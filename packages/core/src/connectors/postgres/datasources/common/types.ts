import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
  TRelationalTransactionOptions,
} from '@/connectors/relational/datasources/common';
import type { TConstValue } from '@venizia/ignis-helpers';
import type { NodePgClient } from 'drizzle-orm/node-postgres';
import { type drizzle as nodePostgresConnector } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Pool, PoolClient } from 'pg';

/**
 * Drizzle connector for any Postgres driver: `NodePgDatabase` and `PostgresJsDatabase` both extend
 * `PgDatabase`, differing only in the query-result HKT.
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

/** Postgres transaction options: a typed `isolationLevel` on top of the string-only neutral one. */
export interface IDatabaseTransactionOptions extends TRelationalTransactionOptions {
  isolationLevel?: TIsolationLevel;
}

/**
 * Postgres narrowing: pins the transaction's connector to a `PgDatabase` and requires a resolved
 * isolation level. `connector`, `commit()` and `rollback()` come from `IRelationalTransaction`.
 */
export interface IDatabaseTransaction<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> extends IRelationalTransaction<TRelationalConnector<Schema>> {
  isolationLevel: TIsolationLevel;
}

/**
 * Postgres narrowing of `IRelationalDataSource`: pins the connector to `PgDatabase` and narrows
 * `beginTransaction` to the isolation-level-aware `IDatabaseTransaction`.
 */
export interface IPostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends IRelationalDataSource<
  Settings,
  Schema,
  ConfigurableOptions,
  Client,
  TRelationalConnector<Schema>
> {
  getQueryDialect(): IRelationalQueryDialect;
  beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
