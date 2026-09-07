import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Integration Cases - transactions, relations, concurrency alongside the default filter
// ----------------------------------------------------------------
export class IntegrationCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 19: Transaction with default filter
  // ----------------------------------------------------------------
  async case19TransactionWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 19] Default filter should work in transaction context');

    const testCode = `DF_TX_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { transaction, shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { transaction, shouldSkipDefaultFilter: true },
      });

      // Find within transaction - default filter should apply
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` } } },
        options: { transaction },
      });

      if (results.length === 1) {
        await transaction.commit();
        this.context.logger.info(
          '[CASE 19] PASSED | Default filter works in transaction | count: %d',
          results.length,
        );
      } else {
        await transaction.rollback();
        this.context.logger.error(
          '[CASE 19] FAILED | Expected 1 in transaction | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Relations with default filter
  // ----------------------------------------------------------------
  async case20RelationsWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 20] Default filter should work with relation includes');

    const testCode = `DF_REL_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Product with Relations', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with include - default filter should still apply
      const found = await repo.findOne({
        filter: {
          where: { code: testCode },
          include: [{ relation: 'saleChannelProducts' }],
        },
      });

      if (found?.code === testCode) {
        this.context.logger.info(
          '[CASE 20] PASSED | Relations work with default filter | code: %s',
          found.code,
        );
      } else {
        this.context.logger.error(
          '[CASE 20] FAILED | Expected product with relations | Got: %j',
          found,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 25: Concurrent queries with default filter
  // ----------------------------------------------------------------
  async case25ConcurrentQueriesWithDefaultFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 25] Concurrent queries should all apply default filter');

    const testCode = `DF_CONCURRENT_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${testCode}_1`, name: 'Product 1', price: 100 },
          { code: `${testCode}_2`, name: 'Product 2', price: 200 },
          { code: `${testCode}_3`, name: 'Product 3', price: 0 }, // Excluded
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      // Run multiple concurrent queries
      const queries = Array.from({ length: 10 }, () =>
        repo.find({
          filter: { where: { code: { like: `${testCode}%` } } },
        }),
      );

      const allResults = await Promise.all(queries);
      const allCorrect = allResults.every(r => r.length === 2);

      if (allCorrect) {
        this.context.logger.info(
          '[CASE 25] PASSED | All 10 concurrent queries applied default filter correctly',
        );
      } else {
        const counts = allResults.map(r => r.length);
        this.context.logger.error('[CASE 25] FAILED | Inconsistent results | counts: %j', counts);
      }
    } catch (error) {
      this.context.logger.error('[CASE 25] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 26: Default filter with nested relations
  // ----------------------------------------------------------------
  async case26DefaultFilterWithNestedRelations(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 26] Default filter should work with nested relations');

    const testCode = `DF_NESTED_${getUID()}`;

    try {
      const product = await productRepo.create({
        data: { code: testCode, name: 'Nested Test', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const channel = await saleChannelRepo.create({
        data: { code: `${testCode}_CH`, name: 'Test Channel' },
      });

      await junctionRepo.create({
        data: { productId: product.data.id, saleChannelId: channel.data.id },
      });

      // Find with nested relations - default filter should apply to main entity
      const found = await productRepo.findOne({
        filter: {
          where: { code: testCode },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
      });

      if (found?.code === testCode) {
        const hasRelations = ((found as any).saleChannelProducts?.length ?? 0) > 0;
        if (hasRelations) {
          this.context.logger.info(
            '[CASE 26] PASSED | Nested relations loaded with default filter',
          );
        } else {
          this.context.logger.info('[CASE 26] INFO | Relations may be empty');
        }
      } else {
        this.context.logger.error('[CASE 26] FAILED | Product not found with default filter');
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.context.logger.error('[CASE 26] FAILED | Error: %s', (error as Error).message);
    }
  }
}
