import type { ITransaction } from '@venizia/ignis-kernel';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresTransactionDouble, RepositoryDoubles, TransactionStates } from '@/testing';
import { getError } from '@venizia/ignis-helpers/core';
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
  const repository = RepositoryDoubles.withTransactions({
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

describe('RepositoryDoubles.withTransactions', () => {
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
    const original = getError({ message: '[RepositoryDoublesTest] create failed' });
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
    const { repository, create } = buildRepository();
    const owner = new PostgresTransactionDouble();

    await repository.runInTransaction({
      transaction: owner,
      execute: ({ transaction }) =>
        repository.create({ data: { name: 'b' }, options: { transaction } }),
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(owner.commitCount).toBe(0);
    expect(owner.rollbackCount).toBe(0);
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
});
