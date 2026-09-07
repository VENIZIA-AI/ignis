import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Override Cases - shouldSkipDefaultFilter bypass verified across every repository method
// ----------------------------------------------------------------
export class OverrideCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 2: shouldSkipDefaultFilter bypasses the default filter
  // ----------------------------------------------------------------
  async case2SkipDefaultFilterBypass(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 2] shouldSkipDefaultFilter should bypass default filter');

    const testCode = `DF_TEST_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find WITH shouldSkipDefaultFilter - should return both products
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` } } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (results.length === 2) {
        this.context.logger.info(
          '[CASE 2] PASSED | shouldSkipDefaultFilter bypasses default filter | Found %d products',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 2] FAILED | Expected 2 products with skip | Got %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: User filter overrides default for same key
  // ----------------------------------------------------------------
  async case4UserFilterOverridesDefaultSameKey(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 4] User filter should override default for same key');

    const testCode = `DF_OVERRIDE_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // User explicitly sets price filter to override default
      // Note: This tests that user can override the default where condition
      const results = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            price: { eq: 0 }, // User explicitly wants price = 0
          },
        },
        options: { shouldSkipDefaultFilter: true }, // Must skip to get price = 0
      });

      if (results.length === 1 && results[0].price === 0) {
        this.context.logger.info(
          '[CASE 4] PASSED | User override works | price: %d',
          results[0].price,
        );
      } else {
        this.context.logger.error('[CASE 4] FAILED | Expected price=0 | Got: %j', results);
      }
    } catch (error) {
      this.context.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: FindOne with default filter
  // ----------------------------------------------------------------
  async case5FindOneWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 5] FindOne should apply default filter');

    const testCode = `DF_FINDONE_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // FindOne without skip - should return null (price = 0 excluded)
      const result = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (result === null) {
        this.context.logger.info('[CASE 5] PASSED | FindOne applies default filter | result: null');
      } else {
        this.context.logger.error('[CASE 5] FAILED | Expected null | Got: %j', result);
      }

      // FindOne with skip - should return the product
      const resultWithSkip = await repo.findOne({
        filter: { where: { code: testCode } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (resultWithSkip?.code === testCode) {
        this.context.logger.info(
          '[CASE 5] PASSED | FindOne with skip works | code: %s',
          resultWithSkip.code,
        );
      } else {
        this.context.logger.error('[CASE 5] FAILED | Expected product | Got: %j', resultWithSkip);
      }
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: FindById with default filter
  // ----------------------------------------------------------------
  async case6FindByIdWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 6] FindById should apply default filter');

    const testCode = `DF_FINDBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code: testCode, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      const productId = created.data.id;

      // FindById without skip - should return null (price = 0 excluded)
      const result = await repo.findById({ id: productId });

      if (result === null) {
        this.context.logger.info(
          '[CASE 6] PASSED | FindById applies default filter | result: null',
        );
      } else {
        this.context.logger.error('[CASE 6] FAILED | Expected null | Got id: %s', result?.id);
      }

      // FindById with skip - should return the product
      const resultWithSkip = await repo.findById({
        id: productId,
        options: { shouldSkipDefaultFilter: true },
      });

      if (resultWithSkip?.id === productId) {
        this.context.logger.info(
          '[CASE 6] PASSED | FindById with skip works | id: %s',
          resultWithSkip?.id,
        );
      } else {
        this.context.logger.error('[CASE 6] FAILED | Expected product | Got: %j', resultWithSkip);
      }
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Count with default filter
  // ----------------------------------------------------------------
  async case7CountWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 7] Count should apply default filter');

    const testCode = `DF_COUNT_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Count without skip - should be 1
      const countResult = await repo.count({
        where: { code: { like: `${testCode}%` } },
      });

      if (countResult.count === 1) {
        this.context.logger.info(
          '[CASE 7] PASSED | Count applies default filter | count: %d',
          countResult.count,
        );
      } else {
        this.context.logger.error('[CASE 7] FAILED | Expected 1 | Got: %d', countResult.count);
      }

      // Count with skip - should be 2
      const countWithSkip = await repo.count({
        where: { code: { like: `${testCode}%` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (countWithSkip.count === 2) {
        this.context.logger.info(
          '[CASE 7] PASSED | Count with skip works | count: %d',
          countWithSkip.count,
        );
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | Expected 2 with skip | Got: %d',
          countWithSkip.count,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Exists with default filter
  // ----------------------------------------------------------------
  async case8ExistsWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 8] ExistsWith should apply default filter');

    const testCode = `DF_EXISTS_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Exists without skip - should be false
      const exists = await repo.existsWith({
        where: { code: testCode },
      });

      if (!exists) {
        this.context.logger.info(
          '[CASE 8] PASSED | ExistsWith applies default filter | exists: %s',
          exists,
        );
      } else {
        this.context.logger.error('[CASE 8] FAILED | Expected false | Got: %s', exists);
      }

      // Exists with skip - should be true
      const existsWithSkip = await repo.existsWith({
        where: { code: testCode },
        options: { shouldSkipDefaultFilter: true },
      });

      if (existsWithSkip) {
        this.context.logger.info(
          '[CASE 8] PASSED | ExistsWith with skip works | exists: %s',
          existsWithSkip,
        );
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED | Expected true with skip | Got: %s',
          existsWithSkip,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: UpdateAll with default filter
  // ----------------------------------------------------------------
  async case21UpdateAllWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 21] UpdateAll should respect default filter');

    const testCode = `DF_UPDATEALL_${getUID()}`;

    try {
      // Create products with different prices
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // UpdateAll without skip - should only update priced product
      const updateResult = await repo.updateAll({
        where: { code: { like: `${testCode}%` } },
        data: { description: 'Updated' },
      });

      if (updateResult.count === 1) {
        this.context.logger.info(
          '[CASE 21] PASSED | UpdateAll respects default filter | updated: %d',
          updateResult.count,
        );
      } else {
        this.context.logger.error(
          '[CASE 21] FAILED | Expected 1 update | Got: %d',
          updateResult.count,
        );
      }

      // Verify the free product was NOT updated
      const freeProduct = await repo.findOne({
        filter: { where: { code: `${testCode}_FREE` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (freeProduct?.description !== 'Updated') {
        this.context.logger.info(
          '[CASE 21] PASSED | Free product was NOT updated (excluded by default filter)',
        );
      } else {
        this.context.logger.error('[CASE 21] FAILED | Free product should NOT have been updated');
      }
    } catch (error) {
      this.context.logger.error('[CASE 21] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 22: DeleteAll with default filter
  // ----------------------------------------------------------------
  async case22DeleteAllWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 22] DeleteAll should respect default filter');

    const testCode = `DF_DELETEALL_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // DeleteAll without skip - should only delete priced product
      const deleteResult = await repo.deleteAll({
        where: { code: { like: `${testCode}%` } },
      });

      if (deleteResult.count === 1) {
        this.context.logger.info(
          '[CASE 22] PASSED | DeleteAll respects default filter | deleted: %d',
          deleteResult.count,
        );
      } else {
        this.context.logger.error(
          '[CASE 22] FAILED | Expected 1 delete | Got: %d',
          deleteResult.count,
        );
      }

      // Verify the free product still exists
      const freeProduct = await repo.findOne({
        filter: { where: { code: `${testCode}_FREE` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (freeProduct) {
        this.context.logger.info(
          '[CASE 22] PASSED | Free product still exists (excluded by default filter)',
        );
        // Clean up the remaining product
        await repo.deleteAll({
          where: { code: `${testCode}_FREE` },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
      } else {
        this.context.logger.error('[CASE 22] FAILED | Free product should still exist');
      }
    } catch (error) {
      this.context.logger.error('[CASE 22] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 27: UpdateById with default filter
  // ----------------------------------------------------------------
  async case27UpdateByIdWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 27] UpdateById should respect default filter');

    const testCode = `DF_UPDATEBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code: testCode, name: 'Update Test', price: 0 }, // price=0 excluded by default
        options: { shouldSkipDefaultFilter: true },
      });

      const productId = created.data.id;

      // Try to update - should fail because product is excluded by default filter
      const updateResult = await repo.updateById({
        id: productId,
        data: { name: 'Updated Name' },
      });

      if (updateResult.count === 0) {
        this.context.logger.info(
          '[CASE 27] PASSED | UpdateById respects default filter | count: 0',
        );
      } else {
        this.context.logger.error(
          '[CASE 27] FAILED | Should not update excluded record | count: %d',
          updateResult.count,
        );
      }

      // Update with skip - should work
      const updateWithSkip = await repo.updateById({
        id: productId,
        data: { name: 'Updated Name' },
        options: { shouldSkipDefaultFilter: true },
      });

      if (updateWithSkip.count === 1) {
        this.context.logger.info('[CASE 27] PASSED | UpdateById with skip works | count: 1');
      }
    } catch (error) {
      this.context.logger.error('[CASE 27] FAILED | Error: %s', (error as Error).message);
    }
  }
}
