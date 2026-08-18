import type { ISqliteTransaction } from '@/relational/sqlite/datasources/common';
import type { TSqliteConnector } from '@/relational/sqlite/drivers';
import type { IRelationalExtraOptions } from '@/relational/core/repositories/common';

/** These surfaces are engine-neutral; re-exported so the sqlite import paths keep resolving. */
export type {
  IRelationalQueryDialect,
  ITransformedUpdateData,
  TTableColumns,
} from '@/relational/core/repositories/common';

/**
 * SQLite's `IRelationalExtraOptions`: narrows `transaction` to
 * `ISqliteTransaction` so `options.transaction.connector` is an async
 * `BaseSQLiteDatabase` without a cast. Default for every sqlite repository
 * class; extend a plain `IExtraOptions` to opt back out to the neutral shape.
 */
export interface ISqliteExtraOptions extends IRelationalExtraOptions<TSqliteConnector> {
  transaction?: ISqliteTransaction;
}
