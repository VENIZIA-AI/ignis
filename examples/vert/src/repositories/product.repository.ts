import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Product } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

/**
 * ProductRepository with auto-resolution.
 *
 * Uses @repository decorator to bind to model and datasource.
 */
@repository({ model: Product, dataSource: PostgresDataSource })
export class ProductRepository extends DefaultCRUDRepository<typeof Product.schema> {
  async findByCode(code: string) {
    return this.findOne({ filter: { where: { code } } });
  }

  async findWithSaleChannels(productId: string) {
    return this.findOne({
      filter: {
        where: { id: productId },
        include: [
          { relation: 'saleChannelProducts', scope: { include: [{ relation: 'saleChannel' }] } },
        ],
      },
    });
  }
}
