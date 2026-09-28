import { TRANSACTION_STATE_KEY, TransactionStates } from './transaction-lifecycle';

/** True only for a handle built on `TransactionLifecycle`, from either build, that ended by COMMIT. */
export const isTransactionCommitted = (opts: { transaction: object }): boolean => {
  const { transaction } = opts;

  return (
    TRANSACTION_STATE_KEY in transaction &&
    transaction[TRANSACTION_STATE_KEY] === TransactionStates.COMMITTED
  );
};
