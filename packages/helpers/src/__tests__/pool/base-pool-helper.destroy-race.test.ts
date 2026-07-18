import { describe, expect, test } from 'bun:test';
import { BasePoolHelper } from '@/modules/pool';

interface IProbePool {
  pool: BasePoolHelper<number>;
  created: number[];
  destroyed: number[];
  finishCreate: () => void;
}

/**
 * destroy() only tears down what it can SEE (waiter queue + idle list) - a resource whose create()
 * is still in flight is in neither, so the dispatch loop decides whether it leaks once the pool is gone.
 */
const buildPool = (): IProbePool => {
  const created: number[] = [];
  const destroyed: number[] = [];
  let sequence = 0;
  let release: (() => void) | undefined;

  const pool = new BasePoolHelper<number>({
    scope: 'destroy-race',
    size: 2,
    create: async () => {
      await new Promise<void>(resolve => {
        release = resolve;
      });

      sequence += 1;
      created.push(sequence);
      return sequence;
    },
    destroy: (resource: number) => {
      destroyed.push(resource);
    },
  });

  return {
    pool,
    created,
    destroyed,
    finishCreate: () => {
      release?.();
    },
  };
};

describe('BasePoolHelper - destroy() while a create() is still in flight', () => {
  test('the late resource is destroyed, not parked in idle where nothing would ever close it', async () => {
    const { pool, created, destroyed, finishCreate } = buildPool();

    const acquiring = pool.acquire().catch(() => 'rejected');
    // Let the dispatch loop reach the awaited create().
    await Bun.sleep(10);

    await pool.destroy();
    expect(await acquiring).toBe('rejected');

    finishCreate();
    await Bun.sleep(30);

    expect(created).toEqual([1]);
    // Parking it in idle leaks a live resource - a database connection, a Casbin enforcer - that
    // nothing will ever reclaim, because destroy() already ran.
    expect(destroyed).toEqual([1]);
    expect(pool.getStats().available).toBe(0);
  });

  test('a resource released after destroy() is torn down, not returned to idle', async () => {
    const { pool, destroyed, finishCreate } = buildPool();

    const acquiring = pool.acquire();
    await Bun.sleep(10);
    finishCreate();

    const resource = await acquiring;
    expect(pool.getStats().borrowed).toBe(1);

    await pool.destroy();
    pool.release({ resource });
    await Bun.sleep(10);

    expect(destroyed).toEqual([resource]);
    expect(pool.getStats().available).toBe(0);
  });
});
