import type { ITransaction } from '@venizia/ignis-kernel';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';

/** The two statements that end a transaction; the probe injects a failure on one of them. */
export class TransactionEndStatements {
  static readonly COMMIT = 'COMMIT';
  static readonly ROLLBACK = 'ROLLBACK';

  static readonly SCHEME_SET = new Set([this.COMMIT, this.ROLLBACK]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TTransactionEndStatement = TConstValue<typeof TransactionEndStatements>;

export interface ITransactionParityHandle {
  transaction: ITransaction;

  /**
   * End statements that passed the already-ended guard and reached the engine, failed ones
   * included. For a real handle that is the COMMIT/ROLLBACK statements its connection ran; for the
   * double it is `commitCount + rollbackCount`.
   */
  countEndStatements: () => number;
}

export interface ITransactionParityProbe {
  /** Begins a transaction whose `failure.statement` rejects with exactly `failure.error`. */
  begin: (opts?: {
    failure?: { statement: TTransactionEndStatement; error: Error };
  }) => Promise<ITransactionParityHandle>;
}

export const ALREADY_ENDED_COMMIT = '[Transaction][commit] Transaction already ended';
export const ALREADY_ENDED_ROLLBACK = '[Transaction][rollback] Transaction already ended';

/** Settles a promise into the value it rejected with, or `undefined` when it resolved. */
export const captureRejection = async (opts: { task: Promise<unknown> }): Promise<unknown> => {
  try {
    await opts.task;
    return undefined;
  } catch (error) {
    return error;
  }
};

interface ITransactionParityCase {
  name: string;
  failOn?: TTransactionEndStatement;
  run: (opts: { handle: ITransactionParityHandle; injectedError: Error }) => Promise<void>;
}

/**
 * One table of end-of-transaction rules, run unchanged against every subject: the real handle on
 * each engine and the test double. A rule that holds for one and not the other is the drift the
 * shared state machine exists to prevent.
 */
const PARITY_CASES: ITransactionParityCase[] = [
  {
    name: 'a fresh transaction is active',
    run: async ({ handle }) => {
      expect(handle.transaction.isActive).toBe(true);
      expect(handle.countEndStatements()).toBe(0);

      await handle.transaction.rollback();
    },
  },
  {
    name: 'commit() ends the transaction and issues one statement',
    run: async ({ handle }) => {
      await handle.transaction.commit();

      expect(handle.transaction.isActive).toBe(false);
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'rollback() ends the transaction and issues one statement',
    run: async ({ handle }) => {
      await handle.transaction.rollback();

      expect(handle.transaction.isActive).toBe(false);
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'commit() after a successful commit throws already ended, and issues nothing',
    run: async ({ handle }) => {
      await handle.transaction.commit();

      const caught = await captureRejection({ task: handle.transaction.commit() });

      expect(caught).toMatchObject({ message: ALREADY_ENDED_COMMIT });
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'rollback() after a successful commit throws already ended, and issues nothing',
    run: async ({ handle }) => {
      await handle.transaction.commit();

      const caught = await captureRejection({ task: handle.transaction.rollback() });

      expect(caught).toMatchObject({ message: ALREADY_ENDED_ROLLBACK });
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'rollback() after a successful rollback throws already ended',
    run: async ({ handle }) => {
      await handle.transaction.rollback();

      const caught = await captureRejection({ task: handle.transaction.rollback() });

      expect(caught).toMatchObject({ message: ALREADY_ENDED_ROLLBACK });
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'isActive is false synchronously after commit() is called, before its await resolves',
    run: async ({ handle }) => {
      const pending = handle.transaction.commit();

      expect(handle.transaction.isActive).toBe(false);

      await pending;
      expect(handle.transaction.isActive).toBe(false);
    },
  },
  {
    name: 'isActive is false synchronously after rollback() is called, before its await resolves',
    run: async ({ handle }) => {
      const pending = handle.transaction.rollback();

      expect(handle.transaction.isActive).toBe(false);

      await pending;
    },
  },
  {
    name: 'concurrent commit() and rollback() end the transaction once, with one statement',
    run: async ({ handle }) => {
      const outcomes = await Promise.allSettled([
        handle.transaction.commit(),
        handle.transaction.rollback(),
      ]);

      expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'rejected']);
      expect(outcomes[1]).toMatchObject({ reason: { message: ALREADY_ENDED_ROLLBACK } });
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'a failed commit rethrows the engine error itself and ends the transaction',
    failOn: TransactionEndStatements.COMMIT,
    run: async ({ handle, injectedError }) => {
      const caught = await captureRejection({ task: handle.transaction.commit() });

      expect(caught).toBe(injectedError);
      expect(handle.transaction.isActive).toBe(false);
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'a failed rollback rethrows the engine error itself and ends the transaction',
    failOn: TransactionEndStatements.ROLLBACK,
    run: async ({ handle, injectedError }) => {
      const caught = await captureRejection({ task: handle.transaction.rollback() });

      expect(caught).toBe(injectedError);
      expect(handle.transaction.isActive).toBe(false);
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'rollback() after a failed commit is a no-op: resolves and issues nothing',
    failOn: TransactionEndStatements.COMMIT,
    run: async ({ handle, injectedError }) => {
      expect(await captureRejection({ task: handle.transaction.commit() })).toBe(injectedError);

      await handle.transaction.rollback();

      expect(handle.transaction.isActive).toBe(false);
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'rollback() after a failed rollback is a no-op: resolves and issues nothing',
    failOn: TransactionEndStatements.ROLLBACK,
    run: async ({ handle, injectedError }) => {
      expect(await captureRejection({ task: handle.transaction.rollback() })).toBe(injectedError);

      await handle.transaction.rollback();

      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'commit() after a failed commit still throws already ended',
    failOn: TransactionEndStatements.COMMIT,
    run: async ({ handle, injectedError }) => {
      expect(await captureRejection({ task: handle.transaction.commit() })).toBe(injectedError);

      const caught = await captureRejection({ task: handle.transaction.commit() });

      expect(caught).toMatchObject({ message: ALREADY_ENDED_COMMIT });
      expect(handle.countEndStatements()).toBe(1);
    },
  },
  {
    name: 'commit() after a failed rollback still throws already ended',
    failOn: TransactionEndStatements.ROLLBACK,
    run: async ({ handle, injectedError }) => {
      expect(await captureRejection({ task: handle.transaction.rollback() })).toBe(injectedError);

      const caught = await captureRejection({ task: handle.transaction.commit() });

      expect(caught).toMatchObject({ message: ALREADY_ENDED_COMMIT });
      expect(handle.countEndStatements()).toBe(1);
    },
  },
];

/** Runs every parity case against one subject. */
export const runTransactionParity = (opts: {
  subject: string;
  probe: () => ITransactionParityProbe;
}): void => {
  const { subject, probe } = opts;

  describe(`End-of-transaction parity - ${subject}`, () => {
    for (const parityCase of PARITY_CASES) {
      test(parityCase.name, async () => {
        const injectedError = getError({
          message: `[TransactionParity] ${parityCase.failOn ?? 'nothing'} injected to fail`,
        });
        const handle = await probe().begin({
          failure: parityCase.failOn
            ? { statement: parityCase.failOn, error: injectedError }
            : undefined,
        });

        await parityCase.run({ handle, injectedError });
      });
    }
  });
};
