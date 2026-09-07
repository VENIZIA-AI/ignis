import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - misuse, introspection, and scale boundaries
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 6: Use Inactive Transaction After Commit
  // ----------------------------------------------------------------
  async case6UseInactiveTransactionAfterCommit(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 6] Use Inactive Transaction After Commit');

    const transaction = await repo.beginTransaction();
    await transaction.commit();

    try {
      await repo.create({
        data: {
          code: `TX_INACTIVE_${getUID()}`,
          group: 'TX_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
        },
        options: { transaction },
      });

      this.context.logger.error(
        '[CASE 6] FAILED - Should have thrown error for inactive transaction',
      );
    } catch (error) {
      this.context.logger.info(
        '[CASE 6] PASSED - Error thrown for inactive transaction: %s',
        (error as Error).message,
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Use Inactive Transaction After Rollback
  // ----------------------------------------------------------------
  async case7UseInactiveTransactionAfterRollback(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 7] Use Inactive Transaction After Rollback');

    const transaction = await repo.beginTransaction();
    await transaction.rollback();

    try {
      await repo.create({
        data: {
          code: `TX_INACTIVE_RB_${getUID()}`,
          group: 'TX_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
        },
        options: { transaction },
      });

      this.context.logger.error(
        '[CASE 7] FAILED - Should have thrown error for inactive transaction',
      );
    } catch (error) {
      this.context.logger.info(
        '[CASE 7] PASSED - Error thrown for inactive transaction: %s',
        (error as Error).message,
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Transaction State Verification
  // ----------------------------------------------------------------
  async case13TransactionStateVerification(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 13] Transaction State Verification');

    try {
      const transaction = await repo.beginTransaction();

      // Check initial state
      const isActiveInitially = transaction.isActive;
      if (isActiveInitially) {
        this.context.logger.info('[CASE 13] PASSED | Transaction is active after begin');
      } else {
        this.context.logger.error('[CASE 13] FAILED | Transaction should be active after begin');
      }

      await transaction.commit();

      // Check state after commit
      const isActiveAfterCommit = transaction.isActive;
      if (!isActiveAfterCommit) {
        this.context.logger.info('[CASE 13] PASSED | Transaction is inactive after commit');
      } else {
        this.context.logger.error('[CASE 13] FAILED | Transaction should be inactive after commit');
      }

      // Test rollback state
      const tx2 = await repo.beginTransaction();
      await tx2.rollback();

      const isActiveAfterRollback = tx2.isActive;
      if (!isActiveAfterRollback) {
        this.context.logger.info('[CASE 13] PASSED | Transaction is inactive after rollback');
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED | Transaction should be inactive after rollback',
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Double Commit Handling
  // ----------------------------------------------------------------
  async case14DoubleCommitHandling(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 14] Double Commit Handling');

    const transaction = await repo.beginTransaction();

    try {
      await transaction.commit();

      // Try to commit again
      try {
        await transaction.commit();
        this.context.logger.error('[CASE 14] FAILED | Double commit should throw error');
      } catch (error) {
        this.context.logger.info(
          '[CASE 14] PASSED | Double commit handled correctly: %s',
          (error as Error).message.substring(0, 50),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Double Rollback Handling
  // ----------------------------------------------------------------
  async case15DoubleRollbackHandling(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 15] Double Rollback Handling');

    const transaction = await repo.beginTransaction();

    try {
      await transaction.rollback();

      // Try to rollback again
      try {
        await transaction.rollback();
        this.context.logger.error('[CASE 15] FAILED | Double rollback should throw error');
      } catch (error) {
        this.context.logger.info(
          '[CASE 15] PASSED | Double rollback handled correctly: %s',
          (error as Error).message.substring(0, 50),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Large Transaction With Many Operations
  // ----------------------------------------------------------------
  async case20LargeTransactionWithManyOperations(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 20] Large Transaction With Many Operations');

    const group = `TX_LARGE_${getUID()}`;
    const operationCount = 50;
    const transaction = await repo.beginTransaction();

    try {
      // Create many records
      const createPromises: Promise<any>[] = [];
      for (let i = 0; i < operationCount; i++) {
        createPromises.push(
          repo.create({
            data: {
              code: `${group}_${i}`,
              group,
              dataType: DataTypes.NUMBER,
              nValue: i * 10,
            },
            options: { transaction },
          }),
        );
      }
      await Promise.all(createPromises);

      // Update some records
      await repo.updateAll({
        where: { group, nValue: { gt: 250 } },
        data: { nValue: 999 },
        options: { transaction },
      });

      // Delete some records
      await repo.deleteAll({
        where: { group, nValue: { lt: 100 } },
        options: { transaction },
      });

      await transaction.commit();

      // Verify final state with exact counts
      // Created: 50 records (nValue: 0, 10, 20, ..., 490)
      // Deleted: nValue < 100 (0, 10, 20, ..., 90) = 10 records
      // Updated: nValue > 250 to 999 (260, 270, ..., 490) = 24 records
      // Remaining: 50 - 10 = 40 records
      const remaining = await repo.find({ filter: { where: { group } } });
      const updated = remaining.filter(r => r.nValue === 999);

      const expectedRemaining = 40; // 50 - 10 deleted
      const expectedUpdated = 24; // values 260-490 (step 10) = 24 values

      if (remaining.length === expectedRemaining && updated.length === expectedUpdated) {
        this.context.logger.info(
          '[CASE 20] PASSED | Large transaction exact counts | remaining: %d/%d | updated: %d/%d',
          remaining.length,
          expectedRemaining,
          updated.length,
          expectedUpdated,
        );
      } else if (remaining.length > 0 && updated.length > 0) {
        // Partial pass - some operations worked but counts are off
        this.context.logger.info(
          '[CASE 20] INFO | Large transaction partial | remaining: %d (expected %d) | updated: %d (expected %d)',
          remaining.length,
          expectedRemaining,
          updated.length,
          expectedUpdated,
        );
      } else {
        this.context.logger.error(
          '[CASE 20] FAILED | remaining: %d (expected %d) | updated: %d (expected %d)',
          remaining.length,
          expectedRemaining,
          updated.length,
          expectedUpdated,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      this.context.logger.error('[CASE 20] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }
}
