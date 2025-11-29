import { Configuration } from '@/models/entities';
import { IDataSource, inject, repository, ViewRepository } from '@vez/ignis';

@repository({})
export class ConfigurationRepository extends ViewRepository<Configuration> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) postgresDs: IDataSource,
  ) {
    super({
      dataSource: postgresDs,
      entityClass: Configuration,
    });
  }
}
