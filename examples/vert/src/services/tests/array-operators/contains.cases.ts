import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Contains Cases - setup fixture plus the @> (contains) and <@ (containedBy) operators
// ----------------------------------------------------------------
export class ContainsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Setup test data with array columns
  // ----------------------------------------------------------------
  async case1SetupTestData(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 1] Setup test data with array columns');

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

      this.context.logger.info('[CASE 1] PASSED | Created 5 products with array tags');
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Contains - array contains all specified elements
  // ----------------------------------------------------------------
  async case2ContainsAllElements(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 2] Contains: tags @> [electronics, featured]');

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
        this.context.logger.info(
          '[CASE 2] PASSED | Found 1 product with both electronics AND featured',
        );
        this.context.logger.info(
          '[CASE 2] Product: %s | Tags: %j',
          results[0].name,
          results[0].tags,
        );
      } else {
        this.context.logger.error('[CASE 2] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Contains - single element
  // ----------------------------------------------------------------
  async case3ContainsSingleElement(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 3] Contains: tags @> [featured]');

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
          this.context.logger.info('[CASE 3] PASSED | Found 2 products with featured tag');
          this.context.logger.info('[CASE 3] Products: %j', names);
        } else {
          this.context.logger.error('[CASE 3] FAILED | Wrong products returned');
        }
      } else {
        this.context.logger.error(
          '[CASE 3] FAILED | Expected 2 products | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Contains - empty array (everything contains empty set)
  // ----------------------------------------------------------------
  async case4ContainsEmptyArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 4] Contains: tags @> [] (empty array)');

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
        this.context.logger.info('[CASE 4] PASSED | All 5 products contain empty set');
      } else {
        this.context.logger.error(
          '[CASE 4] FAILED | Expected 5 products | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: ContainedBy - array is subset of provided elements
  // ----------------------------------------------------------------
  async case5ContainedByArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 5] ContainedBy: tags <@ [electronics, featured, sale, premium]');

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
        this.context.logger.info('[CASE 5] PASSED | Found 3 products that are subsets');
        this.context.logger.info('[CASE 5] Products: %j', names);
      } else {
        this.context.logger.error(
          '[CASE 5] FAILED | Expected 3 products | Got: %d',
          results.length,
        );
        this.context.logger.error(
          '[CASE 5] Products: %j',
          results.map(r => ({ name: r.name, tags: r.tags })),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: ContainedBy - empty array (only empty arrays match)
  // ----------------------------------------------------------------
  async case6ContainedByEmptyArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 6] ContainedBy: tags <@ [] (only empty matches)');

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
        this.context.logger.info('[CASE 6] PASSED | Found 1 product with empty tags');
        this.context.logger.info(
          '[CASE 6] Product: %s | Tags: %j',
          results[0].name,
          results[0].tags,
        );
      } else {
        this.context.logger.error('[CASE 6] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }
}
