import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { TRelationalConnector } from '@/connectors/postgres/datasources/common';

/**
 * The neutral result of a raw statement. The drivers disagree on their native shape (pg returns
 * `{ rows, rowCount }`; postgres-js returns an array carrying `count`), so each driver maps its own
 * shape to this one at the boundary - the one place that knows it statically. Callers never see a
 * driver-specific result and never sniff shapes at runtime.
 */
export interface IStatementResult {
  /**
   * Rows affected by the statement - the same `count` the repository verbs return. `0` for control
   * statements (BEGIN / COMMIT / SET LOCAL).
   */
  count: number;
}

/** One dedicated physical connection, held for the lifetime of a single explicit transaction. */
export interface IRelationalConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> {
  /** Drizzle bound to THIS connection, not to the pool. */
  connector: TRelationalConnector<Schema>;

  /**
   * Runs a control statement verbatim: BEGIN / COMMIT / ROLLBACK / SET LOCAL. The statement is built
   * by the caller and never parameterized - `BEGIN TRANSACTION ISOLATION LEVEL $1` is not valid SQL.
   * Use `connector` for anything that returns rows.
   */
  execute(opts: { statement: string }): Promise<IStatementResult>;

  /**
   * Returns the connection. `destroy` discards it instead of pooling it - required after a failed
   * COMMIT or ROLLBACK, when the session may still hold an open transaction that the next borrower
   * would inherit. A driver that cannot destroy must say so in its own docs rather than pretend.
   */
  release(opts?: { destroy?: boolean }): void;
}

/**
 * Owns connection acquisition and the raw control statements - the only two places `connectors/
 * postgres/` was hard-wired to `pg`. `configure()` stays app-written: connection config varies per
 * deployment, and the framework never builds the driver for you.
 */
export interface IRelationalDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client = unknown,
> {
  /** Pooled connector - what `configure()` assigns to `this.connector`. */
  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema>;

  /** Checks out a dedicated connection for an explicit transaction. */
  acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>>;

  /** Raw client escape: `pg.Pool` for node-postgres, `Sql` for postgres-js. */
  getClient(): Client;

  end(): Promise<void>;
}
