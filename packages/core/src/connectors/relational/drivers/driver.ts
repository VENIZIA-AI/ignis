import type { TAnyDataSourceSchema } from '@/base/datasources';

/** Neutral result of a raw statement. Each driver maps its native shape (pg `rowCount`, postgres-js `count`) at its own boundary - callers never sniff shapes at runtime. */
export interface IStatementResult {
  /** Rows affected - the same `count` the repository verbs return; `0` for control statements (BEGIN / COMMIT / SET LOCAL). */
  count: number;
}

/** One dedicated physical connection, held for the lifetime of a single explicit transaction. */
export interface IRelationalConnection<TConnector> {
  /** Drizzle bound to THIS connection, not to the pool. */
  connector: TConnector;

  /** Runs a control statement verbatim (BEGIN / COMMIT / ROLLBACK / SET LOCAL) - never parameterized, `BEGIN ... ISOLATION LEVEL $1` is not valid SQL. Use `connector` for rows. */
  execute(opts: { statement: string }): Promise<IStatementResult>;

  /** Returns the connection; `destroy` discards instead of pooling - required after a failed COMMIT/ROLLBACK, where the next borrower would inherit an open transaction. A driver that cannot destroy must say so in its own docs. */
  release(opts?: { destroy?: boolean }): void;
}

/** Owns connection acquisition and raw control statements - the only two places hard-wired to a client library. `configure()` stays app-written: the framework never builds the driver for you. */
export interface IRelationalDriver<TConnector, Client = unknown> {
  createConnector(opts: { schema: TAnyDataSourceSchema }): TConnector;
  acquire(opts: { schema: TAnyDataSourceSchema }): Promise<IRelationalConnection<TConnector>>;
  getClient(): Client;
  end(): Promise<void>;
}
