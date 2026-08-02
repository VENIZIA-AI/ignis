import type {
  IExtraOptions,
  RelationTypes,
  TDrizzleQueryOptions,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
} from '@/connectors/relational/datasources/common';
import type { TTableObject, TTableSchemaWithId } from '@/connectors/relational/models/common';
import type { createTableRelationsHelpers, getTableColumns, SQL } from 'drizzle-orm';

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

/** The engine-neutral query-dialect surface a repository consumes via `dataSource.getQueryDialect()`, obtained from the datasource rather than constructed inside the repository. */
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

  /** Splits update data into plain column assignments and engine-specific JSON-path expressions. Postgres composes `jsonb_set`; another engine composes its own. */
  transformUpdate<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, unknown>;
  }): ITransformedUpdateData;

  /** Flattens a transform result into the object handed to the driver's `set()`. */
  toUpdateData(opts: { transformed: ITransformedUpdateData }): Record<string, unknown>;
}

/** The SQL branch's `IExtraOptions`: narrows `transaction` to a connector-bearing SQL handle so `options.transaction.connector` needs no cast. `TConnector` is what an engine binds to keep that access typed - Postgres's `IDatabaseExtraOptions` pins it to a `PgDatabase`; unbound, it is `unknown`, exactly as neutral code can know. */
export interface IRelationalExtraOptions<TConnector = unknown> extends IExtraOptions {
  transaction?: IRelationalTransaction<TConnector>;
}

/** The connector type a given datasource hands out, so a repository's `resolveConnector` stays as specific as the datasource it was bound to. */
export type TRelationalConnectorOf<TDataSource extends IRelationalDataSource> = ReturnType<
  TDataSource['getConnector']
>;

/** The transaction-options shape a given datasource's own `beginTransaction` accepts - Postgres adds `isolationLevel`, another engine adds its own knobs. */
export type TRelationalTransactionOptionsOf<TDataSource extends IRelationalDataSource> = Parameters<
  TDataSource['beginTransaction']
>[0];

/** The transaction handle a given datasource's own `beginTransaction` resolves to. */
export type TRelationalTransactionOf<TDataSource extends IRelationalDataSource> = Awaited<
  ReturnType<TDataSource['beginTransaction']>
>;

export interface ITransformedUpdateData {
  /** Regular field updates (non-JSON-path keys) */
  regularFields: Record<string, any>;

  /** SQL expressions for JSON path updates, keyed by the schema PROPERTY name - not the column name, which is what the emitted SQL quotes. The two diverge whenever a column is declared as `jsonb('meta_data')` under a property called `metadata`. */
  jsonExpressions: Record<string, SQL>;
}
