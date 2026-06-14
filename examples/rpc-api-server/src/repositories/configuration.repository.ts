import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Configuration, TConfigurationSchema } from '@/models/entities';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {}
