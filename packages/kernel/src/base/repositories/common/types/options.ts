import type { ITransaction } from '@/base/datasources';
import type { IRetryBackoffOptions, TLogLevel } from '@venizia/ignis-helpers/core';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { SQL } from 'drizzle-orm';
import type { TLockStrength } from '../constants';
import type { TDataWithRange } from './results';

/** Update data supporting both regular fields and JSON path updates via dot notation. */
export type TUpdateData<T = any> = Partial<T> & {
  [jsonPath: string]: any;
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
