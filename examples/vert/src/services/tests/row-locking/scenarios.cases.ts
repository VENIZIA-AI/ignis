import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Scenarios Cases - SKIP LOCKED, NOWAIT, read-modify-write, cross-repository locking
// and concurrent SHARE readers
// ----------------------------------------------------------------
export class ScenariosCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 7: FOR UPDATE SKIP LOCKED
  // ----------------------------------------------------------------
  async case7ForUpdateSkipLocked(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 7] FOR UPDATE SKIP LOCKED - Skip already-locked rows');

    const group = `LOCK_SKIP_${getUID()}`;

    await repo.createAll({
      data: [
        { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 10 },
        { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 20 },
      ],
    });

    const tx1 = await repo.beginTransaction();
    const tx2 = await repo.beginTransaction();

    try {
      // TX1: Lock first row
      await repo.findOne({
        filter: { where: { code: `${group}_1` } },
        options: {
          transaction: tx1,
          lock: { strength: 'update' },
        },
      });
      this.context.logger.info('[CASE 7] TX1 locked first row');

      // TX2: Find with SKIP LOCKED — should skip locked row
      const results = await repo.find({
        filter: { where: { group } },
        options: {
          transaction: tx2,
          lock: { strength: 'update', config: { skipLocked: true } },
        },
      });

      if (results.length === 1 && results[0].code === `${group}_2`) {
        this.context.logger.info('[CASE 7] PASSED - SKIP LOCKED returned only unlocked row');
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED - Expected 1 unlocked row, got: %d | codes: %j',
          results.length,
          results.map(r => r.code),
        );
      }

      await tx1.commit();
      await tx2.commit();
      await repo.deleteAll({ where: { group } });
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
      this.context.logger.error('[CASE 7] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: FOR UPDATE NOWAIT
  // ----------------------------------------------------------------
  async case8ForUpdateNoWait(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 8] FOR UPDATE NOWAIT - Fail immediately when row locked');

    const code = `LOCK_NOWAIT_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const tx1 = await repo.beginTransaction();
    const tx2 = await repo.beginTransaction();

    try {
      // TX1: Lock the row
      await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction: tx1,
          lock: { strength: 'update' },
        },
      });
      this.context.logger.info('[CASE 8] TX1 acquired lock');

      // TX2: Try NOWAIT — should fail immediately
      try {
        await repo.findOne({
          filter: { where: { code } },
          options: {
            transaction: tx2,
            lock: { strength: 'update', config: { noWait: true } },
          },
        });
        this.context.logger.error('[CASE 8] FAILED - NOWAIT should have thrown when row is locked');
      } catch (lockError) {
        this.context.logger.info(
          '[CASE 8] PASSED - NOWAIT correctly threw: %s',
          (lockError as Error).message.substring(0, 80),
        );
      }

      await tx1.commit();
      await tx2.rollback();
      await repo.deleteAll({ where: { code } });
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
      this.context.logger.error('[CASE 8] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Lock then update in same transaction
  // ----------------------------------------------------------------
  async case12LockAndUpdateInTransaction(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 12] Lock and update - Read-modify-write with FOR UPDATE');

    const code = `LOCK_UPDATE_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const transaction = await repo.beginTransaction();

    try {
      // Lock the row
      const locked = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction,
          lock: { strength: 'update' },
        },
      });

      if (!locked) {
        this.context.logger.error('[CASE 12] FAILED - Could not find record to lock');
        await transaction.rollback();
        return;
      }

      // Update based on locked value
      const newValue = locked.nValue! + 50;
      await repo.updateAll({
        where: { code },
        data: { nValue: newValue },
        options: { transaction },
      });

      await transaction.commit();

      // Verify
      const updated = await repo.findOne({ filter: { where: { code } } });
      if (updated?.nValue === 150) {
        this.context.logger.info('[CASE 12] PASSED - Lock + update: 100 -> 150');
      } else {
        this.context.logger.error('[CASE 12] FAILED - Expected 150, got: %d', updated?.nValue);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 12] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Lock across multiple repositories in same transaction
  // ----------------------------------------------------------------
  async case13MultipleReposWithLock(): Promise<void> {
    const configRepo = this.context.configurationRepository;
    const productRepo = this.context.productRepository;
    this.context.logCase('[CASE 13] Lock across multiple repositories in same transaction');

    const configCode = `LOCK_MULTI_CFG_${getUID()}`;
    const productCode = `LOCK_MULTI_PRD_${getUID()}`;

    await configRepo.create({
      data: { code: configCode, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });
    await productRepo.create({
      data: { code: productCode, name: 'Lock Test Product', price: 50 },
    });

    const transaction = await configRepo.beginTransaction();

    try {
      // Lock rows in both repos
      const lockedConfig = await configRepo.findOne({
        filter: { where: { code: configCode } },
        options: {
          transaction,
          lock: { strength: 'update' },
        },
      });

      const lockedProduct = await productRepo.findOne({
        filter: { where: { code: productCode } },
        options: {
          transaction,
          lock: { strength: 'update' },
          shouldSkipDefaultFilter: true,
        },
      });

      if (lockedConfig && lockedProduct) {
        this.context.logger.info('[CASE 13] PASSED - Locked rows in both repositories');
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED - config: %j, product: %j',
          !!lockedConfig,
          !!lockedProduct,
        );
      }

      await transaction.commit();
      await configRepo.deleteAll({ where: { code: configCode } });
      await productRepo.deleteAll({
        where: { code: productCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 13] FAILED with error: %o', error);
      await configRepo.deleteAll({ where: { code: configCode } }).catch(() => {});
      await productRepo
        .deleteAll({
          where: { code: productCode },
          options: { force: true, shouldSkipDefaultFilter: true },
        })
        .catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Shared locks allow concurrent readers
  // ----------------------------------------------------------------
  async case14SharedLockAllowsConcurrentReaders(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 14] FOR SHARE allows concurrent readers');

    const code = `LOCK_SHARE_CONC_${getUID()}`;

    await repo.create({
      data: { code, group: 'LOCK_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });

    const tx1 = await repo.beginTransaction();
    const tx2 = await repo.beginTransaction();

    try {
      // TX1: Acquire SHARE lock
      const r1 = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction: tx1,
          lock: { strength: 'share' },
        },
      });

      // TX2: Also acquire SHARE lock (should succeed — shared locks don't conflict)
      const r2 = await repo.findOne({
        filter: { where: { code } },
        options: {
          transaction: tx2,
          lock: { strength: 'share' },
        },
      });

      if (r1 && r2) {
        this.context.logger.info(
          '[CASE 14] PASSED - Both transactions acquired SHARE lock concurrently',
        );
      } else {
        this.context.logger.error('[CASE 14] FAILED - r1: %j, r2: %j', !!r1, !!r2);
      }

      await tx1.commit();
      await tx2.commit();
      await repo.deleteAll({ where: { code } });
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
      this.context.logger.error('[CASE 14] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }
}
