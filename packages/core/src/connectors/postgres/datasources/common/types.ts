import {
  AbstractDataSource,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
} from '@/base/datasources';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import { TConstValue, ValueOrPromise } from '@venizia/ignis-helpers';
import { NodePgClient, type drizzle as nodePostgresConnector } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

export type TNodePostgresConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client extends NodePgClient = NodePgClient,
> = ReturnType<typeof nodePostgresConnector<DataSourceSchema, Client>>;

/** Uses PoolClient specifically for transaction isolation. */
export type TNodePostgresTransactionConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> = ReturnType<typeof nodePostgresConnector<DataSourceSchema, PoolClient>>;

export type TAnyConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  | TNodePostgresConnector<DataSourceSchema>
  | TNodePostgresTransactionConnector<DataSourceSchema>;

/** PostgreSQL transaction isolation levels. */
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
  connector: TNodePostgresTransactionConnector<Schema>;
  isolationLevel: TIsolationLevel;

  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** SQL-branch contract: connection string, Drizzle connector, transactions. Extends
 * `AbstractDataSource` itself (not just `IDataSource`) so repositories can narrow safely. */
export interface IPostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
  connector: TNodePostgresConnector<Schema>;

  getConnectionString(): ValueOrPromise<string>;
  getConnector(): TNodePostgresConnector<Schema>;
  getClient(): Pool;
  getQueryDialect(): IRelationalQueryDialect;
  beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
