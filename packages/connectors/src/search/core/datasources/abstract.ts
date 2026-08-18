import { AbstractDataSource } from '@venizia/ignis-kernel';
import type { ISearchConnector } from '@/search/core/connector';
import type { ISearchCollectionDefinition, TSearchSchema } from '@/search/core/models';
import type { ISearchQueryDialect, TMultiSearchEntry } from '@/search/core/repositories/common';

/** Engine contract only (connector, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource. */
export abstract class AbstractSearchDataSource<
  Settings extends object = {},
> extends AbstractDataSource<Settings, TSearchSchema> {
  abstract getConnector(): ISearchConnector;

  abstract getQueryDialect(): ISearchQueryDialect;

  abstract compileCollection(opts: { definition: ISearchCollectionDefinition }): unknown;
  abstract ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void>;

  /** Cross-collection search. Return is `unknown` because each engine's envelope differs (Typesense union, Meilisearch federation) and a concrete datasource narrows it; declared here so a datasource-generic repository can read it. */
  abstract multiSearch(opts: {
    searches: TMultiSearchEntry[];
    union?: boolean;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: unknown;
  }): Promise<unknown>;
}
