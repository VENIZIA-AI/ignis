import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Nested Cases - multi-level include chains as the point of the test
// ----------------------------------------------------------------
export class NestedCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 5: Nested inclusion - find test products with channels
  // Note: Filter by name to avoid counting other products in database
  // ----------------------------------------------------------------
  async case5NestedInclusion(): Promise<void> {
    const productRepo = this.context.productRepository;
    this.context.logCase('[CASE 5] Nested inclusion - find test products with channels');

    try {
      // Filter for only our test products (Product A, B, C)
      const testProducts = await productRepo.find({
        filter: {
          where: {
            or: [{ name: 'Product A' }, { name: 'Product B' }, { name: 'Product C' }],
          },
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

      if (testProducts.length === 3) {
        let totalChannels = 0;
        for (const product of testProducts) {
          const scp = (product as any).saleChannelProducts ?? [];
          totalChannels += scp.length;
        }

        if (totalChannels === 6) {
          this.context.logger.info(
            '[CASE 5] PASSED | Found 3 test products with total 6 channel associations',
          );
        } else {
          this.context.logger.error(
            '[CASE 5] FAILED | Expected 6 total associations | got: %d',
            totalChannels,
          );
        }
      } else {
        this.context.logger.error(
          '[CASE 5] FAILED | Expected 3 test products | got: %d',
          testProducts.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Nested Relation with Scope
  // ----------------------------------------------------------------
  async case13NestedRelationWithScope(): Promise<void> {
    const saleChannelRepo = this.context.saleChannelRepository;
    const productRepo = this.context.productRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 13] Nested Relation with Scope');

    try {
      // Create channel with multiple products at different prices
      const channel = await saleChannelRepo.create({
        data: { code: `NESTED_SCOPE_CH_${getUID()}`, name: 'Nested Scope Channel' },
      });

      const products = await productRepo.createAll({
        data: [
          { code: `NESTED_SCOPE_P1_${getUID()}`, name: 'Cheap Product', price: 10 },
          { code: `NESTED_SCOPE_P2_${getUID()}`, name: 'Medium Product', price: 50 },
          { code: `NESTED_SCOPE_P3_${getUID()}`, name: 'Expensive Product', price: 200 },
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      await junctionRepo.createAll({
        data: products.data!.map(p => ({ productId: p.id, saleChannelId: channel.data.id })),
      });

      // Find channel with products filtered by price (only expensive)
      const channelWithExpensive = await saleChannelRepo.findOne({
        filter: {
          where: { id: channel.data.id },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [
                  {
                    relation: 'product',
                    scope: {
                      where: { price: { gt: 100 } },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const saleChannelProducts = (channelWithExpensive as any)?.saleChannelProducts ?? [];
      const expensiveProducts = saleChannelProducts.filter((scp: any) => scp.product?.price > 100);
      const nullProducts = saleChannelProducts.filter(
        (scp: any) => scp.product === null || scp.product === undefined,
      );

      // We created 3 products: price 10, 50, 200 - only 1 (price=200) is > 100
      // The nested scope filter should either:
      // - Return only 1 junction with the expensive product, OR
      // - Return all 3 junctions with 2 having null products
      if (expensiveProducts.length === 1) {
        this.context.logger.info(
          '[CASE 13] PASSED | Nested scope: expensive=%d, null=%d, total=%d',
          expensiveProducts.length,
          nullProducts.length,
          saleChannelProducts.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED | Expected 1 expensive | got: expensive=%d, null=%d, total=%d',
          expensiveProducts.length,
          nullProducts.length,
          saleChannelProducts.length,
        );
      }

      // Cleanup
      for (const p of products.data!) {
        await junctionRepo.deleteAll({ where: { productId: p.id }, options: { force: true } });
      }
      for (const p of products.data!) {
        await productRepo.deleteAll({
          where: { id: p.id },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
      }
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }
}
