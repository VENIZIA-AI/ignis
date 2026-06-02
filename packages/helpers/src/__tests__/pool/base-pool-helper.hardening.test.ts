import { describe, expect, test } from 'bun:test';
import { BasePoolHelper } from '@/modules/pool';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const tick = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface ITrackedPool<T> {
  pool: BasePoolHelper<T>;
  destroyed: T[];
  created: T[];
  createdCount: () => number;
}

/** Object-identity resources (each is a fresh object) so double-borrow is detectable by ref. */
function objectPool(
  size: number,
  extra: Partial<{
    acquireTimeoutMs: number;
    maxWaitingClients: number;
    validate: (r: { id: number }) => boolean | Promise<boolean>;
    reset: (r: { id: number }) => void | Promise<void>;
  }> = {},
): ITrackedPool<{ id: number }> {
  let n = 0;
  const destroyed: { id: number }[] = [];
  const created: { id: number }[] = [];
  const pool = new BasePoolHelper<{ id: number }>({
    size,
    create: () => {
      const r = { id: ++n };
      created.push(r);
      return r;
    },
    destroy: r => {
      destroyed.push(r);
    },
    ...extra,
  });
  return { pool, destroyed, created, createdCount: () => n };
}

// ===========================================================================
// WHITE-BOX / CONCURRENCY INVARIANTS
// ===========================================================================

describe('BasePoolHelper — concurrency invariants (white-box)', () => {
  test('INVARIANT: total === idle + borrowed after heavy concurrent churn', async () => {
    const { pool } = objectPool(4);
    // 100 concurrent acquire→hold→release cycles.
    const tasks = Array.from({ length: 100 }, async () => {
      const r = await pool.acquire();
      await tick(Math.floor(Math.random() * 3));
      pool.release({ resource: r });
    });
    await Promise.all(tasks);

    const stats = pool.getStats();
    // Drain may still have a dispatch in-flight; let microtasks settle.
    await tick(5);
    const after = pool.getStats();
    // No pending waiters, nothing borrowed, available bounded by size.
    expect(after.pending).toBe(0);
    expect(after.borrowed).toBe(0);
    expect(after.available).toBeLessThanOrEqual(4);
    // available reflects `total` since borrowed==0; size cap held throughout.
    expect(stats.size).toBe(4);
  });

  test('INVARIANT: a resource is never held by two borrowers; borrowed.size <= size', async () => {
    const size = 4;
    const { pool } = objectPool(size);
    const currentlyBorrowed = new Set<number>();
    let maxBorrowed = 0;
    let isDoubleBorrow = false;

    const tasks = Array.from({ length: 100 }, async () => {
      const r = await pool.acquire();
      if (currentlyBorrowed.has(r.id)) {
        isDoubleBorrow = true;
      }
      currentlyBorrowed.add(r.id);
      maxBorrowed = Math.max(maxBorrowed, currentlyBorrowed.size);
      await tick(Math.floor(Math.random() * 3));
      currentlyBorrowed.delete(r.id);
      pool.release({ resource: r });
    });
    await Promise.all(tasks);

    expect(isDoubleBorrow).toBe(false);
    expect(maxBorrowed).toBeLessThanOrEqual(size);
  });

  test('lost-wakeup hunt: N>size acquires all resolve once capacity is released', async () => {
    const size = 3;
    const { pool } = objectPool(size);
    // Saturate the pool.
    const held = await Promise.all(Array.from({ length: size }, () => pool.acquire()));
    // Queue many more than capacity.
    const waiterCount = 20;
    const resolvedOrder: number[] = [];
    const waiters = Array.from({ length: waiterCount }, (_, i) =>
      pool.acquire().then(r => {
        resolvedOrder.push(i);
        return r;
      }),
    );
    await tick(5);
    expect(pool.getStats().pending).toBe(waiterCount);

    // Release initial holders; each release wakes one waiter.
    for (const r of held) {
      pool.release({ resource: r });
    }
    // As waiters resolve they must release too, to feed the rest.
    const got = await Promise.all(
      waiters.map(async w => {
        const r = await w;
        await tick(0);
        pool.release({ resource: r });
        return r;
      }),
    );
    expect(got).toHaveLength(waiterCount);
    await tick(5);
    expect(pool.getStats().pending).toBe(0);
    expect(pool.getStats().borrowed).toBe(0);
  });

  test('lost-wakeup hunt with awaiting validate+reset (exercises dispatching guard re-entrancy)', async () => {
    const size = 2;
    const { pool } = objectPool(size, {
      validate: async () => {
        await tick(1);
        return true;
      },
      reset: async () => {
        await tick(1);
      },
    });
    const held = await Promise.all(Array.from({ length: size }, () => pool.acquire()));
    const N = 15;
    const waiters = Array.from({ length: N }, () => pool.acquire());
    await tick(5);
    expect(pool.getStats().pending).toBe(N);

    // Release holders while validate/reset awaits are in-flight → re-entrant releases.
    for (const r of held) {
      pool.release({ resource: r });
    }
    const results = await Promise.all(
      waiters.map(async w => {
        const r = await w;
        await tick(0);
        pool.release({ resource: r });
        return r;
      }),
    );
    expect(results).toHaveLength(N);
    await tick(10);
    expect(pool.getStats().pending).toBe(0);
    expect(pool.getStats().borrowed).toBe(0);
  });

  test('FIFO fairness: many waiters served in arrival order with interleaved releases', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n });
    const only = await pool.acquire();
    const order: number[] = [];
    const count = 8;
    const waiters = Array.from({ length: count }, (_, i) =>
      pool.acquire().then(r => {
        order.push(i);
        return r;
      }),
    );
    await tick(5);
    // Release one at a time; each frees the single resource for the next FIFO waiter.
    let current = only;
    for (let i = 0; i < count; i++) {
      pool.release({ resource: current });
      current = await waiters[i];
    }
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('dispatch re-entrancy: release DURING in-flight slow reset still pairs the freed resource', async () => {
    // size=1: A is held. One waiter queued. We make reset slow. When we release A,
    // dispatch begins reset(A); meanwhile nothing else can happen. After reset, A
    // must be handed to the waiter (no lost wakeup).
    let n = 0;
    let resetGate: (() => void) | null = null;
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      reset: () =>
        new Promise<void>(resolve => {
          resetGate = resolve;
        }),
    });
    const a = await pool.acquire();
    let got: number | undefined;
    const waiter = pool.acquire().then(r => {
      got = r;
    });
    await tick(2);
    pool.release({ resource: a }); // dispatch picks idle A → enters slow reset (blocks on gate)
    await tick(5);
    expect(got).toBeUndefined(); // still inside reset
    expect(resetGate).not.toBeNull();
    resetGate!(); // finish reset → A handed to waiter
    await waiter;
    expect(got).toBe(a);
    expect(pool.getStats().borrowed).toBe(1);
  });
});

// ===========================================================================
// FAULT INJECTION
// ===========================================================================

describe('BasePoolHelper — fault injection: create()', () => {
  test('create always throws: every concurrent acquirer rejects, no total leak, recovers', async () => {
    let mode: 'fail' | 'ok' = 'fail';
    let n = 0;
    const pool = new BasePoolHelper<number>({
      size: 2,
      create: () => {
        if (mode === 'fail') {
          throw new Error('factory down');
        }
        return ++n;
      },
    });
    const settled = await Promise.allSettled([pool.acquire(), pool.acquire(), pool.acquire()]);
    expect(settled.every(s => s.status === 'rejected')).toBe(true);
    expect(pool.getStats()).toEqual({ size: 2, available: 0, borrowed: 0, pending: 0 });

    mode = 'ok';
    const r = await pool.acquire();
    expect(typeof r).toBe('number');
    expect(pool.getStats().borrowed).toBe(1);
  });

  test('create fails first time then succeeds: distinct waiters get coherent results', async () => {
    let attempt = 0;
    const pool = new BasePoolHelper<number>({
      size: 2,
      create: () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error('transient');
        }
        return attempt;
      },
    });
    const settled = await Promise.allSettled([pool.acquire(), pool.acquire()]);
    const rejected = settled.filter(s => s.status === 'rejected');
    const fulfilled = settled.filter(s => s.status === 'fulfilled');
    // First create failed → 1 rejection; second create succeeded → 1 fulfilled.
    expect(rejected).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);
    expect(pool.getStats().borrowed).toBe(1);
    expect(pool.getStats().pending).toBe(0);
  });
});

describe('BasePoolHelper — fault injection: validate() THROWS', () => {
  // FIXED (helper.ts): validate() is now wrapped in try/catch like reset(). A throwing validate()
  // must be treated like an invalid resource — the popped candidate is destroyed (no leak) and the
  // waiter is served by a freshly-created resource. This guards against the previous bug where a
  // throwing validate leaked the candidate (corrupting `total`) and could permanently starve the pool.
  test('validate() throwing discards the candidate (no leak) and serves the waiter from a fresh resource', async () => {
    let n = 0;
    const destroyed: number[] = [];
    let shouldThrow = true; // first validation throws; the replacement validates OK
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
      validate: () => {
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error('validate boom');
        }
        return true;
      },
      acquireTimeoutMs: 200, // generous; the waiter should be served well before this
    });
    const a = await pool.acquire(); // created fresh (validate NOT run on the create path), resource 1
    pool.release({ resource: a }); // back to idle; total stays 1

    // Next acquire pops idle(1) → validate THROWS → resource 1 discarded → create resource 2 → validate OK → served.
    const b = await pool.acquire();
    expect(b).toBe(2); // served by the freshly-created replacement, NOT timed out
    expect(destroyed).toContain(1); // the candidate that failed validation was destroyed (no leak)

    // White-box invariant holds: total === idle + borrowed (the leak is gone).
    const stats = pool.getStats();
    expect(stats.borrowed).toBe(1); // b is held
    expect(stats.available).toBe(0);

    // Pool is NOT dead: release b and acquire again works.
    pool.release({ resource: b });
    const c = await pool.acquire();
    expect(c).toBe(2); // reuses b (validate returns true now)
  });
});

describe('BasePoolHelper — fault injection: reset() throws', () => {
  test('reset throws with a waiter pending: a fresh resource is created and served', async () => {
    let n = 0;
    const destroyed: number[] = [];
    const failReset = new Set<number>();
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
      reset: r => {
        if (failReset.has(r)) {
          throw new Error('reset boom');
        }
      },
    });
    const a = await pool.acquire(); // resource 1 (no reset on create)
    failReset.add(a); // when 1 is reused, reset will throw
    pool.release({ resource: a });
    // Reuse path: reset(1) throws → 1 destroyed → loop continues → total<size → create 2 → serve.
    const b = await pool.acquire();
    expect(b).not.toBe(a);
    expect(destroyed).toContain(a);
    expect(pool.getStats().borrowed).toBe(1);
  });
});

describe('BasePoolHelper — fault injection: destroy() hook throws', () => {
  test('destroy hook throwing does not break destroy() across multiple idle resources', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({
      size: 3,
      create: () => ++n,
      destroy: () => {
        throw new Error('teardown boom');
      },
    });
    await pool.warmup();
    expect(pool.getStats().available).toBe(3);
    // destroy() awaits Promise.all of destroyResource; each swallows the hook error.
    await pool.destroy();
    expect(pool.getStats().available).toBe(0);
  });

  test('discard() tolerates a throwing destroy hook', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: () => {
        throw new Error('teardown boom');
      },
    });
    const a = await pool.acquire();
    await pool.discard({ resource: a }); // must not reject despite hook throwing
    expect(pool.getStats().borrowed).toBe(0);
  });
});

describe('BasePoolHelper — fault injection: use() + destroy both throw', () => {
  test('use() rethrows the ORIGINAL callback error even when destroy hook throws; no leak', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: () => {
        throw new Error('teardown boom');
      },
    });
    let err: unknown;
    try {
      await pool.use({
        fn: async () => {
          throw new Error('callback boom');
        },
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toBe('callback boom');
    expect(pool.getStats()).toEqual({ size: 1, available: 0, borrowed: 0, pending: 0 });
    // Pool recovers with a fresh resource.
    const r = await pool.use({ fn: async x => x });
    expect(r).toBe(2);
  });
});

// ===========================================================================
// BLACK-BOX / BOUNDARY / EQUIVALENCE
// ===========================================================================

describe('BasePoolHelper — degenerate size: 0', () => {
  test('size:0 warmup creates nothing', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 0, create: () => ++n });
    await pool.warmup();
    expect(n).toBe(0);
    expect(pool.getStats()).toEqual({ size: 0, available: 0, borrowed: 0, pending: 0 });
  });

  test('size:0 acquire with timeout rejects (no resource is ever creatable)', async () => {
    const pool = new BasePoolHelper<number>({
      size: 0,
      create: () => 1,
      acquireTimeoutMs: 30,
    });
    let err: unknown;
    try {
      await pool.acquire();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(pool.getStats().pending).toBe(0);
  });

  test('size:0 use() with timeout rejects', async () => {
    const pool = new BasePoolHelper<number>({
      size: 0,
      create: () => 1,
      acquireTimeoutMs: 30,
    });
    let err: unknown;
    try {
      await pool.use({ fn: async r => r });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });
});

describe('BasePoolHelper — size: 1 heavy reuse', () => {
  test('size:1 serially reuses the SAME resource across many use() calls', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n });
    const seen: number[] = [];
    for (let i = 0; i < 25; i++) {
      await pool.use({
        fn: async r => {
          seen.push(r);
        },
      });
    }
    expect(n).toBe(1); // created once
    expect(seen.every(x => x === 1)).toBe(true);
  });

  test('size:1 under concurrent acquirers never double-borrows', async () => {
    const { pool } = objectPool(1);
    const borrowed = new Set<number>();
    let isDoubled = false;
    await Promise.all(
      Array.from({ length: 30 }, async () => {
        const r = await pool.acquire();
        if (borrowed.has(r.id)) {
          isDoubled = true;
        }
        borrowed.add(r.id);
        await tick(1);
        borrowed.delete(r.id);
        pool.release({ resource: r });
      }),
    );
    expect(isDoubled).toBe(false);
  });
});

describe('BasePoolHelper — acquireTimeoutMs boundaries', () => {
  test('acquireTimeoutMs:0 rejects an exhausted-pool acquirer (does not wait forever)', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1, acquireTimeoutMs: 0 });
    await pool.acquire(); // exhaust
    let err: unknown;
    try {
      await pool.acquire();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(pool.getStats().pending).toBe(0);
  });

  test('acquireTimeoutMs does NOT fire when a resource is available immediately', async () => {
    const pool = new BasePoolHelper<number>({
      size: 2,
      create: () => Math.random(),
      acquireTimeoutMs: 5,
    });
    const r = await pool.acquire(); // served before timer fires
    expect(r).toBeDefined();
    await tick(15); // outlive the timer; timer cleared on hand-out
    expect(pool.getStats().borrowed).toBe(1);
  });
});

describe('BasePoolHelper — maxWaitingClients boundaries', () => {
  // FIXED (helper.ts): the gate now only rejects when the acquire would actually have to WAIT
  // (idle empty AND at capacity). So maxWaitingClients:0 means "serve if a resource is free, reject
  // only when it would otherwise queue" — the pool is usable, not totally dead.
  test('maxWaitingClients:0 serves a free resource and rejects only when it would queue', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1, maxWaitingClients: 0 });
    const a = await pool.acquire(); // resource is creatable → served (no queue needed)
    expect(a).toBe(1);

    // Pool now exhausted; a second acquire would have to wait → rejected (queue cap 0).
    let err: unknown;
    try {
      await pool.acquire();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as Error).message).toContain('Too many waiting clients');

    // Releasing makes it servable again.
    pool.release({ resource: a });
    const b = await pool.acquire();
    expect(b).toBe(1);
  });

  test('maxWaitingClients:1 allows one queued waiter, rejects the second', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1, maxWaitingClients: 1 });
    await pool.acquire(); // served immediately (waiters.length was 0 at gate)
    const w1 = pool.acquire(); // queued → pending=1 (gate saw 0 >= 1 false)
    let err: unknown;
    try {
      await pool.acquire(); // gate: 1 >= 1 → reject
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as Error).message).toContain('Too many waiting clients');
    w1.catch(() => undefined); // avoid unhandled rejection on the still-pending waiter
  });
});

describe('BasePoolHelper — nested acquire (re-entrancy from within use())', () => {
  test('size>=2: nested acquire inside use() works', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 2, create: () => ++n });
    const result = await pool.use({
      fn: async outer => {
        const inner = await pool.acquire();
        expect(inner).not.toBe(outer);
        pool.release({ resource: inner });
        return outer;
      },
    });
    expect(result).toBeDefined();
    expect(pool.getStats().borrowed).toBe(0);
    expect(pool.getStats().available).toBe(2);
  });

  test('DEADLOCK DOC: size:1 nested acquire inside use() deadlocks; only acquireTimeoutMs breaks it', async () => {
    // With size:1, use() holds the single resource; the nested acquire() inside the callback
    // can never be served (no idle, total==size). Without a timeout this hangs forever.
    // We give acquireTimeoutMs so the inner acquire rejects, the callback throws, use() discards
    // the outer resource and rethrows. This DOCUMENTS the deadlock hazard.
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n, acquireTimeoutMs: 30 });
    let err: unknown;
    try {
      await pool.use({
        fn: async () => {
          // self-deadlock without the timeout safety valve
          await pool.acquire();
        },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as Error).message).toContain('timed out');
    // outer resource was discarded by use()'s catch path.
    expect(pool.getStats().borrowed).toBe(0);
  });
});

describe('BasePoolHelper — operations after destroy()', () => {
  test('acquire after destroy throws; warmup after destroy throws', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1 });
    await pool.destroy();
    let acqErr: unknown;
    try {
      await pool.acquire();
    } catch (e) {
      acqErr = e;
    }
    expect(acqErr).toBeDefined();
    let warmErr: unknown;
    try {
      await pool.warmup();
    } catch (e) {
      warmErr = e;
    }
    expect(warmErr).toBeDefined();
  });

  test('use() after destroy rejects', async () => {
    const pool = new BasePoolHelper<number>({ size: 1, create: () => 1 });
    await pool.destroy();
    let err: unknown;
    try {
      await pool.use({ fn: async r => r });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });

  test('release after destroy destroys the resource (no return to idle)', async () => {
    let n = 0;
    const destroyed: number[] = [];
    const pool = new BasePoolHelper<number>({
      size: 1,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
    });
    const a = await pool.acquire();
    await pool.destroy();
    pool.release({ resource: a });
    await tick(0);
    expect(destroyed).toContain(a);
    expect(pool.getStats().available).toBe(0);
  });

  test('double destroy() is idempotent (does not throw, does not re-destroy)', async () => {
    let n = 0;
    const destroyed: number[] = [];
    const pool = new BasePoolHelper<number>({
      size: 2,
      create: () => ++n,
      destroy: r => {
        destroyed.push(r);
      },
    });
    await pool.warmup();
    await pool.destroy();
    const afterFirst = [...destroyed];
    await pool.destroy(); // idle already drained → nothing more to destroy
    expect(destroyed).toEqual(afterFirst);
  });
});

describe('BasePoolHelper — cross-pool release isolation', () => {
  test('releasing a resource borrowed from a DIFFERENT pool is ignored (no corruption)', async () => {
    const poolA = new BasePoolHelper<{ id: number }>({ size: 1, create: () => ({ id: 1 }) });
    const poolB = new BasePoolHelper<{ id: number }>({ size: 1, create: () => ({ id: 2 }) });
    const a = await poolA.acquire();
    poolB.release({ resource: a }); // foreign to B → ignored
    expect(poolB.getStats()).toEqual({ size: 1, available: 0, borrowed: 0, pending: 0 });
    // A is unaffected.
    expect(poolA.getStats().borrowed).toBe(1);
    poolA.release({ resource: a });
    expect(poolA.getStats().available).toBe(1);
  });
});

// ===========================================================================
// STRESS — mixed operations, invariant re-check
// ===========================================================================

describe('BasePoolHelper — mixed-op stress', () => {
  test('mixed acquire/use/discard/release keeps total === idle + borrowed', async () => {
    const size = 5;
    let n = 0;
    let live = 0; // proxy for `total`: incremented in create, decremented in destroy
    const pool = new BasePoolHelper<number>({
      size,
      create: () => {
        live += 1;
        return ++n;
      },
      destroy: () => {
        live -= 1;
      },
      validate: () => true,
      reset: () => undefined,
    });

    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 120; i++) {
      const mode = i % 3;
      if (mode === 0) {
        tasks.push(
          (async () => {
            const r = await pool.acquire();
            await tick(Math.floor(Math.random() * 2));
            pool.release({ resource: r });
          })(),
        );
      } else if (mode === 1) {
        tasks.push(pool.use({ fn: async r => r }).catch(() => undefined));
      } else {
        tasks.push(
          (async () => {
            const r = await pool.acquire();
            await tick(Math.floor(Math.random() * 2));
            await pool.discard({ resource: r });
          })(),
        );
      }
    }
    await Promise.all(tasks);
    await tick(10);

    const stats = pool.getStats();
    expect(stats.pending).toBe(0);
    expect(stats.borrowed).toBe(0);
    // `live` (our proxy for total) must equal idle + borrowed.
    expect(live).toBe(stats.available + stats.borrowed);
    expect(stats.available).toBeLessThanOrEqual(size);
    expect(live).toBeLessThanOrEqual(size);
    expect(live).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// WAITER QUEUE — O(1) head-index correctness (FIFO at scale + settled-skip)
// ===========================================================================

describe('BasePoolHelper — waiter queue (head-index) correctness', () => {
  test('FIFO preserved across a large burst (exercises head-index advance + compaction)', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n });
    const only = await pool.acquire(); // hold the single resource
    const count = 300; // > WAITERS_COMPACT_THRESHOLD (256) → the consumed prefix compacts mid-drain
    const order: number[] = [];
    const waiters = Array.from({ length: count }, (_, i) =>
      pool.acquire().then(r => {
        order.push(i);
        return r;
      }),
    );
    await tick(5);
    expect(pool.getStats().pending).toBe(count);

    let current = only;
    for (let i = 0; i < count; i++) {
      pool.release({ resource: current });
      current = await waiters[i];
    }
    pool.release({ resource: current });

    expect(order).toEqual(Array.from({ length: count }, (_, i) => i)); // strict arrival order
    await tick(5);
    expect(pool.getStats().pending).toBe(0);
    expect(pool.getStats().borrowed).toBe(0);
  });

  test('a timed-out waiter is skipped; a later live waiter is still served in order', async () => {
    let n = 0;
    const pool = new BasePoolHelper<number>({ size: 1, create: () => ++n, acquireTimeoutMs: 80 });
    const a = await pool.acquire(); // hold the only resource

    let isW1Rejected = false;
    const w1 = pool.acquire().catch(() => {
      isW1Rejected = true;
    }); // enqueued at t≈0 → times out at ≈80ms

    await tick(40);
    let w2Resource: number | undefined;
    const w2 = pool.acquire().then(r => {
      w2Resource = r;
      return r;
    }); // enqueued at t≈40 → times out at ≈120ms

    await tick(55); // t≈95: w1 has timed out (>80), w2 still live (<120)
    expect(isW1Rejected).toBe(true);
    expect(pool.getStats().pending).toBe(1); // only w2 remains live

    pool.release({ resource: a }); // dispatch must SKIP the settled w1 and serve w2
    await w2;
    expect(w2Resource).toBe(a);

    await w1;
    pool.release({ resource: w2Resource! });
    expect(pool.getStats().pending).toBe(0);
  });
});
