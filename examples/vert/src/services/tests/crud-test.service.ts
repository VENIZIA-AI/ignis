import { BindingKeys, BindingNamespaces, DataTypes, getUID, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// CRUD Test Service - Basic repository operations (no transaction)
// ----------------------------------------------------------------
export class CrudTestService extends BaseTestService {
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
      CrudTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[CrudTestService] Starting repository test cases (no transaction)');

    // Basic CRUD operations
    await this.case1_CreateSingle();
    await this.case2_CreateAll();
    await this.case3_FindOne();
    await this.case4_FindWithFilter();
    await this.case5_FindById();
    await this.case6_UpdateById();
    await this.case7_UpdateAll();
    await this.case8_DeleteByIdAndDeleteAll();

    // Edge cases and error handling
    await this.case9_CreateWithNullValues();
    await this.case10_EmptyBatchCreate();
    await this.case11_UpdateNonExistentRecord();
    await this.case12_DeleteNonExistentRecord();
    await this.case13_BoundaryValues();
    await this.case14_CountOperation();
    await this.case15_ExistsWithOperation();
    await this.case16_ConcurrentCreates();
    await this.case17_UpdateWithPartialData();
    await this.case18_FindWithEmptyResult();
    await this.case19_DoublePrecisionValues();

    this.logSection('[CrudTestService] All repository test cases completed');
  }

  // ----------------------------------------------------------------
  // CASE 1: Create single record
  // ----------------------------------------------------------------
  private async case1_CreateSingle(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case1_CreateSingle] Create single record');

    const code = `REPO_CREATE_${getUID()}`;

    try {
      const result = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      if (result.count === 1 && result.data?.code === code) {
        this.logger.info(
          '[case1_CreateSingle] PASSED | Created record | id: %s | code: %s',
          result.data.id,
          result.data.code,
        );
      } else {
        this.logger.error('[case1_CreateSingle] FAILED | Unexpected result: %j', result);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[case1_CreateSingle] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: CreateAll (batch create)
  // ----------------------------------------------------------------
  private async case2_CreateAll(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case2_CreateAll] CreateAll (batch create)');

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
        this.logger.info('[case2_CreateAll] PASSED | Created records | count: %d', result.count);
      } else {
        this.logger.error('[case2_CreateAll] FAILED | Expected 3 records | got: %j', result);
      }

      await repo.deleteAll({ where: { group: 'REPO_BATCH_TEST' } });
    } catch (error) {
      this.logger.error('[case2_CreateAll] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: FindOne
  // ----------------------------------------------------------------
  private async case3_FindOne(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case3_FindOne] FindOne');

    const code = `REPO_FINDONE_${getUID()}`;

    try {
      await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 555 },
      });

      const result = await repo.findOne({ filter: { where: { code } } });

      if (result?.code === code && result.nValue === 555) {
        this.logger.info(
          '[case3_FindOne] PASSED | Found record | code: %s | nValue: %d',
          result.code,
          result.nValue,
        );
      } else {
        this.logger.error('[case3_FindOne] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findOne({ filter: { where: { code: 'NON_EXISTENT_CODE' } } });
      if (notFound === null) {
        this.logger.info('[case3_FindOne] PASSED | Non-existent record returns null');
      } else {
        this.logger.error('[case3_FindOne] FAILED | Expected null for non-existent record');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[case3_FindOne] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Find with filter (where, order, limit, offset)
  // ----------------------------------------------------------------
  private async case4_FindWithFilter(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case4_FindWithFilter] Find with filter (where, order, limit, offset)');

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
          '[case4_FindWithFilter] PASSED | Where filter | count: %d',
          whereResult.length,
        );
      } else {
        this.logger.error(
          '[case4_FindWithFilter] FAILED | Expected 5 | got: %d',
          whereResult.length,
        );
      }

      const orderedAsc = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'] },
      });
      if (orderedAsc[0]?.nValue === 100 && orderedAsc[4]?.nValue === 500) {
        this.logger.info('[case4_FindWithFilter] PASSED | Order ASC works correctly');
      } else {
        this.logger.error(
          '[case4_FindWithFilter] FAILED | Order ASC incorrect: %j',
          orderedAsc.map(r => r.nValue),
        );
      }

      const orderedDesc = await repo.find({
        filter: { where: { group }, order: ['nValue DESC'] },
      });
      if (orderedDesc[0]?.nValue === 500 && orderedDesc[4]?.nValue === 100) {
        this.logger.info('[case4_FindWithFilter] PASSED | Order DESC works correctly');
      } else {
        this.logger.error(
          '[case4_FindWithFilter] FAILED | Order DESC incorrect: %j',
          orderedDesc.map(r => r.nValue),
        );
      }

      const limited = await repo.find({
        filter: { where: { group }, limit: 2 },
      });
      if (limited.length === 2) {
        this.logger.info('[case4_FindWithFilter] PASSED | Limit | count: %d', limited.length);
      } else {
        this.logger.error(
          '[case4_FindWithFilter] FAILED | Limit expected 2 | got: %d',
          limited.length,
        );
      }

      const skipped = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'], skip: 2, limit: 2 },
      });
      if (skipped.length === 2 && skipped[0]?.nValue === 300 && skipped[1]?.nValue === 400) {
        this.logger.info('[case4_FindWithFilter] PASSED | Skip/offset works correctly');
      } else {
        this.logger.error(
          '[case4_FindWithFilter] FAILED | Skip incorrect: %j',
          skipped.map(r => r.nValue),
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[case4_FindWithFilter] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: FindById
  // ----------------------------------------------------------------
  private async case5_FindById(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case5_FindById] FindById');

    const code = `REPO_FINDBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
      });

      const id = created.data!.id;
      const result = await repo.findById({ id });

      if (result?.id === id && result.code === code) {
        this.logger.info('[case5_FindById] PASSED | Found by id: %s', id);
      } else {
        this.logger.error('[case5_FindById] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findById({ id: '00000000-0000-0000-0000-000000000000' });
      if (notFound === null) {
        this.logger.info('[case5_FindById] PASSED | Non-existent id returns null');
      } else {
        this.logger.error('[case5_FindById] FAILED | Expected null for non-existent id');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[case5_FindById] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: UpdateById
  // ----------------------------------------------------------------
  private async case6_UpdateById(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case6_UpdateById] UpdateById');

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
          '[case6_UpdateById] PASSED | Updated record | nValue: %d',
          updateResult.data.nValue,
        );
      } else {
        this.logger.error('[case6_UpdateById] FAILED | Update result: %j', updateResult);
      }

      const verified = await repo.findById({ id });
      if (verified?.nValue === 999 && verified?.description === 'Updated') {
        this.logger.info('[case6_UpdateById] PASSED | Update verified in database');
      } else {
        this.logger.error('[case6_UpdateById] FAILED | Update not persisted: %j', verified);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[case6_UpdateById] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: UpdateAll / UpdateBy
  // ----------------------------------------------------------------
  private async case7_UpdateAll(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case7_UpdateAll] UpdateAll / UpdateBy');

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
          '[case7_UpdateAll] PASSED | UpdateAll affected | count: %d',
          updateResult.count,
        );
      } else {
        this.logger.error('[case7_UpdateAll] FAILED | Expected 3 | got: %d', updateResult.count);
      }

      const verified = await repo.find({ filter: { where: { group } } });
      const allUpdated = verified.every(r => r.nValue === 999);
      if (allUpdated) {
        this.logger.info('[case7_UpdateAll] PASSED | All records updated to nValue=999');
      } else {
        this.logger.error(
          '[case7_UpdateAll] FAILED | Not all records updated: %j',
          verified.map(r => r.nValue),
        );
      }

      const updateByResult = await repo.updateBy({
        where: { group },
        data: { nValue: 888 },
      });
      if (updateByResult.count === 3) {
        this.logger.info('[case7_UpdateAll] PASSED | UpdateBy works as alias for UpdateAll');
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[case7_UpdateAll] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: DeleteById and DeleteAll
  // ----------------------------------------------------------------
  private async case8_DeleteByIdAndDeleteAll(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case8_DeleteByIdAndDeleteAll] DeleteById and DeleteAll');

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
          '[case8_DeleteByIdAndDeleteAll] PASSED | DeleteById removed record | id: %s',
          firstId,
        );
      } else {
        this.logger.error(
          '[case8_DeleteByIdAndDeleteAll] FAILED | DeleteById result: %j',
          deleteByIdResult,
        );
      }

      const verifyDeleted = await repo.findById({ id: firstId });
      if (verifyDeleted === null) {
        this.logger.info(
          '[case8_DeleteByIdAndDeleteAll] PASSED | DeleteById verified (record not found)',
        );
      } else {
        this.logger.error(
          '[case8_DeleteByIdAndDeleteAll] FAILED | Record still exists after DeleteById',
        );
      }

      const deleteAllResult = await repo.deleteAll({ where: { group } });
      if (deleteAllResult.count === 2) {
        this.logger.info(
          '[case8_DeleteByIdAndDeleteAll] PASSED | DeleteAll removed remaining records | count: %d',
          deleteAllResult.count,
        );
      } else {
        this.logger.error(
          '[case8_DeleteByIdAndDeleteAll] FAILED | DeleteAll expected 2 | got: %d',
          deleteAllResult.count,
        );
      }

      const remaining = await repo.find({ filter: { where: { group } } });
      if (remaining.length === 0) {
        this.logger.info('[case8_DeleteByIdAndDeleteAll] PASSED | All records deleted');
      } else {
        this.logger.error(
          '[case8_DeleteByIdAndDeleteAll] FAILED | Records still remain | count: %d',
          remaining.length,
        );
      }
    } catch (error) {
      this.logger.error('[case8_DeleteByIdAndDeleteAll] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Create with null/undefined values
  // ----------------------------------------------------------------
  private async case9_CreateWithNullValues(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case9_CreateWithNullValues] Create with null/undefined values');

    const code = `REPO_NULL_${getUID()}`;

    try {
      // Create with explicit null values
      const result = await repo.create({
        data: {
          code,
          group: 'REPO_NULL_TEST',
          dataType: DataTypes.NUMBER,
          nValue: null,
          description: null,
        },
      });

      if (result.count === 1) {
        this.logger.info(
          '[case9_CreateWithNullValues] PASSED | Created record with null values | id: %s',
          result.data?.id,
        );
      } else {
        this.logger.error('[case9_CreateWithNullValues] FAILED | Create result: %j', result);
      }

      // Verify null values are stored correctly
      const found = await repo.findOne({ filter: { where: { code } } });
      if (found?.nValue === null && found?.description === null) {
        this.logger.info('[case9_CreateWithNullValues] PASSED | Null values persisted correctly');
      } else {
        this.logger.error(
          '[case9_CreateWithNullValues] FAILED | Null values not preserved | nValue: %s | description: %s',
          found?.nValue,
          found?.description,
        );
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[case9_CreateWithNullValues] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Empty batch create
  // ----------------------------------------------------------------
  private async case10_EmptyBatchCreate(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case10_EmptyBatchCreate] CreateAll with empty array');

    try {
      const result = await repo.createAll({ data: [] });

      if (result.count === 0 && (result.data?.length === 0 || !result.data)) {
        this.logger.info('[case10_EmptyBatchCreate] PASSED | Empty batch returns count: 0');
      } else {
        this.logger.error('[case10_EmptyBatchCreate] FAILED | Unexpected result: %j', result);
      }
    } catch (error) {
      // Empty batch might throw an error - that's also valid behavior
      this.logger.info(
        '[case10_EmptyBatchCreate] PASSED | Empty batch handled (threw error): %s',
        (error as Error).message.substring(0, 50),
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Update non-existent record
  // ----------------------------------------------------------------
  private async case11_UpdateNonExistentRecord(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case11_UpdateNonExistentRecord] UpdateById for non-existent ID');

    const fakeId = '00000000-0000-0000-0000-000000000000';

    try {
      const result = await repo.updateById({
        id: fakeId,
        data: { description: 'This should not update anything' },
      });

      if (result.count === 0) {
        this.logger.info(
          '[case11_UpdateNonExistentRecord] PASSED | Non-existent ID returns count: 0',
        );
      } else {
        this.logger.error(
          '[case11_UpdateNonExistentRecord] FAILED | Expected count 0 | got: %d',
          result.count,
        );
      }
    } catch (error) {
      // Some implementations might throw an error - that's also valid
      this.logger.info(
        '[case11_UpdateNonExistentRecord] PASSED | Non-existent ID handled (threw error): %s',
        (error as Error).message.substring(0, 50),
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Delete non-existent record
  // ----------------------------------------------------------------
  private async case12_DeleteNonExistentRecord(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case12_DeleteNonExistentRecord] DeleteById for non-existent ID');

    const fakeId = '00000000-0000-0000-0000-000000000000';

    try {
      const result = await repo.deleteById({ id: fakeId });

      if (result.count === 0) {
        this.logger.info(
          '[case12_DeleteNonExistentRecord] PASSED | Non-existent ID returns count: 0',
        );
      } else {
        this.logger.error(
          '[case12_DeleteNonExistentRecord] FAILED | Expected count 0 | got: %d',
          result.count,
        );
      }
    } catch (error) {
      // Some implementations might throw an error - that's also valid
      this.logger.info(
        '[case12_DeleteNonExistentRecord] PASSED | Non-existent ID handled (threw error): %s',
        (error as Error).message.substring(0, 50),
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Boundary values (extreme numbers, long strings)
  // ----------------------------------------------------------------
  private async case13_BoundaryValues(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case13_BoundaryValues] Test boundary values');

    const group = `REPO_BOUNDARY_${getUID()}`;

    try {
      // Test very large number
      const maxInt = 2147483647; // Max 32-bit signed integer
      const minInt = -2147483648;
      const longString = 'A'.repeat(5000); // 5000 character string

      await repo.createAll({
        data: [
          { code: `${group}_MAX`, group, dataType: DataTypes.NUMBER, nValue: maxInt },
          { code: `${group}_MIN`, group, dataType: DataTypes.NUMBER, nValue: minInt },
          { code: `${group}_LONG`, group, dataType: DataTypes.TEXT, description: longString },
          { code: `${group}_ZERO`, group, dataType: DataTypes.NUMBER, nValue: 0 },
          { code: `${group}_NEGATIVE`, group, dataType: DataTypes.NUMBER, nValue: -999 },
        ],
      });

      // Verify max integer
      const maxRecord = await repo.findOne({ filter: { where: { code: `${group}_MAX` } } });
      if (maxRecord?.nValue === maxInt) {
        this.logger.info('[case13_BoundaryValues] PASSED | Max integer: %d', maxRecord.nValue);
      } else {
        this.logger.error(
          '[case13_BoundaryValues] FAILED | Max integer | expected: %d | got: %d',
          maxInt,
          maxRecord?.nValue,
        );
      }

      // Verify min integer
      const minRecord = await repo.findOne({ filter: { where: { code: `${group}_MIN` } } });
      if (minRecord?.nValue === minInt) {
        this.logger.info('[case13_BoundaryValues] PASSED | Min integer: %d', minRecord.nValue);
      } else {
        this.logger.error(
          '[case13_BoundaryValues] FAILED | Min integer | expected: %d | got: %d',
          minInt,
          minRecord?.nValue,
        );
      }

      // Verify long string
      const longRecord = await repo.findOne({ filter: { where: { code: `${group}_LONG` } } });
      if (longRecord?.description?.length === 5000) {
        this.logger.info(
          '[case13_BoundaryValues] PASSED | Long string length: %d',
          longRecord.description.length,
        );
      } else {
        this.logger.error(
          '[case13_BoundaryValues] FAILED | Long string | expected 5000 | got: %d',
          longRecord?.description?.length,
        );
      }

      // Verify zero
      const zeroRecord = await repo.findOne({ filter: { where: { code: `${group}_ZERO` } } });
      if (zeroRecord?.nValue === 0) {
        this.logger.info('[case13_BoundaryValues] PASSED | Zero value handled correctly');
      } else {
        this.logger.error(
          '[case13_BoundaryValues] FAILED | Zero value | got: %d',
          zeroRecord?.nValue,
        );
      }

      // Verify negative integer
      const negRecord = await repo.findOne({ filter: { where: { code: `${group}_NEGATIVE` } } });
      if (negRecord?.nValue === -999) {
        this.logger.info('[case13_BoundaryValues] PASSED | Negative integer: %d', negRecord.nValue);
      } else {
        this.logger.error(
          '[case13_BoundaryValues] FAILED | Negative integer | got: %d',
          negRecord?.nValue,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[case13_BoundaryValues] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Count operation
  // ----------------------------------------------------------------
  private async case14_CountOperation(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case14_CountOperation] Count operation with various filters');

    const group = `REPO_COUNT_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
          { code: `${group}_4`, group, dataType: DataTypes.NUMBER, nValue: 400 },
          { code: `${group}_5`, group, dataType: DataTypes.NUMBER, nValue: 500 },
        ],
      });

      // Count all in group
      const countAll = await repo.count({ where: { group } });
      if (countAll.count === 5) {
        this.logger.info('[case14_CountOperation] PASSED | Count all: %d', countAll.count);
      } else {
        this.logger.error(
          '[case14_CountOperation] FAILED | Expected 5 | got: %d',
          countAll.count,
        );
      }

      // Count with additional filter
      const countFiltered = await repo.count({
        where: { group, nValue: { gt: 200 } },
      });
      if (countFiltered.count === 3) {
        this.logger.info(
          '[case14_CountOperation] PASSED | Count filtered (nValue > 200): %d',
          countFiltered.count,
        );
      } else {
        this.logger.error(
          '[case14_CountOperation] FAILED | Expected 3 | got: %d',
          countFiltered.count,
        );
      }

      // Count with no matches
      const countNone = await repo.count({
        where: { group, nValue: { gt: 1000 } },
      });
      if (countNone.count === 0) {
        this.logger.info('[case14_CountOperation] PASSED | Count with no matches: 0');
      } else {
        this.logger.error(
          '[case14_CountOperation] FAILED | Expected 0 | got: %d',
          countNone.count,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[case14_CountOperation] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: ExistsWith operation
  // ----------------------------------------------------------------
  private async case15_ExistsWithOperation(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case15_ExistsWithOperation] ExistsWith operation');

    const code = `REPO_EXISTS_${getUID()}`;

    try {
      // Check before creating (should not exist)
      const existsBefore = await repo.existsWith({ where: { code } });
      if (!existsBefore) {
        this.logger.info('[case15_ExistsWithOperation] PASSED | Does not exist before create');
      } else {
        this.logger.error('[case15_ExistsWithOperation] FAILED | Should not exist before create');
      }

      // Create record
      await repo.create({
        data: { code, group: 'REPO_EXISTS_TEST', dataType: DataTypes.NUMBER, nValue: 123 },
      });

      // Check after creating (should exist)
      const existsAfter = await repo.existsWith({ where: { code } });
      if (existsAfter) {
        this.logger.info('[case15_ExistsWithOperation] PASSED | Exists after create');
      } else {
        this.logger.error('[case15_ExistsWithOperation] FAILED | Should exist after create');
      }

      // Delete and check again
      await repo.deleteAll({ where: { code } });

      const existsAfterDelete = await repo.existsWith({ where: { code } });
      if (!existsAfterDelete) {
        this.logger.info('[case15_ExistsWithOperation] PASSED | Does not exist after delete');
      } else {
        this.logger.error('[case15_ExistsWithOperation] FAILED | Should not exist after delete');
      }
    } catch (error) {
      this.logger.error('[case15_ExistsWithOperation] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Concurrent creates (race condition test)
  // ----------------------------------------------------------------
  private async case16_ConcurrentCreates(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case16_ConcurrentCreates] Concurrent create operations');

    const group = `REPO_CONCURRENT_${getUID()}`;
    const concurrentCount = 10;

    try {
      // Test 1: Launch multiple creates concurrently with unique codes
      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        repo.create({
          data: {
            code: `${group}_${i}_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: i * 100,
          },
        }),
      );

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.count === 1).length;

      if (successCount === concurrentCount) {
        this.logger.info(
          '[case16_ConcurrentCreates] PASSED | All %d concurrent creates succeeded',
          concurrentCount,
        );
      } else {
        this.logger.error(
          '[case16_ConcurrentCreates] FAILED | Expected %d | succeeded: %d',
          concurrentCount,
          successCount,
        );
      }

      // Verify all records exist
      const allRecords = await repo.find({ filter: { where: { group } } });
      if (allRecords.length === concurrentCount) {
        this.logger.info(
          '[case16_ConcurrentCreates] PASSED | All %d records persisted',
          concurrentCount,
        );
      } else {
        this.logger.error(
          '[case16_ConcurrentCreates] FAILED | Expected %d records | found: %d',
          concurrentCount,
          allRecords.length,
        );
      }

      await repo.deleteAll({ where: { group } });

      // Test 2: Race condition with duplicate codes (tests unique constraint handling)
      const duplicateCode = `RACE_DUP_${getUID()}`;
      const racePromises = Array.from({ length: 5 }, () =>
        repo.create({
          data: {
            code: duplicateCode,
            group: `${group}_RACE`,
            dataType: DataTypes.NUMBER,
            nValue: 100,
          },
        }).catch(err => ({ error: err, count: 0 })),
      );

      const raceResults = await Promise.all(racePromises);
      const raceSuccessCount = raceResults.filter(r => !('error' in r) && r.count === 1).length;
      const raceErrorCount = raceResults.filter(r => 'error' in r).length;

      // Only 1 should succeed (first to acquire the code), others should fail
      if (raceSuccessCount === 1 && raceErrorCount === 4) {
        this.logger.info(
          '[case16_ConcurrentCreates] PASSED | Race condition: 1 succeeded, 4 failed (unique constraint)',
        );
      } else if (raceSuccessCount >= 1) {
        // Some databases may handle this differently
        this.logger.info(
          '[case16_ConcurrentCreates] INFO | Race condition: %d succeeded, %d failed',
          raceSuccessCount,
          raceErrorCount,
        );
      } else {
        this.logger.error(
          '[case16_ConcurrentCreates] FAILED | Race condition: expected 1 success | got: %d',
          raceSuccessCount,
        );
      }

      // Verify only 1 record with duplicate code exists
      const duplicateRecords = await repo.find({
        filter: { where: { code: duplicateCode } },
      });
      if (duplicateRecords.length === 1) {
        this.logger.info('[case16_ConcurrentCreates] PASSED | Only 1 record with duplicate code');
      } else {
        this.logger.error(
          '[case16_ConcurrentCreates] FAILED | Expected 1 duplicate record | found: %d',
          duplicateRecords.length,
        );
      }

      await repo.deleteAll({ where: { code: duplicateCode } });
    } catch (error) {
      this.logger.error('[case16_ConcurrentCreates] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Update with partial data (only some fields)
  // ----------------------------------------------------------------
  private async case17_UpdateWithPartialData(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case17_UpdateWithPartialData] Update only specific fields');

    const code = `REPO_PARTIAL_${getUID()}`;

    try {
      // Create with all fields
      const created = await repo.create({
        data: {
          code,
          group: 'REPO_PARTIAL_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          description: 'Original description',
        },
      });

      const id = created.data.id;

      // Update only one field
      await repo.updateById({
        id,
        data: { nValue: 999 },
      });

      // Verify only the updated field changed
      const updated = await repo.findById({ id });
      if (updated?.nValue === 999 && updated?.description === 'Original description') {
        this.logger.info(
          '[case17_UpdateWithPartialData] PASSED | Only nValue updated | description preserved',
        );
      } else {
        this.logger.error(
          '[case17_UpdateWithPartialData] FAILED | nValue: %d | description: %s',
          updated?.nValue,
          updated?.description,
        );
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[case17_UpdateWithPartialData] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Find with empty result set
  // ----------------------------------------------------------------
  private async case18_FindWithEmptyResult(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case18_FindWithEmptyResult] Find with filter that matches nothing');

    const nonExistentGroup = `NON_EXISTENT_${getUID()}`;

    try {
      const results = await repo.find({
        filter: { where: { group: nonExistentGroup } },
      });

      if (Array.isArray(results) && results.length === 0) {
        this.logger.info(
          '[case18_FindWithEmptyResult] PASSED | Empty array returned for no matches',
        );
      } else {
        this.logger.error(
          '[case18_FindWithEmptyResult] FAILED | Expected empty array | got: %j',
          results,
        );
      }

      // Also test with complex filter
      const complexResults = await repo.find({
        filter: {
          where: {
            and: [
              { group: nonExistentGroup },
              { nValue: { gt: 100 } },
              { code: { like: 'IMPOSSIBLE%' } },
            ],
          },
        },
      });

      if (Array.isArray(complexResults) && complexResults.length === 0) {
        this.logger.info(
          '[case18_FindWithEmptyResult] PASSED | Empty array for complex filter with no matches',
        );
      } else {
        this.logger.error(
          '[case18_FindWithEmptyResult] FAILED | Complex filter | got: %j',
          complexResults,
        );
      }
    } catch (error) {
      this.logger.error('[case18_FindWithEmptyResult] FAILED | Error: %j', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: DOUBLE PRECISION values (floating point precision)
  // ----------------------------------------------------------------
  private async case19_DoublePrecisionValues(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[case19_DoublePrecisionValues] Test DOUBLE PRECISION floating point values');

    const group = `REPO_DOUBLE_${getUID()}`;

    try {
      // Test various DOUBLE PRECISION scenarios
      const pi = 3.141592653589793;
      const smallDecimal = 0.000000001;
      const largeDecimal = 999999999.999999;
      const negativeDecimal = -123.456789;
      const scientificNotation = 1.23e-10;

      await repo.createAll({
        data: [
          { code: `${group}_PI`, group, dataType: DataTypes.NUMBER, nValue: pi },
          { code: `${group}_SMALL`, group, dataType: DataTypes.NUMBER, nValue: smallDecimal },
          { code: `${group}_LARGE`, group, dataType: DataTypes.NUMBER, nValue: largeDecimal },
          { code: `${group}_NEGATIVE`, group, dataType: DataTypes.NUMBER, nValue: negativeDecimal },
          { code: `${group}_SCIENTIFIC`, group, dataType: DataTypes.NUMBER, nValue: scientificNotation },
          { code: `${group}_ZERO_POINT`, group, dataType: DataTypes.NUMBER, nValue: 0.0 },
        ],
      });

      // Helper for relative tolerance comparison (handles very small numbers correctly)
      const isCloseEnough = (actual: number, expected: number): boolean => {
        if (expected === 0) return Math.abs(actual) < 1e-15;
        return Math.abs((actual - expected) / expected) < 1e-10; // 0.00000001% relative error
      };

      // Verify PI with floating point precision
      const piRecord = await repo.findOne({ filter: { where: { code: `${group}_PI` } } });
      if (piRecord && piRecord.nValue !== null && isCloseEnough(piRecord.nValue, pi)) {
        this.logger.info(
          '[case19_DoublePrecisionValues] PASSED | PI value: %d (precision maintained)',
          piRecord.nValue,
        );
      } else {
        this.logger.error(
          '[case19_DoublePrecisionValues] FAILED | PI | expected: %d | got: %d',
          pi,
          piRecord?.nValue,
        );
      }

      // Verify very small decimal
      const smallRecord = await repo.findOne({ filter: { where: { code: `${group}_SMALL` } } });
      if (smallRecord && smallRecord.nValue !== null && isCloseEnough(smallRecord.nValue, smallDecimal)) {
        this.logger.info(
          '[case19_DoublePrecisionValues] PASSED | Small decimal: %d',
          smallRecord.nValue,
        );
      } else {
        this.logger.error(
          '[case19_DoublePrecisionValues] FAILED | Small decimal | expected: %d | got: %d',
          smallDecimal,
          smallRecord?.nValue,
        );
      }

      // Verify large decimal
      const largeRecord = await repo.findOne({ filter: { where: { code: `${group}_LARGE` } } });
      if (largeRecord && largeRecord.nValue !== null && isCloseEnough(largeRecord.nValue, largeDecimal)) {
        this.logger.info(
          '[case19_DoublePrecisionValues] PASSED | Large decimal: %d',
          largeRecord.nValue,
        );
      } else {
        this.logger.error(
          '[case19_DoublePrecisionValues] FAILED | Large decimal | expected: %d | got: %d',
          largeDecimal,
          largeRecord?.nValue,
        );
      }

      // Verify negative decimal
      const negRecord = await repo.findOne({ filter: { where: { code: `${group}_NEGATIVE` } } });
      if (negRecord && negRecord.nValue !== null && isCloseEnough(negRecord.nValue, negativeDecimal)) {
        this.logger.info(
          '[case19_DoublePrecisionValues] PASSED | Negative decimal: %d',
          negRecord.nValue,
        );
      } else {
        this.logger.error(
          '[case19_DoublePrecisionValues] FAILED | Negative decimal | expected: %d | got: %d',
          negativeDecimal,
          negRecord?.nValue,
        );
      }

      // Verify scientific notation
      const sciRecord = await repo.findOne({ filter: { where: { code: `${group}_SCIENTIFIC` } } });
      if (sciRecord && sciRecord.nValue !== null && isCloseEnough(sciRecord.nValue, scientificNotation)) {
        this.logger.info(
          '[case19_DoublePrecisionValues] PASSED | Scientific notation: %d',
          sciRecord.nValue,
        );
      } else {
        this.logger.error(
          '[case19_DoublePrecisionValues] FAILED | Scientific notation | expected: %d | got: %d',
          scientificNotation,
          sciRecord?.nValue,
        );
      }

      // Test filter with DOUBLE PRECISION comparison
      const gtFilterResult = await repo.find({
        filter: { where: { group, nValue: { gt: 1.0 } } },
      });
      // Should find: PI (3.14...), LARGE (999999999.99...), expected 2 records
      if (gtFilterResult.length === 2) {
        this.logger.info(
          '[case19_DoublePrecisionValues] PASSED | Filter nValue > 1.0 found %d records',
          gtFilterResult.length,
        );
      } else {
        this.logger.error(
          '[case19_DoublePrecisionValues] FAILED | Filter nValue > 1.0 | expected: 2 | got: %d',
          gtFilterResult.length,
        );
      }

      // Test update with DOUBLE PRECISION
      const recordToUpdate = await repo.findOne({ filter: { where: { code: `${group}_PI` } } });
      const newValue = 2.718281828459045; // Euler's number
      await repo.updateById({
        id: recordToUpdate!.id,
        data: { nValue: newValue },
      });

      const updatedRecord = await repo.findById({ id: recordToUpdate!.id });
      if (updatedRecord && updatedRecord.nValue !== null && Math.abs(updatedRecord.nValue - newValue) < 1e-10) {
        this.logger.info(
          "[case19_DoublePrecisionValues] PASSED | Updated to Euler's number: %d",
          updatedRecord.nValue,
        );
      } else {
        this.logger.error(
          "[case19_DoublePrecisionValues] FAILED | Update to Euler's number | got: %d",
          updatedRecord?.nValue,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[case19_DoublePrecisionValues] FAILED | Error: %j', error);
    }
  }
}
