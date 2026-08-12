import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { RetryBackoffStrategies, RetryJitterModes } from '@venizia/ignis-helpers';

import type { TCount, TFilter } from '@/base/repositories/common';
import { ReadableRelationalRepository } from '@/connectors/relational/repositories/core/readable';

const FAST_RETRY_BACKOFF = {
  strategy: RetryBackoffStrategies.FIXED,
  initialDelayMs: 1,
  jitter: RetryJitterModes.NONE,
} as const;

/**
 * Shared engine-stubbing: pass-through default filter/limit and a canned count, so retry behavior
 * is observable without a database. Engine-neutral on purpose - read retry is SQL-tier behavior,
 * not a Postgres one.
 */
abstract class ReadRetryProbeBase extends ReadableRelationalRepository {
  calls = 0;
  total = 0;

  override applyDefaultFilter<DataObject = AnyType>(opts: {
    userFilter?: TFilter<DataObject>;
  }): TFilter<DataObject> {
    return opts.userFilter ?? {};
  }

  override getDefaultLimit(): number | undefined {
    return undefined;
  }

  override async count(): Promise<TCount> {
    return { count: this.total };
  }
}

/** Per-attempt response queue; lock validation stubbed out. */
class RetryProbeRepository extends ReadRetryProbeBase {
  responses: Array<Array<Record<string, unknown>>> = [];

  protected override validateLockOptions(): void {}

  protected override async findWithCoreAPI<R = AnyType>(): Promise<Array<R>> {
    const index = Math.min(this.calls, this.responses.length - 1);
    this.calls += 1;
    return this.responses[index] as Array<R>;
  }
}

/** Keeps the REAL `validateLockOptions` - `RetryProbeRepository` no-ops it, hiding that invariant. */
class LockAwareRetryProbeRepository extends ReadRetryProbeBase {
  protected override async findWithCoreAPI<R = AnyType>(): Promise<Array<R>> {
    this.calls += 1;
    return [] as Array<R>;
  }
}

/** The query layer itself fails - distinct from an unsatisfied `until`, and never retried. */
class ThrowingRetryProbeRepository extends ReadRetryProbeBase {
  protected override validateLockOptions(): void {}

  protected override async findWithCoreAPI<R = AnyType>(): Promise<Array<R>> {
    this.calls += 1;
    throw getError({ message: '[ThrowingRetryProbeRepository] connection reset by peer' });
  }
}

describe('AbstractRepository read-retry engine', () => {
  test('findOneUntil retries with the default non-null predicate and returns the first hit', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 7 }]];

    const result = await repository['findOneUntil']({
      filter: {},
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual({ id: 7 });
    expect(repository.calls).toBe(2);
  });

  test('findUntil retries with the default non-empty predicate', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 1 }]];

    const result = await repository['findUntil']({
      filter: {},
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual([{ id: 1 }]);
    expect(repository.calls).toBe(2);
  });

  test('findRangeUntil retries on the envelope shape - predicate sees { data, range }', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 1 }]];
    repository.total = 1;

    const result = await repository['findRangeUntil']({
      filter: {},
      options: { shouldQueryRange: true, retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.range).toEqual({ start: 0, end: 0, total: 1 });
    expect(repository.calls).toBe(2);
  });

  test('a transaction skips retry - exactly one execution', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[]];

    const result = await repository['findOneUntil']({
      filter: {},
      options: {
        retry: { maxAttempts: 5, backoff: FAST_RETRY_BACKOFF },
        transaction: {} as AnyType,
      },
    });

    expect(result).toBeNull();
    expect(repository.calls).toBe(1);
  });

  test('exhaustion returns the last (stale) result instead of throwing', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[{ id: 1, status: 'PENDING' }]];

    const result = await repository['findOneUntil']<{ id: number; status: string }>({
      filter: {},
      options: {
        retry: {
          maxAttempts: 2,
          backoff: FAST_RETRY_BACKOFF,
          until: row => row?.status === 'PAID',
        },
      },
    });

    expect(result).toEqual({ id: 1, status: 'PENDING' });
    expect(repository.calls).toBe(2);
  });

  test('lock + retry without a transaction throws before any query runs', async () => {
    const repository = new LockAwareRetryProbeRepository();
    let caught: unknown;

    try {
      await repository.findOne({
        filter: {},
        options: {
          lock: { strength: 'update' },
          retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF },
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error).message).toMatch(/transaction/i);
    expect(repository.calls).toBe(0);
  });

  test('a real query error propagates immediately and is never retried', async () => {
    const repository = new ThrowingRetryProbeRepository();
    let caught: unknown;

    try {
      await repository.findOne({
        filter: {},
        options: { retry: { maxAttempts: 5, backoff: FAST_RETRY_BACKOFF } },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error).message).toMatch(/connection reset by peer/);
    expect(repository.calls).toBe(1);
  });

  test('maxTotalMs stops new attempts long before maxAttempts and still resolves', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[]];

    const result = await repository['findUntil']({
      filter: {},
      options: {
        retry: {
          maxAttempts: 100,
          maxTotalMs: 60,
          backoff: {
            strategy: RetryBackoffStrategies.FIXED,
            initialDelayMs: 15,
            jitter: RetryJitterModes.NONE,
          },
        },
      },
    });

    expect(result).toEqual([]);
    expect(repository.calls).toBeGreaterThan(0);
    expect(repository.calls).toBeLessThan(30);
  });

  test('a non-positive maxTotalMs still performs exactly one read and returns it', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[]];

    const result = await repository['findUntil']({
      filter: {},
      options: { retry: { maxAttempts: 5, maxTotalMs: 0, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual([]);
    expect(repository.calls).toBe(1);
  });

  test('omitting backoff falls back to the repository default schedule and still retries', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 3 }]];

    const startedAt = Date.now();
    const result = await repository['findUntil']({
      filter: {},
      options: { retry: { maxAttempts: 3 } },
    });

    expect(result).toEqual([{ id: 3 }]);
    expect(repository.calls).toBe(2);
    // Default is EXPONENTIAL from 50ms with EQUAL jitter, so the first sleep is >= 25ms.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
  });

  test('an aborted signal stops the retry loop early', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[]];

    const controller = new AbortController();
    const originalCount = () => repository.calls;
    let caught: unknown;

    // Abort as soon as the first attempt has come back unsatisfied.
    const abortWhenFirstAttemptDone = setInterval(() => {
      if (originalCount() >= 1) {
        controller.abort();
        clearInterval(abortWhenFirstAttemptDone);
      }
    }, 1);

    try {
      await repository['findUntil']({
        filter: {},
        options: {
          retry: {
            maxAttempts: 50,
            signal: controller.signal,
            backoff: {
              strategy: RetryBackoffStrategies.FIXED,
              initialDelayMs: 10,
              jitter: RetryJitterModes.NONE,
            },
          },
        },
      });
    } catch (error) {
      caught = error;
    }

    clearInterval(abortWhenFirstAttemptDone);

    expect(caught).toBeDefined();
    expect((caught as Error).message).toMatch(/Aborted/);
    expect(repository.calls).toBeLessThan(50);
  });
});

describe('postgres readable retry wiring', () => {
  test('find with retry re-runs until rows appear', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 1 }]];

    const results = await repository.find({
      filter: {},
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(results).toEqual([{ id: 1 }]);
    expect(repository.calls).toBe(2);
  });

  test('find without retry executes exactly once - untouched fast path', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[]];

    const results = await repository.find({ filter: {} });

    expect(results).toEqual([]);
    expect(repository.calls).toBe(1);
  });

  test('findById inherits retry through findOne - default non-null predicate', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 7 }]];

    const result = await repository.findById({
      id: 7,
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual({ id: 7 });
    expect(repository.calls).toBe(2);
  });

  test('the update case: a caller-supplied until sees the typed row', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[{ id: 1, status: 'PENDING' }], [{ id: 1, status: 'PAID' }]];

    const result = await repository.findOne<{ id: number; status: string }>({
      filter: {},
      options: {
        retry: {
          maxAttempts: 3,
          backoff: FAST_RETRY_BACKOFF,
          until: row => row?.status === 'PAID',
        },
      },
    });

    expect(result).toEqual({ id: 1, status: 'PAID' });
    expect(repository.calls).toBe(2);
  });

  test('shouldQueryRange composite retries data+count together, predicate sees the envelope', async () => {
    const repository = new RetryProbeRepository();
    repository.responses = [[], [{ id: 1 }]];
    repository.total = 1;

    const result = await repository.find({
      filter: {},
      options: {
        shouldQueryRange: true,
        retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF },
      },
    });

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.range).toEqual({ start: 0, end: 0, total: 1 });
    expect(repository.calls).toBe(2);
  });
});

/** Never executed. Write verbs must reject `retry` - deleting any marker below must break the build. */
export const writeVerbsRejectRetryGuard = (repository: RetryProbeRepository) => [
  // @ts-expect-error - create options never accept retry
  repository.create({ data: {} as AnyType, options: { retry: {} } }),
  // @ts-expect-error - updateById options never accept retry
  repository.updateById({ id: 1, data: {} as AnyType, options: { retry: {} } }),
  // @ts-expect-error - deleteById options never accept retry
  repository.deleteById({ id: 1, options: { retry: {} } }),
];
