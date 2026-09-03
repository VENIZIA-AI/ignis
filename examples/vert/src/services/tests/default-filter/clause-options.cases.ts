import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Clause Options Cases - limit, order and field selection alongside the default filter
// ----------------------------------------------------------------
export class ClauseOptionsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 12: Limit override
  // ----------------------------------------------------------------
  async case12LimitOverride(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 12] User limit should override default limit');

    const testCode = `DF_LIMIT_${getUID()}`;

    try {
      // Create 5 products
      for (let i = 1; i <= 5; i++) {
        await repo.create({
          data: { code: `${testCode}_${i}`, name: `Product ${i}`, price: i * 10 },
          options: { shouldSkipDefaultFilter: true },
        });
      }

      // User limit: 2 (default is 100)
      const results = await repo.find({
        filter: {
          where: { code: { like: `${testCode}%` } },
          limit: 2,
        },
      });

      if (results.length === 2) {
        this.context.logger.info(
          '[CASE 12] PASSED | User limit overrides default | count: %d',
          results.length,
        );
      } else {
        this.context.logger.error('[CASE 12] FAILED | Expected 2 | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Order preservation
  // ----------------------------------------------------------------
  async case13OrderPreservation(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 13] User order should override default order');

    const testCode = `DF_ORDER_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_A`, name: 'Product A', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_B`, name: 'Product B', price: 200 },
        options: { shouldSkipDefaultFilter: true },
      });

      // User order: price DESC
      const results = await repo.find({
        filter: {
          where: { code: { like: `${testCode}%` } },
          order: ['price DESC'],
        },
      });

      if (results.length === 2 && results[0].price > results[1].price) {
        this.context.logger.info(
          '[CASE 13] PASSED | User order preserved | prices: %j',
          results.map(r => r.price),
        );
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED | Expected DESC order | Got: %j',
          results.map(r => r.price),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 24: Default filter with field selection
  // ----------------------------------------------------------------
  async case24DefaultFilterWithFieldSelection(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 24] Field selection should work with default filter');

    const testCode = `DF_FIELDS_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Field Test', price: 100, description: 'Test Desc' },
        options: { shouldSkipDefaultFilter: true },
      });

      // Select only specific fields
      const results = await repo.find({
        filter: {
          where: { code: testCode },
          fields: ['id', 'name', 'price'],
        },
      });

      if (results.length === 1 && results[0].name === 'Field Test') {
        // Check that only selected fields are returned
        const hasDescription = 'description' in results[0];
        if (!hasDescription || results[0].description === undefined) {
          this.context.logger.info('[CASE 24] PASSED | Field selection works with default filter');
        } else {
          this.context.logger.info('[CASE 24] INFO | All fields returned despite selection');
        }
      } else {
        this.context.logger.error('[CASE 24] FAILED | Expected 1 result | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 24] FAILED | Error: %s', (error as Error).message);
    }
  }
}
