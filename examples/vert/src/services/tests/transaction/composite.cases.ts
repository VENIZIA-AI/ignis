import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Composite Cases - multiple repositories or related entities coordinated in one transaction
// ----------------------------------------------------------------
export class CompositeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 11: Multiple Repositories in One Transaction
  // ----------------------------------------------------------------
  async case11MultipleRepositoriesInTransaction(): Promise<void> {
    const configRepo = this.context.configurationRepository;
    const productRepo = this.context.productRepository;
    this.context.logCase('[CASE 11] Multiple Repositories in One Transaction');

    const configCode = `TX_MULTI_CFG_${getUID()}`;
    const productCode = `TX_MULTI_PRD_${getUID()}`;
    const transaction = await configRepo.beginTransaction();

    try {
      // Create in configuration repository
      await configRepo.create({
        data: { code: configCode, group: 'TX_MULTI_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });

      // Create in product repository using same transaction
      await productRepo.create({
        data: { code: productCode, name: 'TX Test Product', price: 50 },
        options: { transaction, shouldSkipDefaultFilter: true },
      });

      await transaction.commit();

      // Verify both records exist
      const config = await configRepo.findOne({ filter: { where: { code: configCode } } });
      const product = await productRepo.findOne({
        filter: { where: { code: productCode } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (config && product) {
        this.context.logger.info('[CASE 11] PASSED | Both repos committed in same transaction');
      } else {
        this.context.logger.error(
          '[CASE 11] FAILED | config: %j | product: %j',
          !!config,
          !!product,
        );
      }

      // Cleanup
      await configRepo.deleteAll({ where: { code: configCode } });
      await productRepo.deleteAll({
        where: { code: productCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 11] FAILED with error: %o', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Transaction With Related Entities
  // ----------------------------------------------------------------
  async case17TransactionWithRelatedEntities(): Promise<void> {
    const productRepo = this.context.productRepository;
    const saleChannelRepo = this.context.saleChannelRepository;
    const junctionRepo = this.context.saleChannelProductRepository;
    this.context.logCase('[CASE 17] Transaction With Related Entities');

    const productCode = `TX_REL_PROD_${getUID()}`;
    const channelCode = `TX_REL_CHAN_${getUID()}`;
    const transaction = await productRepo.beginTransaction();

    try {
      // Create product
      const product = await productRepo.create({
        data: { code: productCode, name: 'TX Related Product', price: 100 },
        options: { transaction, shouldSkipDefaultFilter: true },
      });

      // Create sale channel
      const channel = await saleChannelRepo.create({
        data: { code: channelCode, name: 'TX Related Channel' },
        options: { transaction },
      });

      // Create junction record linking them
      await junctionRepo.create({
        data: {
          productId: product.data.id,
          saleChannelId: channel.data.id,
        },
        options: { transaction },
      });

      await transaction.commit();

      // Verify all records exist with relations
      const productWithRelations = await productRepo.findOne({
        filter: {
          where: { code: productCode },
          include: [{ relation: 'saleChannelProducts' }],
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const saleChannelProducts = (productWithRelations as any)?.saleChannelProducts;
      if (saleChannelProducts?.length === 1) {
        this.context.logger.info('[CASE 17] PASSED | All related entities committed together');
      } else {
        this.context.logger.error(
          '[CASE 17] FAILED | Relations not correct | got: %d',
          saleChannelProducts?.length,
        );
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await productRepo.deleteAll({
        where: { code: productCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
      await saleChannelRepo.deleteAll({ where: { code: channelCode }, options: { force: true } });
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 17] FAILED with error: %o', error);
    }
  }
}
