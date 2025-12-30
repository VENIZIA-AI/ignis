import {
  BaseService,
  BindingKeys,
  BindingNamespaces,
  DataTypes,
  getUID,
  inject,
  IsolationLevels,
} from '@venizia/ignis';
import { eq, like } from 'drizzle-orm';
import { User } from '../models/entities';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../repositories';

// ----------------------------------------------------------------
export class RepositoryTestService extends BaseService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    private readonly configurationRepository: ConfigurationRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    private readonly productRepository: ProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    })
    private readonly saleChannelRepository: SaleChannelRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    })
    private readonly saleChannelProductRepository: SaleChannelProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    private readonly userRepository: UserRepository,
  ) {
    super({ scope: RepositoryTestService.name });
  }

  // --------------------------------------------------------------------------------
  // Repository Test Cases (without transaction)
  // --------------------------------------------------------------------------------
  async runRepositoryTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[runRepositoryTests] Starting repository test cases (no transaction)');
    this.logger.info('='.repeat(80));

    await this.repoCase1_CreateSingle();
    await this.repoCase2_CreateAll();
    await this.repoCase3_FindOne();
    await this.repoCase4_FindWithFilter();
    await this.repoCase5_FindById();
    await this.repoCase6_UpdateById();
    await this.repoCase7_UpdateAll();
    await this.repoCase8_DeleteByIdAndDeleteAll();

    this.logger.info('='.repeat(80));
    this.logger.info('[runRepositoryTests] All repository test cases completed');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 1: Create single record
  // --------------------------------------------------------------------------------
  private async repoCase1_CreateSingle(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase1_CreateSingle] Create single record');

    const code = `REPO_CREATE_${getUID()}`;

    try {
      const result = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      if (result.count === 1 && result.data?.code === code) {
        this.logger.info(
          '[repoCase1_CreateSingle] PASSED | Created record | id: %s | code: %s',
          result.data.id,
          result.data.code,
        );
      } else {
        this.logger.error('[repoCase1_CreateSingle] FAILED | Unexpected result: %j', result);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase1_CreateSingle] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 2: CreateAll (batch create)
  // --------------------------------------------------------------------------------
  private async repoCase2_CreateAll(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase2_CreateAll] CreateAll (batch create)');

    const codes = [`REPO_BATCH_${getUID()}`, `REPO_BATCH_${getUID()}`, `REPO_BATCH_${getUID()}`];

    try {
      const result = await repo.createAll({
        data: codes.map((code, idx) => ({
          code,
          group: 'REPO_BATCH_TEST',
          dataType: DataTypes.NUMBER,
          nValue: (idx + 1) * 100,
        })),
      });

      if (result.count === 3 && result.data?.length === 3) {
        this.logger.info(
          '[repoCase2_CreateAll] PASSED | Created records | count: %d',
          result.count,
        );
      } else {
        this.logger.error('[repoCase2_CreateAll] FAILED | Expected 3 records | got: %j', result);
      }

      await repo.deleteAll({ where: { group: 'REPO_BATCH_TEST' } });
    } catch (error) {
      this.logger.error('[repoCase2_CreateAll] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 3: FindOne
  // --------------------------------------------------------------------------------
  private async repoCase3_FindOne(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase3_FindOne] FindOne');

    const code = `REPO_FINDONE_${getUID()}`;

    try {
      await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 555 },
      });

      const result = await repo.findOne({ filter: { where: { code } } });

      if (result?.code === code && result.nValue === 555) {
        this.logger.info(
          '[repoCase3_FindOne] PASSED | Found record | code: %s | nValue: %d',
          result.code,
          result.nValue,
        );
      } else {
        this.logger.error('[repoCase3_FindOne] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findOne({ filter: { where: { code: 'NON_EXISTENT_CODE' } } });
      if (notFound === null) {
        this.logger.info('[repoCase3_FindOne] PASSED | Non-existent record returns null');
      } else {
        this.logger.error('[repoCase3_FindOne] FAILED | Expected null for non-existent record');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase3_FindOne] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 4: Find with filter (where, order, limit, offset)
  // --------------------------------------------------------------------------------
  private async repoCase4_FindWithFilter(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase4_FindWithFilter] Find with filter (where, order, limit, offset)');

    const group = `REPO_FILTER_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_A`, group, dataType: DataTypes.NUMBER, nValue: 300 },
          { code: `${group}_B`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_C`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_D`, group, dataType: DataTypes.NUMBER, nValue: 400 },
          { code: `${group}_E`, group, dataType: DataTypes.NUMBER, nValue: 500 },
        ],
      });

      const whereResult = await repo.find({ filter: { where: { group } } });
      if (whereResult.length === 5) {
        this.logger.info(
          '[repoCase4_FindWithFilter] PASSED | Where filter | count: %d',
          whereResult.length,
        );
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Expected 5 | got: %d',
          whereResult.length,
        );
      }

      const orderedAsc = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'] },
      });
      if (orderedAsc[0]?.nValue === 100 && orderedAsc[4]?.nValue === 500) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Order ASC works correctly');
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Order ASC incorrect: %j',
          orderedAsc.map(r => r.nValue),
        );
      }

      const orderedDesc = await repo.find({
        filter: { where: { group }, order: ['nValue DESC'] },
      });
      if (orderedDesc[0]?.nValue === 500 && orderedDesc[4]?.nValue === 100) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Order DESC works correctly');
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Order DESC incorrect: %j',
          orderedDesc.map(r => r.nValue),
        );
      }

      const limited = await repo.find({
        filter: { where: { group }, limit: 2 },
      });
      if (limited.length === 2) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Limit | count: %d', limited.length);
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Limit expected 2 | got: %d',
          limited.length,
        );
      }

      // After ASC order: 100, 200, 300, 400, 500. Skip 2 => 300, 400, 500. Limit 2 => 300, 400
      const skipped = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'], skip: 2, limit: 2 },
      });
      if (skipped.length === 2 && skipped[0]?.nValue === 300 && skipped[1]?.nValue === 400) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Skip/offset works correctly');
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Skip incorrect: %j',
          skipped.map(r => r.nValue),
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[repoCase4_FindWithFilter] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 5: FindById
  // --------------------------------------------------------------------------------
  private async repoCase5_FindById(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase5_FindById] FindById');

    const code = `REPO_FINDBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
      });

      const id = created.data!.id;
      const result = await repo.findById({ id });

      if (result?.id === id && result.code === code) {
        this.logger.info('[repoCase5_FindById] PASSED | Found by id: %s', id);
      } else {
        this.logger.error('[repoCase5_FindById] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findById({ id: '00000000-0000-0000-0000-000000000000' });
      if (notFound === null) {
        this.logger.info('[repoCase5_FindById] PASSED | Non-existent id returns null');
      } else {
        this.logger.error('[repoCase5_FindById] FAILED | Expected null for non-existent id');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase5_FindById] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 6: UpdateById
  // --------------------------------------------------------------------------------
  private async repoCase6_UpdateById(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase6_UpdateById] UpdateById');

    const code = `REPO_UPDATE_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      const id = created.data.id;
      const updateResult = await repo.updateById({
        id,
        data: { nValue: 999, description: 'Updated' },
      });

      if (updateResult.count === 1 && updateResult.data?.nValue === 999) {
        this.logger.info(
          '[repoCase6_UpdateById] PASSED | Updated record | nValue: %d',
          updateResult.data.nValue,
        );
      } else {
        this.logger.error('[repoCase6_UpdateById] FAILED | Update result: %j', updateResult);
      }

      const verified = await repo.findById({ id });
      if (verified?.nValue === 999 && verified?.description === 'Updated') {
        this.logger.info('[repoCase6_UpdateById] PASSED | Update verified in database');
      } else {
        this.logger.error('[repoCase6_UpdateById] FAILED | Update not persisted: %j', verified);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase6_UpdateById] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 7: UpdateAll / UpdateBy
  // --------------------------------------------------------------------------------
  private async repoCase7_UpdateAll(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase7_UpdateAll] UpdateAll / UpdateBy');

    const group = `REPO_UPDATEALL_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
      });

      const updateResult = await repo.updateAll({
        where: { group },
        data: { nValue: 999 },
      });

      if (updateResult.count === 3) {
        this.logger.info(
          '[repoCase7_UpdateAll] PASSED | UpdateAll affected | count: %d',
          updateResult.count,
        );
      } else {
        this.logger.error(
          '[repoCase7_UpdateAll] FAILED | Expected 3 | got: %d',
          updateResult.count,
        );
      }

      const verified = await repo.find({ filter: { where: { group } } });
      const allUpdated = verified.every(r => r.nValue === 999);
      if (allUpdated) {
        this.logger.info('[repoCase7_UpdateAll] PASSED | All records updated to nValue=999');
      } else {
        this.logger.error(
          '[repoCase7_UpdateAll] FAILED | Not all records updated: %j',
          verified.map(r => r.nValue),
        );
      }

      const updateByResult = await repo.updateBy({
        where: { group },
        data: { nValue: 888 },
      });
      if (updateByResult.count === 3) {
        this.logger.info('[repoCase7_UpdateAll] PASSED | UpdateBy works as alias for UpdateAll');
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[repoCase7_UpdateAll] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 8: DeleteById and DeleteAll
  // --------------------------------------------------------------------------------
  private async repoCase8_DeleteByIdAndDeleteAll(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase8_DeleteByIdAndDeleteAll] DeleteById and DeleteAll');

    const group = `REPO_DELETE_${getUID()}`;

    try {
      const created = await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
      });

      const firstId = created.data![0].id;
      const deleteByIdResult = await repo.deleteById({ id: firstId });

      if (deleteByIdResult.count === 1 && deleteByIdResult.data?.id === firstId) {
        this.logger.info(
          '[repoCase8_DeleteByIdAndDeleteAll] PASSED | DeleteById removed record | id: %s',
          firstId,
        );
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | DeleteById result: %j',
          deleteByIdResult,
        );
      }

      const verifyDeleted = await repo.findById({ id: firstId });
      if (verifyDeleted === null) {
        this.logger.info(
          '[repoCase8_DeleteByIdAndDeleteAll] PASSED | DeleteById verified (record not found)',
        );
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | Record still exists after DeleteById',
        );
      }

      const deleteAllResult = await repo.deleteAll({ where: { group } });
      if (deleteAllResult.count === 2) {
        this.logger.info(
          '[repoCase8_DeleteByIdAndDeleteAll] PASSED | DeleteAll removed remaining records | count: %d',
          deleteAllResult.count,
        );
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | DeleteAll expected 2 | got: %d',
          deleteAllResult.count,
        );
      }

      const remaining = await repo.find({ filter: { where: { group } } });
      if (remaining.length === 0) {
        this.logger.info('[repoCase8_DeleteByIdAndDeleteAll] PASSED | All records deleted');
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | Records still remain | count: %d',
          remaining.length,
        );
      }
    } catch (error) {
      this.logger.error('[repoCase8_DeleteByIdAndDeleteAll] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // Transaction Test Cases
  // --------------------------------------------------------------------------------
  async runTransactionTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[Transaction Tests] Starting transaction test cases...');
    this.logger.info('='.repeat(80));

    await this.testCase1_CommitSuccess();
    await this.testCase2_RollbackOnError();
    await this.testCase3_RollbackExplicit();
    await this.testCase4_ReadWithinTransaction();
    await this.testCase5_UpdateAndDeleteInTransaction();
    await this.testCase6_UseInactiveTransactionAfterCommit();
    await this.testCase7_UseInactiveTransactionAfterRollback();
    await this.testCase8_IsolationLevelReadCommitted();
    await this.testCase9_IsolationLevelSerializable();
    await this.testCase10_CreateAllInTransaction();

    this.logger.info('='.repeat(80));
    this.logger.info('[Transaction Tests] All test cases completed!');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // CASE 1: Commit Success - Multiple creates should persist after commit
  // --------------------------------------------------------------------------------
  private async testCase1_CommitSuccess(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 1] Commit Success - Multiple creates should persist after commit');

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

      // Verify data persisted
      const result1 = await repo.findOne({ filter: { where: { code: code1 } } });
      const result2 = await repo.findOne({ filter: { where: { code: code2 } } });

      if (result1 && result2) {
        this.logger.info('[CASE 1] PASSED - Both records persisted after commit');
      } else {
        this.logger.error('[CASE 1] FAILED - Records not found after commit');
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 1] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 2: Rollback on Error - Data should NOT persist after rollback
  // --------------------------------------------------------------------------------
  private async testCase2_RollbackOnError(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 2] Rollback on Error - Data should NOT persist after rollback');

    const code1 = `TX_ROLLBACK_ERR_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });

      // Simulate an error by creating duplicate (unique constraint violation)
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

      // Verify data NOT persisted
      const result = await repo.findOne({ filter: { where: { code: code1 } } });
      if (!result) {
        this.logger.info('[CASE 2] PASSED - Record NOT persisted after rollback');
      } else {
        this.logger.error('[CASE 2] FAILED - Record should not exist after rollback');
        await repo.deleteAll({ where: { code: code1 } });
      }
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 3: Explicit Rollback - Manual rollback without error
  // --------------------------------------------------------------------------------
  private async testCase3_RollbackExplicit(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 3] Explicit Rollback - Manual rollback discards changes');

    const code = `TX_EXPLICIT_ROLLBACK_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 12345 },
        options: { transaction },
      });

      // Explicitly rollback without any error
      await transaction.rollback();
      this.logger.info('[CASE 3] Transaction rolled back explicitly');

      // Verify data NOT persisted
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

  // --------------------------------------------------------------------------------
  // CASE 4: Read within Transaction
  // --------------------------------------------------------------------------------
  private async testCase4_ReadWithinTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 4] Read within Transaction - Uncommitted data visible in transaction');

    const code = `TX_READ_WITHIN_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 999 },
        options: { transaction },
      });

      // Read within same transaction - should see uncommitted data
      const withinTx = await repo.findOne({
        filter: { where: { code } },
        options: { transaction },
      });

      // Read outside transaction - should NOT see uncommitted data
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

  // --------------------------------------------------------------------------------
  // CASE 5: Update and Delete in Transaction
  // --------------------------------------------------------------------------------
  private async testCase5_UpdateAndDeleteInTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 5] Update and Delete in Transaction');

    const code1 = `TX_UPDATE_${getUID()}`;
    const code2 = `TX_DELETE_${getUID()}`;

    // Setup: create records outside transaction
    await repo.create({
      data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });
    await repo.create({
      data: { code: code2, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
    });

    const transaction = await repo.beginTransaction();

    try {
      // Update in transaction
      await repo.updateAll({
        where: { code: code1 },
        data: { nValue: 999 },
        options: { transaction },
      });

      // Delete in transaction
      await repo.deleteAll({
        where: { code: code2 },
        options: { transaction },
      });

      await transaction.commit();

      // Verify changes persisted
      const updated = await repo.findOne({ filter: { where: { code: code1 } } });
      const deleted = await repo.findOne({ filter: { where: { code: code2 } } });

      if (updated?.nValue === 999 && !deleted) {
        this.logger.info('[CASE 5] PASSED - Update and delete persisted after commit');
      } else {
        this.logger.error('[CASE 5] FAILED - updated: %j, deleted: %j', updated, deleted);
      }

      // Cleanup
      await repo.deleteAll({ where: { code: code1 } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 5] FAILED with error: %o', error);
      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 6: Use Inactive Transaction After Commit
  // --------------------------------------------------------------------------------
  private async testCase6_UseInactiveTransactionAfterCommit(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 6] Use Inactive Transaction After Commit');

    const transaction = await repo.beginTransaction();
    await transaction.commit();

    try {
      // Try to use committed transaction - should fail
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

  // --------------------------------------------------------------------------------
  // CASE 7: Use Inactive Transaction After Rollback
  // --------------------------------------------------------------------------------
  private async testCase7_UseInactiveTransactionAfterRollback(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 7] Use Inactive Transaction After Rollback');

    const transaction = await repo.beginTransaction();
    await transaction.rollback();

    try {
      // Try to use rolled back transaction - should fail
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

  // --------------------------------------------------------------------------------
  // CASE 8: Isolation Level - READ COMMITTED
  // --------------------------------------------------------------------------------
  private async testCase8_IsolationLevelReadCommitted(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 8] Isolation Level - READ COMMITTED');

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

  // --------------------------------------------------------------------------------
  // CASE 9: Isolation Level - SERIALIZABLE
  // --------------------------------------------------------------------------------
  private async testCase9_IsolationLevelSerializable(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 9] Isolation Level - SERIALIZABLE');

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

  // --------------------------------------------------------------------------------
  // CASE 10: CreateAll in Transaction
  // --------------------------------------------------------------------------------
  private async testCase10_CreateAllInTransaction(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 10] CreateAll in Transaction');

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

      // Verify all records persisted
      const results = await repo.find({
        filter: { where: { group: 'TX_BATCH_TEST' } },
      });

      if (results.length === 3) {
        this.logger.info('[CASE 10] PASSED - All 3 batch records persisted after commit');
      } else {
        this.logger.error('[CASE 10] FAILED - Expected 3 records, got: %d', results.length);
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'TX_BATCH_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 10] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // JSON OrderBy Test Cases
  // --------------------------------------------------------------------------------
  async runJsonOrderByTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[runJsonOrderByTests] Starting JSON order by test cases');
    this.logger.info('='.repeat(80));

    await this.jsonCase1_CreateWithNestedJson();
    await this.jsonCase2_OrderBySimpleJsonField();
    await this.jsonCase3_OrderByNestedJsonField();
    await this.jsonCase4_OrderByArrayIndex();
    await this.jsonCase5_OrderByNonExistentField();
    await this.jsonCase6_OrderByNonExistentNestedField();
    await this.jsonCase7_Cleanup();

    this.logger.info('='.repeat(80));
    this.logger.info('[runJsonOrderByTests] All JSON order by test cases completed');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 1: Create records with nested JSON data
  // --------------------------------------------------------------------------------
  private async jsonCase1_CreateWithNestedJson(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[jsonCase1_CreateWithNestedJson] Create records with nested JSON data');

    const group = 'JSON_ORDER_TEST';

    try {
      await repo.createAll({
        data: [
          {
            code: `JSON_TEST_A_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 3,
              name: 'Config A',
              metadata: { level: 'high', score: 95 },
              tags: ['important', 'urgent'],
            },
          },
          {
            code: `JSON_TEST_B_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 1,
              name: 'Config B',
              metadata: { level: 'low', score: 45 },
              tags: ['normal', 'pending'],
            },
          },
          {
            code: `JSON_TEST_C_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 2,
              name: 'Config C',
              metadata: { level: 'medium', score: 70 },
              tags: ['review', 'active'],
            },
          },
          {
            code: `JSON_TEST_D_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 5,
              name: 'Config D',
              metadata: { level: 'critical', score: 100 },
              tags: ['emergency', 'priority'],
            },
          },
          {
            code: `JSON_TEST_E_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 4,
              name: 'Config E',
              metadata: { level: 'high', score: 85 },
              tags: ['attention', 'monitor'],
            },
          },
        ],
      });

      this.logger.info(
        '[jsonCase1_CreateWithNestedJson] PASSED | Created 5 records with nested JSON',
      );
    } catch (error) {
      this.logger.error(
        '[jsonCase1_CreateWithNestedJson] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 2: Order by simple JSON field (jValue.priority)
  // --------------------------------------------------------------------------------
  private async jsonCase2_OrderBySimpleJsonField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[jsonCase2_OrderBySimpleJsonField] Order by jValue.priority');

    const group = 'JSON_ORDER_TEST';

    try {
      // Order by jValue.priority ASC
      const ascResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.priority ASC'],
        },
      });

      const ascPriorities = ascResult.map(r => (r.jValue as any)?.priority);
      this.logger.info('[jsonCase2] ASC priorities: %j', ascPriorities);

      // Priorities should be: 1, 2, 3, 4, 5
      const isAscCorrect =
        ascPriorities[0] === 1 &&
        ascPriorities[1] === 2 &&
        ascPriorities[2] === 3 &&
        ascPriorities[3] === 4 &&
        ascPriorities[4] === 5;

      if (isAscCorrect) {
        this.logger.info('[jsonCase2_OrderBySimpleJsonField] PASSED | ASC order correct');
      } else {
        this.logger.error('[jsonCase2_OrderBySimpleJsonField] FAILED | ASC order incorrect');
      }

      // Order by jValue.priority DESC
      const descResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.priority DESC'],
        },
      });

      const descPriorities = descResult.map(r => (r.jValue as any)?.priority);
      this.logger.info('[jsonCase2] DESC priorities: %j', descPriorities);

      // Priorities should be: 5, 4, 3, 2, 1
      const isDescCorrect =
        descPriorities[0] === 5 &&
        descPriorities[1] === 4 &&
        descPriorities[2] === 3 &&
        descPriorities[3] === 2 &&
        descPriorities[4] === 1;

      if (isDescCorrect) {
        this.logger.info('[jsonCase2_OrderBySimpleJsonField] PASSED | DESC order correct');
      } else {
        this.logger.error('[jsonCase2_OrderBySimpleJsonField] FAILED | DESC order incorrect');
      }
    } catch (error) {
      this.logger.error(
        '[jsonCase2_OrderBySimpleJsonField] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 3: Order by nested JSON field (jValue.metadata.score)
  // --------------------------------------------------------------------------------
  private async jsonCase3_OrderByNestedJsonField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[jsonCase3_OrderByNestedJsonField] Order by jValue.metadata.score');

    const group = 'JSON_ORDER_TEST';

    try {
      // Order by jValue.metadata.score ASC
      const ascResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.metadata.score ASC'],
        },
      });

      const ascScores = ascResult.map(r => (r.jValue as any)?.metadata?.score);
      this.logger.info('[jsonCase3] ASC scores: %j', ascScores);

      // Scores should be: 45, 70, 85, 95, 100
      const isAscCorrect =
        ascScores[0] === 45 &&
        ascScores[1] === 70 &&
        ascScores[2] === 85 &&
        ascScores[3] === 95 &&
        ascScores[4] === 100;

      if (isAscCorrect) {
        this.logger.info(
          '[jsonCase3_OrderByNestedJsonField] PASSED | Nested field ASC order correct',
        );
      } else {
        this.logger.error('[jsonCase3_OrderByNestedJsonField] FAILED | Nested field ASC incorrect');
      }

      // Order by jValue.metadata.score DESC
      const descResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.metadata.score DESC'],
        },
      });

      const descScores = descResult.map(r => (r.jValue as any)?.metadata?.score);
      this.logger.info('[jsonCase3] DESC scores: %j', descScores);

      const isDescCorrect =
        descScores[0] === 100 &&
        descScores[1] === 95 &&
        descScores[2] === 85 &&
        descScores[3] === 70 &&
        descScores[4] === 45;

      if (isDescCorrect) {
        this.logger.info(
          '[jsonCase3_OrderByNestedJsonField] PASSED | Nested field DESC order correct',
        );
      } else {
        this.logger.error(
          '[jsonCase3_OrderByNestedJsonField] FAILED | Nested field DESC incorrect',
        );
      }
    } catch (error) {
      this.logger.error(
        '[jsonCase3_OrderByNestedJsonField] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 4: Order by array index (jValue.tags[0])
  // --------------------------------------------------------------------------------
  private async jsonCase4_OrderByArrayIndex(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[jsonCase4_OrderByArrayIndex] Order by jValue.tags[0]');

    const group = 'JSON_ORDER_TEST';

    try {
      // Order by tags[0] ASC (alphabetically: attention, emergency, important, normal, review)
      const ascResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.tags[0] ASC'],
        },
      });

      const ascTags = ascResult.map(r => (r.jValue as any)?.tags?.[0]);
      this.logger.info('[jsonCase4] ASC tags[0]: %j', ascTags);

      // Check alphabetical order
      const sortedTags = [...ascTags].sort();
      const isAscCorrect = ascTags.every((tag: string, i: number) => tag === sortedTags[i]);

      if (isAscCorrect) {
        this.logger.info('[jsonCase4_OrderByArrayIndex] PASSED | Array index ASC order correct');
      } else {
        this.logger.error(
          '[jsonCase4_OrderByArrayIndex] FAILED | Expected: %j | Got: %j',
          sortedTags,
          ascTags,
        );
      }

      // Order by tags[0] DESC
      const descResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.tags[0] DESC'],
        },
      });

      const descTags = descResult.map(r => (r.jValue as any)?.tags?.[0]);
      this.logger.info('[jsonCase4] DESC tags[0]: %j', descTags);

      const sortedTagsDesc = [...descTags].sort().reverse();
      const isDescCorrect = descTags.every((tag: string, i: number) => tag === sortedTagsDesc[i]);

      if (isDescCorrect) {
        this.logger.info('[jsonCase4_OrderByArrayIndex] PASSED | Array index DESC order correct');
      } else {
        this.logger.error(
          '[jsonCase4_OrderByArrayIndex] FAILED | Expected: %j | Got: %j',
          sortedTagsDesc,
          descTags,
        );
      }
    } catch (error) {
      this.logger.error(
        '[jsonCase4_OrderByArrayIndex] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 5: Order by non-existent JSON field (jValue.nonExistent)
  // --------------------------------------------------------------------------------
  private async jsonCase5_OrderByNonExistentField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[jsonCase5_OrderByNonExistentField] Order by jValue.nonExistent');

    const group = 'JSON_ORDER_TEST';

    try {
      // Order by a field that doesn't exist - should return all records (NULL values)
      const result = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.nonExistent ASC'],
        },
      });

      // Should still return all 5 records, just with undefined ordering for non-existent field
      if (result.length === 5) {
        this.logger.info(
          '[jsonCase5_OrderByNonExistentField] PASSED | Returned all %d records (non-existent field treated as NULL)',
          result.length,
        );
      } else {
        this.logger.error(
          '[jsonCase5_OrderByNonExistentField] FAILED | Expected 5 records | got: %d',
          result.length,
        );
      }
    } catch (error) {
      this.logger.error(
        '[jsonCase5_OrderByNonExistentField] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 6: Order by non-existent nested field (jValue.metadata.nonExistent)
  // --------------------------------------------------------------------------------
  private async jsonCase6_OrderByNonExistentNestedField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[jsonCase6_OrderByNonExistentNestedField] Order by jValue.metadata.nonExistent',
    );

    const group = 'JSON_ORDER_TEST';

    try {
      // Order by a nested field that doesn't exist
      const result = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.metadata.nonExistent DESC'],
        },
      });

      // Should still return all 5 records
      if (result.length === 5) {
        this.logger.info(
          '[jsonCase6_OrderByNonExistentNestedField] PASSED | Returned all %d records (non-existent nested field treated as NULL)',
          result.length,
        );
      } else {
        this.logger.error(
          '[jsonCase6_OrderByNonExistentNestedField] FAILED | Expected 5 records | got: %d',
          result.length,
        );
      }

      // Also test deeply nested non-existent path
      const deepResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.a.b.c.d.e ASC'],
        },
      });

      if (deepResult.length === 5) {
        this.logger.info(
          '[jsonCase6_OrderByNonExistentNestedField] PASSED | Deep non-existent path returned all %d records',
          deepResult.length,
        );
      } else {
        this.logger.error(
          '[jsonCase6_OrderByNonExistentNestedField] FAILED | Deep path expected 5 records | got: %d',
          deepResult.length,
        );
      }
    } catch (error) {
      this.logger.error(
        '[jsonCase6_OrderByNonExistentNestedField] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // JSON CASE 7: Cleanup JSON test data
  // --------------------------------------------------------------------------------
  private async jsonCase7_Cleanup(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[jsonCase7_Cleanup] Cleanup JSON test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'JSON_ORDER_TEST' } });
      this.logger.info('[jsonCase7_Cleanup] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[jsonCase7_Cleanup] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // Field Selection Test Cases (toColumns)
  // --------------------------------------------------------------------------------
  async runFieldSelectionTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[runFieldSelectionTests] Starting field selection test cases');
    this.logger.info('='.repeat(80));

    await this.fieldsCase1_CreateTestData();
    await this.fieldsCase2_ArrayFormat();
    await this.fieldsCase3_ObjectFormatWithTrue();
    await this.fieldsCase4_ObjectFormatWithFalse();
    await this.fieldsCase5_ArrayVsObjectEquivalence();
    await this.fieldsCase6_Cleanup();

    this.logger.info('='.repeat(80));
    this.logger.info('[runFieldSelectionTests] All field selection test cases completed');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // FIELDS CASE 1: Create test data for field selection tests
  // --------------------------------------------------------------------------------
  private async fieldsCase1_CreateTestData(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[fieldsCase1_CreateTestData] Create test data for field selection');

    const group = 'FIELDS_TEST';

    try {
      await repo.createAll({
        data: [
          {
            code: `FIELDS_A_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 100,
            tValue: 'Text A',
            jValue: { key: 'valueA' },
          },
          {
            code: `FIELDS_B_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 200,
            tValue: 'Text B',
            jValue: { key: 'valueB' },
          },
          {
            code: `FIELDS_C_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 300,
            tValue: 'Text C',
            jValue: { key: 'valueC' },
          },
        ],
      });

      this.logger.info(
        '[fieldsCase1_CreateTestData] PASSED | Created 3 records for field selection tests',
      );
    } catch (error) {
      this.logger.error(
        '[fieldsCase1_CreateTestData] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // FIELDS CASE 2: Array format - ['id', 'code', 'nValue']
  // --------------------------------------------------------------------------------
  private async fieldsCase2_ArrayFormat(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[fieldsCase2_ArrayFormat] Test array format: [id, code, nValue]');

    const group = 'FIELDS_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group },
          fields: ['id', 'code', 'nValue'],
        },
      });

      if (results.length !== 3) {
        this.logger.error(
          '[fieldsCase2_ArrayFormat] FAILED | Expected 3 records | got: %d',
          results.length,
        );
        return;
      }

      // Check that only specified fields are present
      const firstRecord = results[0];
      const hasId = 'id' in firstRecord;
      const hasCode = 'code' in firstRecord;
      const hasNValue = 'nValue' in firstRecord;
      const hasTValue = 'tValue' in firstRecord;
      const hasJValue = 'jValue' in firstRecord;

      if (hasId && hasCode && hasNValue && !hasTValue && !hasJValue) {
        this.logger.info('[fieldsCase2_ArrayFormat] PASSED | Only selected fields returned');
        this.logger.info('[fieldsCase2_ArrayFormat] Record keys: %j', Object.keys(firstRecord));
      } else {
        this.logger.error(
          '[fieldsCase2_ArrayFormat] FAILED | Unexpected fields | hasId: %s, hasCode: %s, hasNValue: %s, hasTValue: %s, hasJValue: %s',
          hasId,
          hasCode,
          hasNValue,
          hasTValue,
          hasJValue,
        );
        this.logger.error('[fieldsCase2_ArrayFormat] Record: %j', firstRecord);
      }
    } catch (error) {
      this.logger.error('[fieldsCase2_ArrayFormat] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // FIELDS CASE 3: Object format with true - { id: true, code: true }
  // --------------------------------------------------------------------------------
  private async fieldsCase3_ObjectFormatWithTrue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[fieldsCase3_ObjectFormatWithTrue] Test object format: { id: true, code: true, tValue: true }',
    );

    const group = 'FIELDS_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group },
          fields: { id: true, code: true, tValue: true },
        },
      });

      if (results.length !== 3) {
        this.logger.error(
          '[fieldsCase3_ObjectFormatWithTrue] FAILED | Expected 3 records | got: %d',
          results.length,
        );
        return;
      }

      const firstRecord = results[0];
      const hasId = 'id' in firstRecord;
      const hasCode = 'code' in firstRecord;
      const hasTValue = 'tValue' in firstRecord;
      const hasNValue = 'nValue' in firstRecord;
      const hasJValue = 'jValue' in firstRecord;

      if (hasId && hasCode && hasTValue && !hasNValue && !hasJValue) {
        this.logger.info('[fieldsCase3_ObjectFormatWithTrue] PASSED | Only true fields returned');
        this.logger.info(
          '[fieldsCase3_ObjectFormatWithTrue] Record keys: %j',
          Object.keys(firstRecord),
        );
      } else {
        this.logger.error(
          '[fieldsCase3_ObjectFormatWithTrue] FAILED | Unexpected fields | Record: %j',
          firstRecord,
        );
      }
    } catch (error) {
      this.logger.error(
        '[fieldsCase3_ObjectFormatWithTrue] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // FIELDS CASE 4: Object format with false - { id: true, code: true, nValue: false }
  // --------------------------------------------------------------------------------
  private async fieldsCase4_ObjectFormatWithFalse(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[fieldsCase4_ObjectFormatWithFalse] Test object format with false: { id: true, code: true, nValue: false }',
    );

    const group = 'FIELDS_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group },
          fields: { id: true, code: true, nValue: false, tValue: false },
        },
      });

      if (results.length !== 3) {
        this.logger.error(
          '[fieldsCase4_ObjectFormatWithFalse] FAILED | Expected 3 records | got: %d',
          results.length,
        );
        return;
      }

      const firstRecord = results[0];
      const hasId = 'id' in firstRecord;
      const hasCode = 'code' in firstRecord;
      const hasNValue = 'nValue' in firstRecord;
      const hasTValue = 'tValue' in firstRecord;

      // false fields should be excluded, only true fields returned
      if (hasId && hasCode && !hasNValue && !hasTValue) {
        this.logger.info('[fieldsCase4_ObjectFormatWithFalse] PASSED | False fields excluded');
        this.logger.info(
          '[fieldsCase4_ObjectFormatWithFalse] Record keys: %j',
          Object.keys(firstRecord),
        );
      } else {
        this.logger.error(
          '[fieldsCase4_ObjectFormatWithFalse] FAILED | Unexpected fields | hasId: %s, hasCode: %s, hasNValue: %s, hasTValue: %s',
          hasId,
          hasCode,
          hasNValue,
          hasTValue,
        );
        this.logger.error('[fieldsCase4_ObjectFormatWithFalse] Record: %j', firstRecord);
      }
    } catch (error) {
      this.logger.error(
        '[fieldsCase4_ObjectFormatWithFalse] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // FIELDS CASE 5: Array vs Object equivalence
  // --------------------------------------------------------------------------------
  private async fieldsCase5_ArrayVsObjectEquivalence(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[fieldsCase5_ArrayVsObjectEquivalence] Test array and object formats produce same result',
    );

    const group = 'FIELDS_TEST';

    try {
      // Query with array format
      const arrayResults = await repo.find({
        filter: {
          where: { group },
          fields: ['id', 'code'],
          order: ['code ASC'],
        },
      });

      // Query with object format
      const objectResults = await repo.find({
        filter: {
          where: { group },
          fields: { id: true, code: true },
          order: ['code ASC'],
        },
      });

      if (arrayResults.length !== objectResults.length) {
        this.logger.error(
          '[fieldsCase5_ArrayVsObjectEquivalence] FAILED | Different record counts | array: %d, object: %d',
          arrayResults.length,
          objectResults.length,
        );
        return;
      }

      // Compare keys of first record
      const arrayKeys = Object.keys(arrayResults[0]).sort();
      const objectKeys = Object.keys(objectResults[0]).sort();

      if (arrayKeys.join(',') === objectKeys.join(',')) {
        this.logger.info(
          '[fieldsCase5_ArrayVsObjectEquivalence] PASSED | Array and object formats are equivalent',
        );
        this.logger.info('[fieldsCase5_ArrayVsObjectEquivalence] Both return keys: %j', arrayKeys);
      } else {
        this.logger.error(
          '[fieldsCase5_ArrayVsObjectEquivalence] FAILED | Different keys | array: %j, object: %j',
          arrayKeys,
          objectKeys,
        );
      }
    } catch (error) {
      this.logger.error(
        '[fieldsCase5_ArrayVsObjectEquivalence] FAILED | Error: %s',
        (error as Error).message,
      );
    }
  }

  // --------------------------------------------------------------------------------
  // FIELDS CASE 6: Cleanup test data
  // --------------------------------------------------------------------------------
  private async fieldsCase6_Cleanup(): Promise<void> {
    const repo = this.configurationRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[fieldsCase6_Cleanup] Cleanup field selection test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'FIELDS_TEST' } });
      this.logger.info('[fieldsCase6_Cleanup] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[fieldsCase6_Cleanup] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // Inclusion Test Cases (Many-to-Many Relationship)
  // --------------------------------------------------------------------------------
  async runInclusionTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[Inclusion Tests] Starting inclusion test cases (many-to-many)');
    this.logger.info('='.repeat(80));

    await this.inclusionCase1_SetupAndBasicInclude();
    await this.inclusionCase2_ProductWithSaleChannels();
    await this.inclusionCase3_SaleChannelWithProducts();
    await this.inclusionCase4_JunctionTableWithBothRelations();
    await this.inclusionCase5_NestedInclusion();
    await this.inclusionCase6_Cleanup();

    this.logger.info('='.repeat(80));
    this.logger.info('[Inclusion Tests] All inclusion test cases completed!');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 1: Setup and Basic Include
  // --------------------------------------------------------------------------------
  private async inclusionCase1_SetupAndBasicInclude(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const saleChannelProductRepo = this.saleChannelProductRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 1] Setup test data and basic include');

    try {
      // Create products
      const products = await productRepo.createAll({
        data: [
          { name: 'Product A', code: `PROD_A_${getUID()}`, price: 100 },
          { name: 'Product B', code: `PROD_B_${getUID()}`, price: 200 },
          { name: 'Product C', code: `PROD_C_${getUID()}`, price: 300 },
        ],
      });

      // Create sale channels
      const channels = await saleChannelRepo.createAll({
        data: [
          { name: 'Online Store', code: `ONLINE_${getUID()}` },
          { name: 'Retail Store', code: `RETAIL_${getUID()}` },
          { name: 'Wholesale', code: `WHOLESALE_${getUID()}` },
        ],
      });

      // Create junction records (many-to-many)
      // Product A -> Online, Retail
      // Product B -> Online, Wholesale
      // Product C -> Retail, Wholesale
      await saleChannelProductRepo.createAll({
        data: [
          { productId: products.data![0].id, saleChannelId: channels.data![0].id },
          { productId: products.data![0].id, saleChannelId: channels.data![1].id },
          { productId: products.data![1].id, saleChannelId: channels.data![0].id },
          { productId: products.data![1].id, saleChannelId: channels.data![2].id },
          { productId: products.data![2].id, saleChannelId: channels.data![1].id },
          { productId: products.data![2].id, saleChannelId: channels.data![2].id },
        ],
      });

      this.logger.info('[INCLUSION 1] PASSED | Created 3 products, 3 channels, 6 junction records');
    } catch (error) {
      this.logger.error('[INCLUSION 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 2: Product with Sale Channels
  // --------------------------------------------------------------------------------
  private async inclusionCase2_ProductWithSaleChannels(): Promise<void> {
    const productRepo = this.productRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 2] Find Product with its SaleChannels');

    try {
      // Find Product A with its sale channels
      const productA = await productRepo.findOne({
        filter: {
          where: { name: 'Product A' },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
      });

      if (!productA) {
        this.logger.error('[INCLUSION 2] FAILED | Product A not found');
        return;
      }

      const saleChannelProducts = (productA as any).saleChannelProducts;
      if (saleChannelProducts?.length === 2) {
        const channelNames = saleChannelProducts.map((scp: any) => scp.saleChannel?.name);
        this.logger.info(
          '[INCLUSION 2] PASSED | Product A has 2 channels | Channels: %j',
          channelNames,
        );
      } else {
        this.logger.error(
          '[INCLUSION 2] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 3: Sale Channel with Products
  // --------------------------------------------------------------------------------
  private async inclusionCase3_SaleChannelWithProducts(): Promise<void> {
    const saleChannelRepo = this.saleChannelRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 3] Find SaleChannel with its Products');

    try {
      // Find Online Store with its products
      const onlineStore = await saleChannelRepo.findOne({
        filter: {
          where: { name: 'Online Store' },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'product' }],
              },
            },
          ],
        },
      });

      if (!onlineStore) {
        this.logger.error('[INCLUSION 3] FAILED | Online Store not found');
        return;
      }

      const saleChannelProducts = (onlineStore as any).saleChannelProducts;
      if (saleChannelProducts?.length === 2) {
        const productNames = saleChannelProducts.map((scp: any) => scp.product?.name);
        this.logger.info(
          '[INCLUSION 3] PASSED | Online Store has 2 products | Products: %j',
          productNames,
        );
      } else {
        this.logger.error(
          '[INCLUSION 3] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 4: Junction table with both relations
  // --------------------------------------------------------------------------------
  private async inclusionCase4_JunctionTableWithBothRelations(): Promise<void> {
    const saleChannelProductRepo = this.saleChannelProductRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 4] Find junction table with both relations');

    try {
      const allRelations = await saleChannelProductRepo.find({
        filter: {
          include: [{ relation: 'product' }, { relation: 'saleChannel' }],
        },
      });

      if (allRelations.length === 6) {
        const withBothRelations = allRelations.filter(
          (r: any) => r.product && r.saleChannel,
        ).length;

        if (withBothRelations === 6) {
          this.logger.info(
            '[INCLUSION 4] PASSED | All 6 junction records have both product and saleChannel',
          );
        } else {
          this.logger.error(
            '[INCLUSION 4] FAILED | Only %d of 6 have both relations',
            withBothRelations,
          );
        }
      } else {
        this.logger.error(
          '[INCLUSION 4] FAILED | Expected 6 junction records | got: %d',
          allRelations.length,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 5: Nested inclusion - find all products with channels
  // --------------------------------------------------------------------------------
  private async inclusionCase5_NestedInclusion(): Promise<void> {
    const productRepo = this.productRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 5] Nested inclusion - find all products with channels');

    try {
      const allProducts = await productRepo.find({
        filter: {
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
      });

      if (allProducts.length === 3) {
        let totalChannels = 0;
        for (const product of allProducts) {
          const scp = (product as any).saleChannelProducts || [];
          totalChannels += scp.length;
        }

        if (totalChannels === 6) {
          this.logger.info(
            '[INCLUSION 5] PASSED | Found 3 products with total 6 channel associations',
          );
        } else {
          this.logger.error(
            '[INCLUSION 5] FAILED | Expected 6 total associations | got: %d',
            totalChannels,
          );
        }
      } else {
        this.logger.error(
          '[INCLUSION 5] FAILED | Expected 3 products | got: %d',
          allProducts.length,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 6: Cleanup all test data
  // --------------------------------------------------------------------------------
  private async inclusionCase6_Cleanup(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const saleChannelProductRepo = this.saleChannelProductRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 6] Cleanup all test data');

    try {
      // Delete in correct order (junction table first due to foreign keys)
      const deletedJunction = await saleChannelProductRepo.deleteAll({
        where: {},
        options: { force: true },
      });
      const deletedProducts = await productRepo.deleteAll({
        where: {},
        options: { force: true },
      });
      const deletedChannels = await saleChannelRepo.deleteAll({
        where: {},
        options: { force: true },
      });

      this.logger.info(
        '[INCLUSION 6] PASSED | Cleaned up | Junction: %d | Products: %d | Channels: %d',
        deletedJunction.count,
        deletedProducts.count,
        deletedChannels.count,
      );
    } catch (error) {
      this.logger.error('[INCLUSION 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // Hidden Properties Test Cases
  // --------------------------------------------------------------------------------
  async runHiddenPropertiesTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[Hidden Properties Tests] Starting hidden properties test cases');
    this.logger.info('='.repeat(80));

    // Basic CRUD tests
    await this.hiddenCase1_CreateUserWithHiddenFields();
    await this.hiddenCase2_FindOneExcludesHidden();
    await this.hiddenCase3_FindExcludesHidden();
    await this.hiddenCase4_FindByIdExcludesHidden();
    await this.hiddenCase5_UpdateByIdExcludesHidden();

    // Edge cases
    await this.hiddenCase7_ConnectorQueryReturnsHidden();
    await this.hiddenCase8_CreateAllExcludesHidden();
    await this.hiddenCase9_UpdateAllExcludesHidden();
    await this.hiddenCase10_DeleteByIdExcludesHidden();
    await this.hiddenCase11_FieldsSelectionStillExcludesHidden();
    await this.hiddenCase12_VerifyDataActuallyStoredInDB();

    // Advanced edge cases - digging deeper
    await this.hiddenCase13_WhereClauseCanFilterByHidden();
    await this.hiddenCase14_CountWithHiddenInWhere();
    await this.hiddenCase15_ExistsWithHiddenInWhere();
    await this.hiddenCase16_TransactionContextHidden();
    await this.hiddenCase17_FindByIdWithFilterFields();
    await this.hiddenCase18_MultipleHiddenFieldsPartialMatch();
    await this.hiddenCase19_UpdateOnlyHiddenFields();
    await this.hiddenCase20_NullHiddenFieldValues();

    // Relation hidden properties
    await this.hiddenCase21_RelationHiddenProperties();

    // Cleanup last
    await this.hiddenCase6_Cleanup();

    this.logger.info('='.repeat(80));
    this.logger.info('[Hidden Properties Tests] All hidden properties test cases completed!');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 1: Create user with hidden fields - verify they are not returned
  // --------------------------------------------------------------------------------
  private async hiddenCase1_CreateUserWithHiddenFields(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[hiddenCase1] Create user with password and secret - verify hidden in response',
    );

    try {
      const testRealm = `HIDDEN_TEST_${getUID()}`;
      const created = await repo.create({
        data: {
          realm: testRealm,
          password: 'super_secret_password_123',
          secret: 'top_secret_token_456',
        },
      });

      // Verify hidden fields are NOT in the response
      const hasPassword = 'password' in created.data;
      const hasSecret = 'secret' in created.data;

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase1] FAILED | Hidden fields should NOT be in create response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
        this.logger.error('[hiddenCase1] Response data: %j', created.data);
      } else {
        this.logger.info(
          '[hiddenCase1] PASSED | Hidden fields excluded from create response | id: %s | realm: %s',
          created.data.id,
          created.data.realm,
        );
        this.logger.info('[hiddenCase1] Response keys: %s', Object.keys(created.data).join(', '));
      }
    } catch (error) {
      this.logger.error('[hiddenCase1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 2: FindOne excludes hidden properties
  // --------------------------------------------------------------------------------
  private async hiddenCase2_FindOneExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase2] FindOne should exclude hidden properties');

    try {
      // First, find any user created in case 1
      const user = await repo.findOne({
        filter: {
          where: { realm: { like: 'HIDDEN_TEST_%' } },
        },
      });

      if (!user) {
        this.logger.warn('[hiddenCase2] SKIPPED | No test user found');
        return;
      }

      // Store id before property checks to avoid TypeScript narrowing issues
      const userId = user.id;
      const userKeys = Object.keys(user);

      // Verify hidden fields are NOT in the response
      const hasPassword = userKeys.includes('password');
      const hasSecret = userKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase2] FAILED | Hidden fields should NOT be in findOne response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info(
          '[hiddenCase2] PASSED | Hidden fields excluded from findOne | id: %s',
          userId,
        );
        this.logger.info('[hiddenCase2] Response keys: %s', userKeys.join(', '));
      }
    } catch (error) {
      this.logger.error('[hiddenCase2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 3: Find (multiple) excludes hidden properties
  // --------------------------------------------------------------------------------
  private async hiddenCase3_FindExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase3] Find should exclude hidden properties from all results');

    try {
      const users = await repo.find({
        filter: {
          where: { realm: { like: 'HIDDEN_TEST_%' } },
        },
      });

      if (users.length === 0) {
        this.logger.warn('[hiddenCase3] SKIPPED | No test users found');
        return;
      }

      // Check all users for hidden fields
      let hasFailed = false;
      for (const user of users) {
        const hasPassword = 'password' in user;
        const hasSecret = 'secret' in user;
        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.logger.error(
            '[hiddenCase3] FAILED | User %s has hidden fields | hasPassword: %s | hasSecret: %s',
            user.id,
            hasPassword,
            hasSecret,
          );
        }
      }

      if (!hasFailed) {
        this.logger.info(
          '[hiddenCase3] PASSED | Hidden fields excluded from all %d users',
          users.length,
        );
        this.logger.info('[hiddenCase3] Sample keys: %s', Object.keys(users[0]).join(', '));
      }
    } catch (error) {
      this.logger.error('[hiddenCase3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 4: FindById excludes hidden properties
  // --------------------------------------------------------------------------------
  private async hiddenCase4_FindByIdExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase4] FindById should exclude hidden properties');

    try {
      // First get a user ID
      const anyUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!anyUser) {
        this.logger.warn('[hiddenCase4] SKIPPED | No test user found');
        return;
      }

      // Now findById
      const user = await repo.findById({ id: anyUser.id });

      if (!user) {
        this.logger.error('[hiddenCase4] FAILED | User not found by ID: %s', anyUser.id);
        return;
      }

      // Store id before property checks to avoid TypeScript narrowing issues
      const userId = user.id;
      const userKeys = Object.keys(user);

      const hasPassword = userKeys.includes('password');
      const hasSecret = userKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase4] FAILED | Hidden fields should NOT be in findById response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info(
          '[hiddenCase4] PASSED | Hidden fields excluded from findById | id: %s',
          userId,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 5: UpdateById excludes hidden properties in response
  // --------------------------------------------------------------------------------
  private async hiddenCase5_UpdateByIdExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase5] UpdateById should exclude hidden properties in response');

    try {
      // First get a user ID
      const anyUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!anyUser) {
        this.logger.warn('[hiddenCase5] SKIPPED | No test user found');
        return;
      }

      // Update the user (even updating a hidden field)
      const updated = await repo.updateById({
        id: anyUser.id,
        data: {
          realm: `HIDDEN_TEST_UPDATED_${getUID()}`,
          password: 'new_password_789', // Update hidden field
        },
      });

      const hasPassword = 'password' in updated.data;
      const hasSecret = 'secret' in updated.data;

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase5] FAILED | Hidden fields should NOT be in updateById response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info(
          '[hiddenCase5] PASSED | Hidden fields excluded from updateById response | id: %s | newRealm: %s',
          updated.data.id,
          updated.data.realm,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 6: Cleanup test data
  // --------------------------------------------------------------------------------
  private async hiddenCase6_Cleanup(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase6] Cleanup hidden properties test data');

    try {
      const deleted = await repo.deleteAll({
        where: { realm: { like: 'HIDDEN_TEST_%' } },
      });

      // Verify hidden fields are NOT in delete response either
      if (deleted.data && deleted.data.length > 0) {
        const firstDeleted = deleted.data[0];
        const hasPassword = 'password' in firstDeleted;
        const hasSecret = 'secret' in firstDeleted;

        if (hasPassword || hasSecret) {
          this.logger.error(
            '[hiddenCase6] Note: Hidden fields found in delete response | hasPassword: %s | hasSecret: %s',
            hasPassword,
            hasSecret,
          );
        }
      }

      this.logger.info('[hiddenCase6] PASSED | Deleted %d test users', deleted.count);
    } catch (error) {
      this.logger.error('[hiddenCase6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 7: Connector query SHOULD return hidden properties (bypass repository)
  // This is the critical test - direct SQL queries should NOT filter hidden properties
  // --------------------------------------------------------------------------------
  private async hiddenCase7_ConnectorQueryReturnsHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase7] Connector query SHOULD return hidden properties');

    try {
      // First, find a test user ID via repository (hidden excluded)
      const repoUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!repoUser) {
        this.logger.warn('[hiddenCase7] SKIPPED | No test user found');
        return;
      }

      // Now query directly via connector - should return ALL columns including hidden
      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, repoUser.id));

      if (directResults.length === 0) {
        this.logger.error('[hiddenCase7] FAILED | Direct query returned no results');
        return;
      }

      const directUser = directResults[0];
      const directKeys = Object.keys(directUser);

      // Direct connector query SHOULD have password and secret
      const hasPassword = directKeys.includes('password');
      const hasSecret = directKeys.includes('secret');

      if (hasPassword && hasSecret) {
        this.logger.info(
          '[hiddenCase7] PASSED | Connector query returns hidden fields | password: %s | secret: %s',
          directUser.password ? '***' : 'null',
          directUser.secret ? '***' : 'null',
        );
        this.logger.info('[hiddenCase7] Direct query keys: %s', directKeys.join(', '));
      } else {
        this.logger.error(
          '[hiddenCase7] FAILED | Connector query should return hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 8: CreateAll (batch create) excludes hidden properties
  // --------------------------------------------------------------------------------
  private async hiddenCase8_CreateAllExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase8] CreateAll should exclude hidden properties from response');

    try {
      const created = await repo.createAll({
        data: [
          {
            realm: `HIDDEN_TEST_BATCH1_${getUID()}`,
            password: 'batch_password_1',
            secret: 'batch_secret_1',
          },
          {
            realm: `HIDDEN_TEST_BATCH2_${getUID()}`,
            password: 'batch_password_2',
            secret: 'batch_secret_2',
          },
        ],
      });

      if (created.count !== 2 || created.data?.length !== 2) {
        this.logger.error('[hiddenCase8] FAILED | Expected 2 records created');
        return;
      }

      // Check all created records for hidden fields
      let hasFailed = false;
      for (const user of created.data) {
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.logger.error(
            '[hiddenCase8] FAILED | User %s has hidden fields in createAll response',
            user.id,
          );
        }
      }

      if (!hasFailed) {
        this.logger.info(
          '[hiddenCase8] PASSED | CreateAll excludes hidden from all %d records',
          created.count,
        );
        this.logger.info('[hiddenCase8] Sample keys: %s', Object.keys(created.data[0]).join(', '));
      }
    } catch (error) {
      this.logger.error('[hiddenCase8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 9: UpdateAll (bulk update) excludes hidden properties
  // --------------------------------------------------------------------------------
  private async hiddenCase9_UpdateAllExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase9] UpdateAll should exclude hidden properties from response');

    try {
      // Update all test users
      const updated = await repo.updateAll({
        where: { realm: { like: 'HIDDEN_TEST_%' } },
        data: {
          password: 'updated_bulk_password',
          secret: 'updated_bulk_secret',
        },
      });

      if (updated.count === 0) {
        this.logger.warn('[hiddenCase9] SKIPPED | No test users to update');
        return;
      }

      if (!updated.data || updated.data.length === 0) {
        this.logger.warn('[hiddenCase9] SKIPPED | No data returned (shouldReturn may be false)');
        return;
      }

      // Check all updated records for hidden fields
      let hasFailed = false;
      for (const user of updated.data) {
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.logger.error(
            '[hiddenCase9] FAILED | User %s has hidden fields in updateAll response',
            user.id,
          );
        }
      }

      if (!hasFailed) {
        this.logger.info(
          '[hiddenCase9] PASSED | UpdateAll excludes hidden from all %d records',
          updated.count,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 10: DeleteById excludes hidden properties from response
  // --------------------------------------------------------------------------------
  private async hiddenCase10_DeleteByIdExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase10] DeleteById should exclude hidden properties from response');

    try {
      // Create a user to delete
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_DELETE_${getUID()}`,
          password: 'delete_test_password',
          secret: 'delete_test_secret',
        },
      });

      const userId = created.data.id;

      // Delete by ID and check response
      const deleted = await repo.deleteById({ id: userId });

      if (deleted.count !== 1 || !deleted.data) {
        this.logger.error('[hiddenCase10] FAILED | Expected 1 record deleted');
        return;
      }

      const deletedKeys = Object.keys(deleted.data);
      const hasPassword = deletedKeys.includes('password');
      const hasSecret = deletedKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase10] FAILED | DeleteById response has hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info(
          '[hiddenCase10] PASSED | DeleteById excludes hidden fields | id: %s',
          deleted.data.id,
        );
        this.logger.info('[hiddenCase10] Response keys: %s', deletedKeys.join(', '));
      }
    } catch (error) {
      this.logger.error('[hiddenCase10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 11: Fields selection still excludes hidden (even if explicitly requested)
  // --------------------------------------------------------------------------------
  private async hiddenCase11_FieldsSelectionStillExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase11] Fields selection should still exclude hidden properties');

    try {
      // Try to explicitly request hidden fields via fields option
      const users = await repo.find({
        filter: {
          where: { realm: { like: 'HIDDEN_TEST_%' } },
          // Explicitly request hidden fields - they should STILL be excluded
          fields: ['id', 'realm', 'password', 'secret'],
        },
      });

      if (users.length === 0) {
        this.logger.warn('[hiddenCase11] SKIPPED | No test users found');
        return;
      }

      // Even though we requested password and secret, they should be excluded
      const firstUser = users[0];
      const userKeys = Object.keys(firstUser);
      const hasPassword = userKeys.includes('password');
      const hasSecret = userKeys.includes('secret');
      const hasId = userKeys.includes('id');
      const hasRealm = userKeys.includes('realm');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase11] FAILED | Hidden fields returned despite being hidden | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else if (hasId && hasRealm) {
        this.logger.info(
          '[hiddenCase11] PASSED | Hidden fields excluded even when explicitly requested',
        );
        this.logger.info(
          '[hiddenCase11] Requested: [id, realm, password, secret] | Got: %s',
          userKeys.join(', '),
        );
      } else {
        this.logger.error(
          '[hiddenCase11] FAILED | Non-hidden requested fields missing | hasId: %s | hasRealm: %s',
          hasId,
          hasRealm,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 12: Verify data is actually stored in DB (via connector)
  // This ensures hidden properties are stored, just not returned via repository
  // --------------------------------------------------------------------------------
  private async hiddenCase12_VerifyDataActuallyStoredInDB(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase12] Verify hidden data is actually stored in DB');

    try {
      // Create a user with known password and secret
      const testPassword = `test_pw_${getUID()}`;
      const testSecret = `test_secret_${getUID()}`;
      const testRealm = `HIDDEN_TEST_VERIFY_${getUID()}`;

      await repo.create({
        data: {
          realm: testRealm,
          password: testPassword,
          secret: testSecret,
        },
      });

      // Query directly via connector to verify data was stored
      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(like(User.schema.realm, 'HIDDEN_TEST_VERIFY_%'));

      if (directResults.length === 0) {
        this.logger.error('[hiddenCase12] FAILED | No records found via connector');
        return;
      }

      const storedUser = directResults[0];

      // Verify the exact values we stored
      if (storedUser.password === testPassword && storedUser.secret === testSecret) {
        this.logger.info('[hiddenCase12] PASSED | Hidden data correctly stored in DB');
        this.logger.info(
          '[hiddenCase12] Stored password matches: %s | Stored secret matches: %s',
          storedUser.password === testPassword,
          storedUser.secret === testSecret,
        );
      } else {
        this.logger.error(
          '[hiddenCase12] FAILED | Stored values do not match | password: %s | secret: %s',
          storedUser.password,
          storedUser.secret,
        );
      }

      // Cleanup this specific test user
      await connector.delete(User.schema).where(like(User.schema.realm, 'HIDDEN_TEST_VERIFY_%'));
    } catch (error) {
      this.logger.error('[hiddenCase12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 13: Where clause CAN filter by hidden field (filter works, just not returned)
  // This is critical - you should be able to query by password but not see it in results
  // --------------------------------------------------------------------------------
  private async hiddenCase13_WhereClauseCanFilterByHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase13] Where clause should be able to filter by hidden field');

    try {
      // Create user with known password
      const knownPassword = `unique_password_${getUID()}`;
      const testRealm = `HIDDEN_TEST_WHERE_${getUID()}`;

      await repo.create({
        data: {
          realm: testRealm,
          password: knownPassword,
          secret: 'some_secret',
        },
      });

      // Try to find by password (hidden field) - this SHOULD work
      const foundByPassword = await repo.findOne({
        filter: {
          where: { password: knownPassword },
        },
      });

      if (!foundByPassword) {
        this.logger.error('[hiddenCase13] FAILED | Could not find user by password filter');
        return;
      }

      // Verify we found the right user
      if (foundByPassword.realm !== testRealm) {
        this.logger.error(
          '[hiddenCase13] FAILED | Found wrong user | expected realm: %s | got: %s',
          testRealm,
          foundByPassword.realm,
        );
        return;
      }

      // Verify password is NOT in the result
      const resultKeys = Object.keys(foundByPassword);
      const hasPassword = resultKeys.includes('password');

      if (hasPassword) {
        this.logger.error('[hiddenCase13] FAILED | Password should NOT be in result');
      } else {
        this.logger.info(
          '[hiddenCase13] PASSED | Can filter by hidden field but it is excluded from result',
        );
        this.logger.info('[hiddenCase13] Found user by password, realm: %s', foundByPassword.realm);
      }
    } catch (error) {
      this.logger.error('[hiddenCase13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 14: Count operation with hidden field in where clause
  // --------------------------------------------------------------------------------
  private async hiddenCase14_CountWithHiddenInWhere(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase14] Count should work with hidden field in where clause');

    try {
      // Create users with known passwords
      const password1 = `count_pw_${getUID()}`;
      const password2 = `count_pw_${getUID()}`;

      await repo.createAll({
        data: [
          { realm: `HIDDEN_TEST_COUNT1_${getUID()}`, password: password1, secret: 's1' },
          { realm: `HIDDEN_TEST_COUNT2_${getUID()}`, password: password1, secret: 's2' }, // same password
          { realm: `HIDDEN_TEST_COUNT3_${getUID()}`, password: password2, secret: 's3' }, // different password
        ],
      });

      // Count by password (hidden field)
      const count = await repo.count({
        where: { password: password1 },
      });

      if (count.count === 2) {
        this.logger.info(
          '[hiddenCase14] PASSED | Count works with hidden field filter | count: %d',
          count.count,
        );
      } else {
        this.logger.error('[hiddenCase14] FAILED | Expected count 2 | got: %d', count.count);
      }
    } catch (error) {
      this.logger.error('[hiddenCase14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 15: ExistsWith operation with hidden field in where clause
  // --------------------------------------------------------------------------------
  private async hiddenCase15_ExistsWithHiddenInWhere(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase15] ExistsWith should work with hidden field in where clause');

    try {
      // Find a test user's password via connector
      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(like(User.schema.realm, 'HIDDEN_TEST_%'))
        .limit(1);

      if (directResults.length === 0) {
        this.logger.warn('[hiddenCase15] SKIPPED | No test users found');
        return;
      }

      const knownPassword = directResults[0].password;

      if (!knownPassword) {
        this.logger.warn('[hiddenCase15] SKIPPED | Test user has no password');
        return;
      }

      // Check existence by password (hidden field)
      const exists = await repo.existsWith({
        where: { password: knownPassword },
      });

      // Also check for non-existent password
      const notExists = await repo.existsWith({
        where: { password: 'definitely_not_a_real_password_xyz_123' },
      });

      if (exists && !notExists) {
        this.logger.info('[hiddenCase15] PASSED | ExistsWith works with hidden field filter');
      } else {
        this.logger.error(
          '[hiddenCase15] FAILED | exists: %s (expected true) | notExists: %s (expected false)',
          exists,
          notExists,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 16: Transaction context - hidden properties should work in transactions
  // --------------------------------------------------------------------------------
  private async hiddenCase16_TransactionContextHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[hiddenCase16] Hidden properties should work correctly in transaction context',
    );

    const transaction = await repo.beginTransaction();

    try {
      // Create in transaction
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_TX_${getUID()}`,
          password: 'tx_password',
          secret: 'tx_secret',
        },
        options: { transaction },
      });

      // Verify hidden excluded in create response
      const createKeys = Object.keys(created.data);
      const createHasPassword = createKeys.includes('password');

      if (createHasPassword) {
        this.logger.error('[hiddenCase16] FAILED | Create in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      // Find in transaction
      const found = await repo.findById({
        id: created.data.id,
        options: { transaction },
      });

      if (!found) {
        this.logger.error('[hiddenCase16] FAILED | Could not find created user in TX');
        await transaction.rollback();
        return;
      }

      const findKeys = Object.keys(found);
      const findHasPassword = findKeys.includes('password');

      if (findHasPassword) {
        this.logger.error('[hiddenCase16] FAILED | Find in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      // Update in transaction
      const updated = await repo.updateById({
        id: created.data.id,
        data: { password: 'new_tx_password' },
        options: { transaction },
      });

      const updateKeys = Object.keys(updated.data);
      const updateHasPassword = updateKeys.includes('password');

      if (updateHasPassword) {
        this.logger.error('[hiddenCase16] FAILED | Update in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      await transaction.commit();
      this.logger.info('[hiddenCase16] PASSED | Hidden properties work correctly in transactions');
      this.logger.info('[hiddenCase16] Create keys: %s', createKeys.join(', '));
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[hiddenCase16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 17: FindById with filter.fields including hidden - should still exclude
  // --------------------------------------------------------------------------------
  private async hiddenCase17_FindByIdWithFilterFields(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase17] FindById with filter.fields should still exclude hidden');

    try {
      // Get a test user
      const anyUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!anyUser) {
        this.logger.warn('[hiddenCase17] SKIPPED | No test user found');
        return;
      }

      // FindById with explicit fields including hidden
      const user = await repo.findById({
        id: anyUser.id,
        filter: {
          fields: ['id', 'realm', 'password', 'secret'],
        },
      });

      if (!user) {
        this.logger.error('[hiddenCase17] FAILED | User not found');
        return;
      }

      const userKeys = Object.keys(user);
      const hasPassword = userKeys.includes('password');
      const hasSecret = userKeys.includes('secret');
      const hasId = userKeys.includes('id');
      const hasRealm = userKeys.includes('realm');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase17] FAILED | FindById returned hidden fields | keys: %s',
          userKeys.join(', '),
        );
      } else if (hasId && hasRealm) {
        this.logger.info(
          '[hiddenCase17] PASSED | FindById excludes hidden even with explicit fields',
        );
        this.logger.info(
          '[hiddenCase17] Requested: [id, realm, password, secret] | Got: %s',
          userKeys.join(', '),
        );
      } else {
        this.logger.error('[hiddenCase17] FAILED | Missing expected fields');
      }
    } catch (error) {
      this.logger.error('[hiddenCase17] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 18: Multiple users - verify ALL have hidden excluded (not just first)
  // --------------------------------------------------------------------------------
  private async hiddenCase18_MultipleHiddenFieldsPartialMatch(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase18] Verify ALL users in result have hidden excluded');

    try {
      // Create multiple users with different hidden values
      await repo.createAll({
        data: [
          { realm: `HIDDEN_TEST_MULTI1_${getUID()}`, password: 'pw1', secret: 'sec1' },
          { realm: `HIDDEN_TEST_MULTI2_${getUID()}`, password: 'pw2', secret: null },
          { realm: `HIDDEN_TEST_MULTI3_${getUID()}`, password: null, secret: 'sec3' },
          { realm: `HIDDEN_TEST_MULTI4_${getUID()}`, password: null, secret: null },
        ],
      });

      // Find all test users
      const users = await repo.find({
        filter: { where: { realm: { like: 'HIDDEN_TEST_MULTI%' } } },
      });

      if (users.length < 4) {
        this.logger.error(
          '[hiddenCase18] FAILED | Expected at least 4 users | got: %d',
          users.length,
        );
        return;
      }

      // Check EVERY user
      let failedCount = 0;
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          failedCount++;
          this.logger.error(
            '[hiddenCase18] User %d (%s) has hidden | hasPassword: %s | hasSecret: %s',
            i,
            user.realm,
            hasPassword,
            hasSecret,
          );
        }
      }

      if (failedCount === 0) {
        this.logger.info(
          '[hiddenCase18] PASSED | All %d users have hidden fields excluded',
          users.length,
        );
      } else {
        this.logger.error(
          '[hiddenCase18] FAILED | %d users have hidden fields exposed',
          failedCount,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 19: Update ONLY hidden fields - should work but response excludes them
  // --------------------------------------------------------------------------------
  private async hiddenCase19_UpdateOnlyHiddenFields(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[hiddenCase19] Update ONLY hidden fields - should work but exclude from response',
    );

    try {
      // Create a user
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_ONLYHIDDEN_${getUID()}`,
          password: 'original_password',
          secret: 'original_secret',
        },
      });

      const userId = created.data.id;
      const originalRealm = created.data.realm;

      // Update ONLY hidden fields
      const updated = await repo.updateById({
        id: userId,
        data: {
          password: 'new_password_only',
          secret: 'new_secret_only',
        },
      });

      // Verify response excludes hidden
      const updateKeys = Object.keys(updated.data);
      const hasPassword = updateKeys.includes('password');
      const hasSecret = updateKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error('[hiddenCase19] FAILED | Update response has hidden fields');
        return;
      }

      // Verify realm didn't change (only hidden updated)
      if (updated.data.realm !== originalRealm) {
        this.logger.error('[hiddenCase19] FAILED | Non-hidden field changed unexpectedly');
        return;
      }

      // Verify via connector that hidden fields DID change
      const connector = repo.getConnector();
      const directResult = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, userId));

      if (directResult.length === 0) {
        this.logger.error('[hiddenCase19] FAILED | User not found via connector');
        return;
      }

      const dbUser = directResult[0];
      if (dbUser.password === 'new_password_only' && dbUser.secret === 'new_secret_only') {
        this.logger.info(
          '[hiddenCase19] PASSED | Hidden fields updated but excluded from response',
        );
        this.logger.info(
          '[hiddenCase19] DB password: %s | DB secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      } else {
        this.logger.error(
          '[hiddenCase19] FAILED | Hidden fields not updated | password: %s | secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase19] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 20: Null/undefined hidden field values - edge case
  // --------------------------------------------------------------------------------
  private async hiddenCase20_NullHiddenFieldValues(): Promise<void> {
    const repo = this.userRepository;
    this.logger.info('-'.repeat(80));
    this.logger.info('[hiddenCase20] Handle null hidden field values correctly');

    try {
      // Create user with null hidden fields
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_NULL_${getUID()}`,
          password: null,
          secret: null,
        },
      });

      // Verify hidden fields not in response (even when null)
      const createKeys = Object.keys(created.data);
      const hasPassword = createKeys.includes('password');
      const hasSecret = createKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error('[hiddenCase20] FAILED | Null hidden fields should still be excluded');
        return;
      }

      // Find and verify
      const found = await repo.findById({ id: created.data.id });
      if (!found) {
        this.logger.error('[hiddenCase20] FAILED | User not found');
        return;
      }

      const findKeys = Object.keys(found);
      const findHasPassword = findKeys.includes('password');
      const findHasSecret = findKeys.includes('secret');

      if (findHasPassword || findHasSecret) {
        this.logger.error('[hiddenCase20] FAILED | Find returned null hidden fields');
        return;
      }

      // Verify via connector that null values are stored
      const connector = repo.getConnector();
      const directResult = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, created.data.id));

      if (directResult.length === 0) {
        this.logger.error('[hiddenCase20] FAILED | User not found via connector');
        return;
      }

      const dbUser = directResult[0];
      if (dbUser.password === null && dbUser.secret === null) {
        this.logger.info(
          '[hiddenCase20] PASSED | Null hidden fields stored and excluded correctly',
        );
      } else {
        this.logger.error(
          '[hiddenCase20] FAILED | Expected null values | password: %s | secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      }
    } catch (error) {
      this.logger.error('[hiddenCase20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // HIDDEN CASE 21: Relation hidden properties - included relations should exclude hidden
  // --------------------------------------------------------------------------------
  private async hiddenCase21_RelationHiddenProperties(): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info(
      '[hiddenCase21] Relations should exclude hidden properties from related entities',
    );

    try {
      // First, ensure we have a test user with hidden properties
      const testRealm = 'hidden_relation_test';
      let testUser = await this.userRepository.findOne({
        filter: { where: { realm: testRealm } },
      });

      if (!testUser) {
        // Create a test user with hidden properties
        const created = await this.userRepository.create({
          data: {
            realm: testRealm,
            password: 'relation_test_password',
            secret: 'relation_test_secret',
          },
        });
        testUser = created.data;
        this.logger.info('[hiddenCase21] Created test user | id: %s', testUser?.id);
      }

      if (!testUser) {
        this.logger.warn('[hiddenCase21] SKIPPED | Could not create test user');
        return;
      }

      // Create a configuration with the test user as creator
      const configRepo = this.configurationRepository;
      const testConfigCode = `HIDDEN_REL_TEST_${Date.now()}`;

      const createdConfig = await configRepo.create({
        data: {
          code: testConfigCode,
          group: 'HIDDEN_TEST',
          description: 'Test for relation hidden properties',
          createdBy: testUser.id,
          modifiedBy: testUser.id,
        },
      });

      if (!createdConfig.data) {
        this.logger.error('[hiddenCase21] FAILED | Could not create test configuration');
        return;
      }

      this.logger.info(
        '[hiddenCase21] Created test config | id: %s | code: %s',
        createdConfig.data.id,
        testConfigCode,
      );

      // Now query the configuration WITH the creator relation included
      const configWithCreator = await configRepo.findOne({
        filter: {
          where: { id: createdConfig.data.id },
          include: [{ relation: 'creator' }],
        },
      });

      if (!configWithCreator) {
        this.logger.error('[hiddenCase21] FAILED | Could not find configuration with creator');
        return;
      }

      // Check if creator relation is included
      const creator = (configWithCreator as any).creator;
      if (!creator) {
        this.logger.error('[hiddenCase21] FAILED | Creator relation not included in result');
        return;
      }

      const creatorKeys = Object.keys(creator);
      const hasPassword = creatorKeys.includes('password');
      const hasSecret = creatorKeys.includes('secret');

      this.logger.info('[hiddenCase21] Creator relation keys: %s', creatorKeys.join(', '));

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[hiddenCase21] FAILED | Creator relation has hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info('[hiddenCase21] PASSED | Creator relation excludes hidden fields');
        this.logger.info('[hiddenCase21] Creator id: %s | realm: %s', creator.id, creator.realm);
      }

      // Verify the hidden data is still in DB via connector
      const connector = this.userRepository.getConnector();

      const [dbUser] = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, testUser.id));

      if (
        dbUser?.password === 'relation_test_password' &&
        dbUser?.secret === 'relation_test_secret'
      ) {
        this.logger.info('[hiddenCase21] Verified: Hidden data exists in DB for related user');
      } else {
        this.logger.warn('[hiddenCase21] Warning: Could not verify hidden data in DB');
      }

      // Cleanup: delete the test configuration
      await configRepo.deleteById({ id: createdConfig.data.id });
      this.logger.info('[hiddenCase21] Cleaned up test configuration');

      // Delete the test user
      await this.userRepository.deleteAll({
        where: { realm: testRealm },
        options: { force: true },
      });
      this.logger.info('[hiddenCase21] Cleaned up test user');
    } catch (error) {
      this.logger.error('[hiddenCase21] FAILED | Error: %s', (error as Error).message);
    }
  }
}
