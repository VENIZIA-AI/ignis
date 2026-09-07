import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Scenarios Cases - real-world queries: e-commerce search, date-range filtering, scoped
// relation filtering
// ----------------------------------------------------------------
export class ScenariosCases extends BaseTestCases {
  async testEcommerceProductSearch(): Promise<void> {
    this.context.logCase('[SCENARIO] E-commerce Search: Price Range + Tag Overlap + Sort');
    // Scenario: User wants "gaming" items (electronics or furniture) between $100 and $1000,
    // sorted by price descending.

    try {
      const results = await this.context.productRepository.find({
        filter: {
          where: {
            and: [{ price: { between: [100, 1000] } }, { tags: { contains: ['gaming'] } }],
          },
          order: ['price DESC'],
        } as any,
      });

      // Expected:
      // - Gaming Laptop ($1500) -> Excluded (Price > 1000)
      // - Gaming Chair ($350) -> MATCH
      // - Pro Monitor ($800) -> MATCH
      // - Cheap Monitor ($120) -> Excluded (No 'gaming' tag)
      // - Office Mouse ($25) -> Excluded (Price < 100)

      // Expected Order: Pro Monitor ($800), Gaming Chair ($350)

      if (results.length === 2 && results[0].price === 800 && results[1].price === 350) {
        this.context.logger.info('[SCENARIO] PASSED | Found correct products in correct order');
      } else {
        this.context.logger.error('[SCENARIO] FAILED | Expected Pro Monitor then Gaming Chair');
        this.context.logger.error(
          'Results: %j',
          results.map(r => ({ name: r.name, price: r.price })),
        );
      }
    } catch (e) {
      this.context.logger.error('[SCENARIO] FAILED | %s', (e as Error).message);
    }
  }

  async testComplexDateRanges(): Promise<void> {
    this.context.logCase('[SCENARIO] Complex Date Logic (Json Path String Comparison)');
    // Find configs created in 2025 ( >= 2025-01-01 AND < 2026-01-01 )

    try {
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            and: [
              { 'jValue.metadata.created': { gte: '2025-01-01' } },
              { 'jValue.metadata.created': { lt: '2026-01-01' } },
            ],
          } as any,
        },
      });

      // Should match Config 1 (2025-01-01) and Config 2 (2025-02-01)
      // Config 3 is 2024.

      if (results.length === 2) {
        const codes = results.map(r => r.code);
        if (codes.some(c => c.includes('C_ADV_1')) && codes.some(c => c.includes('C_ADV_2'))) {
          this.context.logger.info('[SCENARIO] PASSED | Correctly filtered date strings in JSON');
          return;
        }
      }
      this.context.logger.error('[SCENARIO] FAILED | Expected 2 records (2025)');
      this.context.logger.error(
        'Results: %j',
        results.map(r => ({ code: r.code, created: (r.jValue as any)?.metadata?.created })),
      );
    } catch (e) {
      this.context.logger.error('[SCENARIO] FAILED | %s', (e as Error).message);
    }
  }

  async testScopedRelationFiltering(): Promise<void> {
    this.context.logCase('[RELATION] Scoped Include with Filter');
    // Find Products, include SaleChannels where channel.name = 'Online Store'

    // First, verify setup for relations (we need to create them as setupData didn't link them)
    // We'll reuse the setup from InclusionTest logic loosely or create new links here.
    // Let's create a quick link for P_ADV_1 to a new channel.

    try {
      const channel = await this.context.saleChannelRepository.create({
        data: { name: 'AdvChannel', code: `CH_${getUID()}` },
      });
      const product = (
        await this.context.productRepository.find({
          filter: { where: { code: { like: 'P_ADV_1%' } } },
        })
      )[0];

      if (product && channel.data) {
        await this.context.saleChannelProductRepository.create({
          data: { productId: product.id, saleChannelId: channel.data.id },
        });
      }

      // Query: Find Product, include ONLY 'AdvChannel'
      const result = await this.context.productRepository.findById({
        id: product.id,
        filter: {
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [
                  {
                    relation: 'saleChannel',
                    scope: {
                      where: { name: 'AdvChannel' },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      // We expect 1 saleChannelProduct that has a loaded saleChannel
      // NOTE: This depends on how the ORM handles scoped includes.
      // Often, "where" on an include filters the *included* items, not the parent.

      if (!result) {
        this.context.logger.error('[RELATION] FAILED | Product not found');
        return;
      }

      const scp = (result as any).saleChannelProducts;
      if (scp && scp.length > 0) {
        // Check if the nested relation applied the filter
        // In some ORMs, if the child filter doesn't match, the parent relation array is empty or the specific child is null.
        // Here we look for presence.
        const hasChannel = scp.some((rel: any) => rel.saleChannel?.name === 'AdvChannel');
        if (hasChannel) {
          this.context.logger.info('[RELATION] PASSED | Scoped include filter applied');
        } else {
          this.context.logger.error(
            '[RELATION] FAILED | Scoped filter did not return expected channel',
          );
        }
      } else {
        this.context.logger.error('[RELATION] FAILED | No relations returned');
      }
    } catch (e) {
      this.context.logger.warn('[RELATION] SKIPPED/FAILED | Error: %s', (e as Error).message);
    }
  }
}
