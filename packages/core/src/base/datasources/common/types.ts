import { IConfigurable, TConstValue, ValueOrPromise } from '@venizia/ignis-helpers';
import { NodePgClient, type drizzle as nodePostgresConnector } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

// ----------------------------------------------------------------------------------------------------------------------------------------

export class DataSourceDrivers {
  static readonly NODE_POSTGRES = 'node-postgres';

  static readonly SCHEME_SET = new Set([this.NODE_POSTGRES]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers>;
export type TAnyDataSourceSchema = Record<string, any>;

// Client connector for node-postgres driver
export type TNodePostgresConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client extends NodePgClient = NodePgClient,
> = ReturnType<typeof nodePostgresConnector<DataSourceSchema, Client>>;

// Transaction connector uses PoolClient specifically
export type TNodePostgresTransactionConnector<
  DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> = ReturnType<typeof nodePostgresConnector<DataSourceSchema, PoolClient>>;

// Connector type that works for both datasource and transaction operations
export type TAnyConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  | TNodePostgresConnector<DataSourceSchema>
  | TNodePostgresTransactionConnector<DataSourceSchema>;

// ----------------------------------------------------------------------------------------------------------------------------------------
// Transaction Support
// ----------------------------------------------------------------------------------------------------------------------------------------

/**
 * PostgreSQL transaction isolation levels.
 * Uses static class pattern per code-style-standards.md
 */
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

export interface ITransactionOptions {
  isolationLevel?: TIsolationLevel;
}

export interface ITransaction<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> {
  connector: TNodePostgresTransactionConnector<Schema>;
  isActive: boolean;
  isolationLevel: TIsolationLevel;

  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// DataSource Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  name: string;
  settings: Settings;
  connector: TNodePostgresConnector<Schema>;
  schema: Schema;

  getConnectionString(): ValueOrPromise<string>;
  getSettings(): Settings;
  getConnector(): TNodePostgresConnector<Schema>;
  getSchema(): Schema;
  beginTransaction(opts?: ITransactionOptions): Promise<ITransaction<Schema>>;
}
