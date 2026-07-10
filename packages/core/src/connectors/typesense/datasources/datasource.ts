import type { ISearchableDataSourceCapabilities } from '@/base/datasources';
import type { ISearchCollectionDefinition } from '@/connectors/search/models';
import type {
  ISearchQueryDialect,
  TMultiSearchEntry,
} from '@/connectors/search/repositories/common';
import { getError } from '@venizia/ignis-helpers';
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
} from '../types';
import type { ISearchDataSourceOptions } from '@/connectors/search/datasources/common';
import { BaseSearchDataSource } from '@/connectors/search/datasources';

/** Typesense-backed search datasource: builds/injects a connector, compiles the neutral DSL, and provisions discovered collections. */
export class TypesenseDataSource extends BaseSearchDataSource<ITypesenseDataSourceSettings> {
  /** Stateless dialect - shared across every TypesenseDataSource instance. */
  private static readonly queryDialect: ISearchQueryDialect = new TypesenseQueryDialect();

  private readonly injectedConnector?: TypesenseConnector;
  private connector?: TypesenseConnector;

  constructor(
    opts: ISearchDataSourceOptions<ITypesenseDataSourceSettings> & {
      connector?: TypesenseConnector;
    },
  ) {
    super(opts);

    this.injectedConnector = opts.connector;
  }

  /** Builds the connector (unless injected, e.g. for tests), then provisions collections. Re-entrant-safe: a second call is a logged no-op, not a re-provision. */
  async configure(): Promise<void> {
    if (this.connector) {
      this.logger
        .for(this.configure.name)
        .info('Already configured | Name: %s | Skipping re-provisioning', this.name);
      return;
    }

    this.connector =
      this.injectedConnector ??
      new TypesenseConnector({
        name: this.name,
        ...this.settings,
      } satisfies ITypesenseConnectorOptions);

    await this.provisionCollections();
  }

  getConnector(): TypesenseConnector {
    if (!this.connector) {
      throw getError({
        message: `[TypesenseDataSource] Connector not initialized | Name: ${this.name} | Call configure() first`,
      });
    }

    return this.connector;
  }

  getClient(): Client {
    return this.getConnector().getClient();
  }

  getQueryDialect(): ISearchQueryDialect {
    return TypesenseDataSource.queryDialect;
  }

  /** Narrows the neutral `Promise<unknown>` to Typesense's own multi-search envelopes: `results[]`
   * side by side, or ONE merged result set when `union` is set. */
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

  /** Search capabilities Typesense supports. */
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
