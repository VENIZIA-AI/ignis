import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Where Cases - default filter merge, override-by-key and invariance on the where clause
// ----------------------------------------------------------------
export class WhereCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Default filter is automatically applied
  // ----------------------------------------------------------------
  async case1DefaultFilterApplied(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 1] Default filter should be automatically applied');

    const testCode = `DF_TEST_${getUID()}`;

    try {
      // Create products: one with price > 0, one with price = 0
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find without shouldSkipDefaultFilter - should only return priced product
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` } } },
      });

      if (results.length === 1 && results[0].code === `${testCode}_PRICED`) {
        this.context.logger.info(
          '[CASE 1] PASSED | Default filter applied | Found %d products (expected 1)',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 1] FAILED | Expected 1 priced product | Got %d | Codes: %s',
          results.length,
          results.map(r => r.code).join(', '),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: User filter is merged with default filter
  // ----------------------------------------------------------------
  async case3UserFilterMergedWithDefault(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 3] User filter should be merged with default filter');

    const testCode = `DF_MERGE_${getUID()}`;

    try {
      // Create products with different names and prices
      await repo.create({
        data: { code: `${testCode}_A`, name: 'Product A', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_B`, name: 'Product B', price: 200 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_C`, name: 'Product C', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with user filter (name = 'Product A')
      // Default filter (price > 0) should also be applied
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` }, name: 'Product A' } },
      });

      if (results.length === 1 && results[0].name === 'Product A') {
        this.context.logger.info(
          '[CASE 3] PASSED | User filter merged with default | Found: %s',
          results[0].name,
        );
      } else {
        this.context.logger.error(
          '[CASE 3] FAILED | Expected Product A | Got: %j',
          results.map(r => r.name),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Empty user filter - default filter still applied
  // ----------------------------------------------------------------
  async case9EmptyUserFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 9] Empty user filter should still apply default filter');

    const testCode = `DF_EMPTY_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with empty where - default filter still applies
      const results = await repo.find({
        filter: { where: { code: testCode } },
      });

      if (results.length === 0) {
        this.context.logger.info('[CASE 9] PASSED | Empty user filter + default filter works');
      } else {
        this.context.logger.error('[CASE 9] FAILED | Expected 0 | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Null values in filter
  // ----------------------------------------------------------------
  async case10NullValuesInFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 10] Null values in filter should be handled correctly');

    const testCode = `DF_NULL_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Test', description: null, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with null in user filter
      const results = await repo.find({
        filter: { where: { code: testCode, description: null } },
      });

      if (results.length === 1 && results[0].description === null) {
        this.context.logger.info('[CASE 10] PASSED | Null values handled correctly');
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Expected 1 with null description | Got: %j',
          results,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Operator merging (default has gt, user adds lt)
  // ----------------------------------------------------------------
  async case11OperatorMerging(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 11] Operators should be merged correctly');

    const testCode = `DF_OPERATOR_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_50`, name: 'Low Price', price: 50 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_150`, name: 'Mid Price', price: 150 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_300`, name: 'High Price', price: 300 },
        options: { shouldSkipDefaultFilter: true },
      });

      // User filter: price < 200
      // Default filter: price > 0
      // Combined: 0 < price < 200
      const results = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            price: { lt: 200 },
          },
        },
      });

      // Should return products with price 50 and 150 (not 300)
      const prices = results.map(r => r.price).sort((a, b) => a - b);
      const hasCorrectPrices = prices.length === 2 && prices[0] === 50 && prices[1] === 150;

      if (hasCorrectPrices) {
        this.context.logger.info(
          '[CASE 11] PASSED | Operator merging returns correct products | prices: %j',
          prices,
        );
      } else if (results.length === 2) {
        // Count is right but prices might be wrong
        this.context.logger.error(
          '[CASE 11] FAILED | Count correct but wrong products | expected: [50, 150] | got: %j',
          prices,
        );
      } else {
        this.context.logger.error(
          '[CASE 11] FAILED | Expected 2 products [50, 150] | Got %d: %j',
          results.length,
          prices,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 23: AND/OR combination with default filter
  // ----------------------------------------------------------------
  async case23AndOrCombinationWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 23] Complex AND/OR should work with default filter');

    const testCode = `DF_ANDOR_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${testCode}_A`, name: 'Product A', price: 50 },
          { code: `${testCode}_B`, name: 'Product B', price: 100 },
          { code: `${testCode}_C`, name: 'Product C', price: 0 }, // Excluded by default
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      // Complex query: (name = A OR name = B) AND (price > 0) <- default filter
      const results = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            or: [{ name: 'Product A' }, { name: 'Product B' }],
          },
        },
      });

      if (results.length === 2) {
        this.context.logger.info(
          '[CASE 23] PASSED | AND/OR works with default filter | count: %d',
          results.length,
        );
      } else {
        this.context.logger.error('[CASE 23] FAILED | Expected 2 | Got: %d', results.length);
      }

      // Test with nested AND in OR
      const nestedResults = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            or: [{ and: [{ name: 'Product A' }, { price: { gte: 50 } }] }, { name: 'Product B' }],
          },
        },
      });

      if (nestedResults.length === 2) {
        this.context.logger.info(
          '[CASE 23] PASSED | Nested AND/OR works | count: %d',
          nestedResults.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 23] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 28: Default filter invariance (filter not mutated)
  // ----------------------------------------------------------------
  async case28DefaultFilterInvariance(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 28] Original filter should not be mutated');

    const testCode = `DF_INVARIANCE_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Invariance Test', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const originalFilter = {
        where: { code: testCode },
      };

      // Deep copy to compare later
      const filterBefore = JSON.stringify(originalFilter);

      await repo.find({ filter: originalFilter });

      const filterAfter = JSON.stringify(originalFilter);

      if (filterBefore === filterAfter) {
        this.context.logger.info('[CASE 28] PASSED | Original filter was not mutated');
      } else {
        this.context.logger.error(
          '[CASE 28] FAILED | Filter was mutated | before: %s | after: %s',
          filterBefore,
          filterAfter,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 28] FAILED | Error: %s', (error as Error).message);
    }
  }
}
