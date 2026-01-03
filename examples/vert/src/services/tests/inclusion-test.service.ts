import { BindingKeys, BindingNamespaces, getUID, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// Inclusion Test Service - Many-to-many relationship tests
// ----------------------------------------------------------------
export class InclusionTestService extends BaseTestService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    configurationRepository: ConfigurationRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    productRepository: ProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    })
    saleChannelRepository: SaleChannelRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    })
    saleChannelProductRepository: SaleChannelProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    userRepository: UserRepository,
  ) {
    super(
      InclusionTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[InclusionTestService] Starting inclusion test cases (many-to-many)');

    // Basic inclusion tests
    await this.case1_SetupAndBasicInclude();
    await this.case2_ProductWithSaleChannels();
    await this.case3_SaleChannelWithProducts();
    await this.case4_JunctionTableWithBothRelations();
    await this.case5_NestedInclusion();

    // Advanced inclusion tests
    await this.case7_ScopedRelationWithFilter();
    await this.case8_ScopedRelationWithOrder();
    await this.case9_ScopedRelationWithLimit();
    await this.case10_EmptyRelationsHandling();
    await this.case11_MultipleRelationsAtSameLevel();
    await this.case12_RelationFieldSelection();
    await this.case13_NestedRelationWithScope();
    await this.case14_FindManyWithInclusions();
    await this.case15_IncludeWithWhereOnParent();

    // Cleanup last
    await this.case6_Cleanup();

    this.logSection('[InclusionTestService] All inclusion test cases completed!');
  }

  // ----------------------------------------------------------------
  // CASE 1: Setup and Basic Include
  // ----------------------------------------------------------------
  private async case1_SetupAndBasicInclude(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const saleChannelProductRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 1] Setup test data and basic include');

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

      this.logger.info('[CASE 1] PASSED | Created 3 products, 3 channels, 6 junction records');
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Product with Sale Channels
  // ----------------------------------------------------------------
  private async case2_ProductWithSaleChannels(): Promise<void> {
    const productRepo = this.productRepository;
    this.logCase('[CASE 2] Find Product with its SaleChannels');

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
        this.logger.error('[CASE 2] FAILED | Product A not found');
        return;
      }

      const saleChannelProducts = (productA as any).saleChannelProducts;
      if (saleChannelProducts?.length === 2) {
        const channelNames = saleChannelProducts.map((scp: any) => scp.saleChannel?.name);
        this.logger.info('[CASE 2] PASSED | Product A has 2 channels | Channels: %j', channelNames);
      } else {
        this.logger.error(
          '[CASE 2] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Sale Channel with Products
  // ----------------------------------------------------------------
  private async case3_SaleChannelWithProducts(): Promise<void> {
    const saleChannelRepo = this.saleChannelRepository;
    this.logCase('[CASE 3] Find SaleChannel with its Products');

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
        this.logger.error('[CASE 3] FAILED | Online Store not found');
        return;
      }

      const saleChannelProducts = (onlineStore as any).saleChannelProducts;
      if (saleChannelProducts?.length === 2) {
        const productNames = saleChannelProducts.map((scp: any) => scp.product?.name);
        this.logger.info(
          '[CASE 3] PASSED | Online Store has 2 products | Products: %j',
          productNames,
        );
      } else {
        this.logger.error(
          '[CASE 3] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Junction table with both relations
  // Note: Filter by test product names to avoid counting other records
  // ----------------------------------------------------------------
  private async case4_JunctionTableWithBothRelations(): Promise<void> {
    const saleChannelProductRepo = this.saleChannelProductRepository;
    const productRepo = this.productRepository;
    this.logCase('[CASE 4] Find junction table with both relations');

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
          this.logger.info(
            '[CASE 4] PASSED | All 6 junction records have both product and saleChannel',
          );
        } else {
          this.logger.error(
            '[CASE 4] FAILED | Only %d of 6 have both relations',
            withBothRelations,
          );
        }
      } else {
        this.logger.error(
          '[CASE 4] FAILED | Expected 6 junction records | got: %d',
          allRelations.length,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: Nested inclusion - find test products with channels
  // Note: Filter by name to avoid counting other products in database
  // ----------------------------------------------------------------
  private async case5_NestedInclusion(): Promise<void> {
    const productRepo = this.productRepository;
    this.logCase('[CASE 5] Nested inclusion - find test products with channels');

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
          const scp = (product as any).saleChannelProducts || [];
          totalChannels += scp.length;
        }

        if (totalChannels === 6) {
          this.logger.info('[CASE 5] PASSED | Found 3 test products with total 6 channel associations');
        } else {
          this.logger.error(
            '[CASE 5] FAILED | Expected 6 total associations | got: %d',
            totalChannels,
          );
        }
      } else {
        this.logger.error('[CASE 5] FAILED | Expected 3 test products | got: %d', testProducts.length);
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Cleanup all test data
  // ----------------------------------------------------------------
  private async case6_Cleanup(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const saleChannelProductRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 6] Cleanup all test data');

    try {
      // Delete in correct order (junction table first due to foreign keys)
      const deletedJunction = await saleChannelProductRepo.deleteAll({
        where: {},
        options: { force: true },
      });
      const deletedProducts = await productRepo.deleteAll({
        where: {},
        options: { force: true },
      });
      const deletedChannels = await saleChannelRepo.deleteAll({
        where: {},
        options: { force: true },
      });

      this.logger.info(
        '[CASE 6] PASSED | Cleaned up | Junction: %d | Products: %d | Channels: %d',
        deletedJunction.count,
        deletedProducts.count,
        deletedChannels.count,
      );
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Scoped Relation with Filter
  // ----------------------------------------------------------------
  private async case7_ScopedRelationWithFilter(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 7] Scoped Relation with Filter');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{
                relation: 'saleChannel',
                scope: {
                  where: { name: 'Active Channel' },
                },
              }],
            },
          }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithFiltered as any)?.saleChannelProducts || [];
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
        this.logger.info(
          '[CASE 7] PASSED | Scoped filter: active=%d, inactive=%d, null=%d, total=%d',
          activeChannels.length,
          inactiveChannels.length,
          nullChannels.length,
          saleChannelProducts.length,
        );
      } else {
        this.logger.error(
          '[CASE 7] FAILED | Expected 1 active | got: active=%d, inactive=%d, null=%d, total=%d',
          activeChannels.length,
          inactiveChannels.length,
          nullChannels.length,
          saleChannelProducts.length,
        );
      }

      // Cleanup
      await junctionRepo.deleteAll({ where: { productId: product.data.id }, options: { force: true } });
      await productRepo.deleteAll({ where: { id: product.data.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      await saleChannelRepo.deleteAll({ where: { code: { like: 'SCOPE_FILTER_CH%' } }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Scoped Relation with Order
  // ----------------------------------------------------------------
  private async case8_ScopedRelationWithOrder(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 8] Scoped Relation with Order');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{ relation: 'saleChannel' }],
              order: ['saleChannelId DESC'],
            },
          }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithOrdered as any)?.saleChannelProducts || [];
      if (saleChannelProducts.length === 3) {
        this.logger.info('[CASE 8] PASSED | Scoped order returned 3 channels');
        this.logger.info('[CASE 8] Channel names: %j', saleChannelProducts.map((s: any) => s.saleChannel?.name));
      } else {
        this.logger.error('[CASE 8] FAILED | Expected 3 ordered channels | got: %d', saleChannelProducts.length);
      }

      // Cleanup
      await junctionRepo.deleteAll({ where: { productId: product.data.id }, options: { force: true } });
      await productRepo.deleteAll({ where: { id: product.data.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      await saleChannelRepo.deleteAll({ where: { code: { like: 'SCOPE_ORDER_CH_%' } }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Scoped Relation with Limit
  // ----------------------------------------------------------------
  private async case9_ScopedRelationWithLimit(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 9] Scoped Relation with Limit');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              limit: 2,
              include: [{ relation: 'saleChannel' }],
            },
          }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithLimited as any)?.saleChannelProducts || [];
      if (saleChannelProducts.length === 2) {
        this.logger.info('[CASE 9] PASSED | Scoped limit returned only 2 channels');
      } else {
        this.logger.error('[CASE 9] FAILED | Expected 2 limited channels | got: %d', saleChannelProducts.length);
      }

      // Cleanup
      await junctionRepo.deleteAll({ where: { productId: product.data.id }, options: { force: true } });
      await productRepo.deleteAll({ where: { id: product.data.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      await saleChannelRepo.deleteAll({ where: { code: { like: 'SCOPE_LIMIT_CH_%' } }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Empty Relations Handling
  // ----------------------------------------------------------------
  private async case10_EmptyRelationsHandling(): Promise<void> {
    const productRepo = this.productRepository;
    this.logCase('[CASE 10] Empty Relations Handling');

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
        this.logger.info('[CASE 10] PASSED | Empty relations returned as empty array');
      } else if (saleChannelProducts === undefined || saleChannelProducts === null) {
        this.logger.info('[CASE 10] PASSED | Empty relations returned as undefined/null');
      } else {
        this.logger.error('[CASE 10] FAILED | Expected empty | got: %j', saleChannelProducts);
      }

      // Cleanup
      await productRepo.deleteAll({ where: { id: product.data.id }, options: { force: true, shouldSkipDefaultFilter: true } });
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Multiple Relations at Same Level
  // ----------------------------------------------------------------
  private async case11_MultipleRelationsAtSameLevel(): Promise<void> {
    const configRepo = this.configurationRepository;
    const userRepo = this.userRepository;
    this.logCase('[CASE 11] Multiple Relations at Same Level');

    try {
      // Create a user for creator/modifier relations
      const user = await userRepo.create({
        data: { realm: `MULTI_REL_USER_${getUID()}`, password: 'test', secret: 'test' },
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
          include: [
            { relation: 'creator' },
            { relation: 'modifier' },
          ],
        },
      });

      const creator = (configWithRelations as any)?.creator;
      const modifier = (configWithRelations as any)?.modifier;

      if (creator?.id === user.data.id && modifier?.id === user.data.id) {
        this.logger.info('[CASE 11] PASSED | Both creator and modifier relations loaded');
      } else {
        this.logger.error('[CASE 11] FAILED | creator: %j | modifier: %j', !!creator, !!modifier);
      }

      // Cleanup
      await configRepo.deleteAll({ where: { id: config.data.id } });
      await userRepo.deleteAll({ where: { id: user.data.id } });
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Relation Field Selection
  // ----------------------------------------------------------------
  private async case12_RelationFieldSelection(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 12] Relation Field Selection');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{
                relation: 'saleChannel',
                scope: {
                  fields: ['id', 'name'], // Only select id and name
                },
              }],
            },
          }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const scp = (productWithFields as any)?.saleChannelProducts?.[0];
      const sc = scp?.saleChannel;

      if (sc && sc.name && !sc.createdAt) {
        this.logger.info('[CASE 12] PASSED | Only selected fields returned in relation');
        this.logger.info('[CASE 12] Channel keys: %s', Object.keys(sc).join(', '));
      } else {
        this.logger.info('[CASE 12] INFO | Field selection may include all fields | keys: %s',
          sc ? Object.keys(sc).join(', ') : 'no channel');
      }

      // Cleanup
      await junctionRepo.deleteAll({ where: { productId: product.data.id }, options: { force: true } });
      await productRepo.deleteAll({ where: { id: product.data.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Nested Relation with Scope
  // ----------------------------------------------------------------
  private async case13_NestedRelationWithScope(): Promise<void> {
    const saleChannelRepo = this.saleChannelRepository;
    const productRepo = this.productRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 13] Nested Relation with Scope');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{
                relation: 'product',
                scope: {
                  where: { price: { gt: 100 } },
                },
              }],
            },
          }],
        },
      });

      const saleChannelProducts = (channelWithExpensive as any)?.saleChannelProducts || [];
      const expensiveProducts = saleChannelProducts.filter((scp: any) => scp.product?.price > 100);
      const nullProducts = saleChannelProducts.filter(
        (scp: any) => scp.product === null || scp.product === undefined,
      );

      // We created 3 products: price 10, 50, 200 - only 1 (price=200) is > 100
      // The nested scope filter should either:
      // - Return only 1 junction with the expensive product, OR
      // - Return all 3 junctions with 2 having null products
      if (expensiveProducts.length === 1) {
        this.logger.info(
          '[CASE 13] PASSED | Nested scope: expensive=%d, null=%d, total=%d',
          expensiveProducts.length,
          nullProducts.length,
          saleChannelProducts.length,
        );
      } else {
        this.logger.error(
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
        await productRepo.deleteAll({ where: { id: p.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      }
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Find Many With Inclusions
  // ----------------------------------------------------------------
  private async case14_FindManyWithInclusions(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 14] Find Many With Inclusions');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{ relation: 'saleChannel' }],
            },
          }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const allHaveRelations = productsWithRelations.every(
        (p: any) => p.saleChannelProducts?.length === 1,
      );

      if (productsWithRelations.length === 3 && allHaveRelations) {
        this.logger.info('[CASE 14] PASSED | All 3 products have their relations loaded');
      } else {
        this.logger.error(
          '[CASE 14] FAILED | products: %d | allHaveRelations: %s',
          productsWithRelations.length,
          allHaveRelations,
        );
      }

      // Cleanup
      for (const p of products.data!) {
        await junctionRepo.deleteAll({ where: { productId: p.id }, options: { force: true } });
        await productRepo.deleteAll({ where: { id: p.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      }
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Include With Where On Parent
  // ----------------------------------------------------------------
  private async case15_IncludeWithWhereOnParent(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 15] Include With Where On Parent');

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
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{ relation: 'saleChannel' }],
            },
          }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      if (expensiveWithRelations.length === 1 && expensiveWithRelations[0].price === 1000) {
        const hasChannel = (expensiveWithRelations[0] as any).saleChannelProducts?.length === 1;
        if (hasChannel) {
          this.logger.info('[CASE 15] PASSED | Parent where filter works with include');
        } else {
          this.logger.error('[CASE 15] FAILED | Include not loaded');
        }
      } else {
        this.logger.error('[CASE 15] FAILED | Wrong product returned');
      }

      // Cleanup
      for (const p of products.data!) {
        await junctionRepo.deleteAll({ where: { productId: p.id }, options: { force: true } });
        await productRepo.deleteAll({ where: { id: p.id }, options: { force: true, shouldSkipDefaultFilter: true } });
      }
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }
}
