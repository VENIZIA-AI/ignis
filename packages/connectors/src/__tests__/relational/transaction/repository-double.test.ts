import type { ITransaction } from '@venizia/ignis-kernel';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresTransactionDouble, RepositoryDouble, TransactionStates } from '@/testing';
import { getError } from '@venizia/ignis-helpers/core';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, mock, test } from 'bun:test';

/**
 * A service that opens a transaction runs against a hand-made repository double: the double has no database, and
 * `withTransactions` gives it the repository's own `runInTransaction`.
 */
const buildRepository = () => {
  const transaction = new PostgresTransactionDouble();
  const create = mock(
    async (opts: { data: { name: string }; options?: { transaction?: ITransaction } }) => opts.data,
  );
  const repository = RepositoryDouble.withTransactions({
    repository: { create },
    transaction,
    source: DefaultCRUDRepository,
  });

  return { repository, transaction, create };
};

/** The shape of service code: a repository method inside a transaction the service opens. */
const createInTransaction = (opts: {
  repository: ReturnType<typeof buildRepository>['repository'];
  name: string;
}) => {
  const { repository, name } = opts;

  return repository.runInTransaction({
    execute: ({ transaction }) => repository.create({ data: { name }, options: { transaction } }),
  });
};

describe('RepositoryDouble.withTransactions', () => {
  test('runs a repository method inside a transaction and commits it', async () => {
    const { repository, transaction, create } = buildRepository();

    const created = await createInTransaction({ repository, name: 'a' });

    expect(created).toEqual({ name: 'a' });
    expect(create).toHaveBeenCalledWith({ data: { name: 'a' }, options: { transaction } });
    expect(transaction.commitCount).toBe(1);
    expect(transaction.state).toBe(TransactionStates.COMMITTED);
  });

  test('rolls back when the repository method throws, and rethrows the original error', async () => {
    const { repository, transaction, create } = buildRepository();
    const original = getError({ message: '[RepositoryDoubleTest] create failed' });
    create.mockRejectedValueOnce(original);

    let caught;

    try {
      const result = await createInTransaction({ repository, name: 'a' });
      caught = result;
    } catch (error: any) {
      caught = error;
    }

    expect(caught).toBe(original);
    expect(transaction.rollbackCount).toBe(1);
    expect(transaction.commitCount).toBe(0);
  });

  test('joins a transaction it is given and leaves its end to the owner', async () => {
    const { repository, transaction: built, create } = buildRepository();
    const owner = new PostgresTransactionDouble();

    await repository.runInTransaction({
      transaction: owner,
      execute: ({ transaction }) =>
        repository.create({ data: { name: 'b' }, options: { transaction } }),
    });

    expect(create).toHaveBeenCalledWith({ data: { name: 'b' }, options: { transaction: owner } });
    expect(owner.commitCount).toBe(0);
    expect(owner.rollbackCount).toBe(0);
    expect(built.commitCount).toBe(0);
    expect(built.state).toBe(TransactionStates.ACTIVE);
  });

  test('an owned transaction that execute ended itself is not ended twice', async () => {
    const { repository, transaction } = buildRepository();

    await repository.runInTransaction({
      execute: async ({ transaction: owned }) => {
        await owned.commit();
      },
    });

    expect(transaction.commitCount).toBe(1);
  });

  describe('events: the order of begin, commit and rollback', () => {
    test('a commit flow is begin, then commit', async () => {
      const { repository, transaction } = buildRepository();

      expect(transaction.events).toEqual([]);

      await createInTransaction({ repository, name: 'a' });

      expect(transaction.events).toEqual(['begin', 'commit']);
    });

    test('a rollback-on-error flow is begin, then rollback, and the error is still the original', async () => {
      const { repository, transaction, create } = buildRepository();
      const original = getError({ message: '[RepositoryDoubleTest] create failed' });
      create.mockRejectedValueOnce(original);

      const result2 = await RejectionHelper.rejectionOf({
        task: createInTransaction({ repository, name: 'a' }),
      });
      expect(result2).toBe(original);

      expect(transaction.events).toEqual(['begin', 'rollback']);
    });

    test('a joined call records no begin of its own, and the owner records its own end', async () => {
      const { repository, transaction: built } = buildRepository();
      const owner = new PostgresTransactionDouble();

      await repository.runInTransaction({
        transaction: owner,
        execute: ({ transaction }) =>
          repository.create({ data: { name: 'b' }, options: { transaction } }),
      });

      expect(owner.events).toEqual([]);
      expect(built.events).toEqual([]);

      await owner.commit();

      expect(owner.events).toEqual(['commit']);
    });

    test('a nested call inside an owned transaction joins it: one begin, one commit', async () => {
      const { repository, transaction } = buildRepository();

      await repository.runInTransaction({
        execute: ({ transaction: owned }) =>
          repository.runInTransaction({
            transaction: owned,
            execute: () =>
              repository.create({ data: { name: 'c' }, options: { transaction: owned } }),
          }),
      });

      expect(transaction.events).toEqual(['begin', 'commit']);
    });

    test('an end the handle refuses is not recorded, and the list is a snapshot', async () => {
      const transaction = new PostgresTransactionDouble();

      await transaction.commit();
      const before = transaction.events;
      await RejectionHelper.expectRejection({ task: transaction.commit(), message: /.+/ });

      expect(before).toEqual(['commit']);
      expect(transaction.events).toEqual(['commit']);
      expect(transaction.commitCount).toBe(1);
    });

    test('a failed commit is recorded as a commit; the hooks and counters are unchanged', async () => {
      const failing = new PostgresTransactionDouble({ commitError: new Error('boom') });

      await RejectionHelper.expectRejection({ task: failing.commit(), message: 'boom' });

      expect(failing.events).toEqual(['commit']);
      expect(failing.commitCount).toBe(1);
    });

    test('events interleave with what the code under test does', async () => {
      const { repository, transaction, create } = buildRepository();
      create.mockImplementationOnce(async (opts) => {
        expect(transaction.events).toEqual(['begin']);

        return opts.data;
      });

      await createInTransaction({ repository, name: 'a' });

      expect(transaction.events).toEqual(['begin', 'commit']);
    });
  });
});
