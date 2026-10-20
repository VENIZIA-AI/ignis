import type { ITransaction } from '@venizia/ignis-kernel';
import { isRelationalTransaction } from '@/relational/core/datasources/common';
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
