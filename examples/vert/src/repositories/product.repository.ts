import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Product, productTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Product, dataSource: PostgresDataSource })
export class ProductRepository extends DefaultCRUDRepository<typeof productTable> {
  findByCode(opts: { code: string }) {
    return this.findOne({ filter: { where: { code: opts.code } } });
  }

  /** A nested include: the product, its junction rows, and the channel behind each. */
  findWithSaleChannels(opts: { productId: string }) {
    return this.findOne({
      filter: {
        where: { id: opts.productId },
        include: [
          { relation: 'saleChannelProducts', scope: { include: [{ relation: 'saleChannel' }] } },
        ],
      },
    });
  }
}
