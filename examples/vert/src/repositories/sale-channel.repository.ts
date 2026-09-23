import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { SaleChannel, saleChannelTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: SaleChannel, dataSource: PostgresDataSource })
export class SaleChannelRepository extends DefaultCRUDRepository<typeof saleChannelTable> {
  findByCode(opts: { code: string }) {
    return this.findOne({ filter: { where: { code: opts.code } } });
  }

  findActiveChannels() {
    return this.find({ filter: { where: { isActive: true } } });
  }

  /** A nested include: the channel, its junction rows, and the product behind each. */
  findWithProducts(opts: { saleChannelId: string }) {
    return this.findOne({
      filter: {
        where: { id: opts.saleChannelId },
        include: [
          { relation: 'saleChannelProducts', scope: { include: [{ relation: 'product' }] } },
        ],
      },
    });
  }
}
