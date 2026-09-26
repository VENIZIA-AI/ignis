import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { ITransaction } from '@venizia/ignis-kernel';

export class TransactionStates {
  static readonly ACTIVE = 'ACTIVE';
  static readonly COMMITTED = 'COMMITTED';
  static readonly ROLLED_BACK = 'ROLLED_BACK';
  static readonly FAILED = 'FAILED';

  static readonly SCHEME_SET = new Set([
    this.ACTIVE,
    this.COMMITTED,
    this.ROLLED_BACK,
    this.FAILED,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TTransactionState = TConstValue<typeof TransactionStates>;

/** Registry symbol, not a module-private one: the CommonJS and ESM builds each load their own copy of this class, and a handle from one must still be read by the other. */
export const TRANSACTION_STATE_KEY: unique symbol = Symbol.for(
  '@venizia/ignis-connectors/transaction-state',
);

export interface ITransactionEnd {
  verb: string;
  statement: string;
  endedState: TTransactionState;
}

/**
 * The end-of-transaction rules every handle shares, the real one and the test double alike: the
 * first commit() or rollback() wins, a second end throws, and rollback() after a failed end is a
 * no-op. A subclass supplies only the statement and what happens around it.
 */
export abstract class TransactionLifecycle implements ITransaction {
  private static readonly COMMIT: ITransactionEnd = {
    verb: 'commit',
    statement: 'COMMIT',
    endedState: TransactionStates.COMMITTED,
  };

  private static readonly ROLLBACK: ITransactionEnd = {
    verb: 'rollback',
    statement: 'ROLLBACK',
    endedState: TransactionStates.ROLLED_BACK,
  };

  // ES-private, not TS-private: a handle that is logged, spread or serialised must not carry its internals.
  #state: TTransactionState = TransactionStates.ACTIVE;

  /** Symbol-keyed so the state stays off the handle's string-keyed surface. */
  get [TRANSACTION_STATE_KEY](): TTransactionState {
    return this.#state;
  }

  get isActive(): boolean {
    return this.#state === TransactionStates.ACTIVE;
  }

  protected get lifecycleState(): TTransactionState {
    return this.#state;
  }

  // Own properties, not prototype methods, so a detached `transaction.commit` still works.
  readonly commit = (): Promise<void> => this.end({ end: TransactionLifecycle.COMMIT });
  readonly rollback = (): Promise<void> => this.end({ end: TransactionLifecycle.ROLLBACK });

  /** Runs the end statement. Called at most once per transaction, after the state has left ACTIVE. */
  protected abstract executeEnd(opts: { end: ITransactionEnd }): Promise<unknown>;

  protected onEnded(_opts: { end: ITransactionEnd }): void {}

  protected onEndFailed(_opts: { end: ITransactionEnd; error: unknown }): void {}

  protected onRollbackAfterFailure(): void {}

  private async end(opts: { end: ITransactionEnd }): Promise<void> {
    const { end } = opts;

    if (this.#state !== TransactionStates.ACTIVE) {
      // After a FAILED end the transaction is already torn down, so rollback is satisfied by construction - throwing here would replace the caller's original error in `catch { await tx.rollback(); throw error; }`.
      if (this.#state === TransactionStates.FAILED && end === TransactionLifecycle.ROLLBACK) {
        this.onRollbackAfterFailure();
        return;
      }

      throw getError({ message: `[Transaction][${end.verb}] Transaction already ended` });
    }

    // Left ACTIVE BEFORE the await: commit racing rollback would otherwise both pass the guard, issue two end statements, and double-release the same connection.
    this.#state = end.endedState;

    try {
      await this.executeEnd({ end });
    } catch (error) {
      this.onEndFailed({ end, error });
      this.#state = TransactionStates.FAILED;
      throw error;
    }

    this.onEnded({ end });
  }
}
