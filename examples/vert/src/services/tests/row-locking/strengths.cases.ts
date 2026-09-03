import { LockStrengths } from '@venizia/ignis';
import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Strengths Cases - acquiring each lock strength (UPDATE/SHARE/NO_KEY_UPDATE/KEY_SHARE)
// via findOne/find/findById
// ----------------------------------------------------------------
export class StrengthsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Basic FOR UPDATE with findOne
  // ----------------------------------------------------------------
  async case1BasicForUpdate(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 1] Basic FOR UPDATE - findOne with exclusive lock');

    const code = `LOCK_BASIC_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const transaction = await repo.beginTransaction();

    try {
      const locked = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction,
          lock: { strength: LockStrengths.UPDATE },
        },
      });

      if (locked?.nValue === 100) {
        this.context.logger.info(
          '[CASE 1] PASSED - Row locked with FOR UPDATE | id: %s',
          locked.id,
        );
      } else {
        this.context.logger.error('[CASE 1] FAILED - Locked record not found or incorrect');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 1] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: FOR UPDATE with find (multiple rows)
  // ----------------------------------------------------------------
  async case2ForUpdateWithFind(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 2] FOR UPDATE with find - Lock multiple rows');

    const group = `LOCK_FIND_${getUID()}`;

    await repo.createAll({
      data: [
        { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 10 },
        { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 20 },
        { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 30 },
      ],
    });

    const transaction = await repo.beginTransaction();

    try {
      const locked = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'] },
        options: {
          transaction,
          lock: { strength: 'update' },
        },
      });

      if (locked.length === 3) {
        this.context.logger.info('[CASE 2] PASSED - Locked %d rows with FOR UPDATE', locked.length);
      } else {
        this.context.logger.error(
          '[CASE 2] FAILED - Expected 3 locked rows, got: %d',
          locked.length,
        );
      }

      await transaction.commit();
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 2] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: FOR UPDATE with findById
  // ----------------------------------------------------------------
  async case3ForUpdateWithFindById(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 3] FOR UPDATE with findById');

    const code = `LOCK_BYID_${getUID()}`;

    const { data: created } = await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 42 },
    });

    const transaction = await repo.beginTransaction();

    try {
      const locked = await repo.findById({
        id: created.id,
        options: {
          transaction,
          lock: { strength: 'update' },
        },
      });

      if (locked?.code === code) {
        this.context.logger.info('[CASE 3] PASSED - findById with FOR UPDATE | id: %s', locked.id);
      } else {
        this.context.logger.error('[CASE 3] FAILED - Record not found via findById with lock');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 3] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: FOR SHARE lock
  // ----------------------------------------------------------------
  async case4ForShareLock(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 4] FOR SHARE - Shared read lock');

    const code = `LOCK_SHARE_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const transaction = await repo.beginTransaction();

    try {
      const locked = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction,
          lock: { strength: LockStrengths.SHARE },
        },
      });

      if (locked) {
        this.context.logger.info('[CASE 4] PASSED - FOR SHARE lock acquired');
      } else {
        this.context.logger.error('[CASE 4] FAILED - Record not found with FOR SHARE');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 4] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: FOR NO KEY UPDATE lock
  // ----------------------------------------------------------------
  async case5ForNoKeyUpdate(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 5] FOR NO KEY UPDATE - Exclusive lock allowing key share');

    const code = `LOCK_NKU_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const transaction = await repo.beginTransaction();

    try {
      const locked = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction,
          lock: { strength: LockStrengths.NO_KEY_UPDATE },
        },
      });

      if (locked) {
        this.context.logger.info('[CASE 5] PASSED - FOR NO KEY UPDATE lock acquired');
      } else {
        this.context.logger.error('[CASE 5] FAILED - Record not found with FOR NO KEY UPDATE');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 5] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: FOR KEY SHARE lock
  // ----------------------------------------------------------------
  async case6ForKeyShare(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 6] FOR KEY SHARE - Weakest lock');

    const code = `LOCK_KS_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const transaction = await repo.beginTransaction();

    try {
      const locked = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction,
          lock: { strength: LockStrengths.KEY_SHARE },
        },
      });

      if (locked) {
        this.context.logger.info('[CASE 6] PASSED - FOR KEY SHARE lock acquired');
      } else {
        this.context.logger.error('[CASE 6] FAILED - Record not found with FOR KEY SHARE');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 6] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }
}
