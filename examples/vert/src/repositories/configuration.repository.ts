import { Configuration, TConfigurationSchema } from '@/models/entities';
import { IDataSource, inject, repository, ViewRepository } from '@vez/ignis';

@repository({})
export class ConfigurationRepository extends ViewRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({ dataSource, entityClass: Configuration });
  }
}
