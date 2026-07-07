import { ISearchCollectionDefinition } from '@/connectors/typesense/models';
import { ISearchQueryDialect } from '@/connectors/typesense/repositories/common';
import { getError } from '@venizia/ignis-helpers';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { compileTypesenseCollection } from '../compiler';
import { ITypesenseClientLike, TypesenseDriver } from '../driver';
import { TypesenseQueryDialect } from '../repositories/dialect/query-dialect';
import {
    ISearchDataSourceOptions,
    ITypesenseDataSourceSettings,
    ITypesenseDriverOptions,
} from '../types';
import { BaseSearchDataSource } from './base';

/** Typesense-backed search datasource: builds/injects a driver, compiles the neutral DSL, and provisions discovered collections. */
export class TypesenseDataSource extends BaseSearchDataSource<ITypesenseDataSourceSettings> {
  /** Stateless dialect - shared across every TypesenseDataSource instance. */
  private static readonly queryDialect: ISearchQueryDialect = new TypesenseQueryDialect();

  private readonly injectedDriver?: TypesenseDriver;
  private driver?: TypesenseDriver;

  constructor(
    opts: ISearchDataSourceOptions<ITypesenseDataSourceSettings> & { driver?: TypesenseDriver },
  ) {
    super(opts);

    this.injectedDriver = opts.driver;
  }

  /** Builds the driver (unless injected, e.g. for tests), then provisions collections. Re-entrant-safe: a second call is a logged no-op, not a re-provision. */
  async configure(): Promise<void> {
    if (this.driver) {
      this.logger
        .for(this.configure.name)
        .info('Already configured | Name: %s | Skipping re-provisioning', this.name);
      return;
    }

    this.driver =
      this.injectedDriver ??
      new TypesenseDriver({ name: this.name, ...this.settings } satisfies ITypesenseDriverOptions);

    await this.provisionCollections();
  }

  getDriver(): TypesenseDriver {
    if (!this.driver) {
      throw getError({
        message: `[TypesenseDataSource] Driver not initialized | Name: ${this.name} | Call configure() first`,
      });
    }

    return this.driver;
  }

  getClient(): ITypesenseClientLike {
    return this.getDriver().getClient();
  }

  getQueryDialect(): ISearchQueryDialect {
    return TypesenseDataSource.queryDialect;
  }

  compileCollection(opts: { definition: ISearchCollectionDefinition }): CollectionCreateSchema {
    return compileTypesenseCollection(opts);
  }

  async ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void> {
    const schema = this.compileCollection(opts);
    await this.getDriver().ensureCollection({ schema });
  }
}
