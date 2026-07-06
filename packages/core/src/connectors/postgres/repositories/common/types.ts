import { IExtraOptions, RelationTypes } from '@/base/repositories/common';
import { IDatabaseTransaction } from '@/connectors/postgres/datasources';
import { TTableSchemaWithId } from '@/connectors/postgres/models';
import { createTableRelationsHelpers, getTableColumns, SQL } from 'drizzle-orm';

/** Postgres's `IExtraOptions`: narrows `transaction` to `IDatabaseTransaction` so
 * `options.transaction.connector` works without a cast. Default `ExtraOptions` for every postgres
 * repository class; extend with a plain `IExtraOptions` to opt back out to the neutral shape. */
export interface IDatabaseExtraOptions extends IExtraOptions {
  transaction?: IDatabaseTransaction;
}

/** Entity relationship config (one-to-one/many-to-one, one-to-many). Drizzle-specific, so it lives
 * in the postgres connector rather than the neutral base repository types. */
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

/** Cached table columns type. */
export type TTableColumns = ReturnType<typeof getTableColumns>;

/** Result of transforming update data for Drizzle. */
export interface ITransformedUpdateData {
  /** Regular field updates (non-JSON-path keys) */
  regularFields: Record<string, any>;

  /** SQL expressions for JSON path updates, keyed by column name */
  jsonExpressions: Record<string, SQL>;
}
