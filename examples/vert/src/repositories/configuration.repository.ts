import {
  Configuration,
  configurationRelations,
  TConfigurationSchema,
} from '@/models/entities';
import { DefaultCRUDRepository, IDataSource, inject, repository } from '@vez/ignis';

@repository({})
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    console.log(configurationRelations);
    super({
      dataSource,
      entityClass: Configuration,
      relations: configurationRelations.definitions,
    });
  }
}
