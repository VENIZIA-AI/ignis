import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { SaleChannelProduct } from '@/models/entities';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

/**
 * SaleChannelProductRepository (Junction Table Repository)
 *
 * Manages the many-to-many relationship between Product and SaleChannel.
 */
@repository({
  model: SaleChannelProduct,
  dataSource: PostgresDataSource,
})
export class SaleChannelProductRepository extends DefaultCRUDRepository<
  typeof SaleChannelProduct.schema
> {
  async findByProductId(productId: string) {
    return this.find({
      filter: {
        where: { productId },
        include: [{ relation: 'saleChannel' }],
      },
    });
  }

  async findBySaleChannelId(saleChannelId: string) {
    return this.find({
      filter: {
        where: { saleChannelId },
        include: [{ relation: 'product' }],
      },
    });
  }

  async findWithBothRelations() {
    return this.find({
      filter: {
        include: [{ relation: 'product' }, { relation: 'saleChannel' }],
      },
    });
  }
}
