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

/** Base DataSource with schema auto-discovery from registered repositories. */
export abstract class BaseDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
  constructor(opts: { name: string; config: Settings; schema?: Schema }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;

    if (opts.schema) {
      this.schema = opts.schema;
    }
  }

  /** Auto-discovers schema from repositories if not manually provided. */
  override getSchema(): Schema {
    if (!this.schema) {
      this.schema = this.discoverSchema();
    }
    return this.schema;
  }

  protected discoverSchema(): Schema {
    const registry = MetadataRegistry.getInstance();
    const metadata = registry.getDataSourceMetadata({ target: this.constructor });

    if (metadata?.autoDiscovery === false) {
      this.logger.for(this.discoverSchema.name).debug('Auto-discovery disabled for %s', this.name);
      return {} as Schema;
    }

    const { schema, relations } = registry.buildSchema({
      dataSource: this.constructor as TClass<IDataSource>,
    });

    const models = Object.keys(schema);
    this.logger
      .for(this.discoverSchema.name)
      .debug(
        'Detected model(s) | Name: %s | Count: %s | Models: %j',
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
      isolationLevel,
      connector: drizzle({ client, schema: this.schema }),

      get isActive() {
        return isActive;
      },

      commit: async () => {
        if (!isActive) {
          throw getError({ message: '[Transaction][commit] Transaction already ended' });
        }

        try {
          await client.query('COMMIT');
        } catch (error) {
          this.logger.for('commit').error('Failed to COMMIT transaction | Error: %s', error);
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
        } catch (error) {
          this.logger.for('rollback').error('Failed to ROLLBACK transaction | Error: %s', error);
        } finally {
          isActive = false;
          client.release();
        }
      },
    };
  }
}
