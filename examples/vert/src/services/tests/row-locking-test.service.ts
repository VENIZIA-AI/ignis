import { BindingKeys, BindingNamespaces, inject, LockStrengths, service } from '@venizia/ignis';
import { DataTypes, getUID } from '@venizia/ignis-helpers';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// Row Locking Test Service - Row-level locking (FOR UPDATE) tests
// ----------------------------------------------------------------
@service()
export class RowLockingTestService extends BaseTestService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    configurationRepository: ConfigurationRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    productRepository: ProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    })
    saleChannelRepository: SaleChannelRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    })
    saleChannelProductRepository: SaleChannelProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    userRepository: UserRepository,
  ) {
    super(
      RowLockingTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[RowLockingTestService] Starting row-level locking test cases...');

    await this.case1BasicForUpdate();
    await this.case2ForUpdateWithFind();
    await this.case3ForUpdateWithFindById();
    await this.case4ForShareLock();
    await this.case5ForNoKeyUpdate();
    await this.case6ForKeyShare();
    await this.case7ForUpdateSkipLocked();
    await this.case8ForUpdateNoWait();
    await this.case9LockWithoutTransactionThrows();
    await this.case10LockWithIncludeThrows();
    await this.case11LockWithFieldsThrows();
    await this.case12LockAndUpdateInTransaction();
    await this.case13MultipleReposWithLock();
    await this.case14SharedLockAllowsConcurrentReaders();
    await this.case15LockStrengthsConstants();

    this.logSection('[RowLockingTestService] All row-level locking test cases completed!');
  }

  // ----------------------------------------------------------------
  // CASE 1: Basic FOR UPDATE with findOne
  // ----------------------------------------------------------------
  private async case1BasicForUpdate(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 1] Basic FOR UPDATE - findOne with exclusive lock');

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
        this.logger.info('[CASE 1] PASSED - Row locked with FOR UPDATE | id: %s', locked.id);
      } else {
        this.logger.error('[CASE 1] FAILED - Locked record not found or incorrect');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 1] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: FOR UPDATE with find (multiple rows)
  // ----------------------------------------------------------------
  private async case2ForUpdateWithFind(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 2] FOR UPDATE with find - Lock multiple rows');

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
        this.logger.info('[CASE 2] PASSED - Locked %d rows with FOR UPDATE', locked.length);
      } else {
        this.logger.error('[CASE 2] FAILED - Expected 3 locked rows, got: %d', locked.length);
      }

      await transaction.commit();
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 2] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: FOR UPDATE with findById
  // ----------------------------------------------------------------
  private async case3ForUpdateWithFindById(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 3] FOR UPDATE with findById');

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
        this.logger.info('[CASE 3] PASSED - findById with FOR UPDATE | id: %s', locked.id);
      } else {
        this.logger.error('[CASE 3] FAILED - Record not found via findById with lock');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 3] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: FOR SHARE lock
  // ----------------------------------------------------------------
  private async case4ForShareLock(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 4] FOR SHARE - Shared read lock');

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
        this.logger.info('[CASE 4] PASSED - FOR SHARE lock acquired');
      } else {
        this.logger.error('[CASE 4] FAILED - Record not found with FOR SHARE');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 4] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: FOR NO KEY UPDATE lock
  // ----------------------------------------------------------------
  private async case5ForNoKeyUpdate(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 5] FOR NO KEY UPDATE - Exclusive lock allowing key share');

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
        this.logger.info('[CASE 5] PASSED - FOR NO KEY UPDATE lock acquired');
      } else {
        this.logger.error('[CASE 5] FAILED - Record not found with FOR NO KEY UPDATE');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 5] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: FOR KEY SHARE lock
  // ----------------------------------------------------------------
  private async case6ForKeyShare(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 6] FOR KEY SHARE - Weakest lock');

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
        this.logger.info('[CASE 6] PASSED - FOR KEY SHARE lock acquired');
      } else {
        this.logger.error('[CASE 6] FAILED - Record not found with FOR KEY SHARE');
      }

      await transaction.commit();
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 6] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: FOR UPDATE SKIP LOCKED
  // ----------------------------------------------------------------
  private async case7ForUpdateSkipLocked(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 7] FOR UPDATE SKIP LOCKED - Skip already-locked rows');

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
      this.logger.info('[CASE 7] TX1 locked first row');

      // TX2: Find with SKIP LOCKED — should skip locked row
      const results = await repo.find({
        filter: { where: { group } },
        options: {
          transaction: tx2,
          lock: { strength: 'update', config: { skipLocked: true } },
        },
      });

      if (results.length === 1 && results[0].code === `${group}_2`) {
        this.logger.info('[CASE 7] PASSED - SKIP LOCKED returned only unlocked row');
      } else {
        this.logger.error(
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
      this.logger.error('[CASE 7] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: FOR UPDATE NOWAIT
  // ----------------------------------------------------------------
  private async case8ForUpdateNoWait(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 8] FOR UPDATE NOWAIT - Fail immediately when row locked');

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
      this.logger.info('[CASE 8] TX1 acquired lock');

      // TX2: Try NOWAIT — should fail immediately
      try {
        await repo.findOne({
          filter: { where: { code } },
          options: {
            transaction: tx2,
            lock: { strength: 'update', config: { noWait: true } },
          },
        });
        this.logger.error('[CASE 8] FAILED - NOWAIT should have thrown when row is locked');
      } catch (lockError) {
        this.logger.info(
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
      this.logger.error('[CASE 8] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Lock without transaction should throw
  // ----------------------------------------------------------------
  private async case9LockWithoutTransactionThrows(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 9] Lock without transaction - Should throw validation error');

    try {
      await repo.findOne({
        filter: { where: { code: 'NONEXISTENT' } },
        options: {
          lock: { strength: 'update' },
        },
      });
      this.logger.error('[CASE 9] FAILED - Should have thrown for lock without transaction');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('requires a transaction')) {
        this.logger.info('[CASE 9] PASSED - Correctly threw: %s', message);
      } else {
        this.logger.error('[CASE 9] FAILED - Unexpected error: %s', message);
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Lock with include should throw
  // ----------------------------------------------------------------
  private async case10LockWithIncludeThrows(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 10] Lock with include - Should throw Query API incompatibility');

    const transaction = await repo.beginTransaction();

    try {
      await repo.findOne({
        filter: {
          where: { code: 'NONEXISTENT' },
          include: [{ relation: 'saleChannelProducts' }],
        },
        options: {
          transaction,
          lock: { strength: 'update' },
          shouldSkipDefaultFilter: true,
        },
      });
      this.logger.error('[CASE 10] FAILED - Should have thrown for lock with include');
      await transaction.rollback();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('incompatible with Query API')) {
        this.logger.info('[CASE 10] PASSED - Correctly threw: %s', message);
      } else {
        this.logger.error('[CASE 10] FAILED - Unexpected error: %s', message);
      }
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Lock with fields should throw
  // ----------------------------------------------------------------
  private async case11LockWithFieldsThrows(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 11] Lock with fields - Should throw Query API incompatibility');

    const transaction = await repo.beginTransaction();

    try {
      await repo.findOne({
        filter: {
          where: { code: 'NONEXISTENT' },
          fields: ['id', 'code'],
        },
        options: {
          transaction,
          lock: { strength: 'update' },
        },
      });
      this.logger.error('[CASE 11] FAILED - Should have thrown for lock with fields');
      await transaction.rollback();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('incompatible with Query API')) {
        this.logger.info('[CASE 11] PASSED - Correctly threw: %s', message);
      } else {
        this.logger.error('[CASE 11] FAILED - Unexpected error: %s', message);
      }
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Lock then update in same transaction
  // ----------------------------------------------------------------
  private async case12LockAndUpdateInTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 12] Lock and update - Read-modify-write with FOR UPDATE');

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
        this.logger.error('[CASE 12] FAILED - Could not find record to lock');
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
        this.logger.info('[CASE 12] PASSED - Lock + update: 100 -> 150');
      } else {
        this.logger.error('[CASE 12] FAILED - Expected 150, got: %d', updated?.nValue);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 12] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Lock across multiple repositories in same transaction
  // ----------------------------------------------------------------
  private async case13MultipleReposWithLock(): Promise<void> {
    const configRepo = this.configurationRepository;
    const productRepo = this.productRepository;
    this.logCase('[CASE 13] Lock across multiple repositories in same transaction');

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
        this.logger.info('[CASE 13] PASSED - Locked rows in both repositories');
      } else {
        this.logger.error(
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
      this.logger.error('[CASE 13] FAILED with error: %o', error);
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
  private async case14SharedLockAllowsConcurrentReaders(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 14] FOR SHARE allows concurrent readers');

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
        this.logger.info('[CASE 14] PASSED - Both transactions acquired SHARE lock concurrently');
      } else {
        this.logger.error('[CASE 14] FAILED - r1: %j, r2: %j', !!r1, !!r2);
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
      this.logger.error('[CASE 14] FAILED with error: %o', error);
      await repo.deleteAll({ where: { code } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: LockStrengths constants validation
  // ----------------------------------------------------------------
  private async case15LockStrengthsConstants(): Promise<void> {
    this.logCase('[CASE 15] LockStrengths constants and isValid()');

    const checks = [
      { value: LockStrengths.UPDATE, expected: 'update' },
      { value: LockStrengths.NO_KEY_UPDATE, expected: 'no key update' },
      { value: LockStrengths.SHARE, expected: 'share' },
      { value: LockStrengths.KEY_SHARE, expected: 'key share' },
    ];

    let allPassed = true;

    for (const { value, expected } of checks) {
      if (value !== expected) {
        this.logger.error('[CASE 15] FAILED - %s !== %s', value, expected);
        allPassed = false;
      }
      if (!LockStrengths.isValid(value)) {
        this.logger.error('[CASE 15] FAILED - isValid(%s) returned false', value);
        allPassed = false;
      }
    }

    if (!LockStrengths.isValid('invalid_strength')) {
      // Good — invalid should return false
    } else {
      this.logger.error('[CASE 15] FAILED - isValid("invalid_strength") should return false');
      allPassed = false;
    }

    if (allPassed) {
      this.logger.info('[CASE 15] PASSED - All LockStrengths constants and isValid() correct');
    }
  }
}
