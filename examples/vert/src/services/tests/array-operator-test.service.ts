import { BindingKeys, BindingNamespaces, getUID, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// Array Operator Test Service - PostgreSQL array column operator tests
// ----------------------------------------------------------------
export class ArrayOperatorTestService extends BaseTestService {
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
      ArrayOperatorTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[ArrayOperatorTestService] Starting array operator test cases');

    await this.case1_SetupTestData();
    await this.case2_ContainsAllElements();
    await this.case3_ContainsSingleElement();
    await this.case4_ContainsEmptyArray();
    await this.case5_ContainedByArray();
    await this.case6_ContainedByEmptyArray();
    await this.case7_OverlapsWithArray();
    await this.case8_OverlapsNoMatch();
    await this.case9_OverlapsEmptyArray();
    await this.case10_CombinedWithOtherFilters();
    await this.case11_ContainsWithAndOr();
    await this.case12_Cleanup();

    this.logSection('[ArrayOperatorTestService] All array operator test cases completed');
  }

  // ----------------------------------------------------------------
  // CASE 1: Setup test data with array columns
  // ----------------------------------------------------------------
  private async case1_SetupTestData(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 1] Setup test data with array columns');

    try {
      await repo.createAll({
        data: [
          {
            code: `ARRAY_TEST_A_${getUID()}`,
            name: 'Product A',
            description: 'ARRAY_OPERATOR_TEST',
            price: 100,
            tags: ['electronics', 'featured', 'sale'],
          },
          {
            code: `ARRAY_TEST_B_${getUID()}`,
            name: 'Product B',
            description: 'ARRAY_OPERATOR_TEST',
            price: 200,
            tags: ['electronics', 'premium'],
          },
          {
            code: `ARRAY_TEST_C_${getUID()}`,
            name: 'Product C',
            description: 'ARRAY_OPERATOR_TEST',
            price: 300,
            tags: ['clothing', 'featured'],
          },
          {
            code: `ARRAY_TEST_D_${getUID()}`,
            name: 'Product D',
            description: 'ARRAY_OPERATOR_TEST',
            price: 400,
            tags: ['furniture'],
          },
          {
            code: `ARRAY_TEST_E_${getUID()}`,
            name: 'Product E',
            description: 'ARRAY_OPERATOR_TEST',
            price: 500,
            tags: [],
          },
        ],
      });

      this.logger.info('[CASE 1] PASSED | Created 5 products with array tags');
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Contains - array contains all specified elements
  // ----------------------------------------------------------------
  private async case2_ContainsAllElements(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 2] Contains: tags @> [electronics, featured]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['electronics', 'featured'] },
          } as any,
        },
      });

      if (results.length === 1 && results[0].name === 'Product A') {
        this.logger.info('[CASE 2] PASSED | Found 1 product with both electronics AND featured');
        this.logger.info('[CASE 2] Product: %s | Tags: %j', results[0].name, results[0].tags);
      } else {
        this.logger.error('[CASE 2] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Contains - single element
  // ----------------------------------------------------------------
  private async case3_ContainsSingleElement(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 3] Contains: tags @> [featured]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['featured'] },
          } as any,
        },
      });

      if (results.length === 2) {
        const names = results.map(r => r.name).sort();
        if (names.includes('Product A') && names.includes('Product C')) {
          this.logger.info('[CASE 3] PASSED | Found 2 products with featured tag');
          this.logger.info('[CASE 3] Products: %j', names);
        } else {
          this.logger.error('[CASE 3] FAILED | Wrong products returned');
        }
      } else {
        this.logger.error('[CASE 3] FAILED | Expected 2 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Contains - empty array (everything contains empty set)
  // ----------------------------------------------------------------
  private async case4_ContainsEmptyArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 4] Contains: tags @> [] (empty array)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: [] },
          } as any,
        },
      });

      // Everything contains empty set, so should return all 5 products
      if (results.length === 5) {
        this.logger.info('[CASE 4] PASSED | All 5 products contain empty set');
      } else {
        this.logger.error('[CASE 4] FAILED | Expected 5 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: ContainedBy - array is subset of provided elements
  // ----------------------------------------------------------------
  private async case5_ContainedByArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 5] ContainedBy: tags <@ [electronics, featured, sale, premium]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { containedBy: ['electronics', 'featured', 'sale', 'premium'] },
          } as any,
        },
      });

      // Product A: [electronics, featured, sale] ⊆ superset ✓
      // Product B: [electronics, premium] ⊆ superset ✓
      // Product E: [] ⊆ superset ✓ (empty is subset of everything)
      if (results.length === 3) {
        const names = results.map(r => r.name).sort();
        this.logger.info('[CASE 5] PASSED | Found 3 products that are subsets');
        this.logger.info('[CASE 5] Products: %j', names);
      } else {
        this.logger.error('[CASE 5] FAILED | Expected 3 products | Got: %d', results.length);
        this.logger.error('[CASE 5] Products: %j', results.map(r => ({ name: r.name, tags: r.tags })));
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: ContainedBy - empty array (only empty arrays match)
  // ----------------------------------------------------------------
  private async case6_ContainedByEmptyArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 6] ContainedBy: tags <@ [] (only empty matches)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { containedBy: [] },
          } as any,
        },
      });

      // Only Product E has empty tags
      if (results.length === 1 && results[0].name === 'Product E') {
        this.logger.info('[CASE 6] PASSED | Found 1 product with empty tags');
        this.logger.info('[CASE 6] Product: %s | Tags: %j', results[0].name, results[0].tags);
      } else {
        this.logger.error('[CASE 6] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Overlaps - shares any element
  // ----------------------------------------------------------------
  private async case7_OverlapsWithArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 7] Overlaps: tags && [premium, clothing]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['premium', 'clothing'] },
          } as any,
        },
      });

      // Product B: has premium ✓
      // Product C: has clothing ✓
      if (results.length === 2) {
        const names = results.map(r => r.name).sort();
        if (names.includes('Product B') && names.includes('Product C')) {
          this.logger.info('[CASE 7] PASSED | Found 2 products with overlapping tags');
          this.logger.info('[CASE 7] Products: %j', names);
        } else {
          this.logger.error('[CASE 7] FAILED | Wrong products returned');
        }
      } else {
        this.logger.error('[CASE 7] FAILED | Expected 2 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Overlaps - no matching elements
  // ----------------------------------------------------------------
  private async case8_OverlapsNoMatch(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 8] Overlaps: tags && [nonexistent]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['nonexistent'] },
          } as any,
        },
      });

      if (results.length === 0) {
        this.logger.info('[CASE 8] PASSED | No products with nonexistent tag');
      } else {
        this.logger.error('[CASE 8] FAILED | Expected 0 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Overlaps - empty array (no overlap possible)
  // ----------------------------------------------------------------
  private async case9_OverlapsEmptyArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 9] Overlaps: tags && [] (empty array)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: [] },
          } as any,
        },
      });

      // Empty array overlaps with nothing
      if (results.length === 0) {
        this.logger.info('[CASE 9] PASSED | Empty array overlaps with nothing');
      } else {
        this.logger.error('[CASE 9] FAILED | Expected 0 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Combined with other filters
  // ----------------------------------------------------------------
  private async case10_CombinedWithOtherFilters(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 10] Combined: price > 150 AND tags contains [featured]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            price: { gt: 150 },
            tags: { contains: ['featured'] },
          } as any,
        },
      });

      // Product A: price=100 (no), Product C: price=300 with featured ✓
      if (results.length === 1 && results[0].name === 'Product C') {
        this.logger.info('[CASE 10] PASSED | Found 1 product with price > 150 and featured');
        this.logger.info('[CASE 10] Product: %s | Price: %d | Tags: %j', results[0].name, results[0].price, results[0].tags);
      } else {
        this.logger.error('[CASE 10] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Contains with AND/OR
  // ----------------------------------------------------------------
  private async case11_ContainsWithAndOr(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 11] OR: tags contains [electronics] OR tags contains [furniture]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            or: [
              { tags: { contains: ['electronics'] } },
              { tags: { contains: ['furniture'] } },
            ],
          } as any,
        },
      });

      // Product A: electronics ✓, Product B: electronics ✓, Product D: furniture ✓
      if (results.length === 3) {
        const names = results.map(r => r.name).sort();
        this.logger.info('[CASE 11] PASSED | Found 3 products with electronics OR furniture');
        this.logger.info('[CASE 11] Products: %j', names);
      } else {
        this.logger.error('[CASE 11] FAILED | Expected 3 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Cleanup test data
  // ----------------------------------------------------------------
  private async case12_Cleanup(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 12] Cleanup array operator test data');

    try {
      const deleted = await repo.deleteAll({ where: { description: 'ARRAY_OPERATOR_TEST' } });
      this.logger.info('[CASE 12] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }
}
