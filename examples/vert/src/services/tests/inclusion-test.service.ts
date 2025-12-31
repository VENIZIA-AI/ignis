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

    await this.case1_SetupAndBasicInclude();
    await this.case2_ProductWithSaleChannels();
    await this.case3_SaleChannelWithProducts();
    await this.case4_JunctionTableWithBothRelations();
    await this.case5_NestedInclusion();
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
  // ----------------------------------------------------------------
  private async case4_JunctionTableWithBothRelations(): Promise<void> {
    const saleChannelProductRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 4] Find junction table with both relations');

    try {
      const allRelations = await saleChannelProductRepo.find({
        filter: {
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
}
