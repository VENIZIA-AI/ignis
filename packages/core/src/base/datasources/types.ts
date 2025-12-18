import { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers';
import { NodePgClient, type drizzle as nodePostgresConnector } from 'drizzle-orm/node-postgres';
import { type drizzle as postgresjsConnector } from 'drizzle-orm/postgres-js';
import { Pool } from 'pg';

// ----------------------------------------------------------------------------------------------------------------------------------------

// NOTE: Add more supportable datasource driver
export type TDataSourceDriver = 'node-postgres' | 'postgres-js';
export type TAnyDatasourceSchema = Record<string, any>;

export type TNodePostgresConnector<
  TSchema extends TAnyDatasourceSchema = Record<string, never>,
  TClient extends NodePgClient = Pool,
> = ReturnType<typeof nodePostgresConnector<TSchema, TClient>>;
export type TPostgresJSConnector = ReturnType<typeof postgresjsConnector>;
export type TDatabaseConnector = TNodePostgresConnector | TPostgresJSConnector;

// ----------------------------------------------------------------------------------------------------------------------------------------
// DataSource Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IDataSource<
  Connector extends TDatabaseConnector = TNodePostgresConnector,
  Settings extends object = any,
  Schema extends Record<string, any> = {},
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  name: string;
  settings: Settings;
  connector: Connector;
  schema: Schema;

  getConnectionString(): ValueOrPromise<string>;
  getSettings(): Settings;
  getConnector(): Connector;
  getSchema(): Schema;
}
