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

    await this.case1_CreateSingle();
    await this.case2_CreateAll();
    await this.case3_FindOne();
    await this.case4_FindWithFilter();
    await this.case5_FindById();
    await this.case6_UpdateById();
    await this.case7_UpdateAll();
    await this.case8_DeleteByIdAndDeleteAll();

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
}
