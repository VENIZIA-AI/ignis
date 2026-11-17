import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { IConnectorDriver } from '@/common/driver';

/** The SQL engines a relational driver can speak. Only the migration ledger reads it today: Postgres has schemas to create, SQLite has only `main`. */
export class RelationalDialects {
  static readonly POSTGRES = 'postgres';
  static readonly SQLITE = 'sqlite';

  static readonly SCHEME_SET = new Set([this.POSTGRES, this.SQLITE]);

  static isValid(input: string): input is TRelationalDialect {
    return this.SCHEME_SET.has(input);
  }
}
/** Union of the `RelationalDialects` values. */
export type TRelationalDialect = TConstValue<typeof RelationalDialects>;

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

  /** Rows from a verbatim statement, for the few callers that have no Drizzle schema to query through - the migration ledger is the one in-tree case. Also unparameterized: placeholder syntax is not portable (`$1` on Postgres, `?` on SQLite), so a caller needing a value must prove it is a literal. */
  query<R>(opts: { statement: string }): Promise<Array<R>>;

  /** Returns the connection; `destroy` discards instead of pooling - required after a failed COMMIT/ROLLBACK, where the next borrower would inherit an open transaction. A driver that cannot destroy must say so in its own docs. */
  release(opts?: { destroy?: boolean }): void;
}

/** The common driver (connector, client, end) plus connection acquisition and raw control statements - the only places hard-wired to a client library. `configure()` stays app-written: the framework never builds the driver for you. */
export interface IRelationalDriver<TConnector, Client = unknown> extends IConnectorDriver<
  TConnector,
  Client
> {
  /** The engine this driver speaks. The built-in drivers declare it; a hand-made driver may omit it, and the migration ledger then accepts no `ledger.schema` (it cannot know whether the engine has schemas). */
  readonly dialect?: TRelationalDialect;

  acquire(opts: { schema: TAnyDataSourceSchema }): Promise<IRelationalConnection<TConnector>>;
}
