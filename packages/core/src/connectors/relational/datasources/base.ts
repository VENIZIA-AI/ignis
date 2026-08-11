import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { IDataSource, TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractRelationalDataSource } from './abstract';
import type { IRelationalTransaction, TRelationalTransactionOptions } from './common';

/** Base DataSource with schema auto-discovery from registered repositories. */
export abstract class BaseRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
  TConnector = unknown,
> extends AbstractRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector> {
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

    // buildSchema() is shared by every connector so it returns Record<string, unknown>; the cast narrows back to the Drizzle schema shape.
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
    opts?: TRelationalTransactionOptions,
  ): Promise<IRelationalTransaction<TConnector>> {
    const driver = this.resolveDriver();
    const connection = await driver.acquire({ schema: this.getSchema() });

    try {
      await connection.execute({ statement: this.buildBeginStatement(opts) });
    } catch (error) {
      this.logger.for('beginTransaction').error('Failed to BEGIN transaction | Error: %s', error);

      // No caller ever receives a handle to release this connection, so leaking it exhausts the pool; destroyed rather than pooled because session state after a failed BEGIN is unknown.
      connection.release({ destroy: true });
      throw error;
    }

    let isActive = true;
    let isEndedByFailure = false;

    /** On failure the connection is discarded rather than pooled - the next borrower would inherit an open transaction - and the error rethrown: a caller must never believe a failed COMMIT succeeded. */
    const finish = async (finishOpts: { statement: string; verb: string }): Promise<void> => {
      const { statement, verb } = finishOpts;

      if (!isActive) {
        // After a FAILED commit/rollback the transaction is already torn down, so rollback is satisfied by construction - throwing here would replace the caller's original error in `catch { await tx.rollback(); throw error; }`.
        if (isEndedByFailure && verb === 'rollback') {
          this.logger
            .for(verb)
            .debug('Rollback after a failure-ended transaction - no-op, already torn down');
          return;
        }

        throw getError({ message: `[Transaction][${verb}] Transaction already ended` });
      }

      // Flipped BEFORE the await: commit racing rollback would otherwise both pass the guard, issue two control statements, and double-release the same physical connection.
      isActive = false;

      try {
        await connection.execute({ statement });
      } catch (error) {
        this.logger.for(verb).error('Failed to %s transaction | Error: %s', statement, error);
        isEndedByFailure = true;
        connection.release({ destroy: true });
        throw error;
      }

      connection.release();
    };

    return {
      connector: connection.connector,

      get isActive() {
        return isActive;
      },

      commit: () => finish({ statement: 'COMMIT', verb: 'commit' }),
      rollback: () => finish({ statement: 'ROLLBACK', verb: 'rollback' }),
    };
  }

  /** The engine's own BEGIN. Postgres interpolates an isolation level; SQLite has none and uses `BEGIN IMMEDIATE`. Never parameterized - `BEGIN ... ISOLATION LEVEL $1` is not valid SQL. */
  protected abstract buildBeginStatement(opts?: TRelationalTransactionOptions): string;
}
