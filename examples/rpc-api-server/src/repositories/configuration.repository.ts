import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Configuration, configurationTable } from '@/models/configuration.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: Configuration, dataSource: PGliteDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof configurationTable> {}
