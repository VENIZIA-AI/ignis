import type { ISearchableDataSourceCapabilities } from '@venizia/ignis-kernel';
import type { ISearchCollectionDefinition } from '@/search/core/models';
import type { ISearchQueryDialect, TMultiSearchEntry } from '@/search/core/repositories/common';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type { Client } from 'typesense';
import { compileTypesenseCollection } from '../compiler';
import { TypesenseConnector } from '../connector';
import { TypesenseQueryDialect } from '../repositories/dialect/query-dialect';
import type {
  IMultiSearchResult,
  ITypesenseDataSourceSettings,
  ITypesenseConnectorOptions,
  IUnionSearchResult,
  TDocumentSchema,
  TSearchOptions,
} from '../common';
import { BaseSearchDataSource } from '@/search/core/datasources';

/** Typesense-backed search datasource: builds/injects a connector, compiles the neutral DSL, and provisions discovered collections. */
export class TypesenseDataSource extends BaseSearchDataSource<
  ITypesenseDataSourceSettings,
  TypesenseConnector
> {
  /** Stateless dialect - shared across every TypesenseDataSource instance. */
  private static readonly queryDialect: ISearchQueryDialect = new TypesenseQueryDialect();

  protected createConnector(): TypesenseConnector {
    return new TypesenseConnector({
      name: this.name,
      ...this.settings,
    } satisfies ITypesenseConnectorOptions);
  }

  getClient(): Client {
    return this.getConnector().getClient();
  }

  getQueryDialect(): ISearchQueryDialect {
    return TypesenseDataSource.queryDialect;
  }

  /** Narrows the neutral `Promise<unknown>` to Typesense's own multi-search envelopes: `results[]` side by side, or ONE merged result set when `union` is set. */
  override multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: TMultiSearchEntry[];
    union: true;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: TSearchOptions;
  }): Promise<IUnionSearchResult<T>>;
  override multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: TMultiSearchEntry[];
    union?: false;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: TSearchOptions;
  }): Promise<IMultiSearchResult<T>>;
  override multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: TMultiSearchEntry[];
    union?: boolean;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: TSearchOptions;
  }): Promise<IMultiSearchResult<T> | IUnionSearchResult<T>>;
  override multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
    searches: TMultiSearchEntry[];
    union?: boolean;
    commonParams?: Omit<TMultiSearchEntry, 'collection'>;
    options?: TSearchOptions;
  }): Promise<IMultiSearchResult<T> | IUnionSearchResult<T>> {
    return super.multiSearch(opts) as Promise<IMultiSearchResult<T> | IUnionSearchResult<T>>;
  }

  override getCapabilities(): ISearchableDataSourceCapabilities {
    return {
      transactions: false,
      search: {
        vector: true,
        multi: true,
        union: true,
        synonyms: true,
      },
    };
  }

  compileCollection(opts: { definition: ISearchCollectionDefinition }): CollectionCreateSchema {
    return compileTypesenseCollection(opts);
  }

  async ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void> {
    const schema = this.compileCollection(opts);
    await this.getConnector().collection.ensure({ schema });
  }
}
