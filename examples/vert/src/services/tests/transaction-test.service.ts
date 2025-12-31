import {
  BindingKeys,
  BindingNamespaces,
  DataTypes,
  getUID,
  inject,
  IsolationLevels,
} from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// Transaction Test Service - Transaction handling tests
// ----------------------------------------------------------------
export class TransactionTestService extends BaseTestService {
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
      TransactionTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[TransactionTestService] Starting transaction test cases...');

    await this.case1_CommitSuccess();
    await this.case2_RollbackOnError();
    await this.case3_RollbackExplicit();
    await this.case4_ReadWithinTransaction();
    await this.case5_UpdateAndDeleteInTransaction();
    await this.case6_UseInactiveTransactionAfterCommit();
    await this.case7_UseInactiveTransactionAfterRollback();
    await this.case8_IsolationLevelReadCommitted();
    await this.case9_IsolationLevelSerializable();
    await this.case10_CreateAllInTransaction();

    this.logSection('[TransactionTestService] All transaction test cases completed!');
  }

  // ----------------------------------------------------------------
  // CASE 1: Commit Success
  // ----------------------------------------------------------------
  private async case1_CommitSuccess(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 1] Commit Success - Multiple creates should persist after commit');

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
      this.logger.info('[CASE 1] Transaction committed');

      const result1 = await repo.findOne({ filter: { where: { code: code1 } } });
      const result2 = await repo.findOne({ filter: { where: { code: code2 } } });

      if (result1 && result2) {
        this.logger.info('[CASE 1] PASSED - Both records persisted after commit');
      } else {
        this.logger.error('[CASE 1] FAILED - Records not found after commit');
      }

      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 1] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Rollback on Error
  // ----------------------------------------------------------------
  private async case2_RollbackOnError(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 2] Rollback on Error - Data should NOT persist after rollback');

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
      this.logger.error('[CASE 2] FAILED - Should have thrown error on duplicate');
    } catch (error) {
      await transaction.rollback();
      this.logger.info(
        '[CASE 2] Error caught, transaction rolled back: %s',
        (error as Error).message,
      );

      const result = await repo.findOne({ filter: { where: { code: code1 } } });
      if (!result) {
        this.logger.info('[CASE 2] PASSED - Record NOT persisted after rollback');
      } else {
        this.logger.error('[CASE 2] FAILED - Record should not exist after rollback');
        await repo.deleteAll({ where: { code: code1 } });
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Explicit Rollback
  // ----------------------------------------------------------------
  private async case3_RollbackExplicit(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 3] Explicit Rollback - Manual rollback discards changes');

    const code = `TX_EXPLICIT_ROLLBACK_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 12345 },
        options: { transaction },
      });

      await transaction.rollback();
      this.logger.info('[CASE 3] Transaction rolled back explicitly');

      const result = await repo.findOne({ filter: { where: { code } } });
      if (!result) {
        this.logger.info('[CASE 3] PASSED - Record NOT persisted after explicit rollback');
      } else {
        this.logger.error('[CASE 3] FAILED - Record should not exist');
        await repo.deleteAll({ where: { code } });
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Read within Transaction
  // ----------------------------------------------------------------
  private async case4_ReadWithinTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 4] Read within Transaction - Uncommitted data visible in transaction');

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
        this.logger.info('[CASE 4] PASSED - Within tx sees data, outside tx does not');
      } else {
        this.logger.error('[CASE 4] FAILED - withinTx: %j, outsideTx: %j', !!withinTx, !!outsideTx);
      }

      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 4] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: Update and Delete in Transaction
  // ----------------------------------------------------------------
  private async case5_UpdateAndDeleteInTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 5] Update and Delete in Transaction');

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
        this.logger.info('[CASE 5] PASSED - Update and delete persisted after commit');
      } else {
        this.logger.error('[CASE 5] FAILED - updated: %j, deleted: %j', updated, deleted);
      }

      await repo.deleteAll({ where: { code: code1 } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 5] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Use Inactive Transaction After Commit
  // ----------------------------------------------------------------
  private async case6_UseInactiveTransactionAfterCommit(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 6] Use Inactive Transaction After Commit');

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

      this.logger.error('[CASE 6] FAILED - Should have thrown error for inactive transaction');
    } catch (error) {
      this.logger.info(
        '[CASE 6] PASSED - Error thrown for inactive transaction: %s',
        (error as Error).message,
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Use Inactive Transaction After Rollback
  // ----------------------------------------------------------------
  private async case7_UseInactiveTransactionAfterRollback(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 7] Use Inactive Transaction After Rollback');

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

      this.logger.error('[CASE 7] FAILED - Should have thrown error for inactive transaction');
    } catch (error) {
      this.logger.info(
        '[CASE 7] PASSED - Error thrown for inactive transaction: %s',
        (error as Error).message,
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Isolation Level - READ COMMITTED
  // ----------------------------------------------------------------
  private async case8_IsolationLevelReadCommitted(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 8] Isolation Level - READ COMMITTED');

    const transaction = await repo.beginTransaction({
      isolationLevel: IsolationLevels.READ_COMMITTED,
    });

    try {
      if (transaction.isolationLevel === IsolationLevels.READ_COMMITTED) {
        this.logger.info('[CASE 8] PASSED - Transaction created with READ COMMITTED isolation');
      } else {
        this.logger.error(
          '[CASE 8] FAILED - Expected READ COMMITTED, got: %s',
          transaction.isolationLevel,
        );
      }
      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 8] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Isolation Level - SERIALIZABLE
  // ----------------------------------------------------------------
  private async case9_IsolationLevelSerializable(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 9] Isolation Level - SERIALIZABLE');

    const code = `TX_SERIALIZABLE_${getUID()}`;
    const transaction = await repo.beginTransaction({
      isolationLevel: IsolationLevels.SERIALIZABLE,
    });

    try {
      if (transaction.isolationLevel === IsolationLevels.SERIALIZABLE) {
        this.logger.info('[CASE 9] Transaction created with SERIALIZABLE isolation');
      } else {
        this.logger.error('[CASE 9] Wrong isolation level: %s', transaction.isolationLevel);
      }

      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
        options: { transaction },
      });

      await transaction.commit();

      const result = await repo.findOne({ filter: { where: { code } } });
      if (result) {
        this.logger.info('[CASE 9] PASSED - SERIALIZABLE transaction committed successfully');
        await repo.deleteAll({ where: { code } });
      } else {
        this.logger.error('[CASE 9] FAILED - Record not found after SERIALIZABLE commit');
      }
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 9] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: CreateAll in Transaction
  // ----------------------------------------------------------------
  private async case10_CreateAllInTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 10] CreateAll in Transaction');

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
        this.logger.info('[CASE 10] PASSED - All 3 batch records persisted after commit');
      } else {
        this.logger.error('[CASE 10] FAILED - Expected 3 records, got: %d', results.length);
      }

      await repo.deleteAll({ where: { group: 'TX_BATCH_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 10] FAILED with error: %o', error);
    }
  }
}
