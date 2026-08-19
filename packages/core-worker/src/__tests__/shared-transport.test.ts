import { afterEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffRequestEnvelope } from '@/envelope/types';
import { BffRoles, SharedBffTransport } from '@/transport/shared';

/**
 * A `Worker` stand-in that answers envelopes the way `WorkerApplication.listen()` does, so a leader
 * really does run a request end to end instead of the test asserting its own mock back to itself.
 */
class AnsweringWorker {
  static createdCount = 0;
  static terminatedCount = 0;

  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  private readonly handler: (request: Request) => Promise<Response>;

  constructor(opts: { handler: (request: Request) => Promise<Response> }) {
    this.handler = opts.handler;
    AnsweringWorker.createdCount += 1;
  }

  /** The real thing releases the OPFS access handle here, which is the whole reason it is called. */
  terminate(): void {
    AnsweringWorker.terminatedCount += 1;
    this.listeners.clear();
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: unknown): void {
    const envelope = message as IBffRequestEnvelope;

    const dispatch = (data: unknown): void => {
      for (const listener of this.listeners.get('message') ?? []) {
        listener({ data } as MessageEvent);
      }
    };

    this.handler(BffEnvelope.decodeRequest({ envelope }))
      .then(response => BffEnvelope.encodeResponse({ response, id: envelope.id }))
      .then(dispatch)
      // A thrown handler comes back as an ERROR envelope, which is what `WorkerApplication.listen()`
      // does. A fake that simply went quiet would make every failure look like a timeout.
      .catch((error: unknown) => {
        dispatch(BffEnvelope.encodeError({ id: envelope.id, error }));
      });
  }
}

/**
 * Models the parts of `LockManager` this transport relies on: `ifAvailable` answers immediately with
 * `null` when the lock is held, and a plain request queues until the holder's callback settles.
 * Bun has no `navigator.locks`, and the fallback path there is exactly the branch this test suite
 * needs to steer away from.
 */
class LockManagerStub {
  private holder?: Promise<unknown>;
  private readonly queue: Array<() => void> = [];

  /** Grants queued in order, so a test can assert who gets promoted rather than hoping. */
  get queueLength(): number {
    return this.queue.length;
  }

  async request(_name: string, ...rest: AnyType[]): Promise<AnyType> {
    const options =
      typeof rest[0] === 'function'
        ? {}
        : (rest[0] as { ifAvailable?: boolean; signal?: AbortSignal });
    const callback = (typeof rest[0] === 'function' ? rest[0] : rest[1]) as (
      lock: unknown,
    ) => Promise<AnyType>;

    // A real `LockManager` grants from a QUEUED TASK - it never invokes the callback synchronously
    // inside `request()`. Modelling that is not pedantry: granting synchronously makes the role
    // settle before the constructor returns, which closes the window where `close()` races the
    // grant, and that window held a blocker (a closed transport starting a worker and holding the
    // lock for the life of the page). A stub that cannot reach a window cannot test it.
    await Promise.resolve();

    if (this.holder) {
      if (options.ifAvailable) {
        return callback(null);
      }

      // A real `LockManager` drops the request from the queue and rejects with `AbortError`; the
      // transport relies on that to leave the queue when it closes.
      await new Promise<void>((resolve, reject) => {
        const grant = (): void => {
          resolve();
        };

        this.queue.push(grant);

        options.signal?.addEventListener('abort', () => {
          const index = this.queue.indexOf(grant);
          if (index >= 0) {
            this.queue.splice(index, 1);
          }

          reject(new DOMException('The lock request was aborted', 'AbortError'));
        });
      });
    }

    const held = callback({ name: 'stub' });

    // The rejection is NOT swallowed - it is delivered to whoever called `request()` through the
    // `held` promise returned below. This chain exists only to release the lock, which a real
    // `LockManager` does whether the callback resolved or threw.
    this.holder = held
      .catch(() => undefined)
      .finally(() => {
        this.holder = undefined;
        this.queue.shift()?.();
      });

    return held;
  }
}

const installLockManager = (): LockManagerStub => {
  const locks = new LockManagerStub();
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...globalThis.navigator, locks },
    configurable: true,
    writable: true,
  });
  return locks;
};

const removeLockManager = (): void => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...globalThis.navigator, locks: undefined },
    configurable: true,
    writable: true,
  });
};

const flush = (ms = 30): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Every suite gets its own channel, so a leaked transport cannot answer another test's requests. */
let channelSequence = 0;
const nextChannelName = (): string => `ignis.bff.test.${++channelSequence}`;

const echoHandler = async (request: Request): Promise<Response> => {
  return Response.json({
    served: true,
    path: new URL(request.url).pathname,
    method: request.method,
  });
};

describe('SharedBffTransport', () => {
  const opened: SharedBffTransport[] = [];

  const open = (opts: {
    channelName: string;
    handler?: (request: Request) => Promise<Response>;
    timeoutMs?: number;
  }): SharedBffTransport => {
    const transport = new SharedBffTransport({
      channelName: opts.channelName,
      timeoutMs: opts.timeoutMs ?? 2_000,
      createWorker: () =>
        new AnsweringWorker({ handler: opts.handler ?? echoHandler }) as unknown as Worker,
    });

    opened.push(transport);
    return transport;
  };

  afterEach(() => {
    while (opened.length > 0) {
      opened.pop()?.close();
    }
    removeLockManager();
    AnsweringWorker.createdCount = 0;
    AnsweringWorker.terminatedCount = 0;
  });

  /**
   * The race a synchronous lock stub could not reach. `close()` used to leave the `ifAvailable`
   * callback unguarded, so a CLOSED transport started a worker, called itself leader, and then held
   * the lock for the life of the page - `close()` had already cleared `releaseLeadership` before
   * `heldUntilClosed()` assigned it, so nothing could ever resolve it.
   */
  test('closing before the lock is granted starts no Worker and frees the lock', async () => {
    const locks = installLockManager();
    const channelName = nextChannelName();

    const early = open({ channelName });
    early.close();
    await flush();

    expect(AnsweringWorker.createdCount).toBe(0);
    expect(early.getRole()).not.toBe(BffRoles.LEADER);

    // The proof that the lock was released rather than held: the next tab leads.
    const next = open({ channelName });
    await flush();

    expect(next.getRole()).toBe(BffRoles.LEADER);
    expect(locks.queueLength).toBe(0);
  });

  /**
   * `WorkerBffTransport.close()` deliberately leaves its worker running - it did not create it.
   * `SharedBffTransport` DID, so it must terminate it, and BEFORE releasing the lock: the promoted
   * tab opens the same OPFS database, and an access handle the old worker still holds fails it.
   */
  test('closing a leader terminates the Worker it created', async () => {
    installLockManager();

    const leader = open({ channelName: nextChannelName() });
    await flush();

    expect(AnsweringWorker.createdCount).toBe(1);
    expect(AnsweringWorker.terminatedCount).toBe(0);

    leader.close();

    expect(AnsweringWorker.terminatedCount).toBe(1);
  });

  /** No per-request timer is armed on this path, so an unsettled role hangs every caller forever. */
  test('a Worker that cannot start fails the caller instead of hanging', async () => {
    installLockManager();

    const transport = new SharedBffTransport({
      channelName: nextChannelName(),
      timeoutMs: 2_000,
      createWorker: () => {
        throw new Error('blocked by Content-Security-Policy');
      },
    });
    opened.push(transport);
    await flush();

    return expect(
      transport.fetch({ request: new Request('http://app.test/api/notes') }),
    ).rejects.toThrow(/worker never started/);
  });

  test("a follower honours the caller's AbortSignal", async () => {
    installLockManager();
    const channelName = nextChannelName();

    // A leader that never answers, so only the abort can settle the request.
    open({ channelName, handler: () => new Promise<Response>(() => {}) });
    await flush();
    const follower = open({ channelName });
    await flush();

    const controller = new AbortController();
    const inFlight = follower.fetch({
      request: new Request('http://app.test/api/notes', { signal: controller.signal }),
    });

    await flush(10);
    controller.abort();

    return expect(inFlight).rejects.toThrow();
  });

  test('runs single-tab when the host has no Web Locks', async () => {
    removeLockManager();

    const transport = open({ channelName: nextChannelName() });
    await flush();

    expect(transport.getRole()).toBe(BffRoles.LEADER);

    const response = await transport.fetch({ request: new Request('http://app.test/api/notes') });
    expect(await response.json()).toMatchObject({ served: true, path: '/api/notes' });
  });

  test('the first tab leads and the second follows', async () => {
    installLockManager();
    const channelName = nextChannelName();

    const first = open({ channelName });
    await flush();
    const second = open({ channelName });
    await flush();

    expect(first.getRole()).toBe(BffRoles.LEADER);
    expect(second.getRole()).toBe(BffRoles.FOLLOWER);
  });

  /** The whole point: only one tab may hold the OPFS handle, so only one may start a Worker. */
  test('a follower never starts a Worker of its own', async () => {
    installLockManager();
    const channelName = nextChannelName();

    open({ channelName });
    await flush();
    open({ channelName });
    await flush();

    expect(AnsweringWorker.createdCount).toBe(1);
  });

  test("a follower's request is served by the leader", async () => {
    installLockManager();
    const channelName = nextChannelName();

    open({ channelName });
    await flush();
    const follower = open({ channelName });
    await flush();

    const response = await follower.fetch({
      request: new Request('http://app.test/api/notes', { method: 'POST', body: '{"title":"x"}' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      served: true,
      path: '/api/notes',
      method: 'POST',
    });
  });

  /** A failure has to arrive AS a failure - waiting out the timeout tells the caller nothing. */
  test("a leader's failure reaches the follower as a rejection", async () => {
    installLockManager();
    const channelName = nextChannelName();

    open({
      channelName,
      handler: async () => {
        throw new Error('deliberate leader failure');
      },
    });
    await flush();

    const follower = open({ channelName });
    await flush();

    return expect(
      follower.fetch({ request: new Request('http://app.test/api/notes') }),
    ).rejects.toThrow(/deliberate leader failure/);
  });

  test('a follower is promoted when the leader closes, and serves locally after that', async () => {
    installLockManager();
    const channelName = nextChannelName();

    const leader = open({ channelName });
    await flush();
    const follower = open({ channelName });
    await flush();

    expect(follower.getRole()).toBe(BffRoles.FOLLOWER);
    expect(AnsweringWorker.createdCount).toBe(1);

    leader.close();
    await flush(60);

    expect(follower.getRole()).toBe(BffRoles.LEADER);
    // Only now does the promoted tab start a Worker - never before.
    expect(AnsweringWorker.createdCount).toBe(2);

    const response = await follower.fetch({ request: new Request('http://app.test/api/notes') });
    expect(await response.json()).toMatchObject({ served: true });
  });

  test('closing rejects whatever it was still waiting for', async () => {
    installLockManager();
    const channelName = nextChannelName();

    // A leader that never answers, so the follower's request stays in flight.
    open({ channelName, handler: () => new Promise<Response>(() => {}) });
    await flush();

    const follower = open({ channelName });
    await flush();

    const inFlight = follower.fetch({ request: new Request('http://app.test/api/notes') });
    await flush();

    follower.close();

    return expect(inFlight).rejects.toThrow(/transport was closed/);
  });

  test('refuses a request once closed', async () => {
    removeLockManager();

    const transport = open({ channelName: nextChannelName() });
    await flush();
    transport.close();

    return expect(
      transport.fetch({ request: new Request('http://app.test/api/notes') }),
    ).rejects.toThrow(/is closed/);
  });

  /** A closed follower still in the queue would be handed leadership over a tab that could serve. */
  test('a closed follower leaves the leadership queue', async () => {
    const locks = installLockManager();
    const channelName = nextChannelName();

    open({ channelName });
    await flush();
    const follower = open({ channelName });
    await flush();

    expect(locks.queueLength).toBe(1);

    follower.close();
    await flush();

    expect(locks.queueLength).toBe(0);
  });

  test('times out when no leader ever answers', async () => {
    installLockManager();
    const channelName = nextChannelName();

    open({ channelName, handler: () => new Promise<Response>(() => {}) });
    await flush();

    const follower = open({ channelName, timeoutMs: 120 });
    await flush();

    return expect(
      follower.fetch({ request: new Request('http://app.test/api/notes') }),
    ).rejects.toThrow(/Timed out waiting for the leader tab/);
  });
});
