import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Configuration } from '@/models/entities';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

/**
 * ConfigurationRepository with auto-resolution.
 *
 * Uses @repository decorator to bind to model and datasource.
 * No constructor needed - everything is auto-resolved!
 *
 * This repository:
 * - Auto-resolves Configuration model from @repository metadata
 * - Auto-resolves PostgresDataSource from @repository metadata
 * - Auto-builds relations from Configuration.relations static property
 */
@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {
  // No constructor needed!

  // Add custom methods as needed
  async findByCode(code: string) {
    return this.findOne({ filter: { where: { code } } });
  }

  async findByGroup(group: string) {
    return this.find({ filter: { where: { group } } });
  }
}
