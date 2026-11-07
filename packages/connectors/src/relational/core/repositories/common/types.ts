import type {
  IExtraOptions,
  IModelAccessThroughSettings,
  RelationTypes,
  ScopeFilters,
  TDrizzleQueryOptions,
  TFilter,
  TModelAccessSettings,
  TScopeOperation,
  TWhere,
} from '@venizia/ignis-kernel';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { ScopeThroughLink } from './scope-through';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
} from '@/relational/core/datasources/common';
import type { TTableObject, TTableSchemaWithId } from '@/relational/core/models/common';
import type {
  AnyColumn,
  createTableRelationsHelpers,
  getTableColumns,
  SQL,
  SQLWrapper,
} from 'drizzle-orm';

/** Entity relationship config (one-to-one/many-to-one, one-to-many); Drizzle-specific. */
export type TRelationConfig = {
  name: string;
} & (
  | {
      type: typeof RelationTypes.ONE;
      schema: TTableSchemaWithId;
      /** `fields` and `references` may be left out: they are read off the table's foreign key. */
      metadata?: Partial<
        NonNullable<
          Parameters<ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.ONE]>[1]
        >
      >;
    }
  | {
      type: typeof RelationTypes.MANY;
      schema: TTableSchemaWithId;
      metadata: Parameters<
        ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.MANY]
      >[1];
    }
);

/** The column map of a table, as returned by Drizzle's `getTableColumns`. */
export type TTableColumns = ReturnType<typeof getTableColumns>;

/** The engine-neutral query-dialect surface a repository consumes via `dataSource.getQueryDialect()`, never constructed inside the repository. */
export interface IRelationalQueryDialect {
  /** The relations a schema declares, by name. */
  resolveRelations(opts: { schema: TTableSchemaWithId }): Record<string, TRelationConfig>;
  /** The error the query gives for a `where` key or an `order` field that names no column. */
  columnNotFoundError(opts: { kind: 'where' | 'order'; key: string; tableName: string }): Error;
  /** The fields the model of a schema hides. */
  resolveHiddenProperties(opts: { schema: TTableSchemaWithId }): Set<string>;
  mergeFilter<T = any>(opts: { defaultFilter?: TFilter<T>; userFilter?: TFilter<T> }): TFilter<T>;
  composeScope<T = any>(opts: { scopeWhere: TWhere<T>; userFilter?: TFilter<T> }): TFilter<T>;
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
  /** `expressions` names sort targets the schema cannot: a joined column or a computed `SQL`, keyed by the name an order entry uses. */
  toOrderBy<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    order: string[];
    expressions?: Readonly<Record<string, AnyColumn | SQLWrapper>>;
  }): SQL[];

  /** Splits update data into plain column assignments and engine-specific JSON-path expressions. Postgres composes `jsonb_set`; another engine composes its own. */
  transformUpdate<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, unknown>;
  }): ITransformedUpdateData;

  /** Flattens a transform result into the object handed to the driver's `set()`. */
  toUpdateData(opts: { transformed: ITransformedUpdateData }): Record<string, unknown>;

  /** The foreign key link of a `through` model and the scope its parent resolves for `operation`: what a write must check its rows against. */
  resolveThrough(opts: {
    settings: IModelAccessThroughSettings;
    schema: TTableSchemaWithId;
    operation: TScopeOperation;
  }): {
    link: ReturnType<typeof ScopeThroughLink.of>;
    scope: TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;
  };

  /** The parent's scope as a `where` on the parent table. */
  toParentWhere(opts: {
    link: ReturnType<typeof ScopeThroughLink.of>;
    scope: TWhere;
  }): ReturnType<IRelationalQueryDialect['toWhere']>;

  /**
   * The scope of a model for one call: what its `resolve` answers, or, for a `through` model, a `where` on its
   * foreign key built from its parent's own scope (`UNRESTRICTED` or null when the parent's is).
   */
  resolveAccessScope(opts: {
    settings: TModelAccessSettings;
    schema: TTableSchemaWithId;
    operation: TScopeOperation;
  }): TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;
}

/** The SQL branch's `IExtraOptions`: narrows `transaction` to a connector-bearing SQL handle so `options.transaction.connector` needs no cast. An engine binds `TConnector` to keep that access typed; unbound it is `unknown`, which is all neutral code can know. */
export interface IRelationalExtraOptions<TConnector = unknown> extends IExtraOptions {
  transaction?: IRelationalTransaction<TConnector>;
}

/** The connector type a given datasource hands out, so a repository's `resolveConnector` stays as specific as the datasource it was bound to. */
export type TRelationalConnectorOf<TDataSource extends IRelationalDataSource> = ReturnType<
  TDataSource['getConnector']
>;

/** The transaction-options shape a given datasource's own `beginTransaction` accepts - Postgres adds `isolationLevel`. */
export type TRelationalTransactionOptionsOf<TDataSource extends IRelationalDataSource> = Parameters<
  TDataSource['beginTransaction']
>[0];

/** The transaction handle a given datasource's own `beginTransaction` resolves to. */
export type TRelationalTransactionOf<TDataSource extends IRelationalDataSource> = Awaited<
  ReturnType<TDataSource['beginTransaction']>
>;

/** Update data split into plain column values and JSON-path updates that need SQL expressions. */
export interface ITransformedUpdateData {
  /** Regular field updates (non-JSON-path keys) */
  regularFields: Record<string, any>;

  /** SQL expressions for JSON path updates, keyed by the schema PROPERTY name - not the column name, which is what the emitted SQL quotes. The two diverge whenever a column is declared as `jsonb('meta_data')` under a property called `metadata`. */
  jsonExpressions: Record<string, SQL>;
}
