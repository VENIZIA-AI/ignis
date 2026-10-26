import type { IConnectorDriver } from '@/common/driver';
import type { SQLWrapper } from 'drizzle-orm';

/** What a raw-SQL engine runs: a statement as text, or a Drizzle `sql` template (the engine's connector turns it into text). */
export type TRawSqlQuery = string | SQLWrapper;

/** The only thing a raw-SQL engine promises back: its rows. */
export interface IRawSqlResult {
  rows: Array<Record<string, unknown>>;
}

/**
 * The connector of an engine that only runs SQL and returns rows - an analytics engine beside the
 * main database (ClickHouse, DuckDB, BigQuery). No query builder, no dialect, no transactions: a
 * repository writes the statement and reads `rows`.
 */
export interface IRawSqlConnector {
  execute(query: TRawSqlQuery): Promise<IRawSqlResult>;
}

/** A driver with `createConnector`, `getClient` and `end`, and nothing else: a raw-SQL engine has no transactions to acquire a connection for. */
export type TRawSqlDriver<
  TConnector extends IRawSqlConnector = IRawSqlConnector,
  Client = unknown,
> = IConnectorDriver<TConnector, Client>;

/** A raw-SQL datasource owns no schema: its statements are the repositories' own. */
export type TRawSqlSchema = Record<string, never>;
