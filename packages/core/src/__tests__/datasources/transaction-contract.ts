import { describe, expect, test } from 'bun:test';
import type { ITransaction } from '@/base/datasources';

export interface ITransactionProbe {
  /** A transaction whose engine call for `failOn` rejects; omit for a transaction that succeeds. */
  begin: (opts?: { failOn?: 'COMMIT' | 'ROLLBACK' }) => Promise<ITransaction>;
}

/** The three `ITransaction` rules as a suite every connector's transaction must pass - notably the
 * failure-noop rollback that prevents original-error masking. */
export const runTransactionContract = (opts: { connector: string; probe: ITransactionProbe }) => {
  const { connector, probe } = opts;

  describe(`ITransaction contract - ${connector}`, () => {
    test('commit() throws when the engine fails to commit', async () => {
      const transaction = await probe.begin({ failOn: 'COMMIT' });

      let caught: unknown;
      try {
        await transaction.commit();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(transaction.isActive).toBe(false);
    });

    test('rollback() throws when the engine fails to roll back', async () => {
      const transaction = await probe.begin({ failOn: 'ROLLBACK' });

      let caught: unknown;
      try {
        await transaction.rollback();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
    });

    test('commit() after a SUCCESSFUL commit throws - the transaction already ended', async () => {
      const transaction = await probe.begin();
      await transaction.commit();

      let caught: unknown;
      try {
        await transaction.commit();
      } catch (error) {
        caught = error;
      }

      expect((caught as Error).message).toContain('already ended');
    });

    test('rollback() after a SUCCESSFUL commit throws - rolling back a committed transaction is a caller bug', async () => {
      const transaction = await probe.begin();
      await transaction.commit();

      let caught: unknown;
      try {
        await transaction.rollback();
      } catch (error) {
        caught = error;
      }

      expect((caught as Error).message).toContain('already ended');
    });

    test('rollback() after a FAILED commit is a silent no-op - the caller keeps its original error', async () => {
      const transaction = await probe.begin({ failOn: 'COMMIT' });

      let commitError: unknown;
      try {
        await transaction.commit();
      } catch (error) {
        commitError = error;
      }
      expect(commitError).toBeDefined();

      // The canonical caller shape: `catch (error) { await transaction.rollback(); throw error; }`.
      // A throw here would replace `commitError` with a meaningless "already ended".
      await transaction.rollback();
    });

    test('rollback() after a FAILED rollback is a silent no-op', async () => {
      const transaction = await probe.begin({ failOn: 'ROLLBACK' });

      let rollbackError: unknown;
      try {
        await transaction.rollback();
      } catch (error) {
        rollbackError = error;
      }
      expect(rollbackError).toBeDefined();

      await transaction.rollback();
    });
  });
};
