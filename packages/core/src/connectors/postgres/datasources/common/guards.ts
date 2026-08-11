import type { ITransaction } from '@/base/datasources';
import { isRelationalTransaction } from '@/connectors/relational/datasources/common';
import type { IDatabaseTransaction } from './types';

/**
 * Narrows the neutral `ITransaction` to the Postgres handle before accessing `.connector`. The
 * runtime check is the neutral guard's; only the narrowed type differs.
 */
export const isDatabaseTransaction = (
  transaction: ITransaction | undefined,
): transaction is IDatabaseTransaction => {
  return isRelationalTransaction(transaction);
};
