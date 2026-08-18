import type { ISearchableDataSourceCapabilities } from '@venizia/ignis-kernel';
import { BaseSearchDataSource } from '@/search/core/datasources';
import type { ISearchCollectionDefinition } from '@/search/core/models';
import type { ISearchQueryDialect } from '@/search/core/repositories/common';
import type { Meilisearch } from 'meilisearch';
import type { IMeilisearchIndexPlan } from '../compiler';
import { compileMeilisearchCollection } from '../compiler';
import { MeilisearchConnector } from '../connector';
import { MeilisearchQueryDialect } from '../repositories/dialect/query-dialect';
import type { IMeilisearchConnectorOptions, IMeilisearchDataSourceSettings } from '../types';

/** Meilisearch-backed search datasource: builds/injects a connector, compiles the neutral DSL, and provisions discovered collections. */
export class MeilisearchDataSource extends BaseSearchDataSource<
  IMeilisearchDataSourceSettings,
  MeilisearchConnector
> {
  /** Stateless dialect - shared across every MeilisearchDataSource instance. */
  private static readonly queryDialect: ISearchQueryDialect = new MeilisearchQueryDialect();

  protected createConnector(): MeilisearchConnector {
    return new MeilisearchConnector({
      name: this.name,
      ...this.settings,
    } satisfies IMeilisearchConnectorOptions);
  }

  getClient(): Meilisearch {
    return this.getConnector().getClient();
  }

  getQueryDialect(): ISearchQueryDialect {
    return MeilisearchDataSource.queryDialect;
  }

  /** `union: false` is honest: Meilisearch merges results through its `federation` option, which this connector does not model, so `multiSearch` is batched-but-not-merged. */
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
