import type { ITransaction } from '@venizia/ignis-kernel';
import { LoggerFactory } from '@venizia/ignis-helpers/core';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { RelationalBaseRepository } from '@/relational/core/repositories/core/base';

/** What `RepositoryDoubles.withTransactions` adds: the real `runInTransaction`, with the same contract. */
export type TRepositoryWithTransactions<Repository extends object> = Repository &
  Pick<RelationalBaseRepository, 'runInTransaction'>;

export class RepositoryDoubles {
  /**
   * Gives a hand-made repository double the real `runInTransaction`, so a service that opens a transaction runs in a
   * unit test without a database. The methods are the repository's own, read off its prototype with the two private
   * helpers they call, so the double commits, rolls back and joins exactly as a repository does. `beginTransaction`
   * returns `transaction`: pass a fresh `TransactionDouble` per test, a handle that has ended stays ended.
   */
  static withTransactions<Repository extends object>(opts: {
    repository: Repository;
    transaction: ITransaction;
    logger?: ILogger;
  }): TRepositoryWithTransactions<Repository> {
    const { repository, transaction, logger } = opts;
    const prototype = RelationalBaseRepository.prototype;

    return Object.assign(repository, {
      runInTransaction: prototype.runInTransaction,
      rollbackOwnedTransaction: prototype['rollbackOwnedTransaction'],
      resolveEndedByExecute: prototype['resolveEndedByExecute'],
      beginTransaction: async () => transaction,
      logger: logger ?? LoggerFactory.getLogger(['RepositoryDoubles']),
    });
  }
}
