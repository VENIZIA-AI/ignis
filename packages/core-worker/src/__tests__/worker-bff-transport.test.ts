import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { WorkerBffTransport } from '@/transport/worker';
import type {
  IBffErrorEnvelope,
  IBffRequestEnvelope,
  IBffResponseEnvelope,
} from '@/envelope/types';
import { expectRejection } from './rejection.helper';

type TMessageListener = (event: MessageEvent) => void;

/**
 * `fetch()` chains two `await`s (`rewriteToSyntheticOrigin`, then `encodeRequest`) before it ever
 * calls `postMessage` - a single microtask tick is not enough to observe the post. A macrotask
 * always runs after the microtask queue has fully drained, regardless of how many `await` levels
 * are stacked ahead of it, which is what makes this reliable instead of tick-counting.
 */
const flushMicrotasks = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Answers what a promise DID within a window, so a test can assert "this settled" without hanging
 * on a defect whose whole symptom is that it never settles - a plain `await` on that promise is the
 * one thing that cannot observe it.
 */
const settleWithin = async (opts: {
  task: Promise<unknown>;
  timeoutMs: number;
}): Promise<'resolved' | 'rejected' | 'pending'> => {
  const { task, timeoutMs } = opts;

  return Promise.race([
    task.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), timeoutMs)),
  ]);
};

/**
 * Removes `crypto.randomUUID` - what a browser gives a page on a plain-http LAN origin, and several
 * WebViews everywhere. The real method lives on the prototype, so there is no own descriptor to
 * save: shadowing it with `undefined` and deleting the shadow is what puts the prototype method
 * back.
 *
 * Restored from `afterEach`, never from an async `finally`: bun ends a test at the failed
 * assertion and starts the next one before the rejection has propagated far enough for a `finally`
 * to run, so a leaked shadow would corrupt every test behind it.
 */
const hideSecureContextCrypto = (): void => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: undefined,
    configurable: true,
    writable: true,
  });
};

const restoreSecureContextCrypto = (): void => {
  delete (globalThis.crypto as AnyType).randomUUID;
};

/**
 * A Worker-shaped stub, not a real `Worker` thread: `WorkerBffTransport` only ever calls
 * `addEventListener`/`removeEventListener`/`postMessage` on it, so this is the minimal surface that
 * lets a test control both sides of the exchange directly - post a request in, inspect what was
 * sent, then answer with a response or error envelope on demand.
 */
class FakeWorker {
  readonly posted: unknown[] = [];
  private readonly listeners = new Map<string, Set<TMessageListener>>();

  addEventListener(type: string, listener: TMessageListener): void {
    const set = this.listeners.get(type) ?? new Set<TMessageListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: TMessageListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  listenerCount(): number {
    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.size;
    }
    return total;
  }

  /** Simulates the worker answering back - `WorkerApplication.listen()`'s side of this exchange. */
  respond(data: IBffResponseEnvelope | IBffErrorEnvelope): void {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners.get('message') ?? []) {
      listener(event);
    }
  }

  /** Simulates the worker thread itself dying - the `error` event, not a message. */
  crash(): void {
    const event = new Event('error');
    for (const listener of this.listeners.get('error') ?? []) {
      listener(event as any);
    }
  }

  /**
   * Simulates ONE posted message failing to deserialise on the page - not the worker dying. The
   * event carries no id, so nothing in it says which request lost its answer.
   */
  failOneMessageDeserialisation(): void {
    const event = new Event('messageerror');
    for (const listener of this.listeners.get('messageerror') ?? []) {
      listener(event as any);
    }
  }
}

describe('WorkerBffTransport', () => {
  test('resolves a Response when the worker posts back a matching response envelope', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });

    // Give `fetch()` a tick to post the encoded request before answering it.
    await flushMicrotasks();
    expect(worker.posted).toHaveLength(1);
    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;

    // Proves `BFF_SYNTHETIC_ORIGIN` is applied - the caller built the request against
    // `http://example.test`, never `http://ignis.internal`.
    expect(sentEnvelope.url).toBe('http://ignis.internal/hello');

    worker.respond({
      id: sentEnvelope.id,
      status: 200,
      headers: [['content-type', 'application/json']],
      body: new TextEncoder().encode(JSON.stringify({ ok: true })).buffer as ArrayBuffer,
    });

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('rejects with an ApplicationError when the worker posts back an error envelope', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/boom') });

    await flushMicrotasks();
    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;

    const errorEnvelope: IBffErrorEnvelope = {
      id: sentEnvelope.id,
      statusCode: 500,
      error: { text: 'deliberate failure', code: 'core.system_error', args: {} },
    };
    worker.respond(errorEnvelope);

    await expectRejection({ task: fetchPromise, message: 'deliberate failure' });
  });

  test('ignores a message whose id does not match the in-flight request', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });

    await flushMicrotasks();
    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;

    // A foreign / stale reply must not settle this call.
    worker.respond({
      id: 'not-the-right-id',
      status: 200,
      headers: [],
      body: new ArrayBuffer(0),
    });

    worker.respond({
      id: sentEnvelope.id,
      status: 204,
      headers: [],
    });

    const response = await fetchPromise;
    expect(response.status).toBe(204);
  });

  test('rejects when the worker itself errors before answering', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });

    await flushMicrotasks();
    worker.crash();

    let caught: unknown;
    try {
      await fetchPromise;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
  });

  test('times out rather than hanging forever when nothing ever answers', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 20 });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });

    let caught: unknown;
    try {
      await fetchPromise;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(isApplicationError(caught) ? caught.message : String(caught)).toContain('Timed out');
  });

  test('rejects with the status code the worker sent, not a fabricated 400', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/boom') });

    await flushMicrotasks();
    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;

    // An error envelope is only ever produced when something escaped Hono's `onError` - the
    // 500-class failures a UI must not classify as its own bad request and retry.
    worker.respond({
      id: sentEnvelope.id,
      statusCode: 503,
      error: { text: 'upstream unavailable', code: 'core.system_error', args: {} },
    });

    let caught: unknown;
    try {
      await fetchPromise;
    } catch (error) {
      caught = error;
    }

    expect(isApplicationError(caught)).toBe(true);
    expect((caught as AnyType).statusCode).toBe(503);
  });

  test('buffers the caller body once, not once per hop', async () => {
    const bufferSpy = spyOn(Request.prototype, 'arrayBuffer');

    try {
      const worker = new FakeWorker();
      const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

      const request = new Request('http://example.test/notes', {
        method: 'POST',
        body: JSON.stringify({ title: 'a note' }),
      });

      const fetchPromise = transport.fetch({ request });
      await flushMicrotasks();

      const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;
      expect(new TextDecoder().decode(sentEnvelope.body)).toBe('{"title":"a note"}');

      // A 10 MB upload must cost 10 MB on the UI thread, not 20: an origin rewrite that rebuilds
      // the Request reads the body a second time for nothing.
      expect(bufferSpy).toHaveBeenCalledTimes(1);

      worker.respond({ id: sentEnvelope.id, status: 204, headers: [] });
      await fetchPromise;
    } finally {
      bufferSpy.mockRestore();
    }
  });

  test('honours an AbortSignal instead of making the caller wait out the timeout', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const controller = new AbortController();
    const fetchPromise = transport.fetch({
      request: new Request('http://example.test/slow', { signal: controller.signal }),
    });

    await flushMicrotasks();
    controller.abort();

    expect(await settleWithin({ task: fetchPromise, timeoutMs: 100 })).toBe('rejected');
  });

  test('honours a signal that aborts while the body is still being buffered', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const controller = new AbortController();
    const fetchPromise = transport.fetch({
      request: new Request('http://example.test/upload', {
        method: 'POST',
        body: 'x'.repeat(1024),
        signal: controller.signal,
      }),
    });

    // Aborted in the same turn, before `encodeRequest` has resolved: an `abort` listener attached
    // after the fact never fires, so this is the window a re-read has to cover.
    controller.abort();

    expect(await settleWithin({ task: fetchPromise, timeoutMs: 100 })).toBe('rejected');
    expect(worker.posted).toHaveLength(0);
  });

  test('rejects rather than hanging forever when the response envelope cannot be decoded', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });

    await flushMicrotasks();
    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;

    // 999 is outside 200-599, so `new Response(body, { status })` throws a `RangeError` - the same
    // shape a malformed header tuple gives. Teardown must not run before the settle, or the throw
    // leaves the promise with no timer, no listener and no answer.
    let dispatchError: unknown;
    try {
      worker.respond({ id: sentEnvelope.id, status: 999, headers: [] });
    } catch (error) {
      dispatchError = error;
    }

    expect(await settleWithin({ task: fetchPromise, timeoutMs: 100 })).toBe('rejected');
    // The decode failure belongs to the request that caused it, not to the page's error handler.
    expect(dispatchError).toBeUndefined();
  });

  test('one failed deserialisation does not reject the other in-flight requests', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const first = transport.fetch({ request: new Request('http://example.test/one') });
    const second = transport.fetch({ request: new Request('http://example.test/two') });

    await flushMicrotasks();
    expect(worker.posted).toHaveLength(2);

    // Exactly one message failed to deserialise. Nothing says it was either of these two, and both
    // are about to be answered normally.
    worker.failOneMessageDeserialisation();

    const [firstEnvelope, secondEnvelope] = worker.posted as IBffRequestEnvelope[];
    worker.respond({
      id: firstEnvelope!.id,
      status: 200,
      headers: [],
      body: new TextEncoder().encode('one').buffer as ArrayBuffer,
    });
    worker.respond({
      id: secondEnvelope!.id,
      status: 200,
      headers: [],
      body: new TextEncoder().encode('two').buffer as ArrayBuffer,
    });

    expect(await (await first).text()).toBe('one');
    expect(await (await second).text()).toBe('two');
  });

  test('close() detaches from the worker and fails what was still in flight', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });
    await flushMicrotasks();
    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;

    transport.close();

    expect(await settleWithin({ task: fetchPromise, timeoutMs: 100 })).toBe('rejected');

    // Detached: a late answer must not reach a listener that is no longer there.
    expect(worker.listenerCount()).toBe(0);
    worker.respond({ id: sentEnvelope.id, status: 200, headers: [] });
  });

  test('a crashed worker still rejects every in-flight request', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const first = transport.fetch({ request: new Request('http://example.test/one') });
    const second = transport.fetch({ request: new Request('http://example.test/two') });

    await flushMicrotasks();
    worker.crash();

    expect(await settleWithin({ task: first, timeoutMs: 100 })).toBe('rejected');
    expect(await settleWithin({ task: second, timeoutMs: 100 })).toBe('rejected');
  });
});

/**
 * `crypto.randomUUID` is exposed only in a SECURE CONTEXT. `WorkerApplication` documents that and
 * refuses the API for its request ids; the page half of the same channel must hold the same rule,
 * or a plain-http LAN origin throws on the transport's first line and the BFF looks dead.
 */
describe('WorkerBffTransport outside a secure context', () => {
  beforeEach(hideSecureContextCrypto);
  afterEach(restoreSecureContextCrypto);

  test('still generates a request id and posts the request', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const fetchPromise = transport.fetch({ request: new Request('http://example.test/hello') });

    await flushMicrotasks();
    expect(worker.posted).toHaveLength(1);

    const sentEnvelope = worker.posted[0] as IBffRequestEnvelope;
    // Not merely non-empty: `RequestIdGenerator` falls back to assembling an RFC 9562 v4 from
    // `crypto.getRandomValues()`, so the id a non-secure origin gets must be indistinguishable from
    // the one `crypto.randomUUID()` would have returned. Anything weaker would pass on a fallback
    // that quietly emitted a different shape, which is the bug this whole channel exists to avoid.
    expect(sentEnvelope.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    worker.respond({ id: sentEnvelope.id, status: 204, headers: [] });
    expect((await fetchPromise).status).toBe(204);
  });

  test('gives concurrent requests distinct ids', async () => {
    const worker = new FakeWorker();
    const transport = new WorkerBffTransport({ worker: worker as any, timeoutMs: 5_000 });

    const first = transport.fetch({ request: new Request('http://example.test/one') });
    const second = transport.fetch({ request: new Request('http://example.test/two') });

    await flushMicrotasks();
    const [firstEnvelope, secondEnvelope] = worker.posted as IBffRequestEnvelope[];
    expect(firstEnvelope!.id).not.toBe(secondEnvelope!.id);

    worker.respond({ id: firstEnvelope!.id, status: 204, headers: [] });
    worker.respond({ id: secondEnvelope!.id, status: 204, headers: [] });
    await Promise.all([first, second]);
  });
});
