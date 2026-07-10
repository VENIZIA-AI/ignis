import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import type { IDataSource, TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractRelationalDataSource } from './abstract';
import type { IDatabaseTransaction, IDatabaseTransactionOptions, TIsolationLevel } from './common';
import { IsolationLevels } from './common';

/** Base DataSource with schema auto-discovery from registered repositories. */
export abstract class BaseRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractRelationalDataSource<Settings, Schema, ConfigurableOptions> {
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

    // buildSchema() is shared by every connector so it returns Record<string, unknown>; narrow
    // it back to the real Drizzle schema shape here.
    return { ...schema, ...relations } as Schema;
  }

  hasDiscoverableModels(): boolean {
    const registry = MetadataRegistry.getInstance();
    return registry.hasModels({ dataSource: this.constructor as TClass<IDataSource> });
  }

  override getCapabilities() {
    return { transactions: true };
  }

  override async beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>> {
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
          isActive = false;
          // COMMIT failed, so the session may still hold an open transaction. Returning it to the
          // pool would hand that transaction to the next borrower; a truthy arg destroys it instead.
          client.release(error as Error);
          throw error;
        }

        isActive = false;
        client.release();
      },

      rollback: async () => {
        if (!isActive) {
          throw getError({ message: '[Transaction][rollback] Transaction already ended' });
        }

        try {
          await client.query('ROLLBACK');
        } catch (error) {
          this.logger.for('rollback').error('Failed to ROLLBACK transaction | Error: %s', error);
          isActive = false;
          client.release(error as Error);
          throw error;
        }

        isActive = false;
        client.release();
      },
    };
  }
}
