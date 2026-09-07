import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Commit Cases - operations persist once the transaction commits
// ----------------------------------------------------------------
export class CommitCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Commit Success
  // ----------------------------------------------------------------
  async case1CommitSuccess(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 1] Commit Success - Multiple creates should persist after commit');

    const code1 = `TX_COMMIT_${getUID()}`;
    const code2 = `TX_COMMIT_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });
      await repo.create({
        data: { code: code2, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
        options: { transaction },
      });

      await transaction.commit();
      this.context.logger.info('[CASE 1] Transaction committed');

      const result1 = await repo.findOne({ filter: { where: { code: code1 } } });
      const result2 = await repo.findOne({ filter: { where: { code: code2 } } });

      if (result1 && result2) {
        this.context.logger.info('[CASE 1] PASSED - Both records persisted after commit');
      } else {
        this.context.logger.error('[CASE 1] FAILED - Records not found after commit');
      }

      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 1] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: Update and Delete in Transaction
  // ----------------------------------------------------------------
  async case5UpdateAndDeleteInTransaction(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 5] Update and Delete in Transaction');

    const code1 = `TX_UPDATE_${getUID()}`;
    const code2 = `TX_DELETE_${getUID()}`;

    await repo.create({
      data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });
    await repo.create({
      data: { code: code2, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
    });

    const transaction = await repo.beginTransaction();

    try {
      await repo.updateAll({
        where: { code: code1 },
        data: { nValue: 999 },
        options: { transaction },
      });

      await repo.deleteAll({
        where: { code: code2 },
        options: { transaction },
      });

      await transaction.commit();

      const updated = await repo.findOne({ filter: { where: { code: code1 } } });
      const deleted = await repo.findOne({ filter: { where: { code: code2 } } });

      if (updated?.nValue === 999 && !deleted) {
        this.context.logger.info('[CASE 5] PASSED - Update and delete persisted after commit');
      } else {
        this.context.logger.error('[CASE 5] FAILED - updated: %j, deleted: %j', updated, deleted);
      }

      await repo.deleteAll({ where: { code: code1 } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 5] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: CreateAll in Transaction
  // ----------------------------------------------------------------
  async case10CreateAllInTransaction(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 10] CreateAll in Transaction');

    const codes = [`TX_BATCH_${getUID()}`, `TX_BATCH_${getUID()}`, `TX_BATCH_${getUID()}`];
    const transaction = await repo.beginTransaction();

    try {
      const batchData = codes.map((code, idx) => ({
        code,
        group: 'TX_BATCH_TEST',
        dataType: DataTypes.NUMBER,
        nValue: (idx + 1) * 100,
      }));

      await repo.createAll({
        data: batchData,
        options: { transaction },
      });

      await transaction.commit();

      const results = await repo.find({
        filter: { where: { group: 'TX_BATCH_TEST' } },
      });

      if (results.length === 3) {
        this.context.logger.info('[CASE 10] PASSED - All 3 batch records persisted after commit');
      } else {
        this.context.logger.error('[CASE 10] FAILED - Expected 3 records, got: %d', results.length);
      }

      await repo.deleteAll({ where: { group: 'TX_BATCH_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 10] FAILED with error: %o', error);
    }
  }
}
