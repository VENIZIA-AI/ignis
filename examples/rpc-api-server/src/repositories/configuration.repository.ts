import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Configuration, TConfigurationSchema } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {}
