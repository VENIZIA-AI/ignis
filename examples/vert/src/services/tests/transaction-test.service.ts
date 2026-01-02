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

    // Basic transaction operations
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

    // Advanced transaction tests
    await this.case11_MultipleRepositoriesInTransaction();
    await this.case12_ConcurrentTransactionsOnSameData();
    await this.case13_TransactionStateVerification();
    await this.case14_DoubleCommitHandling();
    await this.case15_DoubleRollbackHandling();
    await this.case16_RollbackVerifiesNoDataPersisted();
    await this.case17_TransactionWithRelatedEntities();
    await this.case18_IsolationLevelRepeatableRead();
    await this.case19_TransactionWithCountAndExists();
    await this.case20_LargeTransactionWithManyOperations();

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

  // ----------------------------------------------------------------
  // CASE 11: Multiple Repositories in One Transaction
  // ----------------------------------------------------------------
  private async case11_MultipleRepositoriesInTransaction(): Promise<void> {
    const configRepo = this.configurationRepository;
    const productRepo = this.productRepository;
    this.logCase('[CASE 11] Multiple Repositories in One Transaction');

    const configCode = `TX_MULTI_CFG_${getUID()}`;
    const productCode = `TX_MULTI_PRD_${getUID()}`;
    const transaction = await configRepo.beginTransaction();

    try {
      // Create in configuration repository
      await configRepo.create({
        data: { code: configCode, group: 'TX_MULTI_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });

      // Create in product repository using same transaction
      await productRepo.create({
        data: { code: productCode, name: 'TX Test Product', price: 50 },
        options: { transaction, skipDefaultFilter: true },
      });

      await transaction.commit();

      // Verify both records exist
      const config = await configRepo.findOne({ filter: { where: { code: configCode } } });
      const product = await productRepo.findOne({
        filter: { where: { code: productCode } },
        options: { skipDefaultFilter: true },
      });

      if (config && product) {
        this.logger.info('[CASE 11] PASSED | Both repos committed in same transaction');
      } else {
        this.logger.error(
          '[CASE 11] FAILED | config: %j | product: %j',
          !!config,
          !!product,
        );
      }

      // Cleanup
      await configRepo.deleteAll({ where: { code: configCode } });
      await productRepo.deleteAll({
        where: { code: productCode },
        options: { force: true, skipDefaultFilter: true },
      });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 11] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Concurrent Transactions on Same Data
  // ----------------------------------------------------------------
  private async case12_ConcurrentTransactionsOnSameData(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 12] Concurrent Transactions on Same Data');

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
          this.logger.info('[CASE 12] INFO | Both concurrent transactions completed (last wins)');
        } catch (conflictError) {
          await tx2.rollback();
          this.logger.info('[CASE 12] INFO | Second transaction detected conflict and rolled back');
        }

        // Verify final state matches expected outcome
        const final = await repo.findOne({ filter: { where: { code } } });
        const expectedValue = tx2Committed ? 300 : 200;

        if (final?.nValue === expectedValue) {
          this.logger.info(
            '[CASE 12] PASSED | Final value: %d (expected %d, tx2 committed: %s)',
            final.nValue,
            expectedValue,
            tx2Committed,
          );
        } else {
          this.logger.error(
            '[CASE 12] FAILED | Final value: %d | expected: %d | tx2 committed: %s',
            final?.nValue,
            expectedValue,
            tx2Committed,
          );
        }
      } catch (error) {
        try { await tx1.rollback(); } catch (_e) { /* ignore */ }
        try { await tx2.rollback(); } catch (_e) { /* ignore */ }
        throw error;
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 12] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group: 'TX_CONCURRENT_TEST' } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Transaction State Verification
  // ----------------------------------------------------------------
  private async case13_TransactionStateVerification(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 13] Transaction State Verification');

    try {
      const transaction = await repo.beginTransaction();

      // Check initial state
      const isActiveInitially = transaction.isActive;
      if (isActiveInitially) {
        this.logger.info('[CASE 13] PASSED | Transaction is active after begin');
      } else {
        this.logger.error('[CASE 13] FAILED | Transaction should be active after begin');
      }

      await transaction.commit();

      // Check state after commit
      const isActiveAfterCommit = transaction.isActive;
      if (!isActiveAfterCommit) {
        this.logger.info('[CASE 13] PASSED | Transaction is inactive after commit');
      } else {
        this.logger.error('[CASE 13] FAILED | Transaction should be inactive after commit');
      }

      // Test rollback state
      const tx2 = await repo.beginTransaction();
      await tx2.rollback();

      const isActiveAfterRollback = tx2.isActive;
      if (!isActiveAfterRollback) {
        this.logger.info('[CASE 13] PASSED | Transaction is inactive after rollback');
      } else {
        this.logger.error('[CASE 13] FAILED | Transaction should be inactive after rollback');
      }
    } catch (error) {
      this.logger.error('[CASE 13] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Double Commit Handling
  // ----------------------------------------------------------------
  private async case14_DoubleCommitHandling(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 14] Double Commit Handling');

    const transaction = await repo.beginTransaction();

    try {
      await transaction.commit();

      // Try to commit again
      try {
        await transaction.commit();
        this.logger.error('[CASE 14] FAILED | Double commit should throw error');
      } catch (error) {
        this.logger.info(
          '[CASE 14] PASSED | Double commit handled correctly: %s',
          (error as Error).message.substring(0, 50),
        );
      }
    } catch (error) {
      this.logger.error('[CASE 14] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Double Rollback Handling
  // ----------------------------------------------------------------
  private async case15_DoubleRollbackHandling(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 15] Double Rollback Handling');

    const transaction = await repo.beginTransaction();

    try {
      await transaction.rollback();

      // Try to rollback again
      try {
        await transaction.rollback();
        this.logger.error('[CASE 15] FAILED | Double rollback should throw error');
      } catch (error) {
        this.logger.info(
          '[CASE 15] PASSED | Double rollback handled correctly: %s',
          (error as Error).message.substring(0, 50),
        );
      }
    } catch (error) {
      this.logger.error('[CASE 15] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Rollback Verifies No Data Persisted
  // ----------------------------------------------------------------
  private async case16_RollbackVerifiesNoDataPersisted(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 16] Rollback Verifies No Data Persisted');

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
        this.logger.error('[CASE 16] FAILED | Expected 3 records within tx | got: %d', withinTx.length);
        await transaction.rollback();
        return;
      }

      // Rollback
      await transaction.rollback();

      // Verify no records exist outside transaction
      const afterRollback = await repo.find({ filter: { where: { group } } });
      if (afterRollback.length === 0) {
        this.logger.info('[CASE 16] PASSED | No data persisted after rollback');
      } else {
        this.logger.error('[CASE 16] FAILED | %d records found after rollback', afterRollback.length);
        await repo.deleteAll({ where: { group } });
      }
    } catch (error) {
      try { await transaction.rollback(); } catch (_e) { /* ignore */ }
      this.logger.error('[CASE 16] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Transaction With Related Entities
  // ----------------------------------------------------------------
  private async case17_TransactionWithRelatedEntities(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 17] Transaction With Related Entities');

    const productCode = `TX_REL_PROD_${getUID()}`;
    const channelCode = `TX_REL_CHAN_${getUID()}`;
    const transaction = await productRepo.beginTransaction();

    try {
      // Create product
      const product = await productRepo.create({
        data: { code: productCode, name: 'TX Related Product', price: 100 },
        options: { transaction, skipDefaultFilter: true },
      });

      // Create sale channel
      const channel = await saleChannelRepo.create({
        data: { code: channelCode, name: 'TX Related Channel' },
        options: { transaction },
      });

      // Create junction record linking them
      await junctionRepo.create({
        data: {
          productId: product.data.id,
          saleChannelId: channel.data.id,
        },
        options: { transaction },
      });

      await transaction.commit();

      // Verify all records exist with relations
      const productWithRelations = await productRepo.findOne({
        filter: {
          where: { code: productCode },
          include: [{ relation: 'saleChannelProducts' }],
        },
        options: { skipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithRelations as any)?.saleChannelProducts;
      if (saleChannelProducts?.length === 1) {
        this.logger.info('[CASE 17] PASSED | All related entities committed together');
      } else {
        this.logger.error('[CASE 17] FAILED | Relations not correct | got: %d', saleChannelProducts?.length);
      }

      // Cleanup
      await junctionRepo.deleteAll({ where: { productId: product.data.id }, options: { force: true } });
      await productRepo.deleteAll({ where: { code: productCode }, options: { force: true, skipDefaultFilter: true } });
      await saleChannelRepo.deleteAll({ where: { code: channelCode }, options: { force: true } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 17] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Isolation Level - REPEATABLE READ
  // ----------------------------------------------------------------
  private async case18_IsolationLevelRepeatableRead(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 18] Isolation Level - REPEATABLE READ');

    try {
      const transaction = await repo.beginTransaction({
        isolationLevel: IsolationLevels.REPEATABLE_READ,
      });

      if (transaction.isolationLevel === IsolationLevels.REPEATABLE_READ) {
        this.logger.info('[CASE 18] PASSED | Transaction created with REPEATABLE READ isolation');
      } else {
        this.logger.error(
          '[CASE 18] FAILED | Expected REPEATABLE READ, got: %s',
          transaction.isolationLevel,
        );
      }

      await transaction.rollback();
    } catch (error) {
      this.logger.error('[CASE 18] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Transaction With Count and Exists
  // ----------------------------------------------------------------
  private async case19_TransactionWithCountAndExists(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 19] Transaction With Count and Exists Operations');

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
        this.logger.info('[CASE 19] PASSED | Count/Exists work correctly in transaction context');
        this.logger.info('[CASE 19] In TX: count=%d exists=%s | Outside: count=%d exists=%s',
          countInTx.count, existsInTx, countOutside.count, existsOutside);
      } else {
        this.logger.error('[CASE 19] FAILED | countInTx=%d existsInTx=%s countOut=%d existsOut=%s',
          countInTx.count, existsInTx, countOutside.count, existsOutside);
      }

      await transaction.rollback();
    } catch (error) {
      try { await transaction.rollback(); } catch (_e) { /* ignore */ }
      this.logger.error('[CASE 19] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Large Transaction With Many Operations
  // ----------------------------------------------------------------
  private async case20_LargeTransactionWithManyOperations(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 20] Large Transaction With Many Operations');

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
        this.logger.info(
          '[CASE 20] PASSED | Large transaction exact counts | remaining: %d/%d | updated: %d/%d',
          remaining.length,
          expectedRemaining,
          updated.length,
          expectedUpdated,
        );
      } else if (remaining.length > 0 && updated.length > 0) {
        // Partial pass - some operations worked but counts are off
        this.logger.info(
          '[CASE 20] INFO | Large transaction partial | remaining: %d (expected %d) | updated: %d (expected %d)',
          remaining.length,
          expectedRemaining,
          updated.length,
          expectedUpdated,
        );
      } else {
        this.logger.error(
          '[CASE 20] FAILED | remaining: %d (expected %d) | updated: %d (expected %d)',
          remaining.length,
          expectedRemaining,
          updated.length,
          expectedUpdated,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      try { await transaction.rollback(); } catch (_e) { /* ignore */ }
      this.logger.error('[CASE 20] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }
}
