import type { ISearchableDataSourceCapabilities } from '@/base/datasources';
import type { ISearchDataSourceOptions } from '@/connectors/search/datasources/common';
import { BaseSearchDataSource } from '@/connectors/search/datasources';
import type { ISearchCollectionDefinition } from '@/connectors/search/models';
import type { ISearchQueryDialect } from '@/connectors/search/repositories/common';
import { getError } from '@venizia/ignis-helpers';
import type { Meilisearch } from 'meilisearch';
import type { IMeilisearchIndexPlan } from '../compiler';
import { compileMeilisearchCollection } from '../compiler';
import { MeilisearchConnector } from '../connector';
import { MeilisearchQueryDialect } from '../repositories/dialect/query-dialect';
import type { IMeilisearchConnectorOptions, IMeilisearchDataSourceSettings } from '../types';

/** Meilisearch-backed search datasource: builds/injects a connector, compiles the neutral DSL, and provisions discovered collections. */
export class MeilisearchDataSource extends BaseSearchDataSource<IMeilisearchDataSourceSettings> {
  /** Stateless dialect - shared across every MeilisearchDataSource instance. */
  private static readonly queryDialect: ISearchQueryDialect = new MeilisearchQueryDialect();

  private readonly injectedConnector?: MeilisearchConnector;
  private connector?: MeilisearchConnector;

  constructor(
    opts: ISearchDataSourceOptions<IMeilisearchDataSourceSettings> & {
      connector?: MeilisearchConnector;
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
      new MeilisearchConnector({
        name: this.name,
        ...this.settings,
      } satisfies IMeilisearchConnectorOptions);

    await this.provisionCollections();
  }

  getConnector(): MeilisearchConnector {
    if (!this.connector) {
      throw getError({
        message: `[MeilisearchDataSource] Connector not initialized | Name: ${this.name} | Call configure() first`,
      });
    }

    return this.connector;
  }

  getClient(): Meilisearch {
    return this.getConnector().getClient();
  }

  getQueryDialect(): ISearchQueryDialect {
    return MeilisearchDataSource.queryDialect;
  }

  /**
   * `union: false` is honest: Meilisearch merges results through its `federation` option, which this
   * connector does not model, so `multiSearch` is batched-but-not-merged.
   */
  override getCapabilities(): ISearchableDataSourceCapabilities {
    return {
      transactions: false,
      search: {
        vector: true,
        multi: true,
        union: false,
        synonyms: true,
      },
    };
  }

  compileCollection(opts: { definition: ISearchCollectionDefinition }): IMeilisearchIndexPlan {
    return compileMeilisearchCollection(opts);
  }

  async ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void> {
    const schema = this.compileCollection(opts);
    await this.getConnector().collection.ensure({ schema });
  }
}
