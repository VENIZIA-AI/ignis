import type { ITransaction } from '@/base/datasources';
import { isRelationalTransaction } from '@/connectors/relational/datasources/common';
import type { IDatabaseTransaction } from './types';

/** Narrows the neutral `ITransaction` to the Postgres-flavoured handle before accessing `.connector`. Delegates to the neutral guard - the runtime check is identical; only the narrowed type differs. */
export const isDatabaseTransaction = (
  transaction: ITransaction | undefined,
): transaction is IDatabaseTransaction => {
  return isRelationalTransaction(transaction);
};
