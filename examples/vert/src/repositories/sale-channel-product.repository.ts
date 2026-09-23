import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { SaleChannelProduct, saleChannelProductTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: SaleChannelProduct, dataSource: PostgresDataSource })
export class SaleChannelProductRepository extends DefaultCRUDRepository<
  typeof saleChannelProductTable
> {
  findByProductId(opts: { productId: string }) {
    return this.find({
      filter: { where: { productId: opts.productId }, include: [{ relation: 'saleChannel' }] },
    });
  }

  findBySaleChannelId(opts: { saleChannelId: string }) {
    return this.find({
      filter: { where: { saleChannelId: opts.saleChannelId }, include: [{ relation: 'product' }] },
    });
  }

  findWithBothRelations() {
    return this.find({
      filter: { include: [{ relation: 'product' }, { relation: 'saleChannel' }] },
    });
  }
}
