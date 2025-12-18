import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, TClass, ValueOrPromise } from '@venizia/ignis-helpers';
import {
  IDataSource,
  TAnyDatasourceSchema,
  TDatabaseConnector,
  TDataSourceDriver,
  TNodePostgresConnector,
} from './types';

// --------------------------------------------------------------------------------------
export abstract class AbstractDataSource<
  Connector extends TDatabaseConnector = TNodePostgresConnector,
  Settings extends object = {},
  Schema extends TAnyDatasourceSchema = {},
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IDataSource<Connector, Settings, Schema, ConfigurableOptions>
{
  name: string;
  settings: Settings;
  connector: Connector;
  schema: Schema;
  protected driver: TDataSourceDriver;

  abstract configure(opts?: ConfigurableOptions): ValueOrPromise<void>;
  abstract getConnectionString(): ValueOrPromise<string>;

  getSettings() {
    return this.settings;
  }

  getConnector() {
    return this.connector;
  }

  getSchema(): Schema {
    if (!this.schema) {
      throw getError({
        message: `[${this.constructor.name}] Schema not initialized. Override getSchema() or provide schema in constructor.`,
      });
    }
    return this.schema;
  }
}

// --------------------------------------------------------------------------------------
/**
 * Base DataSource with auto-discovery support.
 *
 * Features:
 * - Driver is read from @datasource decorator (no need to pass in constructor)
 * - Schema auto-discovered from registered repositories
 *
 * Usage:
 * ```typescript
 * @datasource({ driver: 'node-postgres' })
 * export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDbConfig> {
 *   constructor() {
 *     super({
 *       name: PostgresDataSource.name,
 *       config: { host: '...', port: 5432, ... },
 *       // driver read from @datasource decorator
 *       // schema auto-discovered from repositories
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseDataSource<
  Connector extends TDatabaseConnector = TNodePostgresConnector,
  Settings extends object = {},
  Schema extends TAnyDatasourceSchema = {},
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Connector, Settings, Schema, ConfigurableOptions> {
  /**
   * @param opts.name - DataSource name (usually class name)
   * @param opts.config - Database connection settings
   * @param opts.driver - Optional, read from @datasource decorator if not provided
   * @param opts.schema - Optional, auto-discovered from repositories if not provided
   */
  constructor(opts: {
    name: string;
    config: Settings;
    driver?: TDataSourceDriver;
    schema?: Schema;
  }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;
    this.driver = opts.driver ?? this.resolveDriver();

    if (opts.schema) {
      this.schema = opts.schema;
    }
  }

  private resolveDriver(): TDataSourceDriver {
    const registry = MetadataRegistry.getInstance();
    const metadata = registry.getDataSourceMetadata({ target: this.constructor });

    if (!metadata?.driver) {
      throw getError({
        message: `[${this.constructor.name}] Driver not available. Use @datasource({ driver: '...' }) decorator or pass driver in constructor.`,
      });
    }

    return metadata.driver;
  }

  /**
   * Get the schema - auto-discovers if not manually provided.
   */
  override getSchema(): Schema {
    if (!this.schema) {
      this.schema = this.discoverSchema();
    }
    return this.schema;
  }

  /**
   * Build schema from registered repositories that reference this datasource.
   */
  protected discoverSchema(): Schema {
    const registry = MetadataRegistry.getInstance();
    const metadata = registry.getDataSourceMetadata({ target: this.constructor });

    if (metadata?.autoDiscovery === false) {
      this.logger.debug('[discoverSchema] Auto-discovery disabled for %s', this.name);
      return {} as Schema;
    }

    const { schema, relations } = registry.buildSchema({
      dataSource: this.constructor as TClass<IDataSource>,
    });

    const models = Object.keys(schema);
    this.logger.debug(
      '[discoverSchema][%s] Detected %s model(s) | Model(s): %j',
      this.name,
      models.length,
      models,
    );

    return { ...schema, ...relations } as Schema;
  }

  hasDiscoverableModels(): boolean {
    const registry = MetadataRegistry.getInstance();
    return registry.hasModels({ dataSource: this.constructor as TClass<IDataSource> });
  }
}
