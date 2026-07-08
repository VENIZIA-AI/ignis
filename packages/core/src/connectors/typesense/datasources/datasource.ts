import { ISearchableDataSourceCapabilities } from '@/base/datasources';
import { ISearchCollectionDefinition } from '@/connectors/typesense/models';
import { ISearchQueryDialect } from '@/connectors/typesense/repositories/common';
import { getError } from '@venizia/ignis-helpers';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { Client } from 'typesense';
import { compileTypesenseCollection } from '../compiler';
import { TypesenseConnector } from '../connector';
import { TypesenseQueryDialect } from '../repositories/dialect/query-dialect';
import {
  ISearchDataSourceOptions,
  ITypesenseDataSourceSettings,
  ITypesenseConnectorOptions,
} from '../types';
import { BaseSearchDataSource } from './base';

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
    await this.getConnector().ensureCollection({ schema });
  }
}
