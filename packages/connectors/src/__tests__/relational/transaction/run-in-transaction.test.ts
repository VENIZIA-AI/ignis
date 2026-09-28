import type { ITransaction } from '@venizia/ignis-kernel';
import { IsolationLevels } from '@/relational/postgres/datasources';
import { PostgresTransactionDouble, TransactionStates } from '@/testing';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { describe, expect, mock, spyOn, test } from 'bun:test';
import { PostgresTransactionRepository } from './engine-fixtures';
import { captureRejection } from './parity-suite';
import { RecordingLogger } from './recording-logger';

/**
 * `runInTransaction` against the double, so every branch is reached without a database: the owned
 * path begins through `this.beginTransaction`, which the test stubs, and the joined path never
 * begins at all. The runtime file proves the same rules on PGlite and libsql.
 */
const buildRepository = (opts: { double?: PostgresTransactionDouble }) => {
  const repository = new PostgresTransactionRepository();
  const logger = new RecordingLogger();
  repository.logger = logger;

  const double = opts.double ?? new PostgresTransactionDouble();
  const beginSpy = spyOn(repository, 'beginTransaction').mockResolvedValue(double);

  return { repository, logger, double, beginSpy };
};

describe('runInTransaction - owned (no transaction passed)', () => {
  test('begins, runs execute with the new handle, commits, and returns what execute returned', async () => {
    const { repository, double, beginSpy } = buildRepository({});
    const execute = mock(async (opts: { transaction: ITransaction }) => {
      expect(opts.transaction).toBe(double);
      expect(opts.transaction.isActive).toBe(true);
      return 'execute-result';
    });

    const result = await repository.runInTransaction({ execute });

    expect(result).toBe('execute-result');
    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(double.commitCount).toBe(1);
    expect(double.rollbackCount).toBe(0);
    expect(double.state).toBe(TransactionStates.COMMITTED);
  });

  test('passes transactionOptions to beginTransaction', async () => {
    const { repository, beginSpy } = buildRepository({});

    await repository.runInTransaction({
      transactionOptions: { isolationLevel: IsolationLevels.SERIALIZABLE },
      execute: async () => undefined,
    });

    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledWith({ isolationLevel: IsolationLevels.SERIALIZABLE });
  });

  test('rolls back when execute throws, and rethrows the original error untouched', async () => {
    const { repository, double } = buildRepository({});
    const original = getError({ message: '[RunInTransactionTest] execute failed' });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        execute: async () => {
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(double.commitCount).toBe(0);
    expect(double.rollbackCount).toBe(1);
    expect(double.state).toBe(TransactionStates.ROLLED_BACK);
  });

  test('a commit failure is thrown, and the rollback that follows is the failure no-op', async () => {
    const commitError = getError({ message: '[RunInTransactionTest] commit failed' });
    const { repository, double } = buildRepository({
      double: new PostgresTransactionDouble({ commitError }),
    });

    const caught = await captureRejection({
      task: repository.runInTransaction({ execute: async () => 'never-returned' }),
    });

    expect(caught).toBe(commitError);
    expect(double.commitCount).toBe(1);
    expect(double.rollbackCount).toBe(0);
    expect(double.state).toBe(TransactionStates.FAILED);
  });

  test('a rollback failure is logged at error and the ORIGINAL error is rethrown', async () => {
    const rollbackError = getError({ message: '[RunInTransactionTest] rollback failed' });
    const { repository, logger, double } = buildRepository({
      double: new PostgresTransactionDouble({ rollbackError }),
    });
    const original = getError({ message: '[RunInTransactionTest] execute failed' });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        execute: async () => {
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(double.rollbackCount).toBe(1);
    expect(double.state).toBe(TransactionStates.FAILED);
    expect(logger.countAt({ level: 'error' })).toBeGreaterThanOrEqual(1);
  });

  test('a failed begin rejects with its error and never runs execute', async () => {
    const { repository, beginSpy } = buildRepository({});
    const beginError = getError({ message: '[RunInTransactionTest] begin failed' });
    beginSpy.mockRejectedValue(beginError);
    const execute = mock(async () => 'never-called');

    const caught = await captureRejection({ task: repository.runInTransaction({ execute }) });

    expect(caught).toBe(beginError);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runInTransaction - joined (a transaction passed)', () => {
  test('runs execute with the SAME handle, never begins, commits or rolls back', async () => {
    const { repository, beginSpy } = buildRepository({});
    const joined = new PostgresTransactionDouble();
    const execute = mock(async (opts: { transaction: ITransaction }) => {
      expect(opts.transaction).toBe(joined);
      return 'joined-result';
    });

    const result = await repository.runInTransaction({ transaction: joined, execute });

    expect(result).toBe('joined-result');
    expect(beginSpy).not.toHaveBeenCalled();
    expect(joined.commitCount).toBe(0);
    expect(joined.rollbackCount).toBe(0);
    expect(joined.isActive).toBe(true);
    expect(joined.state).toBe(TransactionStates.ACTIVE);
  });

  test('rethrows the execute error untouched and leaves the handle active for its owner', async () => {
    const { repository } = buildRepository({});
    const joined = new PostgresTransactionDouble();
    const original = getError({ message: '[RunInTransactionTest] execute failed' });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        transaction: joined,
        execute: async () => {
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(joined.commitCount).toBe(0);
    expect(joined.rollbackCount).toBe(0);
    expect(joined.isActive).toBe(true);
  });

  test('an inactive handle throws before execute runs', async () => {
    const { repository, beginSpy } = buildRepository({});
    const joined = new PostgresTransactionDouble();
    await joined.commit();
    const execute = mock(async () => 'never-called');

    const caught = await captureRejection({
      task: repository.runInTransaction({ transaction: joined, execute }),
    });

    expect(isApplicationError(caught)).toBe(true);
    expect(caught).toMatchObject({
      message: '[PostgresTransactionRepository][runInTransaction] Transaction is no longer active',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(beginSpy).not.toHaveBeenCalled();
    expect(joined.commitCount).toBe(1);
    expect(joined.rollbackCount).toBe(0);
  });

  test('transactionOptions are ignored with a debug line - no begin, no error', async () => {
    const { repository, logger, beginSpy } = buildRepository({});
    const joined = new PostgresTransactionDouble();
    const execute = mock(async () => 'joined-result');

    const result = await repository.runInTransaction({
      transaction: joined,
      transactionOptions: { isolationLevel: IsolationLevels.SERIALIZABLE },
      execute,
    });

    expect(result).toBe('joined-result');
    expect(beginSpy).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(joined.commitCount).toBe(0);
    expect(logger.countAt({ level: 'debug' })).toBeGreaterThanOrEqual(1);
  });
});

/**
 * `execute` receives the owned handle, so it can end it. runInTransaction must then neither end it a
 * second time nor report a rollback failure that is only the already-ended guard answering.
 */
describe('runInTransaction - owned, when execute ends the transaction itself', () => {
  /** The house message shape, `[<Repository>][runInTransaction] ...`, naming `execute` as the cause. */
  const EXECUTE_ENDED_MESSAGE = /^\[PostgresTransactionRepository\]\[runInTransaction\] .*execute/;

  const spyOnEnds = (opts: { double: PostgresTransactionDouble }) => ({
    commitSpy: spyOn(opts.double, 'commit'),
    rollbackSpy: spyOn(opts.double, 'rollback'),
  });

  test('execute committed: returns its result, commits no second time, logs no rollback failure', async () => {
    const { repository, logger, double } = buildRepository({});
    const { commitSpy, rollbackSpy } = spyOnEnds({ double });

    const result = await repository.runInTransaction({
      execute: async ({ transaction }) => {
        await transaction.commit();
        return 'execute-result';
      },
    });

    expect(result).toBe('execute-result');
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(double.commitCount).toBe(1);
    expect(double.state).toBe(TransactionStates.COMMITTED);
    expect(logger.countAt({ level: 'error' })).toBe(0);
  });

  test('execute rolled back: throws a clear error naming execute, attempts no rollback of its own', async () => {
    const { repository, logger, double } = buildRepository({});
    const { commitSpy, rollbackSpy } = spyOnEnds({ double });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        execute: async ({ transaction }) => {
          await transaction.rollback();
          return 'execute-result';
        },
      }),
    });

    expect(isApplicationError(caught)).toBe(true);
    expect(caught).toMatchObject({ message: expect.stringMatching(EXECUTE_ENDED_MESSAGE) });
    expect(commitSpy).not.toHaveBeenCalled();
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(double.state).toBe(TransactionStates.ROLLED_BACK);
    expect(logger.countAt({ level: 'error' })).toBe(0);
  });

  test('execute ended it by a failed commit it caught: throws the clear error, attempts no rollback', async () => {
    const commitError = getError({
      message: '[RunInTransactionTest] commit failed inside execute',
    });
    const { repository, logger, double } = buildRepository({
      double: new PostgresTransactionDouble({ commitError }),
    });
    const { commitSpy, rollbackSpy } = spyOnEnds({ double });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        execute: async ({ transaction }) => {
          await captureRejection({ task: transaction.commit() });
          return 'execute-result';
        },
      }),
    });

    expect(isApplicationError(caught)).toBe(true);
    expect(caught).toMatchObject({ message: expect.stringMatching(EXECUTE_ENDED_MESSAGE) });
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(double.state).toBe(TransactionStates.FAILED);
    expect(logger.countAt({ level: 'error' })).toBe(0);
  });

  test('execute committed and then threw: the ORIGINAL error, no rollback attempted, no rollback-failure log', async () => {
    const { repository, logger, double } = buildRepository({});
    const { commitSpy, rollbackSpy } = spyOnEnds({ double });
    const original = getError({ message: '[RunInTransactionTest] execute failed after commit' });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        execute: async ({ transaction }) => {
          await transaction.commit();
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(double.state).toBe(TransactionStates.COMMITTED);
    expect(logger.countAt({ level: 'error' })).toBe(0);
  });

  test('execute rolled back and then threw: the ORIGINAL error, no second rollback, no rollback-failure log', async () => {
    const { repository, logger, double } = buildRepository({});
    const { rollbackSpy } = spyOnEnds({ double });
    const original = getError({ message: '[RunInTransactionTest] execute failed after rollback' });

    const caught = await captureRejection({
      task: repository.runInTransaction({
        execute: async ({ transaction }) => {
          await transaction.rollback();
          throw original;
        },
      }),
    });

    expect(caught).toBe(original);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(double.rollbackCount).toBe(1);
    expect(logger.countAt({ level: 'error' })).toBe(0);
  });
});
