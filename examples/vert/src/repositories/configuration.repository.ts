import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Configuration, configurationTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

/** `@repository` binds the model and the datasource; the class adds only its own queries. */
@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof configurationTable> {
  findByCode(opts: { code: string }) {
    return this.findOne({ filter: { where: { code: opts.code } } });
  }

  findByGroup(opts: { group: string }) {
    return this.find({ filter: { where: { group: opts.group } } });
  }
}
