import type { TDrizzleQueryOptions, TLockOptions } from '@/base/repositories/common';
import type { TNullable } from '@venizia/ignis-helpers';
import type { SQL } from 'drizzle-orm';
import type { TTableSchemaWithId } from '@/connectors/relational/models/common';

/** Column subset for a projection, in Drizzle's own shape. `undefined` selects every column. */
export type TColumnSelection = Record<string, unknown> | undefined;

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

export interface ICountOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  where?: SQL;
}

export interface IRelationalQueryOptions<TConnector> {
  connector: TConnector;
  /** Schema registration key - the entity's `TABLE_NAME`, used to reach Drizzle's relational query interface. */
  entityName: string;
  query: TDrizzleQueryOptions;
  /** The calling repository's class name, so a thrown error names the class that failed rather than the executor. Falls back to the executor's own name when absent. */
  scope?: string;
}

export interface IInsertOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
  /** `undefined` returns every column; omit the key entirely to return nothing. */
  returning?: TColumnSelection;
  shouldReturn: boolean;
}

export interface IUpdateOptions<TConnector> {
  connector: TConnector;
  table: TTableSchemaWithId;
  data: Record<string, unknown>;
  where?: SQL;
  returning?: TColumnSelection;
  shouldReturn: boolean;
}

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
  select<R>(opts: ISelectOptions<TConnector>): Promise<Array<R>>;
  count(opts: ICountOptions<TConnector>): Promise<number>;
  findMany<R>(opts: IRelationalQueryOptions<TConnector>): Promise<Array<R>>;
  findFirst<R>(opts: IRelationalQueryOptions<TConnector>): Promise<TNullable<R>>;
  insert<R>(opts: IInsertOptions<TConnector>): Promise<IWriteResult<R>>;
  update<R>(opts: IUpdateOptions<TConnector>): Promise<IWriteResult<R>>;
  remove<R>(opts: IRemoveOptions<TConnector>): Promise<IWriteResult<R>>;
}
