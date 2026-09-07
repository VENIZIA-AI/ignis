import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Rollback Cases - operations are discarded once the transaction rolls back
// ----------------------------------------------------------------
export class RollbackCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 2: Rollback on Error
  // ----------------------------------------------------------------
  async case2RollbackOnError(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 2] Rollback on Error - Data should NOT persist after rollback');

    const code1 = `TX_ROLLBACK_ERR_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });

      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
        options: { transaction },
      });

      await transaction.commit();
      this.context.logger.error('[CASE 2] FAILED - Should have thrown error on duplicate');
    } catch (error) {
      await transaction.rollback();
      this.context.logger.info(
        '[CASE 2] Error caught, transaction rolled back: %s',
        (error as Error).message,
      );

      const result = await repo.findOne({ filter: { where: { code: code1 } } });
      if (!result) {
        this.context.logger.info('[CASE 2] PASSED - Record NOT persisted after rollback');
      } else {
        this.context.logger.error('[CASE 2] FAILED - Record should not exist after rollback');
        await repo.deleteAll({ where: { code: code1 } });
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Explicit Rollback
  // ----------------------------------------------------------------
  async case3RollbackExplicit(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 3] Explicit Rollback - Manual rollback discards changes');

    const code = `TX_EXPLICIT_ROLLBACK_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 12345 },
        options: { transaction },
      });

      await transaction.rollback();
      this.context.logger.info('[CASE 3] Transaction rolled back explicitly');

      const result = await repo.findOne({ filter: { where: { code } } });
      if (!result) {
        this.context.logger.info('[CASE 3] PASSED - Record NOT persisted after explicit rollback');
      } else {
        this.context.logger.error('[CASE 3] FAILED - Record should not exist');
        await repo.deleteAll({ where: { code } });
      }
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Rollback Verifies No Data Persisted
  // ----------------------------------------------------------------
  async case16RollbackVerifiesNoDataPersisted(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 16] Rollback Verifies No Data Persisted');

    const group = `TX_VERIFY_ROLLBACK_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      // Create multiple records
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
        options: { transaction },
      });

      // Verify they exist within transaction
      const withinTx = await repo.find({
        filter: { where: { group } },
        options: { transaction },
      });

      if (withinTx.length !== 3) {
        this.context.logger.error(
          '[CASE 16] FAILED | Expected 3 records within tx | got: %d',
          withinTx.length,
        );
        await transaction.rollback();
        return;
      }

      // Rollback
      await transaction.rollback();

      // Verify no records exist outside transaction
      const afterRollback = await repo.find({ filter: { where: { group } } });
      if (afterRollback.length === 0) {
        this.context.logger.info('[CASE 16] PASSED | No data persisted after rollback');
      } else {
        this.context.logger.error(
          '[CASE 16] FAILED | %d records found after rollback',
          afterRollback.length,
        );
        await repo.deleteAll({ where: { group } });
      }
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      this.context.logger.error('[CASE 16] FAILED with error: %o', error);
    }
  }
}
