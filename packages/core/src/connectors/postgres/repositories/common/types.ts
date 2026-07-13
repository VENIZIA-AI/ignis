import type {
  IExtraOptions,
  RelationTypes,
  TDrizzleQueryOptions,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import type { IDatabaseTransaction } from '@/connectors/postgres/datasources';
import type { TTableObject, TTableSchemaWithId } from '@/connectors/postgres/models';
import type { createTableRelationsHelpers, getTableColumns, SQL } from 'drizzle-orm';

/** The postgres query-dialect surface a repository consumes via `dataSource.getQueryDialect()`,
 * obtained from the datasource rather than constructed inside the repository. */
export interface IRelationalQueryDialect {
  mergeFilter<T = any>(opts: { defaultFilter?: TFilter<T>; userFilter?: TFilter<T> }): TFilter<T>;
  build<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    filter: TFilter<TTableObject<Schema>>;
  }): TDrizzleQueryOptions;
  toWhere<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    where: TWhere<TTableObject<Schema>>;
  }): SQL | undefined;
  toOrderBy<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    order: string[];
  }): SQL[];
}

/** Postgres's `IExtraOptions`: narrows `transaction` to `IDatabaseTransaction` so
 * `options.transaction.connector` works without a cast. Default `ExtraOptions` for every postgres
 * repository class; extend with a plain `IExtraOptions` to opt back out to the neutral shape. */
export interface IDatabaseExtraOptions extends IExtraOptions {
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

export type TTableColumns = ReturnType<typeof getTableColumns>;

export interface ITransformedUpdateData {
  /** Regular field updates (non-JSON-path keys) */
  regularFields: Record<string, any>;

  /** SQL expressions for JSON path updates, keyed by column name */
  jsonExpressions: Record<string, SQL>;
}
