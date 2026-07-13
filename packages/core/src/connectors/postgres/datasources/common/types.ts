import type {
  AbstractDataSource,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
} from '@/base/datasources';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import type { TConstValue, ValueOrPromise } from '@venizia/ignis-helpers';
import type { NodePgClient } from 'drizzle-orm/node-postgres';
import { type drizzle as nodePostgresConnector } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Pool, PoolClient } from 'pg';

/**
 * Drizzle connector for ANY Postgres driver. `NodePgDatabase` and `PostgresJsDatabase` both extend
 * `PgDatabase<TQueryResult, TFullSchema>`, differing only in the query-result HKT, so this is the
 * real shared base - not a cast. It is what lets `beginTransaction()` hold no driver-specific code.
 */
export type TRelationalConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> = PgDatabase<PgQueryResultHKT, DataSourceSchema>;

/** @deprecated Compat alias. Prefer `TRelationalConnector`, which every Drizzle pg driver satisfies. */
export type TNodePostgresConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client extends NodePgClient = NodePgClient,
> = ReturnType<typeof nodePostgresConnector<DataSourceSchema, Client>>;

/** @deprecated Compat alias. Uses PoolClient specifically for transaction isolation. */
export type TNodePostgresTransactionConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> = ReturnType<typeof nodePostgresConnector<DataSourceSchema, PoolClient>>;

export type TAnyConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  TRelationalConnector<DataSourceSchema>;

export class IsolationLevels {
  static readonly READ_COMMITTED = 'READ COMMITTED';
  static readonly REPEATABLE_READ = 'REPEATABLE READ';
  static readonly SERIALIZABLE = 'SERIALIZABLE';

  static readonly SCHEME_SET = new Set([
    this.READ_COMMITTED,
    this.REPEATABLE_READ,
    this.SERIALIZABLE,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TIsolationLevel = TConstValue<typeof IsolationLevels>;

/** Postgres transaction options - adds a typed `isolationLevel` on top of the neutral,
 * string-only `ITransactionOptions`. */
export interface IDatabaseTransactionOptions extends ITransactionOptions {
  isolationLevel?: TIsolationLevel;
}

export interface IDatabaseTransaction<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> extends ITransaction {
  /** Bound to the transaction's own connection, whichever driver acquired it. */
  connector: TRelationalConnector<Schema>;
  isolationLevel: TIsolationLevel;

  /**
   * Throws if COMMIT fails, per {@link ITransaction.commit}. On failure the connection is discarded
   * rather than pooled, where the driver supports it: node-postgres destroys it via
   * `release(error)`; postgres-js has no destroy semantics, so a poisoned connection returns to its
   * pool.
   */
  commit(): Promise<void>;

  /**
   * Throws if ROLLBACK fails, with the same connection-discard caveat as {@link commit} - but is a
   * silent no-op after the transaction already ended BY FAILURE, per {@link ITransaction.rollback}.
   * That keeps `catch (error) { await transaction.rollback(); throw error; }` safe.
   */
  rollback(): Promise<void>;
}

/** SQL-branch contract: connection string, Drizzle connector, transactions. Extends
 * `AbstractDataSource` itself (not just `IDataSource`) so repositories can narrow safely. */
export interface IPostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
  connector: TRelationalConnector<Schema>;

  getConnectionString(): ValueOrPromise<string>;
  getConnector(): TRelationalConnector<Schema>;

  /** Raw driver client escape: `pg.Pool` today, postgres-js `Sql` once a driver supplies it. */
  getClient(): Client;
  getQueryDialect(): IRelationalQueryDialect;
  beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
