import { describe, expect, test } from 'bun:test';
import { BasePoolHelper } from '@/modules/pool';

// A trivial resource factory: incrementing ids.
function counterPool(size: number) {
  let n = 0;
  const destroyed: number[] = [];
  const pool = new BasePoolHelper<number>({
    size,
    create: () => ++n,
    destroy: r => {
      destroyed.push(r);
    },
  });
  return { pool, destroyed, createdCount: () => n };
}

describe('BasePoolHelper — core acquire/release', () => {
  test('acquire creates up to size; release returns to idle; stats track', async () => {
    const { pool, createdCount } = counterPool(2);
    const a = await pool.acquire();
    const b = await pool.acquire();
    expect(a).not.toBe(b);
    expect(createdCount()).toBe(2);
    expect(pool.getStats()).toEqual({ size: 2, available: 0, borrowed: 2, pending: 0 });

    pool.release({ resource: a });
    expect(pool.getStats().available).toBe(1);
    expect(pool.getStats().borrowed).toBe(1);

    const c = await pool.acquire(); // reuses the released one
    expect(c).toBe(a);
    expect(createdCount()).toBe(2);
  });

  test('never hands the same resource to two borrowers (single-borrower)', async () => {
    const { pool } = counterPool(1);
    const a = await pool.acquire();
    let b: number | undefined;
    const pending = pool.acquire().then(r => {
      b = r;
    });
    // While `a` is borrowed and size=1, the second acquire must WAIT.
    await new Promise(r => setTimeout(r, 10));
    expect(b).toBeUndefined();
    pool.release({ resource: a });
    await pending;
    expect(b).toBe(a); // got it only after release
  });

  test('release of a foreign / already-released resource is ignored (no corruption)', async () => {
    const { pool } = counterPool(2);
    const a = await pool.acquire();
    pool.release({ resource: a });
    pool.release({ resource: a }); // double release → ignored
    pool.release({ resource: 999 }); // foreign → ignored
    expect(pool.getStats().available).toBe(1);
    expect(pool.getStats().borrowed).toBe(0);
  });
});

describe('BasePoolHelper — warmup', () => {
  test('warmup pre-creates `size` resources into idle', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 3, create: () => ++n });
    await pool.warmup();
    expect(n).toBe(3);
    expect(pool.getStats()).toEqual({ size: 3, available: 3, borrowed: 0, pending: 0 });
  });

  test('warmup is idempotent up to size (no over-create)', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 2, create: () => ++n });
    await pool.warmup();
    await pool.warmup();
    expect(n).toBe(2);
  });

  test('concurrent warmup() does not over-create beyond size', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 3, create: () => ++n });
    await Promise.all([pool.warmup(), pool.warmup()]);
    expect(n).toBe(3);
    expect(pool.getStats().available).toBe(3);
  });
});

describe('BasePoolHelper — waiting, timeout, load-shed', () => {
  test('waiters are served FIFO when a resource frees up', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n });
    const a = await pool.acquire(); // holds the only resource
    const order: string[] = [];
    const w1 = pool.acquire().then(() => order.push('w1'));
    const w2 = pool.acquire().then(() => order.push('w2'));
    await new Promise(r => setTimeout(r, 5));
    pool.release({ resource: a }); // → w1
    await w1;
    pool.release({ resource: a }); // → w2 (a is the same single resource)
    await w2;
    expect(order).toEqual(['w1', 'w2']);
  });

  test('acquire rejects after acquireTimeoutMs when pool stays exhausted', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1, acquireTimeoutMs: 20 });
    await pool.acquire(); // exhaust
    let error: unknown;
    try {
      await pool.acquire();
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(pool.getStats().pending).toBe(0); // timed-out waiter removed
  });

  test('acquire rejects immediately when maxWaitingClients exceeded', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1, maxWaitingClients: 1 });
    await pool.acquire(); // exhaust
    const w1 = pool.acquire(); // queued (pending = 1)
    let error: unknown;
    try {
      await pool.acquire(); // queue full → reject
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    // cleanup so the test process doesn't hang on the still-pending w1
    w1.catch(() => undefined);
  });

  test('create failure rejects the waiting acquirer and does not leak capacity', async () => {
    let attempt = 0;
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error('factory down');
        }
        return attempt;
      },
    });
    let error: unknown;
    try {
      await pool.acquire();
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(pool.getStats()).toEqual({ size: 1, available: 0, borrowed: 0, pending: 0 }); // no leaked total
    const r = await pool.acquire(); // recovers
    expect(r).toBe(2);
  });
});

describe('BasePoolHelper — validate/reset hooks', () => {
  test('invalid idle resource is destroyed and replaced before hand-out', async () => {
    let n = 0;
    const destroyed: number[] = [];
    // mark the FIRST created resource invalid once it returns to idle
    const invalid = new Set<number>();
    const pool = new BasePoolHelper<number>({
      size: 2,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
      validate: r => !invalid.has(r),
    });
    const a = await pool.acquire(); // resource 1
    pool.release({ resource: a });
    invalid.add(a); // resource 1 now invalid
    const b = await pool.acquire(); // must NOT be resource 1; it's destroyed + a new one created
    expect(b).not.toBe(a);
    expect(destroyed).toContain(a);
  });

  test('reset runs before hand-out of an idle resource', async () => {
    const reset: number[] = [];
    let n = 0;
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      reset: r => {
        reset.push(r);
      },
    });
    const a = await pool.acquire(); // created (no reset on first create)
    pool.release({ resource: a });
    const b = await pool.acquire(); // idle reuse → reset runs
    expect(b).toBe(a);
    expect(reset).toEqual([a]);
  });
});

describe('BasePoolHelper — use()', () => {
  test('use() releases the resource on success', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n });
    const result = await pool.use({ fn: async r => `used-${r}` });
    expect(result).toBe('used-1');
    expect(pool.getStats()).toEqual({ size: 1, available: 1, borrowed: 0, pending: 0 });
  });

  test('use() DISCARDS (destroys, does not return) the resource when the callback throws', async () => {
    let n = 0;
    const destroyed: number[] = [];
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
    });
    let error: unknown;
    try {
      await pool.use({
        fn: async () => {
          throw new Error('boom');
        },
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(destroyed).toEqual([1]); // the borrowed resource was destroyed, not returned dirty
    expect(pool.getStats().available).toBe(0);
    expect(pool.getStats().borrowed).toBe(0);
    // a fresh resource is created on the next use
    const result = await pool.use({ fn: async r => r });
    expect(result).toBe(2);
  });
});

describe('BasePoolHelper — destroy()', () => {
  test('destroy() destroys idle resources and rejects pending waiters; acquire after destroy throws', async () => {
    let n = 0;
    const destroyed: number[] = [];
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
    });
    const a = await pool.acquire(); // borrowed
    const waiting = pool.acquire(); // pending waiter
    await pool.destroy();
    let waitErr: unknown;
    try {
      await waiting;
    } catch (err) {
      waitErr = err;
    }
    expect(waitErr).toBeDefined(); // pending waiter rejected

    // releasing a borrowed resource after destroy() destroys it
    pool.release({ resource: a });
    await new Promise(r => setTimeout(r, 0));
    expect(destroyed).toContain(a);

    let acqErr: unknown;
    try {
      await pool.acquire();
    } catch (err) {
      acqErr = err;
    }
    expect(acqErr).toBeDefined(); // acquire after destroy throws
  });
});
