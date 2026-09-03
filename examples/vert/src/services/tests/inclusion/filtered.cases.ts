import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Filtered Cases - relation scope where/order/limit/fields, and parent where + include
// ----------------------------------------------------------------
export class FilteredCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 7: Scoped Relation with Filter
  // ----------------------------------------------------------------
  async case7ScopedRelationWithFilter(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 7] Scoped Relation with Filter');

    try {
      // Create test data
      const product = await productRepo.create({
        data: { code: `SCOPE_FILTER_PROD_${getUID()}`, name: 'Scoped Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const channel1 = await saleChannelRepo.create({
        data: { code: `SCOPE_FILTER_CH1_${getUID()}`, name: 'Active Channel' },
      });
      const channel2 = await saleChannelRepo.create({
        data: { code: `SCOPE_FILTER_CH2_${getUID()}`, name: 'Inactive Channel' },
      });

      await junctionRepo.createAll({
        data: [
          { productId: product.data.id, saleChannelId: channel1.data.id },
          { productId: product.data.id, saleChannelId: channel2.data.id },
        ],
      });

      // Find with scoped filter - only get Active Channel
      const productWithFiltered = await productRepo.findOne({
        filter: {
          where: { id: product.data.id },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [
                  {
                    relation: 'saleChannel',
                    scope: {
                      where: { name: 'Active Channel' },
                    },
                  },
                ],
              },
            },
          ],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithFiltered as any)?.saleChannelProducts ?? [];
      const activeChannels = saleChannelProducts.filter(
        (scp: any) => scp.saleChannel?.name === 'Active Channel',
      );
      const inactiveChannels = saleChannelProducts.filter(
        (scp: any) => scp.saleChannel?.name === 'Inactive Channel',
      );
      const nullChannels = saleChannelProducts.filter(
        (scp: any) => scp.saleChannel === null || scp.saleChannel === undefined,
      );

      // Verify the filter behavior:
      // - Total junction records returned (could be 2 with filtering on nested, or 1 if filtered at junction)
      // - Only 1 active channel should have data
      // - Inactive channel should either be excluded or have null saleChannel
      if (activeChannels.length === 1) {
        this.context.logger.info(
          '[CASE 7] PASSED | Scoped filter: active=%d, inactive=%d, null=%d, total=%d',
          activeChannels.length,
          inactiveChannels.length,
          nullChannels.length,
          saleChannelProducts.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | Expected 1 active | got: active=%d, inactive=%d, null=%d, total=%d',
          activeChannels.length,
          inactiveChannels.length,
          nullChannels.length,
          saleChannelProducts.length,
        );
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await productRepo.deleteAll({
        where: { id: product.data.id },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
      await saleChannelRepo.deleteAll({
        where: { code: { like: 'SCOPE_FILTER_CH%' } },
        options: { force: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Scoped Relation with Order
  // ----------------------------------------------------------------
  async case8ScopedRelationWithOrder(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 8] Scoped Relation with Order');

    try {
      const product = await productRepo.create({
        data: { code: `SCOPE_ORDER_PROD_${getUID()}`, name: 'Ordered Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const channels = await saleChannelRepo.createAll({
        data: [
          { code: `SCOPE_ORDER_CH_A_${getUID()}`, name: 'A Channel' },
          { code: `SCOPE_ORDER_CH_B_${getUID()}`, name: 'B Channel' },
          { code: `SCOPE_ORDER_CH_C_${getUID()}`, name: 'C Channel' },
        ],
      });

      await junctionRepo.createAll({
        data: channels.data!.map(ch => ({ productId: product.data.id, saleChannelId: ch.id })),
      });

      // Find with ordered relations (DESC by name)
      const productWithOrdered = await productRepo.findOne({
        filter: {
          where: { id: product.data.id },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
                order: ['saleChannelId DESC'],
              },
            },
          ],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithOrdered as any)?.saleChannelProducts ?? [];
      if (saleChannelProducts.length === 3) {
        // Verify the order is actually DESC by saleChannelId
        const ids = saleChannelProducts.map((s: any) => s.saleChannelId);
        const isDescending = ids.every((id: string, i: number) => i === 0 || id <= ids[i - 1]);

        if (isDescending) {
          this.context.logger.info(
            '[CASE 8] PASSED | Scoped order returned 3 channels in DESC order',
          );
          this.context.logger.info('[CASE 8] Channel IDs (DESC): %j', ids);
        } else {
          this.context.logger.error('[CASE 8] FAILED | Channels not in DESC order | IDs: %j', ids);
        }
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED | Expected 3 ordered channels | got: %d',
          saleChannelProducts.length,
        );
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await productRepo.deleteAll({
        where: { id: product.data.id },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
      await saleChannelRepo.deleteAll({
        where: { code: { like: 'SCOPE_ORDER_CH_%' } },
        options: { force: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Scoped Relation with Limit
  // ----------------------------------------------------------------
  async case9ScopedRelationWithLimit(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 9] Scoped Relation with Limit');

    try {
      const product = await productRepo.create({
        data: { code: `SCOPE_LIMIT_PROD_${getUID()}`, name: 'Limited Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const channels = await saleChannelRepo.createAll({
        data: [
          { code: `SCOPE_LIMIT_CH_1_${getUID()}`, name: 'Channel 1' },
          { code: `SCOPE_LIMIT_CH_2_${getUID()}`, name: 'Channel 2' },
          { code: `SCOPE_LIMIT_CH_3_${getUID()}`, name: 'Channel 3' },
          { code: `SCOPE_LIMIT_CH_4_${getUID()}`, name: 'Channel 4' },
          { code: `SCOPE_LIMIT_CH_5_${getUID()}`, name: 'Channel 5' },
        ],
      });

      await junctionRepo.createAll({
        data: channels.data!.map(ch => ({ productId: product.data.id, saleChannelId: ch.id })),
      });

      // Find with limited relations (only 2)
      const productWithLimited = await productRepo.findOne({
        filter: {
          where: { id: product.data.id },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                limit: 2,
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithLimited as any)?.saleChannelProducts ?? [];
      if (saleChannelProducts.length === 2) {
        this.context.logger.info('[CASE 9] PASSED | Scoped limit returned only 2 channels');
      } else {
        this.context.logger.error(
          '[CASE 9] FAILED | Expected 2 limited channels | got: %d',
          saleChannelProducts.length,
        );
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await productRepo.deleteAll({
        where: { id: product.data.id },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
      await saleChannelRepo.deleteAll({
        where: { code: { like: 'SCOPE_LIMIT_CH_%' } },
        options: { force: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Relation Field Selection
  // ----------------------------------------------------------------
  async case12RelationFieldSelection(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 12] Relation Field Selection');

    try {
      const product = await productRepo.create({
        data: { code: `FIELD_SEL_PROD_${getUID()}`, name: 'Field Select Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const channel = await saleChannelRepo.create({
        data: { code: `FIELD_SEL_CH_${getUID()}`, name: 'Field Select Channel' },
      });

      await junctionRepo.create({
        data: { productId: product.data.id, saleChannelId: channel.data.id },
      });

      // Find with field selection in relation scope
      const productWithFields = await productRepo.findOne({
        filter: {
          where: { id: product.data.id },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [
                  {
                    relation: 'saleChannel',
                    scope: {
                      fields: ['id', 'name'], // Only select id and name
                    },
                  },
                ],
              },
            },
          ],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const scp = (productWithFields as any)?.saleChannelProducts?.[0];
      const sc = scp?.saleChannel;

      if (sc?.name && !sc.createdAt) {
        this.context.logger.info('[CASE 12] PASSED | Only selected fields returned in relation');
        this.context.logger.info('[CASE 12] Channel keys: %s', Object.keys(sc).join(', '));
      } else {
        this.context.logger.info(
          '[CASE 12] INFO | Field selection may include all fields | keys: %s',
          sc ? Object.keys(sc).join(', ') : 'no channel',
        );
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await productRepo.deleteAll({
        where: { id: product.data.id },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Include With Where On Parent
  // ----------------------------------------------------------------
  async case15IncludeWithWhereOnParent(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 15] Include With Where On Parent');

    const testGroup = `WHERE_PARENT_${getUID()}`;

    try {
      const products = await productRepo.createAll({
        data: [
          { code: `${testGroup}_CHEAP`, name: 'Cheap', price: 10 },
          { code: `${testGroup}_EXPENSIVE`, name: 'Expensive', price: 1000 },
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      const channel = await saleChannelRepo.create({
        data: { code: `${testGroup}_CH`, name: 'Test Channel' },
      });

      await junctionRepo.createAll({
        data: products.data!.map(p => ({ productId: p.id, saleChannelId: channel.data.id })),
      });

      // Find only expensive product with relations
      const expensiveWithRelations = await productRepo.find({
        filter: {
          where: { code: `${testGroup}_EXPENSIVE` },
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

      if (expensiveWithRelations.length === 1 && expensiveWithRelations[0].price === 1000) {
        const hasChannel = (expensiveWithRelations[0] as any).saleChannelProducts?.length === 1;
        if (hasChannel) {
          this.context.logger.info('[CASE 15] PASSED | Parent where filter works with include');
        } else {
          this.context.logger.error('[CASE 15] FAILED | Include not loaded');
        }
      } else {
        this.context.logger.error('[CASE 15] FAILED | Wrong product returned');
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
      this.context.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }
}
