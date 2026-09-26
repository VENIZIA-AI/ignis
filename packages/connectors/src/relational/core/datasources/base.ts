import { MetadataRegistry } from '@venizia/ignis-kernel';
import { RelationBuilderRegistry, type TRelationBuilder } from '@venizia/ignis-kernel';
import type { TClass } from '@venizia/ignis-helpers/common';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import type { IDataSource, TAnyDataSourceSchema } from '@venizia/ignis-kernel';
// Deep import, not a barrel: `discoverSchema()` below is the only production call site that needs
// `createRelations`, so the install runs from here rather than `dialect/relations/create.ts` - nothing else
// value-imports that file's `createRelations` export, and a `sideEffects: false` bundler drops an
// unused export's module body even when it is reachable through a barrel `export *` chain (verified
// with `bun build --target=browser`, the tool `make purity` uses).
import { createRelations } from '@/relational/core/repositories/dialect/relations/create';
import type { IRelationalConnection } from '@/relational/core/drivers';
import { AbstractRelationalDataSource } from './abstract';
import type { IRelationalTransaction, TRelationalTransactionOptions } from './common';
import { RelationPairing } from './relation-pairing';
import type { ITransactionEnd } from './transaction-lifecycle';
import { TransactionLifecycle } from './transaction-lifecycle';

/** The handle `beginTransaction()` returns: the shared end rules over one acquired connection. On a failed end the connection is discarded rather than pooled - the next borrower would inherit an open transaction - and the error rethrown: a caller must never believe a failed COMMIT succeeded. */
class ConnectionTransaction<TConnector>
  extends TransactionLifecycle
  implements IRelationalTransaction<TConnector>
{
  readonly connector: TConnector;

  // The datasource, not its logger: the logger is read only when an end fails or is a no-op.
  private readonly dataSource: { readonly logger: ILogger };
  private readonly connection: IRelationalConnection<TConnector>;

  constructor(opts: {
    dataSource: { readonly logger: ILogger };
    connection: IRelationalConnection<TConnector>;
  }) {
    super();

    this.dataSource = opts.dataSource;
    this.connection = opts.connection;
    this.connector = opts.connection.connector;
  }

  protected override executeEnd(end: ITransactionEnd): Promise<unknown> {
    return this.connection.execute({ statement: end.statement });
  }

  protected override onEnded(): void {
    this.connection.release();
  }

  protected override onEndFailed(opts: { end: ITransactionEnd; error: unknown }): void {
    const { end, error } = opts;

    this.dataSource.logger
      .for(end.verb)
      .error('Failed to %s transaction | Error: %s', end.statement, error);
    this.connection.release({ destroy: true });
  }

  protected override onRollbackAfterFailure(): void {
    this.dataSource.logger
      .for('rollback')
      .debug('Rollback after a failure-ended transaction - no-op, already torn down');
  }
}

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
    this.schema ??= this.discoverSchema();
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

    const discovered = { ...schema, ...relations };

    // An inverse one() nothing pairs fails here; any other relation drizzle cannot pair is only
    // reported, so a model set that boots today keeps booting, and its first query still throws.
    const { unpaired, outside } = RelationPairing.inspect({
      dataSource: this.constructor.name,
      schema: discovered,
    });
    const fatal = unpaired.find(item => RelationPairing.isInverseOne({ relation: item.relation }));
    if (fatal) {
      throw getError({ message: fatal.message });
    }

    const logger = this.logger.for(this.discoverSchema.name);
    for (const item of unpaired) {
      logger.warn(item.message);
    }
    if (outside.length > 0) {
      logger.debug(RelationPairing.describeOutside({ outside }));
    }

    // buildSchema() is shared by every connector so it returns Record<string, unknown>; the cast narrows back to the Drizzle schema shape.
    return discovered as Schema;
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

    return new ConnectionTransaction({ dataSource: this, connection });
  }

  /** The engine's own BEGIN. Postgres interpolates an isolation level; SQLite has none and uses `BEGIN IMMEDIATE`. Never parameterized - `BEGIN ... ISOLATION LEVEL $1` is not valid SQL. */
  protected abstract buildBeginStatement(opts?: TRelationalTransactionOptions): string;
}

// Runs once this module loads. Every engine (postgres, sqlite) extends `BaseRelationalDataSource`,
// and `discoverSchema()` above is the sole caller of `resolveModelRelations()`, so this is the one
// place guaranteed to load whenever relation building is actually needed.
RelationBuilderRegistry.set({ builder: createRelations as TRelationBuilder });
