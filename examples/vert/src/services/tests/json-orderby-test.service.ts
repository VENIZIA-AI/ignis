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
// JSON OrderBy Test Service - JSON/JSONB ordering tests
// ----------------------------------------------------------------
export class JsonOrderByTestService extends BaseTestService {
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
      JsonOrderByTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[JsonOrderByTestService] Starting JSON order by test cases');

    await this.case1_CreateWithNestedJson();
    await this.case2_OrderBySimpleJsonField();
    await this.case3_OrderByNestedJsonField();
    await this.case4_OrderByArrayIndex();
    await this.case5_OrderByNonExistentField();
    await this.case6_OrderByNonExistentNestedField();
    await this.case7_Cleanup();

    this.logSection('[JsonOrderByTestService] All JSON order by test cases completed');
  }

  // ----------------------------------------------------------------
  // CASE 1: Create records with nested JSON data
  // ----------------------------------------------------------------
  private async case1_CreateWithNestedJson(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 1] Create records with nested JSON data');

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

      this.logger.info('[CASE 1] PASSED | Created 5 records with nested JSON');
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Order by simple JSON field (jValue.priority)
  // ----------------------------------------------------------------
  private async case2_OrderBySimpleJsonField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 2] Order by jValue.priority');

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
      this.logger.info('[CASE 2] ASC priorities: %j', ascPriorities);

      // Priorities should be: 1, 2, 3, 4, 5
      const isAscCorrect =
        ascPriorities[0] === 1 &&
        ascPriorities[1] === 2 &&
        ascPriorities[2] === 3 &&
        ascPriorities[3] === 4 &&
        ascPriorities[4] === 5;

      if (isAscCorrect) {
        this.logger.info('[CASE 2] PASSED | ASC order correct');
      } else {
        this.logger.error('[CASE 2] FAILED | ASC order incorrect');
      }

      // Order by jValue.priority DESC
      const descResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.priority DESC'],
        },
      });

      const descPriorities = descResult.map(r => (r.jValue as any)?.priority);
      this.logger.info('[CASE 2] DESC priorities: %j', descPriorities);

      // Priorities should be: 5, 4, 3, 2, 1
      const isDescCorrect =
        descPriorities[0] === 5 &&
        descPriorities[1] === 4 &&
        descPriorities[2] === 3 &&
        descPriorities[3] === 2 &&
        descPriorities[4] === 1;

      if (isDescCorrect) {
        this.logger.info('[CASE 2] PASSED | DESC order correct');
      } else {
        this.logger.error('[CASE 2] FAILED | DESC order incorrect');
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Order by nested JSON field (jValue.metadata.score)
  // ----------------------------------------------------------------
  private async case3_OrderByNestedJsonField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 3] Order by jValue.metadata.score');

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
      this.logger.info('[CASE 3] ASC scores: %j', ascScores);

      // Scores should be: 45, 70, 85, 95, 100
      const isAscCorrect =
        ascScores[0] === 45 &&
        ascScores[1] === 70 &&
        ascScores[2] === 85 &&
        ascScores[3] === 95 &&
        ascScores[4] === 100;

      if (isAscCorrect) {
        this.logger.info('[CASE 3] PASSED | Nested field ASC order correct');
      } else {
        this.logger.error('[CASE 3] FAILED | Nested field ASC incorrect');
      }

      // Order by jValue.metadata.score DESC
      const descResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.metadata.score DESC'],
        },
      });

      const descScores = descResult.map(r => (r.jValue as any)?.metadata?.score);
      this.logger.info('[CASE 3] DESC scores: %j', descScores);

      const isDescCorrect =
        descScores[0] === 100 &&
        descScores[1] === 95 &&
        descScores[2] === 85 &&
        descScores[3] === 70 &&
        descScores[4] === 45;

      if (isDescCorrect) {
        this.logger.info('[CASE 3] PASSED | Nested field DESC order correct');
      } else {
        this.logger.error('[CASE 3] FAILED | Nested field DESC incorrect');
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Order by array index (jValue.tags[0])
  // ----------------------------------------------------------------
  private async case4_OrderByArrayIndex(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 4] Order by jValue.tags[0]');

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
      this.logger.info('[CASE 4] ASC tags[0]: %j', ascTags);

      // Check alphabetical order
      const sortedTags = [...ascTags].sort();
      const isAscCorrect = ascTags.every((tag: string, i: number) => tag === sortedTags[i]);

      if (isAscCorrect) {
        this.logger.info('[CASE 4] PASSED | Array index ASC order correct');
      } else {
        this.logger.error('[CASE 4] FAILED | Expected: %j | Got: %j', sortedTags, ascTags);
      }

      // Order by tags[0] DESC
      const descResult = await repo.find({
        filter: {
          where: { group },
          order: ['jValue.tags[0] DESC'],
        },
      });

      const descTags = descResult.map(r => (r.jValue as any)?.tags?.[0]);
      this.logger.info('[CASE 4] DESC tags[0]: %j', descTags);

      const sortedTagsDesc = [...descTags].sort().reverse();
      const isDescCorrect = descTags.every((tag: string, i: number) => tag === sortedTagsDesc[i]);

      if (isDescCorrect) {
        this.logger.info('[CASE 4] PASSED | Array index DESC order correct');
      } else {
        this.logger.error('[CASE 4] FAILED | Expected: %j | Got: %j', sortedTagsDesc, descTags);
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: Order by non-existent JSON field (jValue.nonExistent)
  // ----------------------------------------------------------------
  private async case5_OrderByNonExistentField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 5] Order by jValue.nonExistent');

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
          '[CASE 5] PASSED | Returned all %d records (non-existent field treated as NULL)',
          result.length,
        );
      } else {
        this.logger.error('[CASE 5] FAILED | Expected 5 records | got: %d', result.length);
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Order by non-existent nested field (jValue.metadata.nonExistent)
  // ----------------------------------------------------------------
  private async case6_OrderByNonExistentNestedField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 6] Order by jValue.metadata.nonExistent');

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
          '[CASE 6] PASSED | Returned all %d records (non-existent nested field treated as NULL)',
          result.length,
        );
      } else {
        this.logger.error('[CASE 6] FAILED | Expected 5 records | got: %d', result.length);
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
          '[CASE 6] PASSED | Deep non-existent path returned all %d records',
          deepResult.length,
        );
      } else {
        this.logger.error(
          '[CASE 6] FAILED | Deep path expected 5 records | got: %d',
          deepResult.length,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Cleanup JSON test data
  // ----------------------------------------------------------------
  private async case7_Cleanup(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 7] Cleanup JSON test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'JSON_ORDER_TEST' } });
      this.logger.info('[CASE 7] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }
}
