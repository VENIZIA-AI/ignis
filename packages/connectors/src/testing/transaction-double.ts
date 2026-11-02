import type { IRelationalTransaction } from '@/relational/core/datasources/common/types';
import type {
  ITransactionEnd,
  TTransactionState,
} from '@/relational/core/datasources/transaction-lifecycle';
import {
  TransactionLifecycle,
  TransactionStates,
} from '@/relational/core/datasources/transaction-lifecycle';
import type { TIsolationLevel } from '@/relational/postgres/datasources/common/types';
import { IsolationLevels } from '@/relational/postgres/datasources/common/types';
import type { TSqliteBeginMode } from '@/relational/sqlite/datasources/common/types';
import { SqliteBeginModes } from '@/relational/sqlite/datasources/common/types';
import { getError } from '@venizia/ignis-helpers/core';

/** A hook a test passes to see an end statement; it may be async, and a throw from it fails the end like `commitError`. */
export type TTransactionDoubleHook = () => void | Promise<void>;

export interface ITransactionDoubleOptions<TConnector = never> {
  /**
   * What the `connector` getter returns, typed as `TConnector`. Without it the getter throws and is typed
   * `never`. `TConnector` is inferred from the value, so a stub is passed as the real connector type
   * (`stub as unknown as TRelationalConnector`), or the type is named: `new PostgresTransactionDouble<TRelationalConnector>(...)`.
   */
  connector?: TConnector;

  /** Thrown by the first commit(), which then ends the transaction by failure. */
  commitError?: Error;

  /** Thrown by the first rollback(), which then ends the transaction by failure. */
  rollbackError?: Error;

  /** Called, and awaited, when a commit() reaches the end statement: after `commitCount` goes up, before `commitError` is thrown. */
  onCommit?: TTransactionDoubleHook;

  /** Called, and awaited, when a rollback() reaches the end statement: after `rollbackCount` goes up, before `rollbackError` is thrown. */
  onRollback?: TTransactionDoubleHook;
}

export interface IPostgresTransactionDoubleOptions<
  TConnector = never,
> extends ITransactionDoubleOptions<TConnector> {
  isolationLevel?: TIsolationLevel;
}

export interface ISqliteTransactionDoubleOptions<
  TConnector = never,
> extends ITransactionDoubleOptions<TConnector> {
  beginMode?: TSqliteBeginMode;
}

/**
 * A transaction handle for unit tests, with no database behind it. It ends by the same rules as the
 * real handle and counts every commit() and rollback() that reached the end statement. Reading
 * `connector` returns the `connector` option when one was given; without it the read throws, and a
 * repository method that would reach the database must be stubbed.
 */
export class TransactionDouble<TConnector = never>
  extends TransactionLifecycle
  implements IRelationalTransaction<TConnector>
{
  readonly #connector?: TConnector;
  readonly #commitError?: Error;
  readonly #rollbackError?: Error;
  readonly #onCommit?: TTransactionDoubleHook;
  readonly #onRollback?: TTransactionDoubleHook;

  #commitCount = 0;
  #rollbackCount = 0;

  constructor(opts?: ITransactionDoubleOptions<TConnector>) {
    super();

    this.#connector = opts?.connector;
    this.#commitError = opts?.commitError;
    this.#rollbackError = opts?.rollbackError;
    this.#onCommit = opts?.onCommit;
    this.#onRollback = opts?.onRollback;
  }

  get state(): TTransactionState {
    return this.lifecycleState;
  }

  get commitCount(): number {
    return this.#commitCount;
  }

  get rollbackCount(): number {
    return this.#rollbackCount;
  }

  get connector(): TConnector {
    if (this.#connector !== undefined) {
      return this.#connector;
    }

    throw getError({
      message:
        '[TransactionDouble] connector is not available - stub the repository method that reached the database',
    });
  }

  protected override async executeEnd(opts: { end: ITransactionEnd }): Promise<void> {
    if (opts.end.endedState === TransactionStates.COMMITTED) {
      this.#commitCount++;
      await this.#onCommit?.();

      if (this.#commitError) {
        throw this.#commitError;
      }

      return;
    }

    this.#rollbackCount++;
    await this.#onRollback?.();

    if (this.#rollbackError) {
      throw this.#rollbackError;
    }
  }
}

/** The Postgres handle's shape: carries the isolation level the real BEGIN would have used. */
export class PostgresTransactionDouble<TConnector = never> extends TransactionDouble<TConnector> {
  readonly isolationLevel: TIsolationLevel;

  constructor(opts?: IPostgresTransactionDoubleOptions<TConnector>) {
    super(opts);

    this.isolationLevel = opts?.isolationLevel ?? IsolationLevels.READ_COMMITTED;
  }
}

/** The SQLite handle's shape: carries the locking mode the real BEGIN would have used. */
export class SqliteTransactionDouble<TConnector = never> extends TransactionDouble<TConnector> {
  readonly beginMode: TSqliteBeginMode;

  constructor(opts?: ISqliteTransactionDoubleOptions<TConnector>) {
    super(opts);

    this.beginMode = opts?.beginMode ?? SqliteBeginModes.IMMEDIATE;
  }
}
