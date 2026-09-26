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

export interface ITransactionDoubleOptions {
  /** Thrown by the first commit(), which then ends the transaction by failure. */
  commitError?: Error;

  /** Thrown by the first rollback(), which then ends the transaction by failure. */
  rollbackError?: Error;
}

export interface IPostgresTransactionDoubleOptions extends ITransactionDoubleOptions {
  isolationLevel?: TIsolationLevel;
}

export interface ISqliteTransactionDoubleOptions extends ITransactionDoubleOptions {
  beginMode?: TSqliteBeginMode;
}

/**
 * A transaction handle for unit tests, with no database behind it. It ends by the same rules as the
 * real handle and counts every commit() and rollback() that reached the end statement. Reading
 * `connector` throws: a repository method that would reach the database must be stubbed.
 */
export class TransactionDouble
  extends TransactionLifecycle
  implements IRelationalTransaction<never>
{
  readonly #commitError?: Error;
  readonly #rollbackError?: Error;

  #commitCount = 0;
  #rollbackCount = 0;

  constructor(opts?: ITransactionDoubleOptions) {
    super();

    this.#commitError = opts?.commitError;
    this.#rollbackError = opts?.rollbackError;
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

  get connector(): never {
    throw getError({
      message:
        '[TransactionDouble] connector is not available - stub the repository method that reached the database',
    });
  }

  protected override async executeEnd(opts: { end: ITransactionEnd }): Promise<void> {
    if (opts.end.endedState === TransactionStates.COMMITTED) {
      this.#commitCount++;

      if (this.#commitError) {
        throw this.#commitError;
      }

      return;
    }

    this.#rollbackCount++;

    if (this.#rollbackError) {
      throw this.#rollbackError;
    }
  }
}

/** The Postgres handle's shape: carries the isolation level the real BEGIN would have used. */
export class PostgresTransactionDouble extends TransactionDouble {
  readonly isolationLevel: TIsolationLevel;

  constructor(opts?: IPostgresTransactionDoubleOptions) {
    super(opts);

    this.isolationLevel = opts?.isolationLevel ?? IsolationLevels.READ_COMMITTED;
  }
}

/** The SQLite handle's shape: carries the locking mode the real BEGIN would have used. */
export class SqliteTransactionDouble extends TransactionDouble {
  readonly beginMode: TSqliteBeginMode;

  constructor(opts?: ISqliteTransactionDoubleOptions) {
    super(opts);

    this.beginMode = opts?.beginMode ?? SqliteBeginModes.IMMEDIATE;
  }
}
