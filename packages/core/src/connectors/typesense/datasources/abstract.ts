import { AbstractDataSource } from '@/base/datasources';
import type { ISearchCollectionDefinition, TSearchSchema } from '@/connectors/typesense/models';
import type { ISearchQueryDialect } from '@/connectors/typesense/repositories/common';
import type { ISearchConnector } from '../connector';

/** Engine contract only (connector, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource. */
export abstract class AbstractSearchDataSource<
  Settings extends object = {},
> extends AbstractDataSource<Settings, TSearchSchema> {
  abstract getConnector(): ISearchConnector;

  abstract getQueryDialect(): ISearchQueryDialect;

  abstract compileCollection(opts: { definition: ISearchCollectionDefinition }): unknown;
  abstract ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void>;
}
