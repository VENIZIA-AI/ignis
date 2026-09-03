import { IsolationLevels } from '@venizia/ignis/postgres';
import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Isolation Cases - visibility and isolation-level behavior across transactions
// ----------------------------------------------------------------
export class IsolationCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 4: Read within Transaction
  // ----------------------------------------------------------------
  async case4ReadWithinTransaction(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[CASE 4] Read within Transaction - Uncommitted data visible in transaction',
    );

    const code = `TX_READ_WITHIN_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 999 },
        options: { transaction },
      });

      const withinTx = await repo.findOne({
        filter: { where: { code } },
        options: { transaction },
      });

      const outsideTx = await repo.findOne({ filter: { where: { code } } });

      if (withinTx && !outsideTx) {
        this.context.logger.info('[CASE 4] PASSED - Within tx sees data, outside tx does not');
      } else {
        this.context.logger.error(
          '[CASE 4] FAILED - withinTx: %j, outsideTx: %j',
          !!withinTx,
          !!outsideTx,
        );
      }

      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 4] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Isolation Level - READ COMMITTED
  // ----------------------------------------------------------------
  async case8IsolationLevelReadCommitted(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 8] Isolation Level - READ COMMITTED');

    const transaction = await repo.beginTransaction({
      isolationLevel: IsolationLevels.READ_COMMITTED,
    });

    try {
      if (transaction.isolationLevel === IsolationLevels.READ_COMMITTED) {
        this.context.logger.info(
          '[CASE 8] PASSED - Transaction created with READ COMMITTED isolation',
        );
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED - Expected READ COMMITTED, got: %s',
          transaction.isolationLevel,
        );
      }
      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 8] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Isolation Level - SERIALIZABLE
  // ----------------------------------------------------------------
  async case9IsolationLevelSerializable(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 9] Isolation Level - SERIALIZABLE');

    const code = `TX_SERIALIZABLE_${getUID()}`;
    const transaction = await repo.beginTransaction({
      isolationLevel: IsolationLevels.SERIALIZABLE,
    });

    try {
      if (transaction.isolationLevel === IsolationLevels.SERIALIZABLE) {
        this.context.logger.info('[CASE 9] Transaction created with SERIALIZABLE isolation');
      } else {
        this.context.logger.error('[CASE 9] Wrong isolation level: %s', transaction.isolationLevel);
      }

      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
        options: { transaction },
      });

      await transaction.commit();

      const result = await repo.findOne({ filter: { where: { code } } });
      if (result) {
        this.context.logger.info(
          '[CASE 9] PASSED - SERIALIZABLE transaction committed successfully',
        );
        await repo.deleteAll({ where: { code } });
      } else {
        this.context.logger.error('[CASE 9] FAILED - Record not found after SERIALIZABLE commit');
      }
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 9] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Concurrent Transactions on Same Data
  // ----------------------------------------------------------------
  async case12ConcurrentTransactionsOnSameData(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 12] Concurrent Transactions on Same Data');

    const code = `TX_CONCURRENT_${getUID()}`;

    try {
      // Create initial record
      await repo.create({
        data: { code, group: 'TX_CONCURRENT_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      // Start two transactions concurrently
      const tx1 = await repo.beginTransaction();
      const tx2 = await repo.beginTransaction();

      try {
        // Both transactions read the same data
        await repo.findOne({
          filter: { where: { code } },
          options: { transaction: tx1 },
        });
        await repo.findOne({
          filter: { where: { code } },
          options: { transaction: tx2 },
        });

        // Both try to update
        await repo.updateAll({
          where: { code },
          data: { nValue: 200 },
          options: { transaction: tx1 },
        });

        await tx1.commit();

        // TX2 might fail or succeed depending on isolation level
        let tx2Committed = false;
        try {
          await repo.updateAll({
            where: { code },
            data: { nValue: 300 },
            options: { transaction: tx2 },
          });
          await tx2.commit();
          tx2Committed = true;
          this.context.logger.info(
            '[CASE 12] INFO | Both concurrent transactions completed (last wins)',
          );
        } catch {
          await tx2.rollback();
          this.context.logger.info(
            '[CASE 12] INFO | Second transaction detected conflict and rolled back',
          );
        }

        // Verify final state matches expected outcome
        const final = await repo.findOne({ filter: { where: { code } } });
        const expectedValue = tx2Committed ? 300 : 200;

        if (final?.nValue === expectedValue) {
          this.context.logger.info(
            '[CASE 12] PASSED | Final value: %d (expected %d, tx2 committed: %s)',
            final.nValue,
            expectedValue,
            tx2Committed,
          );
        } else {
          this.context.logger.error(
            '[CASE 12] FAILED | Final value: %d | expected: %d | tx2 committed: %s',
            final?.nValue,
            expectedValue,
            tx2Committed,
          );
        }
      } catch (error) {
        try {
          await tx1.rollback();
        } catch {
          /* ignore */
        }
        try {
          await tx2.rollback();
        } catch {
          /* ignore */
        }
        throw error;
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group: 'TX_CONCURRENT_TEST' } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Isolation Level - REPEATABLE READ
  // ----------------------------------------------------------------
  async case18IsolationLevelRepeatableRead(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 18] Isolation Level - REPEATABLE READ');

    try {
      const transaction = await repo.beginTransaction({
        isolationLevel: IsolationLevels.REPEATABLE_READ,
      });

      if (transaction.isolationLevel === IsolationLevels.REPEATABLE_READ) {
        this.context.logger.info(
          '[CASE 18] PASSED | Transaction created with REPEATABLE READ isolation',
        );
      } else {
        this.context.logger.error(
          '[CASE 18] FAILED | Expected REPEATABLE READ, got: %s',
          transaction.isolationLevel,
        );
      }

      await transaction.rollback();
    } catch (error) {
      this.context.logger.error('[CASE 18] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Transaction With Count and Exists
  // ----------------------------------------------------------------
  async case19TransactionWithCountAndExists(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 19] Transaction With Count and Exists Operations');

    const group = `TX_COUNT_EXISTS_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      // Create records in transaction
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
        ],
        options: { transaction },
      });

      // Count within transaction
      const countInTx = await repo.count({
        where: { group },
        options: { transaction },
      });

      // Exists within transaction
      const existsInTx = await repo.existsWith({
        where: { group },
        options: { transaction },
      });

      // Count outside transaction (should be 0)
      const countOutside = await repo.count({ where: { group } });

      // Exists outside transaction (should be false)
      const existsOutside = await repo.existsWith({ where: { group } });

      if (countInTx.count === 2 && existsInTx && countOutside.count === 0 && !existsOutside) {
        this.context.logger.info(
          '[CASE 19] PASSED | Count/Exists work correctly in transaction context',
        );
        this.context.logger.info(
          '[CASE 19] In TX: count=%d exists=%s | Outside: count=%d exists=%s',
          countInTx.count,
          existsInTx,
          countOutside.count,
          existsOutside,
        );
      } else {
        this.context.logger.error(
          '[CASE 19] FAILED | countInTx=%d existsInTx=%s countOut=%d existsOut=%s',
          countInTx.count,
          existsInTx,
          countOutside.count,
          existsOutside,
        );
      }

      await transaction.rollback();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      this.context.logger.error('[CASE 19] FAILED with error: %o', error);
    }
  }
}
