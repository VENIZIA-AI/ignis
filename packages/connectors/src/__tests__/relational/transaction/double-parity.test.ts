import { PostgresTransactionDouble, SqliteTransactionDouble, TransactionDouble } from '@/testing';
import type { ITransactionParityProbe } from './parity-suite';
import { TransactionEndStatements, runTransactionParity } from './parity-suite';

/**
 * The double runs the same parity table as the real handle on PGlite and libsql
 * (`real-handle-parity.test.ts`). `commitCount + rollbackCount` stands where the real handle counts
 * the COMMIT/ROLLBACK statements its connection ran.
 */
const buildDoubleProbe = (opts: {
  create: (doubleOpts: { commitError?: Error; rollbackError?: Error }) => TransactionDouble;
}): ITransactionParityProbe => ({
  begin: async beginOpts => {
    const failure = beginOpts?.failure;

    const double = opts.create({
      commitError:
        failure?.statement === TransactionEndStatements.COMMIT ? failure.error : undefined,
      rollbackError:
        failure?.statement === TransactionEndStatements.ROLLBACK ? failure.error : undefined,
    });

    return {
      transaction: double,
      countEndStatements: () => double.commitCount + double.rollbackCount,
    };
  },
});

runTransactionParity({
  subject: 'TransactionDouble',
  probe: () => buildDoubleProbe({ create: doubleOpts => new TransactionDouble(doubleOpts) }),
});

runTransactionParity({
  subject: 'PostgresTransactionDouble',
  probe: () =>
    buildDoubleProbe({ create: doubleOpts => new PostgresTransactionDouble(doubleOpts) }),
});

runTransactionParity({
  subject: 'SqliteTransactionDouble',
  probe: () => buildDoubleProbe({ create: doubleOpts => new SqliteTransactionDouble(doubleOpts) }),
});
