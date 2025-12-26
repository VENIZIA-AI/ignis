import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { SaleChannel } from '@/models/entities';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

/**
 * SaleChannelRepository with auto-resolution.
 *
 * Uses @repository decorator to bind to model and datasource.
 */
@repository({
  model: SaleChannel,
  dataSource: PostgresDataSource,
})
export class SaleChannelRepository extends DefaultCRUDRepository<typeof SaleChannel.schema> {
  async findByCode(code: string) {
    return this.findOne({ filter: { where: { code } } });
  }

  async findActiveChannels() {
    return this.find({ filter: { where: { isActive: true } } });
  }

  async findWithProducts(saleChannelId: string) {
    return this.findOne({
      filter: {
        where: { id: saleChannelId },
        include: [{ relation: 'saleChannelProducts', scope: { include: [{ relation: 'product' }] } }],
      },
    });
  }
}
