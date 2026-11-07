import type { TDrizzleQueryOptions, TLockOptions } from '@venizia/ignis-kernel';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { AnyColumn, SQL } from 'drizzle-orm';
import type { TTableSchemaWithId } from '@/relational/core/models/common';

/** Column subset for a projection, in Drizzle's own shape. `undefined` selects every column. */
export type TColumnSelection = Record<string, unknown> | undefined;

/** Input of a `select` call on the query executor; `connector` is the one resolved for the current operation or transaction. */
export interface ISelectOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  columns?: TColumnSelection;
  where?: SQL;
  orderBy?: SQL[];
  limit?: number;
  offset?: number;
  /** Postgres `FOR UPDATE` and friends. Engines without row locking throw NotSupported. */
  lock?: TLockOptions;
}

/** Input of a `count` call on the query executor; `where` omitted counts every row. */
export interface ICountOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  where?: SQL;
}

/** Input of a relational (`findMany`/`findFirst` style) query on the query executor, run through Drizzle's relational query interface. */
export interface IRelationalQueryOptions<TConnector> {
  connector: TConnector;
  /** Schema registration key - the entity's `TABLE_NAME`, used to reach Drizzle's relational query interface. */
  entityName: string;
  query: TDrizzleQueryOptions;
  /** The calling repository's class name, so a thrown error names the class that failed rather than the executor. Falls back to the executor's own name when absent. */
  scope?: string;
}

/** Input of an `insert` call on the query executor; `shouldReturn` selects whether inserted rows are read back. */
export interface IInsertOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
  /** `undefined` returns every column; omit the key entirely to return nothing. */
  returning?: TColumnSelection;
  shouldReturn: boolean;
  /** Turns the insert into an upsert: `ON CONFLICT (target) [WHERE targetWhere] DO UPDATE SET set [WHERE setWhere]`. A conflicting row that fails `setWhere` is left as it is and returned by nothing. */
  onConflict?: IInsertConflictOptions;
}

/** The conflict branch of an upsert; the repository reads `target` and `targetWhere` from a declared unique key before it gets here. */
export interface IInsertConflictOptions {
  /** The key's columns, from the table schema. */
  target: AnyColumn[];
  /** The predicate of a partial unique index, so the engine infers that index as the arbiter. */
  targetWhere?: SQL;
  /** Property to value for the update branch; columns with `$onUpdate` are added by Drizzle, as for an update. */
  set: Record<string, SQL>;
  /** Which existing rows the update branch may touch, read against the existing row. */
  setWhere?: SQL;
}

/** Input of an `update` call on the query executor; `where` omitted updates every row. */
export interface IUpdateOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  data: Record<string, unknown>;
  where?: SQL;
  returning?: TColumnSelection;
  shouldReturn: boolean;
}

/** Input of a `remove` call on the query executor; `where` omitted removes every row. */
export interface IRemoveOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  where?: SQL;
  returning?: TColumnSelection;
  shouldReturn: boolean;
}

/** A write's outcome. `count` is authoritative in both modes: with `shouldReturn` true it is `rows.length`, with it false the engine reads its driver's affected-row field and `rows` is empty. A bare `Array<R>` cannot express the second mode, which is why writes do not return one. */
export interface IWriteResult<R> {
  count: number;
  rows: Array<R>;
}

/** Every Drizzle call the shared repository tier makes, behind one engine-supplied port obtained via `dataSource.getQueryExecutor()`. Stateless: the connector is passed per call because the repository resolves a transaction-bound connector per operation. */
export interface IRelationalQueryExecutor<TConnector> {
  /** Whether `select` takes a row lock. SQLite locks the whole database, so it does not, and a lock there throws. */
  readonly supportsRowLock: boolean;
  select<R>(opts: ISelectOptions<TConnector>): Promise<Array<R>>;
  count(opts: ICountOptions<TConnector>): Promise<number>;
  findMany<R>(opts: IRelationalQueryOptions<TConnector>): Promise<Array<R>>;
  findFirst<R>(opts: IRelationalQueryOptions<TConnector>): Promise<TNullable<R>>;
  insert<R>(opts: IInsertOptions<TConnector>): Promise<IWriteResult<R>>;
  update<R>(opts: IUpdateOptions<TConnector>): Promise<IWriteResult<R>>;
  remove<R>(opts: IRemoveOptions<TConnector>): Promise<IWriteResult<R>>;
}
