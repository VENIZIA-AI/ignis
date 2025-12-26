import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, TClass, ValueOrPromise } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient } from 'pg';
import {
  IDataSource,
  IsolationLevels,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
  TIsolationLevel,
  TNodePostgresConnector,
} from './common';

// --------------------------------------------------------------------------------------
export abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IDataSource<Settings, Schema, ConfigurableOptions>
{
  name: string;
  settings: Settings;
  connector: TNodePostgresConnector<Schema>;
  schema: Schema;

  protected pool: Pool;

  abstract configure(opts?: ConfigurableOptions): ValueOrPromise<void>;
  abstract getConnectionString(): ValueOrPromise<string>;
  abstract beginTransaction(opts?: ITransactionOptions): Promise<ITransaction<Schema>>;

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
 * - Schema auto-discovered from registered repositories
 *
 * Usage:
 * ```typescript
 * @datasource({})
 * export class PostgresDataSource extends BaseDataSource<IDbConfig> {
 *   constructor() {
 *     super({
 *       name: PostgresDataSource.name,
 *       config: { host: '...', port: 5432, ... },
 *       // schema auto-discovered from repositories
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
  /**
   * @param opts.name - DataSource name (usually class name)
   * @param opts.config - Database connection settings
   * @param opts.schema - Optional, auto-discovered from repositories if not provided
   */
  constructor(opts: { name: string; config: Settings; schema?: Schema }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;

    if (opts.schema) {
      this.schema = opts.schema;
    }
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

  // ---------------------------------------------------------------------------
  // Transaction Support
  // ---------------------------------------------------------------------------
  async beginTransaction(opts?: ITransactionOptions): Promise<ITransaction<Schema>> {
    if (!this.pool) {
      throw getError({
        message: `[${this.constructor.name}][beginTransaction] Pool not initialized. Set this.pool in configure().`,
      });
    }

    const client: PoolClient = await this.pool.connect();
    const isolationLevel: TIsolationLevel = opts?.isolationLevel ?? IsolationLevels.READ_COMMITTED;

    await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    let isActive = true;

    return {
      connector: drizzle({ client, schema: this.schema }),
      get isActive() {
        return isActive;
      },
      isolationLevel,

      commit: async () => {
        if (!isActive) {
          throw getError({ message: '[Transaction][commit] Transaction already ended' });
        }

        try {
          await client.query('COMMIT');
        } finally {
          isActive = false;
          client.release();
        }
      },

      rollback: async () => {
        if (!isActive) {
          throw getError({ message: '[Transaction][rollback] Transaction already ended' });
        }

        try {
          await client.query('ROLLBACK');
        } finally {
          isActive = false;
          client.release();
        }
      },
    };
  }
}
