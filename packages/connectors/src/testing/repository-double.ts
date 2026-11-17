import { LoggerFactory } from '@venizia/ignis-helpers/core';
import type { ILogger } from '@venizia/ignis-helpers/core';
import type { IRelationalTransaction } from '@/relational/core/datasources/common/types';
import type { RelationalBaseRepository } from '@/relational/core/repositories/core/base';

/** What `RepositoryDouble.withTransactions` adds: the real `runInTransaction`, with the same contract. */
export type TRepositoryWithTransactions<Repository extends object> = Repository &
  Pick<RelationalBaseRepository, 'runInTransaction'>;

/** Test helper that gives a hand-made repository double the real transaction behaviour, without a database. */
export class RepositoryDouble {
  /**
   * Gives a hand-made repository double the real `runInTransaction`, so a service that opens a transaction runs in a
   * unit test without a database. The methods are `source`'s own, read off its prototype with the two private helpers
   * they call, so the double commits, rolls back and joins exactly as a repository does. `source` is a repository
   * class (`DefaultCRUDRepository`): this entry imports no repository code, so it loads without the database driver.
   * `beginTransaction` returns `transaction`: pass a fresh `TransactionDouble` per test, a handle that has ended stays ended.
   * When `transaction` is a `TransactionDouble`, each `beginTransaction` is recorded in its `events`, so a test can assert the order
   * of begin, commit and rollback; a call that joins a transaction it was given does not begin one.
   * It overwrites the double's own `runInTransaction`, `beginTransaction` and `logger`, and returns the same object.
   */
  static withTransactions<Repository extends object>(opts: {
    repository: Repository;
    transaction: IRelationalTransaction<unknown>;
    source: { prototype: RelationalBaseRepository };
    logger?: ILogger;
  }): TRepositoryWithTransactions<Repository> {
    const { repository, transaction, source, logger } = opts;
    const { prototype } = source;

    return Object.assign(repository, {
      runInTransaction: prototype.runInTransaction,
      rollbackOwnedTransaction: prototype['rollbackOwnedTransaction'],
      resolveEndedByExecute: prototype['resolveEndedByExecute'],
      beginTransaction: async () => {
        // By shape, not `instanceof`: two installed copies of this package each have their own class.
        if ('recordBegin' in transaction && typeof transaction.recordBegin === 'function') {
          transaction.recordBegin();
        }

        return transaction;
      },
      logger: logger ?? LoggerFactory.getLogger(['RepositoryDouble']),
    });
  }
}
