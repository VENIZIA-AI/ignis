import { AbstractDataSource } from '@/base/datasources';
import { ISearchCollectionDefinition, TSearchSchema } from '@/connectors/typesense/models';
import { ISearchQueryDialect } from '@/connectors/typesense/repositories/common';
import { ISearchDriver } from '../driver';

/** Engine contract only (driver, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource. */
export abstract class AbstractSearchDataSource<
  Settings extends object = {},
> extends AbstractDataSource<Settings, TSearchSchema> {
  abstract getDriver(): ISearchDriver;

  abstract getQueryDialect(): ISearchQueryDialect;

  abstract compileCollection(opts: { definition: ISearchCollectionDefinition }): unknown;
  abstract ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void>;
}
