/** WorkerPoolHelper Test Suite */

import { getError } from '@/modules/error';
import { IWorker, WorkerPoolHelper } from '@/modules/worker-thread';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { AnyType } from '@/common/types';

type TFakeWorker = IWorker<unknown> & { terminate: ReturnType<typeof mock> };

const createFakeWorker = (opts?: { terminate?: () => Promise<number> }): TFakeWorker => {
  const terminate = mock(opts?.terminate ?? (() => Promise.resolve(0)));

  return {
    worker: { terminate },
    options: {},
    onOnline: () => {},
    onExit: () => {},
    onError: () => {},
    onMessage: () => {},
    onMessageError: () => {},
    terminate,
  } as AnyType as TFakeWorker;
};

const createPool = (opts?: { ignoreMaxWarning?: boolean; maxWorkers?: number }) => {
  const pool = new WorkerPoolHelper({ ignoreMaxWarning: opts?.ignoreMaxWarning ?? true });

  if (opts?.maxWorkers !== undefined) {
    pool['numberOfCPUs'] = opts.maxWorkers;
  }

  return pool;
};

const pools: WorkerPoolHelper[] = [];

afterEach(async () => {
  while (pools.length) {
    const pool = pools.pop();
    if (!pool) {
      continue;
    }

    for (const key of [...pool['registry'].keys()]) {
      await pool.unregister({ key: key as string });
    }
  }
});

describe('WorkerPoolHelper | registry', () => {
  test('getInstance() returns the same singleton', () => {
    expect(WorkerPoolHelper.getInstance()).toBe(WorkerPoolHelper.getInstance());
  });

  test('register() stores the worker and exposes it via get/has/size', () => {
    const pool = createPool();
    pools.push(pool);
    const worker = createFakeWorker();

    const registered = pool.register({ key: 'worker-a', worker });

    expect(registered).toBe(true);
    expect(pool.size()).toBe(1);
    expect(pool.has({ key: 'worker-a' })).toBe(true);
    expect(pool.get({ key: 'worker-a' })).toBe(worker);
  });

  test('get()/has() return undefined/false for an unknown key', () => {
    const pool = createPool();
    pools.push(pool);

    expect(pool.get({ key: 'nope' })).toBeUndefined();
    expect(pool.has({ key: 'nope' })).toBe(false);
    expect(pool.size()).toBe(0);
  });

  test('register() with an existing key keeps the first worker and reports the rejection', () => {
    const pool = createPool();
    pools.push(pool);
    const first = createFakeWorker();
    const second = createFakeWorker();

    pool.register({ key: 'worker-a', worker: first });
    const registered = pool.register({ key: 'worker-a', worker: second });

    expect(registered).toBe(false);
    expect(pool.size()).toBe(1);
    expect(pool.get({ key: 'worker-a' })).toBe(first);
  });

  test('register() enforces the max-workers bound', () => {
    const pool = createPool({ ignoreMaxWarning: false, maxWorkers: 2 });
    pools.push(pool);

    expect(pool.register({ key: 'worker-a', worker: createFakeWorker() })).toBe(true);
    expect(pool.register({ key: 'worker-b', worker: createFakeWorker() })).toBe(true);
    expect(pool.register({ key: 'worker-c', worker: createFakeWorker() })).toBe(false);

    expect(pool.size()).toBe(2);
    expect(pool.has({ key: 'worker-c' })).toBe(false);
  });

  test('register() still enforces the bound when the pool is already over the limit', () => {
    const pool = createPool({ ignoreMaxWarning: true, maxWorkers: 1 });
    pools.push(pool);

    pool.register({ key: 'worker-a', worker: createFakeWorker() });
    pool.register({ key: 'worker-b', worker: createFakeWorker() });
    expect(pool.size()).toBe(2);

    pool['ignoreMaxWarning'] = false;
    expect(pool.register({ key: 'worker-c', worker: createFakeWorker() })).toBe(false);
    expect(pool.size()).toBe(2);
  });

  test('register() honours ignoreMaxWarning to grow past the core count', () => {
    const pool = createPool({ ignoreMaxWarning: true, maxWorkers: 1 });
    pools.push(pool);

    expect(pool.register({ key: 'worker-a', worker: createFakeWorker() })).toBe(true);
    expect(pool.register({ key: 'worker-b', worker: createFakeWorker() })).toBe(true);
    expect(pool.size()).toBe(2);
  });
});

describe('WorkerPoolHelper | unregister', () => {
  test('terminates the worker thread and drops the registry entry', async () => {
    const pool = createPool();
    pools.push(pool);
    const worker = createFakeWorker();
    pool.register({ key: 'worker-a', worker });

    await pool.unregister({ key: 'worker-a' });

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(pool.has({ key: 'worker-a' })).toBe(false);
    expect(pool.size()).toBe(0);
  });

  test('is a no-op for a missing key', async () => {
    const pool = createPool();
    pools.push(pool);

    await pool.unregister({ key: 'nope' });

    expect(pool.size()).toBe(0);
  });

  test('drops the registry entry even when terminate() rejects', async () => {
    const pool = createPool();
    pools.push(pool);
    const worker = createFakeWorker({
      terminate: () => Promise.reject(getError({ message: 'terminate failed' })),
    });
    pool.register({ key: 'worker-a', worker });

    await pool.unregister({ key: 'worker-a' });

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(pool.has({ key: 'worker-a' })).toBe(false);
    expect(pool.size()).toBe(0);
  });

  test('a key freed by a failing terminate() can be registered again', async () => {
    const pool = createPool();
    pools.push(pool);
    pool.register({
      key: 'worker-a',
      worker: createFakeWorker({
        terminate: () => Promise.reject(getError({ message: 'terminate failed' })),
      }),
    });

    await pool.unregister({ key: 'worker-a' });

    const replacement = createFakeWorker();
    expect(pool.register({ key: 'worker-a', worker: replacement })).toBe(true);
    expect(pool.get({ key: 'worker-a' })).toBe(replacement);
  });

  test('repeated register/unregister cycles do not grow the registry', async () => {
    const pool = createPool();
    pools.push(pool);

    for (let index = 0; index < 20; index++) {
      pool.register({ key: 'worker-a', worker: createFakeWorker() });
      await pool.unregister({ key: 'worker-a' });
    }

    expect(pool.size()).toBe(0);
  });
});
