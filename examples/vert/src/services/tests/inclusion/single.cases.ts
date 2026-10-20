import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Single Cases - one relation, basic setup and simple traversal both directions
// ----------------------------------------------------------------
export class SingleCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Setup and Basic Include
  // ----------------------------------------------------------------
  async case1SetupAndBasicInclude(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const saleChannelProductRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 1] Setup test data and basic include');

    try {
      // Create products
      const products = await productRepo.createAll({
        data: [
          { name: 'Product A', code: `PROD_A_${getUID()}`, price: 100 },
          { name: 'Product B', code: `PROD_B_${getUID()}`, price: 200 },
          { name: 'Product C', code: `PROD_C_${getUID()}`, price: 300 },
        ],
      });

      // Create sale channels
      const channels = await saleChannelRepo.createAll({
        data: [
          { name: 'Online Store', code: `ONLINE_${getUID()}` },
          { name: 'Retail Store', code: `RETAIL_${getUID()}` },
          { name: 'Wholesale', code: `WHOLESALE_${getUID()}` },
        ],
      });

      // Create junction records (many-to-many)
      // Product A -> Online, Retail
      // Product B -> Online, Wholesale
      // Product C -> Retail, Wholesale
      await saleChannelProductRepo.createAll({
        data: [
          { productId: products.data![0].id, saleChannelId: channels.data![0].id },
          { productId: products.data![0].id, saleChannelId: channels.data![1].id },
          { productId: products.data![1].id, saleChannelId: channels.data![0].id },
          { productId: products.data![1].id, saleChannelId: channels.data![2].id },
          { productId: products.data![2].id, saleChannelId: channels.data![1].id },
          { productId: products.data![2].id, saleChannelId: channels.data![2].id },
        ],
      });

      this.context.logger.info(
        '[CASE 1] PASSED | Created 3 products, 3 channels, 6 junction records',
      );
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Product with Sale Channels
  // ----------------------------------------------------------------
  async case2ProductWithSaleChannels(): Promise<void> {
    const productRepo = this.context.productRepository;
    this.context.logCase('[CASE 2] Find Product with its SaleChannels');

    try {
      // Find Product A with its sale channels
      const productA = await productRepo.findOne({
        filter: {
          where: { name: 'Product A' },
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

      if (!productA) {
        this.context.logger.error('[CASE 2] FAILED | Product A not found');
        return;
      }

      const saleChannelProducts = (productA as any).saleChannelProducts;
      if (saleChannelProducts?.length === 2) {
        const channelNames = saleChannelProducts.map((scp: any) => scp.saleChannel?.name);
        this.context.logger.info(
          '[CASE 2] PASSED | Product A has 2 channels | Channels: %j',
          channelNames,
        );
      } else {
        this.context.logger.error(
          '[CASE 2] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Sale Channel with Products
  // ----------------------------------------------------------------
  async case3SaleChannelWithProducts(): Promise<void> {
    const saleChannelRepo = this.context.saleChannelRepository;
    this.context.logCase('[CASE 3] Find SaleChannel with its Products');

    try {
      // Find Online Store with its products
      const onlineStore = await saleChannelRepo.findOne({
        filter: {
          where: { name: 'Online Store' },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'product' }],
              },
            },
          ],
        },
      });

      if (!onlineStore) {
        this.context.logger.error('[CASE 3] FAILED | Online Store not found');
        return;
      }

      const saleChannelProducts = (onlineStore as any).saleChannelProducts;
      if (saleChannelProducts?.length === 2) {
        const productNames = saleChannelProducts.map((scp: any) => scp.product?.name);
        this.context.logger.info(
          '[CASE 3] PASSED | Online Store has 2 products | Products: %j',
          productNames,
        );
      } else {
        this.context.logger.error(
          '[CASE 3] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Junction table with both relations
  // Note: Filter by test product names to avoid counting other records
  // ----------------------------------------------------------------
  async case4JunctionTableWithBothRelations(): Promise<void> {
    const saleChannelProductRepo = this.context.saleChannelProductRepository;
    const productRepo = this.context.productRepository;
    this.context.logCase('[CASE 4] Find junction table with both relations');

    try {
      // First get test product IDs to filter junction records
      const testProducts = await productRepo.find({
        filter: {
          where: { name: { inq: ['Product A', 'Product B', 'Product C'] } },
          fields: ['id'],
        },
      });
      const testProductIds = testProducts.map(p => p.id);

      // Find junction records only for our test products
      const allRelations = await saleChannelProductRepo.find({
        filter: {
          where: { productId: { inq: testProductIds } },
          include: [{ relation: 'product' }, { relation: 'saleChannel' }],
        },
      });

      if (allRelations.length === 6) {
        const withBothRelations = allRelations.filter(
          (r: any) => r.product && r.saleChannel,
        ).length;

        if (withBothRelations === 6) {
          this.context.logger.info(
            '[CASE 4] PASSED | All 6 junction records have both product and saleChannel',
          );
        } else {
          this.context.logger.error(
            '[CASE 4] FAILED | Only %d of 6 have both relations',
            withBothRelations,
          );
        }
      } else {
        this.context.logger.error(
          '[CASE 4] FAILED | Expected 6 junction records | got: %d',
          allRelations.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }
}
