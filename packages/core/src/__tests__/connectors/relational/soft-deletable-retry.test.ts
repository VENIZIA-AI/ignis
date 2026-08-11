import { describe, expect, test } from 'bun:test';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { AnyType, TNullable } from '@venizia/ignis-helpers';
import { ApplicationError, RetryBackoffStrategies, RetryJitterModes } from '@venizia/ignis-helpers';
import { model } from '@/base/metadata';
import type { TDataWithRange } from '@/base/repositories/common';
import { RepositoryErrors } from '@/base/repositories/common';
import { PostgresQueryDialect } from '@/connectors/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/connectors/postgres/repositories/executor';
import type { TTableObject } from '@/connectors/relational/models';
import { BaseRelationalEntity } from '@/connectors/relational/models';
import type { RelationalBaseRepository } from '@/connectors/relational/repositories/core/base';
import { SoftDeletableRelationalRepository } from '@/connectors/relational/repositories/core/soft-deletable';

/**
 * `SoftDeletableRelationalRepository` is the class most consumers extend, so its `findById`
 * overloads must keep `IWithReadRetry` in `options`. Typing it as `ExtraOptions & { isStrict?: X }`
 * omits that and makes `options.retry` a compile error. `bun test` erases types, so the type-level
 * guards below are enforced by `tsc` alone.
 */

const FAST_RETRY_BACKOFF = {
  strategy: RetryBackoffStrategies.FIXED,
  initialDelayMs: 1,
  jitter: RetryJitterModes.NONE,
} as const;

const retryAccounts = pgTable('soft_deletable_retry_accounts', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }),
  status: varchar('status', { length: 32 }),
  deletedAt: timestamp('deleted_at'),
});

type TAccountRow = TTableObject<typeof retryAccounts>;

@model({ type: 'entity', settings: { defaultFilter: { where: { deletedAt: null } } } })
class RetryAccountEntity extends BaseRelationalEntity<typeof retryAccounts> {
  static override schema = retryAccounts;
  static override TABLE_NAME = 'soft_deletable_retry_accounts';
}

/**
 * Every `select()` resolves the next queued row set, so an N-attempt retry loop shows up as N
 * entries in `selectCalls`. A queue shorter than the attempt count keeps yielding the empty set.
 */
const buildQueuedSelectConnector = (opts: { rowSets: Array<Array<AnyType>> }) => {
  const pending = [...opts.rowSets];
  const selectCalls: number[] = [];

  const buildChain = (rows: Array<AnyType>): Record<string, AnyType> => {
    const chain: Record<string, AnyType> = {};
    chain.from = () => chain;
    chain.$dynamic = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => chain;
    chain.offset = () => chain;
    chain.for = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve(rows);
    return chain;
  };

  return {
    selectCalls,
    connector: {
      select: () => {
        const rows = pending.shift() ?? [];
        selectCalls.push(rows.length);
        return buildChain(rows);
      },
      $count: async () => 0,
    } as AnyType,
  };
};

const buildRepository = (opts: {
  rowSets: Array<Array<AnyType>>;
}): {
  repository: SoftDeletableRelationalRepository<typeof retryAccounts>;
  selectCalls: number[];
} => {
  const { connector, selectCalls } = buildQueuedSelectConnector({ rowSets: opts.rowSets });

  const dataSource = {
    getQueryDialect: () => new PostgresQueryDialect(),
    getQueryExecutor: () => new PostgresQueryExecutor(),
    getConnector: () => connector,
  } as AnyType;

  const repository = new SoftDeletableRelationalRepository<typeof retryAccounts>(dataSource, {
    entityClass: RetryAccountEntity,
  });

  return { repository, selectCalls };
};

const PENDING_ROW = { id: 1, email: 'a@b.c', status: 'pending', deletedAt: null };
const READY_ROW = { id: 1, email: 'a@b.c', status: 'ready', deletedAt: null };

describe('SoftDeletableRelationalRepository.findById - read retry', () => {
  test('re-reads until the row appears, then returns it', async () => {
    const { repository, selectCalls } = buildRepository({ rowSets: [[], [], [READY_ROW]] });

    const result = await repository.findById({
      id: 1,
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual(READY_ROW);
    expect(selectCalls.length).toBe(3);
  });

  test('stops as soon as the row is there - a hit on the first attempt issues one select', async () => {
    const { repository, selectCalls } = buildRepository({ rowSets: [[READY_ROW]] });

    const result = await repository.findById({
      id: 1,
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual(READY_ROW);
    expect(selectCalls.length).toBe(1);
  });

  test('exhaustion returns the last result (null) instead of throwing', async () => {
    const { repository, selectCalls } = buildRepository({ rowSets: [[], [], []] });

    const result = await repository.findById({
      id: 1,
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toBeNull();
    expect(selectCalls.length).toBe(3);
  });

  test('isStrict throws ENTITY_NOT_FOUND only AFTER the retries are exhausted', async () => {
    const { repository, selectCalls } = buildRepository({ rowSets: [[], [], []] });
    let caught: unknown;

    try {
      await repository.findById({
        id: 1,
        options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF }, isStrict: true },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApplicationError);
    const applicationError = caught as ApplicationError;
    expect(applicationError.statusCode).toBe(404);
    expect(applicationError.normalized.code).toBe(RepositoryErrors.ENTITY_NOT_FOUND.message.code);
    // The retry loop runs inside super.findById -> findOne, so all 3 attempts happen before the throw.
    expect(selectCalls.length).toBe(3);
  });

  test('isStrict returns the row when a later attempt finds it - no throw', async () => {
    const { repository, selectCalls } = buildRepository({ rowSets: [[], [READY_ROW]] });

    const result = await repository.findById({
      id: 1,
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF }, isStrict: true },
    });

    expect(result).toEqual(READY_ROW);
    expect(selectCalls.length).toBe(2);
  });

  test('a custom until predicate is honoured over the default non-null check', async () => {
    const { repository, selectCalls } = buildRepository({
      rowSets: [[PENDING_ROW], [PENDING_ROW], [READY_ROW]],
    });

    const result = await repository.findById({
      id: 1,
      options: {
        retry: {
          maxAttempts: 3,
          backoff: FAST_RETRY_BACKOFF,
          until: row => row?.status === 'ready',
        },
      },
    });

    expect(result).toEqual(READY_ROW);
    // The default predicate would have stopped at attempt 1 - PENDING_ROW is non-null.
    expect(selectCalls.length).toBe(3);
  });

  test('without retry the behavior is untouched - a single select', async () => {
    const { repository, selectCalls } = buildRepository({ rowSets: [[]] });

    const result = await repository.findById({ id: 1 });

    expect(result).toBeNull();
    expect(selectCalls.length).toBe(1);
  });
});

/**
 * Mutual assignability: a one-directional `extends` would let the non-nullable `isStrict: true`
 * return type pass as `TNullable<R>`, which is the fallthrough this guard has to catch.
 */
type TExactly<TActual, TExpected> = [TActual] extends [TExpected]
  ? [TExpected] extends [TActual]
    ? true
    : never
  : never;

describe('SoftDeletableRelationalRepository.findById - compile-time contract', () => {
  test('options.retry resolves the non-strict overload and keeps the nullable return', async () => {
    const { repository } = buildRepository({ rowSets: [[READY_ROW]] });

    const result = await repository.findById({
      id: 1,
      options: { retry: { maxAttempts: 2, backoff: FAST_RETRY_BACKOFF } },
    });

    // Fails to compile if `retry` is rejected by the non-strict overload and resolution falls
    // through to the `isStrict: true` one, whose return type is `TAccountRow`, not `TNullable<_>`.
    const isNullableReturn: TExactly<typeof result, TNullable<TAccountRow>> = true;

    expect(isNullableReturn).toBe(true);
    expect(result).toEqual(READY_ROW);
  });

  test('options.retry with isStrict: true still narrows the return to non-nullable', async () => {
    const { repository } = buildRepository({ rowSets: [[READY_ROW]] });

    const result = await repository.findById({
      id: 1,
      options: { retry: { maxAttempts: 2, backoff: FAST_RETRY_BACKOFF }, isStrict: true },
    });

    const isNonNullableReturn: TExactly<typeof result, TAccountRow> = true;

    expect(isNonNullableReturn).toBe(true);
    expect(result).toEqual(READY_ROW);
  });
});

/**
 * `RelationalBaseRepository` re-declares `find`/`findOne`/`findById` as abstract, and those
 * re-declarations - not the concrete subclass ones - are what a caller sees through a base-tier
 * reference. Nothing else in the suite holds such a reference, so narrowing `retry` back off them
 * would otherwise pass both `tsc` and `bun test`. Retype the parameter below as
 * `SoftDeletableRelationalRepository` and the guard stops guarding anything.
 */
const readEveryVerbViaBaseTier = async (opts: {
  repository: RelationalBaseRepository<typeof retryAccounts>;
}): Promise<{ assertions: boolean[]; rows: Array<TNullable<TAccountRow>> }> => {
  const { repository } = opts;
  const retry = { maxAttempts: 2, backoff: FAST_RETRY_BACKOFF };

  const byId = await repository.findById({ id: 1, options: { retry } });
  const one = await repository.findOne({ filter: {}, options: { retry } });
  const many = await repository.find({ filter: {}, options: { retry } });
  const ranged = await repository.find({
    filter: {},
    options: { shouldQueryRange: true, retry },
  });

  // Mutual assignability, not `extends`: a one-directional check would accept a widened `unknown`
  // or a collapsed union and let the narrowing come back unnoticed.
  const isNullableById: TExactly<typeof byId, TNullable<TAccountRow>> = true;
  const isNullableOne: TExactly<typeof one, TNullable<TAccountRow>> = true;
  const isPlainArray: TExactly<typeof many, Array<TAccountRow>> = true;
  const isRangeEnvelope: TExactly<typeof ranged, TDataWithRange<TAccountRow>> = true;

  return {
    assertions: [isNullableById, isNullableOne, isPlainArray, isRangeEnvelope],
    rows: [byId, one, many[0] ?? null, ranged.data[0] ?? null],
  };
};

describe('RelationalBaseRepository read verbs - compile-time contract', () => {
  test('find, findOne and findById all accept options.retry through a base-tier reference', async () => {
    const { repository } = buildRepository({
      rowSets: [[READY_ROW], [READY_ROW], [READY_ROW], [READY_ROW]],
    });

    const { assertions, rows } = await readEveryVerbViaBaseTier({ repository });

    expect(assertions).toEqual([true, true, true, true]);
    expect(rows).toEqual([READY_ROW, READY_ROW, READY_ROW, READY_ROW]);
  });
});
