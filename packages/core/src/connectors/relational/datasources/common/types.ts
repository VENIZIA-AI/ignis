import type {
  AbstractDataSource,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
} from '@/base/datasources';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/connectors/relational/repositories/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';

/** Neutral SQL transaction options; each engine adds its own knobs. An alias, not an empty `interface ... extends`, which `@typescript-eslint/no-empty-object-type` rejects. */
export type TRelationalTransactionOptions = ITransactionOptions;

export interface IRelationalTransaction<TConnector> extends ITransaction {
  /** Bound to the transaction's own connection, whichever driver acquired it. */
  connector: TConnector;

  /** Throws if COMMIT fails, per {@link ITransaction.commit}. The connection is discarded where the driver supports it (node-postgres `release(error)`); postgres-js has no destroy semantics, so a poisoned connection returns to its pool. */
  commit(): Promise<void>;

  /** Throws if ROLLBACK fails (same connection-discard caveat as {@link commit}) - but is a silent no-op after the transaction already ended BY FAILURE, keeping `catch (error) { await transaction.rollback(); throw error; }` safe. */
  rollback(): Promise<void>;
}

/** SQL-branch contract, engine-free. Extends `AbstractDataSource` itself, not just `IDataSource`, so repositories can narrow safely. `getConnectionString()` is app-implemented and never called by the framework - an embedded engine with no URL returns its data directory. */
export interface IRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
  TConnector = unknown,
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
  connector: TConnector;

  getConnectionString(): ValueOrPromise<string>;
  getConnector(): TConnector;
  getClient(): Client;
  getQueryDialect(): IRelationalQueryDialect;
  getQueryExecutor(): IRelationalQueryExecutor<TConnector>;
  beginTransaction(
    opts?: TRelationalTransactionOptions,
  ): Promise<IRelationalTransaction<TConnector>>;
}
