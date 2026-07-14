import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { IDataSource, TAnyDataSourceSchema } from '@/base/datasources';
// Type-only: erased at compile time, so the no-eager-import guard is unaffected.
import type { Pool } from 'pg';
import { AbstractRelationalDataSource } from './abstract';
import type { IDatabaseTransaction, IDatabaseTransactionOptions, TIsolationLevel } from './common';
import { IsolationLevels } from './common';

/** Base DataSource with schema auto-discovery from registered repositories. */
export abstract class BaseRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends AbstractRelationalDataSource<Settings, Schema, ConfigurableOptions, Client> {
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
    const driver = this.resolveDriver();
    const connection = await driver.acquire({ schema: this.getSchema() });
    const isolationLevel: TIsolationLevel = opts?.isolationLevel ?? IsolationLevels.READ_COMMITTED;

    // `isolationLevel` comes from the IsolationLevels const-class, never from user input. It must be
    // interpolated: `BEGIN TRANSACTION ISOLATION LEVEL $1` is not valid SQL, and postgres-js tagged
    // templates would bind it as a query parameter.
    try {
      await connection.execute({
        statement: `BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`,
      });
    } catch (error) {
      this.logger.for('beginTransaction').error('Failed to BEGIN transaction | Error: %s', error);

      // The connection was checked out but no caller ever receives a handle to release it - leaking
      // here exhausts the pool under repeated BEGIN failures. Destroyed rather than pooled: the
      // session state after a failed BEGIN is unknown.
      connection.release({ destroy: true });
      throw error;
    }

    let isActive = true;
    let isEndedByFailure = false;

    /**
     * Ends the transaction with `statement`. On failure the connection is discarded rather than
     * pooled - the session may still hold an open transaction that the next borrower would inherit
     * - and the error is rethrown, because a caller must never believe a failed COMMIT succeeded.
     */
    const finish = async (finishOpts: { statement: string; verb: string }): Promise<void> => {
      const { statement, verb } = finishOpts;

      if (!isActive) {
        // The canonical caller pattern is `catch { await tx.rollback(); throw error; }`. After a
        // FAILED commit/rollback the transaction is already torn down - nothing committed, the
        // connection destroyed - so a rollback request is satisfied by construction. Throwing
        // 'already ended' here would replace the caller's original error in every such catch block.
        if (isEndedByFailure && verb === 'rollback') {
          this.logger
            .for(verb)
            .debug('Rollback after a failure-ended transaction - no-op, already torn down');
          return;
        }

        throw getError({ message: `[Transaction][${verb}] Transaction already ended` });
      }

      // Flipped BEFORE the await, not after: two concurrent finish() calls (commit racing rollback)
      // would otherwise both pass the guard, issue two control statements, and double-release the
      // same physical connection.
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
      isolationLevel,
      connector: connection.connector,

      get isActive() {
        return isActive;
      },

      commit: () => finish({ statement: 'COMMIT', verb: 'commit' }),
      rollback: () => finish({ statement: 'ROLLBACK', verb: 'rollback' }),
    };
  }
}
