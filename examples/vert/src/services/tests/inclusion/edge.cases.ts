import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - empty relations, multiple relations at once, plural find, cleanup
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 6: Cleanup all test data (renamed to run last)
  // ----------------------------------------------------------------
  async case6Cleanup(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const saleChannelProductRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 6] Cleanup all test data');

    try {
      // Get test product IDs (only products with test names) to avoid deleting unrelated data
      const testProducts = await productRepo.find({
        filter: {
          where: {
            or: [{ name: 'Product A' }, { name: 'Product B' }, { name: 'Product C' }],
          },
          fields: ['id'],
        },
        options: { shouldSkipDefaultFilter: true },
      });
      const testProductIds = testProducts.map(p => p.id);

      // Get test channel IDs (only channels with test names)
      const testChannels = await saleChannelRepo.find({
        filter: {
          where: {
            or: [{ name: 'Online Store' }, { name: 'Retail Store' }, { name: 'Wholesale' }],
          },
          fields: ['id'],
        },
      });
      const testChannelIds = testChannels.map(c => c.id);

      // Delete only junction records that reference our test products
      let deletedJunctionCount = 0;
      if (testProductIds.length > 0) {
        const deletedJunction = await saleChannelProductRepo.deleteAll({
          where: { productId: { inq: testProductIds } },
          options: { force: true },
        });
        deletedJunctionCount = deletedJunction.count;
      }

      // Delete only test products
      let deletedProductsCount = 0;
      if (testProductIds.length > 0) {
        const deletedProducts = await productRepo.deleteAll({
          where: { id: { inq: testProductIds } },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
        deletedProductsCount = deletedProducts.count;
      }

      // Delete only test channels
      let deletedChannelsCount = 0;
      if (testChannelIds.length > 0) {
        const deletedChannels = await saleChannelRepo.deleteAll({
          where: { id: { inq: testChannelIds } },
          options: { force: true },
        });
        deletedChannelsCount = deletedChannels.count;
      }

      this.context.logger.info(
        '[CASE 6] PASSED | Cleaned up | Junction: %d | Products: %d | Channels: %d',
        deletedJunctionCount,
        deletedProductsCount,
        deletedChannelsCount,
      );
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Empty Relations Handling
  // ----------------------------------------------------------------
  async case10EmptyRelationsHandling(): Promise<void> {
    const productRepo = this.context.productRepository;
    this.context.logCase('[CASE 10] Empty Relations Handling');

    try {
      // Create product without any relations
      const product = await productRepo.create({
        data: { code: `EMPTY_REL_PROD_${getUID()}`, name: 'Lonely Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with include - should get empty array for relations
      const productWithEmpty = await productRepo.findOne({
        filter: {
          where: { id: product.data.id },
          include: [{ relation: 'saleChannelProducts' }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithEmpty as any)?.saleChannelProducts;
      if (Array.isArray(saleChannelProducts) && saleChannelProducts.length === 0) {
        this.context.logger.info('[CASE 10] PASSED | Empty relations returned as empty array');
      } else if (saleChannelProducts === undefined || saleChannelProducts === null) {
        this.context.logger.info('[CASE 10] PASSED | Empty relations returned as undefined/null');
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Expected empty | got: %j',
          saleChannelProducts,
        );
      }

      // Cleanup
      await productRepo.deleteAll({
        where: { id: product.data.id },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Multiple Relations at Same Level
  // ----------------------------------------------------------------
  async case11MultipleRelationsAtSameLevel(): Promise<void> {
    const configRepo = this.context.configurationRepository;
    const userRepo = this.context.userRepository;
    this.context.logCase('[CASE 11] Multiple Relations at Same Level');

    try {
      // Create a user for creator/modifier relations
      const uniqueId = getUID();
      const user = await userRepo.create({
        data: {
          realm: `MULTI_REL_USER_${uniqueId}`,
          username: `user_${uniqueId}`,
          email: `user_${uniqueId}@test.com`,
          password: 'test',
          secret: 'test',
        },
      });

      // Create configuration with creator and modifier (same user for simplicity)
      const config = await configRepo.create({
        data: {
          code: `MULTI_REL_CFG_${getUID()}`,
          group: 'MULTI_REL_TEST',
          createdBy: user.data.id,
          modifiedBy: user.data.id,
        },
      });

      // Find with multiple relations
      const configWithRelations = await configRepo.findOne({
        filter: {
          where: { id: config.data.id },
          include: [{ relation: 'creator' }, { relation: 'modifier' }],
        },
      });

      const creator = (configWithRelations as any)?.creator;
      const modifier = (configWithRelations as any)?.modifier;

      if (creator?.id === user.data.id && modifier?.id === user.data.id) {
        this.context.logger.info('[CASE 11] PASSED | Both creator and modifier relations loaded');
      } else {
        this.context.logger.error(
          '[CASE 11] FAILED | creator: %j | modifier: %j',
          !!creator,
          !!modifier,
        );
      }

      // Cleanup
      await configRepo.deleteAll({ where: { id: config.data.id } });
      await userRepo.deleteAll({ where: { id: user.data.id } });
    } catch (error) {
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Find Many With Inclusions
  // ----------------------------------------------------------------
  async case14FindManyWithInclusions(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 14] Find Many With Inclusions');

    const testGroup = `FIND_MANY_${getUID()}`;

    try {
      // Create multiple products with relations
      const products = await productRepo.createAll({
        data: [
          { code: `${testGroup}_P1`, name: 'Product 1', price: 100 },
          { code: `${testGroup}_P2`, name: 'Product 2', price: 200 },
          { code: `${testGroup}_P3`, name: 'Product 3', price: 300 },
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      const channel = await saleChannelRepo.create({
        data: { code: `${testGroup}_CH`, name: 'Shared Channel' },
      });

      await junctionRepo.createAll({
        data: products.data!.map(p => ({ productId: p.id, saleChannelId: channel.data.id })),
      });

      // Find multiple products with inclusions
      const productsWithRelations = await productRepo.find({
        filter: {
          where: { code: { like: `${testGroup}_%` } },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const allHaveRelations = productsWithRelations.every(
        (p: any) => p.saleChannelProducts?.length === 1,
      );

      if (productsWithRelations.length === 3 && allHaveRelations) {
        this.context.logger.info('[CASE 14] PASSED | All 3 products have their relations loaded');
      } else {
        this.context.logger.error(
          '[CASE 14] FAILED | products: %d | allHaveRelations: %s',
          productsWithRelations.length,
          allHaveRelations,
        );
      }

      // Cleanup
      for (const p of products.data!) {
        await junctionRepo.deleteAll({ where: { productId: p.id }, options: { force: true } });
        await productRepo.deleteAll({
          where: { id: p.id },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
      }
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }
}
