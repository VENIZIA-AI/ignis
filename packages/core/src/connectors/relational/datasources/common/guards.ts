import type { ITransaction } from '@/base/datasources';
import type { IRelationalTransaction } from './types';

/** Narrows the neutral `ITransaction` to a SQL transaction handle before accessing `.connector`. */
export const isRelationalTransaction = (
  transaction: ITransaction | undefined,
): transaction is IRelationalTransaction<unknown> => {
  return transaction !== undefined && 'connector' in transaction;
};
