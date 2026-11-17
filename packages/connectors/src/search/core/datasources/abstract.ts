import { AbstractDataSource } from '@venizia/ignis-kernel/repository';
import type { ISearchConnector } from '@/search/core/connector';
import type { ISearchCollectionDefinition, TSearchSchema } from '@/search/core/models';
import type { ISearchQueryDialect, TMultiSearchEntry } from '@/search/core/repositories/common';

/** Engine contract only (connector, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource. */
export abstract class AbstractSearchDataSource<
  Settings extends object = {},
> extends AbstractDataSource<Settings, TSearchSchema> {
  /** Phantom, never set at runtime: the engine's typed tuning knobs, read by `SearchControllerFactory.build` to type `query`. A datasource that does not bind it leaves `query.tuning` closed; `TypesenseDataSource` binds `ITypesenseTuning`. */
  declare readonly $inferTuning?: unknown;

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
