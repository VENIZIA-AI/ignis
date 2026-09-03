import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Composition Cases - array operators combined with other filters, AND/OR logic, and order/limit
// ----------------------------------------------------------------
export class CompositionCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 10: Combined with other filters
  // ----------------------------------------------------------------
  async case10CombinedWithOtherFilters(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 10] Combined: price > 150 AND tags contains [featured]');

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
        this.context.logger.info(
          '[CASE 10] PASSED | Found 1 product with price > 150 and featured',
        );
        this.context.logger.info(
          '[CASE 10] Product: %s | Price: %d | Tags: %j',
          results[0].name,
          results[0].price,
          results[0].tags,
        );
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Expected 1 product | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Contains with AND/OR
  // ----------------------------------------------------------------
  async case11ContainsWithAndOr(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 11] OR: tags contains [electronics] OR tags contains [furniture]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            or: [{ tags: { contains: ['electronics'] } }, { tags: { contains: ['furniture'] } }],
          } as any,
        },
      });

      // Product A: electronics ✓, Product B: electronics ✓, Product D: furniture ✓
      if (results.length === 3) {
        const names = results.map(r => r.name).sort();
        this.context.logger.info(
          '[CASE 11] PASSED | Found 3 products with electronics OR furniture',
        );
        this.context.logger.info('[CASE 11] Products: %j', names);
      } else {
        this.context.logger.error(
          '[CASE 11] FAILED | Expected 3 products | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Combined Array Operators
  // ----------------------------------------------------------------
  async case18CombinedArrayOperators(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 18] Combined array operators (AND multiple conditions)');

    try {
      // Create products for testing
      await repo.createAll({
        data: [
          {
            code: `ARRAY_COMBO_1_${getUID()}`,
            name: 'Combo Product 1',
            description: 'ARRAY_OPERATOR_TEST',
            price: 100,
            tags: ['red', 'blue', 'green'],
          },
          {
            code: `ARRAY_COMBO_2_${getUID()}`,
            name: 'Combo Product 2',
            description: 'ARRAY_OPERATOR_TEST',
            price: 200,
            tags: ['red', 'yellow'],
          },
        ],
      });

      // Complex: contains 'red' AND overlaps with ['blue', 'purple']
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            name: { like: 'Combo Product%' },
            and: [{ tags: { contains: ['red'] } }, { tags: { overlaps: ['blue', 'purple'] } }],
          } as any,
        },
      });

      // Only Product 1 should match (has red and blue)
      if (results.length === 1 && results[0].name === 'Combo Product 1') {
        this.context.logger.info('[CASE 18] PASSED | Combined operators work correctly');
      } else {
        this.context.logger.error(
          '[CASE 18] FAILED | Expected 1 product | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Array Operators with Order and Limit
  // ----------------------------------------------------------------
  async case20ArrayOperatorWithOrderAndLimit(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 20] Array operators combined with order and limit');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['electronics', 'clothing', 'furniture'] },
          } as any,
          order: ['price DESC'],
          limit: 2,
        },
      });

      if (results.length <= 2) {
        this.context.logger.info(
          '[CASE 20] PASSED | Array filter with limit: %d results',
          results.length,
        );
        if (results.length > 0) {
          this.context.logger.info(
            '[CASE 20] First result (highest price): %s ($%d)',
            results[0].name,
            results[0].price,
          );
        }
      } else {
        this.context.logger.error('[CASE 20] FAILED | Limit not applied | Got: %d', results.length);
      }

      // Verify ordering
      if (results.length >= 2) {
        if (results[0].price >= results[1].price) {
          this.context.logger.info('[CASE 20] PASSED | Order DESC applied correctly');
        } else {
          this.context.logger.error('[CASE 20] FAILED | Order not correct');
        }
      }
    } catch (error) {
      this.context.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }
}
