import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { IRelationalConnection, IRelationalDriver } from '@/connectors/relational/drivers';
import type { AnyType } from '@venizia/ignis-helpers';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

export type { IStatementResult } from '@/connectors/relational/drivers';

/**
 * Drizzle connector for any async SQLite driver. Result kind is pinned to `'async'` - a `'sync'`
 * driver would block the event loop. The run-result type stays open: it is the one thing drivers
 * disagree on, and pinning it would drag an optional peer's types into this tier.
 */
export type TSqliteConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  BaseSQLiteDatabase<'async', AnyType, DataSourceSchema>;

/**
 * SQLite narrowing: the neutral `IRelationalConnection<TConnector>` is parameterized by the
 * connector type, not by `Schema`. Aliased rather than re-exported so callers keep writing
 * `TSqliteConnection<Schema>` and getting `connector: TSqliteConnector<Schema>`.
 */
export type TSqliteConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  IRelationalConnection<TSqliteConnector<Schema>>;

/** SQLite narrowing: the connector is always an async `BaseSQLiteDatabase`. */
export type TSqliteDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client = unknown,
> = IRelationalDriver<TSqliteConnector<Schema>, Client>;
