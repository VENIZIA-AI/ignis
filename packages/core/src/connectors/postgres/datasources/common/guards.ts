import type { ITransaction } from '@/base/datasources';
import type { IDatabaseTransaction } from './types';

/** Narrows the neutral `ITransaction` to the postgres-flavored `IDatabaseTransaction` handle before accessing `.connector`. */
export const isDatabaseTransaction = (
  transaction: ITransaction | undefined,
): transaction is IDatabaseTransaction => {
  return transaction !== undefined && 'connector' in transaction;
};
