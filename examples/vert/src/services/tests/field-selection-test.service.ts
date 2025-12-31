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
// Field Selection Test Service - toColumns/fields filtering tests
// ----------------------------------------------------------------
export class FieldSelectionTestService extends BaseTestService {
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
      FieldSelectionTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[FieldSelectionTestService] Starting field selection test cases');

    await this.case1_CreateTestData();
    await this.case2_ArrayFormat();
    await this.case3_ObjectFormatWithTrue();
    await this.case4_ObjectFormatWithFalse();
    await this.case5_ArrayVsObjectEquivalence();
    await this.case6_Cleanup();

    this.logSection('[FieldSelectionTestService] All field selection test cases completed');
  }

  // ----------------------------------------------------------------
  // CASE 1: Create test data for field selection tests
  // ----------------------------------------------------------------
  private async case1_CreateTestData(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 1] Create test data for field selection');

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

      this.logger.info('[CASE 1] PASSED | Created 3 records for field selection tests');
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Array format - ['id', 'code', 'nValue']
  // ----------------------------------------------------------------
  private async case2_ArrayFormat(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 2] Test array format: [id, code, nValue]');

    const group = 'FIELDS_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group },
          fields: ['id', 'code', 'nValue'],
        },
      });

      if (results.length !== 3) {
        this.logger.error('[CASE 2] FAILED | Expected 3 records | got: %d', results.length);
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
        this.logger.info('[CASE 2] PASSED | Only selected fields returned');
        this.logger.info('[CASE 2] Record keys: %j', Object.keys(firstRecord));
      } else {
        this.logger.error(
          '[CASE 2] FAILED | Unexpected fields | hasId: %s, hasCode: %s, hasNValue: %s, hasTValue: %s, hasJValue: %s',
          hasId,
          hasCode,
          hasNValue,
          hasTValue,
          hasJValue,
        );
        this.logger.error('[CASE 2] Record: %j', firstRecord);
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Object format with true - { id: true, code: true }
  // ----------------------------------------------------------------
  private async case3_ObjectFormatWithTrue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 3] Test object format: { id: true, code: true, tValue: true }');

    const group = 'FIELDS_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group },
          fields: { id: true, code: true, tValue: true },
        },
      });

      if (results.length !== 3) {
        this.logger.error('[CASE 3] FAILED | Expected 3 records | got: %d', results.length);
        return;
      }

      const firstRecord = results[0];
      const hasId = 'id' in firstRecord;
      const hasCode = 'code' in firstRecord;
      const hasTValue = 'tValue' in firstRecord;
      const hasNValue = 'nValue' in firstRecord;
      const hasJValue = 'jValue' in firstRecord;

      if (hasId && hasCode && hasTValue && !hasNValue && !hasJValue) {
        this.logger.info('[CASE 3] PASSED | Only true fields returned');
        this.logger.info('[CASE 3] Record keys: %j', Object.keys(firstRecord));
      } else {
        this.logger.error('[CASE 3] FAILED | Unexpected fields | Record: %j', firstRecord);
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Object format with false - { id: true, code: true, nValue: false }
  // ----------------------------------------------------------------
  private async case4_ObjectFormatWithFalse(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 4] Test object format with false: { id: true, code: true, nValue: false }');

    const group = 'FIELDS_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group },
          fields: { id: true, code: true, nValue: false, tValue: false },
        },
      });

      if (results.length !== 3) {
        this.logger.error('[CASE 4] FAILED | Expected 3 records | got: %d', results.length);
        return;
      }

      const firstRecord = results[0];
      const hasId = 'id' in firstRecord;
      const hasCode = 'code' in firstRecord;
      const hasNValue = 'nValue' in firstRecord;
      const hasTValue = 'tValue' in firstRecord;

      // false fields should be excluded, only true fields returned
      if (hasId && hasCode && !hasNValue && !hasTValue) {
        this.logger.info('[CASE 4] PASSED | False fields excluded');
        this.logger.info('[CASE 4] Record keys: %j', Object.keys(firstRecord));
      } else {
        this.logger.error(
          '[CASE 4] FAILED | Unexpected fields | hasId: %s, hasCode: %s, hasNValue: %s, hasTValue: %s',
          hasId,
          hasCode,
          hasNValue,
          hasTValue,
        );
        this.logger.error('[CASE 4] Record: %j', firstRecord);
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: Array vs Object equivalence
  // ----------------------------------------------------------------
  private async case5_ArrayVsObjectEquivalence(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 5] Test array and object formats produce same result');

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
          '[CASE 5] FAILED | Different record counts | array: %d, object: %d',
          arrayResults.length,
          objectResults.length,
        );
        return;
      }

      // Compare keys of first record
      const arrayKeys = Object.keys(arrayResults[0]).sort();
      const objectKeys = Object.keys(objectResults[0]).sort();

      if (arrayKeys.join(',') === objectKeys.join(',')) {
        this.logger.info('[CASE 5] PASSED | Array and object formats are equivalent');
        this.logger.info('[CASE 5] Both return keys: %j', arrayKeys);
      } else {
        this.logger.error(
          '[CASE 5] FAILED | Different keys | array: %j, object: %j',
          arrayKeys,
          objectKeys,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Cleanup test data
  // ----------------------------------------------------------------
  private async case6_Cleanup(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 6] Cleanup field selection test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'FIELDS_TEST' } });
      this.logger.info('[CASE 6] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }
}
