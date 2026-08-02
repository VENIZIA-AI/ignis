import type { RelationTypes } from '@/base/repositories/common';
import type { IDatabaseTransaction, TRelationalConnector } from '@/connectors/postgres/datasources';
import type { TTableSchemaWithId } from '@/connectors/postgres/models';
import type { IRelationalExtraOptions } from '@/connectors/relational/repositories/common';
import type { createTableRelationsHelpers } from 'drizzle-orm';

/** These surfaces are engine-neutral and live in `@/connectors/relational/repositories/common`; re-exported here so these historical import paths keep resolving. */
export type {
  IRelationalQueryDialect,
  ITransformedUpdateData,
  TTableColumns,
} from '@/connectors/relational/repositories/common';

/** Postgres's `IRelationalExtraOptions`: narrows `transaction` all the way to `IDatabaseTransaction` so `options.transaction.connector` is a `PgDatabase` without a cast. Default for every postgres repository class; extend with a plain `IExtraOptions` to opt back out to the neutral shape. */
export interface IDatabaseExtraOptions extends IRelationalExtraOptions<TRelationalConnector> {
  transaction?: IDatabaseTransaction;
}

/** Entity relationship config (one-to-one/many-to-one, one-to-many); Drizzle-specific. */
export type TRelationConfig = {
  name: string;
} & (
  | {
      type: typeof RelationTypes.ONE;
      schema: TTableSchemaWithId;
      metadata: Parameters<
        ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.ONE]
      >[1];
    }
  | {
      type: typeof RelationTypes.MANY;
      schema: TTableSchemaWithId;
      metadata: Parameters<
        ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.MANY]
      >[1];
    }
);
