import { PGliteDataSource } from '@/datasources/pglite.datasource';
import { Configuration, type configurationTable } from '@/models/configuration.model';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';

@repository({ model: Configuration, dataSource: PGliteDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof configurationTable> {}
