import type { AbstractDataSource, ITransaction } from '@/base/datasources';
import type { AbstractEntity, IdType } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { TFilter, TWhere } from '@venizia/ignis-filter';
import type { TLogLevel } from '@venizia/ignis-helpers/core';
import type { AnyType, TNullable } from '@venizia/ignis-helpers/common';
import type { IRetryBackoffOptions } from '@venizia/ignis-helpers';
import type { Column, SQL } from 'drizzle-orm';
import type { TLockStrength } from './constants';

/** Update data supporting both regular fields and JSON path updates via dot notation. */
export type TUpdateData<T = any> = Partial<T> & {
  [jsonPath: string]: any;
};

/** Zod schema for count operation results. */
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});

export type TCount = z.infer<typeof CountSchema>;

/** Data range information for paginated queries. Follows HTTP Content-Range standard. */
export type TDataRange = {
  start: number;
  end: number;
  total: number;
};

/** Content-Range envelope with an inclusive `end` - an empty page collapses `end` onto `start`. */
export const buildDataRange = (opts: {
  skip?: number;
  offset?: number;
  dataLength: number;
  total: number;
}): TDataRange => {
  const { skip, offset, dataLength, total } = opts;
  const start = skip ?? offset ?? 0;
  const end = dataLength > 0 ? start + dataLength - 1 : start;
  return { start, end, total };
};

/** Options for Drizzle ORM query building, used internally by FilterBuilder. */
export type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, true | TDrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;

/** Configuration for repository operation logging. */
export type TRepositoryLogOptions = {
  use: boolean;
  level?: TLogLevel;
};

/** Configuration for row-level lock wait behavior. Mutually exclusive: use noWait OR skipLocked. */
export type TLockConfig =
  | { noWait: true; skipLocked?: undefined }
  | { noWait?: undefined; skipLocked: true }
  | { noWait?: undefined; skipLocked?: undefined };

/** Row-level locking options for read operations. */
export type TLockOptions = {
  strength: TLockStrength;
  config?: TLockConfig;
};

/** Neutral transaction association - postgres narrows to its own `IDatabaseTransaction` (via `isDatabaseTransaction`) where it needs `.connector`. */
export interface IWithTransaction {
  transaction?: ITransaction;
}

/** Extended options for repository operations with transaction, logging, and default filter bypass. */
export interface IExtraOptions extends IWithTransaction {
  log?: TRepositoryLogOptions;

  /** If true, bypass the default filter configured in model settings (e.g., soft delete). */
  shouldSkipDefaultFilter?: boolean;

  /** Row-level locking. Requires transaction. Incompatible with include/fields (Query API). */
  lock?: TLockOptions;
}

/**
 * Read-after-write retry for read verbs behind a replicated pool. The read re-executes while
 * `until(result)` returns false; on exhaustion the last result is returned as-is.
 */
export interface IReadRetryOptions<TResult> {
  /** Default 3. */
  maxAttempts?: number;

  /** Total budget across attempts AND sleeps. Default: unlimited. */
  maxTotalMs?: number;

  /**
   * Aborts between attempts and during backoff sleeps - pass the request signal so a cancelled
   * request stops retrying.
   */
  signal?: AbortSignal;

  /** Default: EXPONENTIAL from 50ms, capped at 500ms, EQUAL jitter - tuned for replica lag. */
  backoff?: IRetryBackoffOptions;

  /** Retry while false. Default per verb: findOne/findById non-null, find non-empty. */
  until?: (result: TResult) => boolean;
}

/**
 * Intersected into READ verb signatures only - a write verb's options type has no `retry`, so an
 * inline `{ retry }` fails to compile and a pre-built object carrying it is inert.
 */
export interface IWithReadRetry<TResult> {
  retry?: IReadRetryOptions<TResult>;
}

/** The `shouldQueryRange: true` result envelope. */
export type TDataWithRange<R> = { data: Array<R>; range: TDataRange };

/** Options for `find` returning a plain array - the retry predicate sees `Array<R>`. */
export type TFindOptions<TOptions extends IExtraOptions, R> = TOptions & {
  shouldQueryRange?: false;
} & IWithReadRetry<Array<R>>;

/** Options for `find` with the range envelope - the retry predicate sees `{ data, range }`. */
export type TFindRangeOptions<TOptions extends IExtraOptions, R> = TOptions & {
  shouldQueryRange: true;
} & IWithReadRetry<TDataWithRange<R>>;

/** Options for `findOne`/`findById` - the retry predicate sees `TNullable<R>`. */
export type TFindOneOptions<TOptions extends IExtraOptions, R> = TOptions &
  IWithReadRetry<TNullable<R>>;

/**
 * Base repository interface shared by every engine - engine-specific accessors (postgres's
 * `getEntitySchema()`/`getConnector()`) stay on the connector's own repository tier.
 */
export interface IRepository {
  dataSource: AbstractDataSource;
  entity: AbstractEntity;
  getEntity(): AbstractEntity;
}

/** Interface for read-only repository operations. `TDataObject` is the row/document shape itself. */
export interface IReadableRepository<
  TDataObject extends object = object,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  count(opts: { where: TWhere<TDataObject>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<TDataObject>; options?: ExtraOptions }): Promise<boolean>;

  find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TFindRangeOptions<ExtraOptions, R>;
  }): Promise<TDataWithRange<R>>;

  find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TFindOptions<ExtraOptions, R>;
  }): Promise<Array<R>>;

  findOne<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TFindOneOptions<ExtraOptions, R>;
  }): Promise<TNullable<R>>;

  findById<R = TDataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<TDataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R>;
  }): Promise<TNullable<R>>;
}

/** Interface for create operations. */
export interface ICreatableRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  create(opts: {
    data: TPersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  create<R = TDataObject>(opts: {
    data: TPersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  createAll(opts: {
    data: Array<TPersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  createAll<R = TDataObject>(opts: {
    data: Array<TPersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;
}

/** Interface for update operations. */
export interface IUpdatableRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  updateById(opts: {
    id: IdType;
    data: Partial<TPersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  updateById<R = TDataObject>(opts: {
    id: IdType;
    data: Partial<TPersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  updateAll(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  updateAll<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;

  /** Alias for updateAll. */
  updateBy(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for updateAll. */
  updateBy<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
}

/** Interface for delete operations. */
export interface IDeletableRepository<
  TDataObject extends object = object,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  deleteById<R = TDataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  deleteAll(opts: {
    where?: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  deleteAll<R = TDataObject>(opts: {
    where?: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;

  /** Alias for deleteAll. */
  deleteBy(opts: {
    where?: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for deleteAll. */
  deleteBy<R = TDataObject>(opts: {
    where?: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
}

/** Interface for full CRUD repository operations - reads plus create, update, and delete. */
export interface IPersistableRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
>
  extends
    IReadableRepository<TDataObject, ExtraOptions>,
    ICreatableRepository<TDataObject, TPersistObject, ExtraOptions>,
    IUpdatableRepository<TDataObject, TPersistObject, ExtraOptions>,
    IDeletableRepository<TDataObject, ExtraOptions> {}

/**
 * Alias for IPersistableRepository - the name both DefaultRelationalRepository and
 * DefaultSearchRepository satisfy.
 */
export interface ICrudRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IPersistableRepository<TDataObject, TPersistObject, ExtraOptions> {}

/** Options passed to query operator handler functions. */
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}

/**
 * Operator-name to SQL-handler table a relational dialect translates with, so a second SQL engine
 * swaps the whole table without touching the walk that reaches it. `column` is wider than
 * `IQueryHandlerOptions` names it: the JSON-path branch hands handlers a raw `#>>` extraction
 * expression, not a `Column`.
 */
export type TQueryOperatorHandlers = Record<
  string,
  (opts: { column: AnyType; value: AnyType }) => SQL | undefined
>;
