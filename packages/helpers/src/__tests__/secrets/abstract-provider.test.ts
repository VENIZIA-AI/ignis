import { beforeEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { AbstractSecretsHelper } from '@/modules/secrets/base/abstract.helper';
import type {
  IClock,
  ISecretRotatable,
  ISecretsHelperOptions,
  ITimerAdapter,
  TTimerHandle,
} from '@/modules/secrets/common';

const TIMEOUT_MAX_MS = 2_147_483_647;

/** Awaits a rejection explicitly: bun's `expect(...).rejects` is typed as non-thenable in this repo. */
const captureRejection = async (opts: { promise: Promise<unknown> }): Promise<Error> => {
  const outcome = await opts.promise.then(
    () => null,
    (error: unknown) => error as Error,
  );

  if (!outcome) {
    throw getError({ message: 'Expected the promise to REJECT, but it resolved' });
  }

  return outcome;
};

class ManualClock implements IClock {
  current = 0;
  now() {
    return this.current;
  }
}

/** Fires the single registered timer on demand instead of waiting; records requested delays. */
class ManualTimers implements ITimerAdapter {
  private handlers = new Map<TTimerHandle, () => void>();
  private seq = 0;
  delays: number[] = [];
  set(handler: () => void, ms: number): TTimerHandle {
    const handle = ++this.seq;
    this.handlers.set(handle, handler);
    this.delays.push(ms);
    return handle;
  }
  clear(handle: TTimerHandle) {
    this.handlers.delete(handle);
  }
  count() {
    return this.handlers.size;
  }
  lastDelay() {
    return this.delays[this.delays.length - 1];
  }
  async fireAll() {
    const pending = [...this.handlers.values()];
    this.handlers.clear();
    for (const handler of pending) {
      handler();
    }
    await Promise.resolve();
    await Promise.resolve();
  }
}

interface IScriptStep {
  value: Record<string, string>;
  lease?: { leaseId: string; ttlSeconds: number; renewable: boolean };
}

class FakeSecretsHelper extends AbstractSecretsHelper {
  fetchScript: IScriptStep[] = [];
  renewResults: Array<{ ttlSeconds: number } | null> = [];
  revoked: string[] = [];
  fetchCount = 0;
  /** Call-index -> error to throw for that fetchRaw invocation. */
  fetchErrorAtCall = new Map<number, Error>();
  /** When set, renewRaw awaits this before resolving (models an in-flight renewal). */
  renewGate?: Promise<void>;
  /** When set, fetchRaw awaits this before resolving (models an in-flight fetch/lease call). */
  fetchGate?: Promise<void>;

  constructor(opts: ISecretsHelperOptions) {
    super(opts);
  }

  protected async fetchRaw() {
    const call = this.fetchCount;
    this.fetchCount += 1;
    if (this.fetchGate) {
      await this.fetchGate;
    }
    const injected = this.fetchErrorAtCall.get(call);
    if (injected) {
      throw injected;
    }
    return this.fetchScript[Math.min(call, this.fetchScript.length - 1)];
  }
  protected async renewRaw() {
    if (this.renewGate) {
      await this.renewGate;
    }
    return this.renewResults.shift() ?? null;
  }
  protected async revokeRaw(opts: { leaseId: string }) {
    this.revoked.push(opts.leaseId);
  }
}

const build = () => {
  const clock = new ManualClock();
  const timers = new ManualTimers();
  const provider = new FakeSecretsHelper({
    scope: 'Fake',
    clock,
    timers,
    cacheTtlSeconds: 100,
    renewBeforeRatio: 0.5,
  });
  return { clock, timers, provider };
};

const createDeferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(res => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('AbstractSecretsHelper', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  test('getBundle caches within TTL and re-fetches after expiry', async () => {
    ctx.provider.fetchScript = [{ value: { A: '1' } }, { value: { A: '2' } }];
    expect(await ctx.provider.getBundle({ path: 'p' })).toEqual({ A: '1' });
    expect(await ctx.provider.getBundle({ path: 'p' })).toEqual({ A: '1' }); // cached
    expect(ctx.provider.fetchCount).toBe(1);
    ctx.clock.current = 200_000;
    expect(await ctx.provider.getBundle({ path: 'p' })).toEqual({ A: '2' }); // re-fetched
  });

  test('get returns keyed value or defaultValue', async () => {
    ctx.provider.fetchScript = [{ value: { USER: 'app' } }];
    expect(await ctx.provider.get({ path: 'p', key: 'USER' })).toBe('app');
    expect(await ctx.provider.get({ path: 'p', key: 'MISSING', defaultValue: 'd' })).toBe('d');
  });

  test('renew success reschedules with NO rotation event', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: true } },
    ];
    ctx.provider.renewResults = [{ ttlSeconds: 10 }];
    const events: string[] = [];
    ctx.provider.onRotate(e => {
      events.push(e.lease.leaseId);
    });
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.timers.fireAll();
    expect(events).toEqual([]); // renewed, not rotated
  });

  test('renew failure fetches fresh and dispatches exactly one rotation', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: true } },
      { value: { password: 'p2' }, lease: { leaseId: 'L2', ttlSeconds: 10, renewable: true } },
    ];
    ctx.provider.renewResults = [null]; // cannot renew
    const events: string[] = [];
    ctx.provider.onRotate(e => {
      events.push(e.lease.leaseId);
    });
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.timers.fireAll();
    expect(events).toEqual(['L2']);
  });

  test('dispatchRotation runs rotatables in series; one throwing does not abort the rest', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: false } },
      { value: { password: 'p2' }, lease: { leaseId: 'L2', ttlSeconds: 10, renewable: false } },
    ];
    const order: string[] = [];
    const failing: ISecretRotatable = {
      async onSecretRotated() {
        order.push('failing');
        throw new Error('boom');
      },
    };
    const ok: ISecretRotatable = {
      async onSecretRotated() {
        order.push('ok');
      },
    };
    ctx.provider.registerRotatable({ key: 'datasources.postgres', target: failing });
    ctx.provider.registerRotatable({ key: 'datasources.postgres', target: ok });
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.timers.fireAll();
    expect(order).toEqual(['failing', 'ok']);
  });

  test('shutdown clears timers and revokes every lease', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: true } },
    ];
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.provider.shutdown();
    expect(ctx.provider.revoked).toEqual(['L1']);
  });

  // Fix 1 - renewal loop survives a transient failure and recovers on a later cycle.
  test('renewal recovers after a transient fetch failure via bounded-backoff retry', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: true } },
      { value: { password: 'p2' }, lease: { leaseId: 'L2', ttlSeconds: 10, renewable: true } },
    ];
    ctx.provider.renewResults = [null]; // force rotate
    // fetch call 0 -> lease (ok); call 1 -> rotate throws; call 2 -> rotate succeeds (L2).
    ctx.provider.fetchErrorAtCall.set(1, new Error('vault 503'));
    const events: string[] = [];
    ctx.provider.onRotate(e => {
      events.push(e.lease.leaseId);
    });
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });

    await ctx.timers.fireAll(); // renewal #1: renew null -> rotate -> fetch throws -> backoff scheduled
    expect(events).toEqual([]); // nothing rotated yet
    expect(ctx.timers.count()).toBe(1); // loop did NOT die; retry armed

    await ctx.timers.fireAll(); // backoff retry: rotate succeeds -> L2
    expect(events).toEqual(['L2']);
  });

  // Fix 2 - shutdown mid-renewal must not resurrect the revoked lease or leave a timer.
  test('shutdown during an in-flight renewal does not re-add lease or re-arm a timer', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: true } },
    ];
    ctx.provider.renewResults = [{ ttlSeconds: 10 }];
    const gate = createDeferred();
    ctx.provider.renewGate = gate.promise;

    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.timers.fireAll(); // renewal starts, suspends on renewGate

    await ctx.provider.shutdown(); // revokes L1, clears everything while renewal is mid-flight
    gate.resolve(); // renewal resumes AFTER shutdown
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.provider.revoked).toEqual(['L1']);
    expect(ctx.timers.count()).toBe(0); // no timer resurrected
    expect((ctx.provider as AnyType).leases.size).toBe(0); // lease not re-added
  });

  // Fix 3 - a huge ttl must clamp the delay to setTimeout's ceiling, not overflow to ~1ms.
  test('huge ttl clamps the renewal delay to TIMEOUT_MAX', async () => {
    ctx.provider.fetchScript = [
      {
        value: { password: 'p1' },
        lease: { leaseId: 'L1', ttlSeconds: Number.MAX_SAFE_INTEGER, renewable: true },
      },
    ];
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    expect(ctx.timers.lastDelay()).toBe(TIMEOUT_MAX_MS);
  });

  // Fix 3 - a zero/negative ttl must not produce a 0ms busy-loop.
  test('zero ttl clamps the renewal delay to the floor, never 0', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 0, renewable: true } },
    ];
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    expect(ctx.timers.lastDelay()).toBeGreaterThan(0);
  });

  // Fix 3 - renewBeforeRatio must be within (0, 1].
  test('constructor rejects an out-of-range renewBeforeRatio', () => {
    expect(() => new FakeSecretsHelper({ scope: 'Fake', renewBeforeRatio: 0 })).toThrow();
    expect(() => new FakeSecretsHelper({ scope: 'Fake', renewBeforeRatio: 1.5 })).toThrow();
    expect(() => new FakeSecretsHelper({ scope: 'Fake', renewBeforeRatio: 1 })).not.toThrow();
  });

  // Fix 5 - backoff after very many consecutive failures must saturate at the ceiling, never
  // collapse to the floor (unclamped attempt makes 2 ** (attempt - 1) overflow to Infinity, and
  // clampDelayMs's non-finite branch returns the floor).
  test('backoff delay saturates at TIMEOUT_MAX after many consecutive failures, never collapses to the floor', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: false } },
    ];
    const FAILURE_COUNT = 1040;
    for (let call = 1; call <= FAILURE_COUNT; call += 1) {
      ctx.provider.fetchErrorAtCall.set(call, new Error(`vault unreachable #${call}`));
    }
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });

    for (let i = 0; i < FAILURE_COUNT; i += 1) {
      await ctx.timers.fireAll();
    }

    expect(ctx.timers.lastDelay()).toBe(TIMEOUT_MAX_MS);
  });

  // Fix 4 - a wedged rotatable must not stall the renewal loop for that key.
  test('a hanging rotatable does not stall the next renewal schedule', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: false } },
      { value: { password: 'p2' }, lease: { leaseId: 'L2', ttlSeconds: 10, renewable: false } },
    ];
    const started: string[] = [];
    const hanging: ISecretRotatable = {
      onSecretRotated() {
        started.push('hanging');
        return new Promise<void>(() => undefined); // never resolves
      },
    };
    ctx.provider.registerRotatable({ key: 'datasources.postgres', target: hanging });
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });

    await ctx.timers.fireAll(); // rotate -> schedule next renewal, THEN await the wedged dispatch

    expect(started).toEqual(['hanging']); // dispatch was reached
    expect(ctx.timers.count()).toBe(1); // next renewal armed despite the hang
  });

  // Fix 7 - lease() resolving AFTER shutdown() must not repopulate the maps shutdown just cleared.
  test('lease resolving after shutdown throws and does not repopulate leases/leasePaths', async () => {
    const gate = createDeferred();
    ctx.provider.fetchGate = gate.promise;
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: false } },
    ];

    const pending = ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.provider.shutdown(); // closes provider and clears maps while fetchRaw is still gated
    gate.resolve(); // fetchRaw resolves AFTER shutdown
    const error = await captureRejection({ promise: pending });
    expect(error.message).toMatch(/shut down/);

    expect((ctx.provider as AnyType).leases.size).toBe(0);
    expect((ctx.provider as AnyType).leasePaths.size).toBe(0);
  });

  // Fix 7 - getBundle() resolving AFTER shutdown() must not repopulate the cleared cache map.
  test('getBundle resolving after shutdown does not repopulate the cache', async () => {
    const gate = createDeferred();
    ctx.provider.fetchGate = gate.promise;
    ctx.provider.fetchScript = [{ value: { A: '1' } }];

    const pending = ctx.provider.getBundle({ path: 'p' });
    await ctx.provider.shutdown();
    gate.resolve();
    await pending;

    expect((ctx.provider as AnyType).cache.size).toBe(0);
  });

  // Fix 6 - rotation refreshes the get/getBundle cache instead of serving a stale secret.
  test('rotation refreshes the cache so get returns the rotated secret', async () => {
    ctx.provider.fetchScript = [
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: false } },
      { value: { password: 'p1' }, lease: { leaseId: 'L1', ttlSeconds: 10, renewable: false } },
      { value: { password: 'p2' }, lease: { leaseId: 'L2', ttlSeconds: 10, renewable: false } },
    ];
    // Prime the static cache from the same path.
    expect(await ctx.provider.get({ path: 'db', key: 'password' })).toBe('p1');
    await ctx.provider.lease({ path: 'db', key: 'datasources.postgres' });
    await ctx.timers.fireAll(); // rotate -> fetch p2
    expect(await ctx.provider.get({ path: 'db', key: 'password' })).toBe('p2'); // not stale
  });
});
