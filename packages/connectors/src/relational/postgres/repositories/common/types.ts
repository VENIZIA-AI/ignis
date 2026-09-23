import type { IDatabaseTransaction, TRelationalConnector } from '@/relational/postgres/datasources';
import type { IRelationalExtraOptions } from '@/relational/core/repositories/common';

/** These surfaces are engine-neutral; re-exported so the postgres import paths keep resolving. */
export type {
  IRelationalQueryDialect,
  ITransformedUpdateData,
  TRelationConfig,
  TTableColumns,
} from '@/relational/core/repositories/common';

/**
 * Postgres's `IRelationalExtraOptions`: narrows `transaction` to `IDatabaseTransaction` so
 * `options.transaction.connector` is a `PgDatabase` without a cast. Default for every postgres
 * repository class; extend a plain `IExtraOptions` to opt back out to the neutral shape.
 */
export interface IDatabaseExtraOptions extends IRelationalExtraOptions<TRelationalConnector> {
  transaction?: IDatabaseTransaction;
}
