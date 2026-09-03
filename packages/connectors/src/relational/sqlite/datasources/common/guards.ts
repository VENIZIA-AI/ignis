import type { ITransaction } from '@venizia/ignis-kernel';
import { isRelationalTransaction } from '@/relational/core/datasources/common';
import type { ISqliteTransaction } from './types';

/**
 * Narrows the neutral `ITransaction` to the SQLite handle before accessing `.connector`.
 * The runtime check is the neutral guard's; only the narrowed type differs.
 */
export const isSqliteTransaction = (
  transaction: ITransaction | undefined,
): transaction is ISqliteTransaction => {
  return isRelationalTransaction(transaction);
};
