import { AbstractDataSource } from '@/base/datasources';
import type { ISearchConnector } from '@/connectors/search/connector';
import type { ISearchCollectionDefinition, TSearchSchema } from '@/connectors/search/models';
import type {
  ISearchQueryDialect,
  TMultiSearchEntry,
} from '@/connectors/search/repositories/common';

/** Engine contract only (connector, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource. */
export abstract class AbstractSearchDataSource<
  Settings extends object = {},
> extends AbstractDataSource<Settings, TSearchSchema> {
  abstract getConnector(): ISearchConnector;

  abstract getQueryDialect(): ISearchQueryDialect;

  abstract compileCollection(opts: { definition: ISearchCollectionDefinition }): unknown;
  abstract ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void>;

  /** Cross-collection search. The neutral return is `unknown` because each engine's multi-search
   * envelope differs (Typesense `results[]`/union, Meilisearch `results[]`/federation); a concrete
   * datasource narrows it. Declared here so a repository generic over its datasource can read it. */
  abstract multiSearch(opts: {
    searches: TMultiSearchEntry[];
    union?: boolean;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: unknown;
  }): Promise<unknown>;
}
