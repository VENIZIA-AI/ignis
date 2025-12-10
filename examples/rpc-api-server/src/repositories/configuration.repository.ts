import { Configuration, TConfigurationSchema } from '@/models/entities';
import { DefaultCRUDRepository, IDataSource, inject, repository } from '@venizia/ignis';

@repository({})
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({
      dataSource,
      entityClass: Configuration,
      relations: {},
    });
  }
}