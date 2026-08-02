import type { ISqliteTransaction } from '@/connectors/sqlite/datasources/common';
import type { TSqliteConnector } from '@/connectors/sqlite/drivers';
import type { IRelationalExtraOptions } from '@/connectors/relational/repositories/common';

/** These surfaces are engine-neutral; re-exported so the sqlite import paths keep resolving. */
export type {
  IRelationalQueryDialect,
  ITransformedUpdateData,
  TTableColumns,
} from '@/connectors/relational/repositories/common';

/**
 * SQLite's `IRelationalExtraOptions`: narrows `transaction` to
 * `ISqliteTransaction` so `options.transaction.connector` is an async
 * `BaseSQLiteDatabase` without a cast. Default for every sqlite repository
 * class; extend a plain `IExtraOptions` to opt back out to the neutral shape.
 */
export interface ISqliteExtraOptions extends IRelationalExtraOptions<TSqliteConnector> {
  transaction?: ISqliteTransaction;
}
