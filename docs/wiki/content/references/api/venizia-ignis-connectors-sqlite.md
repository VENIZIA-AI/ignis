---
title: "@venizia/ignis-connectors/sqlite"
description: "Every export of @venizia/ignis-connectors/sqlite, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/sqlite`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

49 exports, 49 with TSDoc. 22 more are re-exported from other entries (listed at the end).

## `AbstractSqliteDataSource`

*class*

SQLite branch root: supplies the SQLite dialect and executor on
top of the engine-neutral `BaseRelationalDataSource`. The BEGIN
statement stays abstract - `BaseSqliteDataSource` supplies it.

```ts
export declare abstract class AbstractSqliteDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown> extends BaseRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TSqliteConnector<Schema>> {
    private static queryDialect?;
    private static queryExecutor?;
    getQueryDialect(): IRelationalQueryDialect;
    getQueryExecutor(): IRelationalQueryExecutor<TSqliteConnector<Schema>>;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/abstract.ts`

## `BaseSqliteDataSource`

*class*

SQLite's half of the transaction seam: supplies the BEGIN statement the inherited
`beginTransaction()` delegates to, then attaches `beginMode` - a SQLite-only field the neutral
`IRelationalTransaction` has no concept of.

```ts
export declare abstract class BaseSqliteDataSource<Settings extends object = ISqliteDataSourceSettings, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown> extends AbstractSqliteDataSource<Settings, Schema, ConfigurableOptions, Client> {
    private resolveBeginMode;
    /**
     * The driver runs the BEGIN verbatim and never parameterized, so an
     * unchecked mode is raw interpolation into SQL. Matched as written -
     * SQLite's keywords are upper-case and nothing here normalises them.
     */
    private assertBeginMode;
    /**
     * `beginTransaction()` settles the mode before delegating here; the assertion still runs so a
     * subclass calling this directly cannot interpolate an unchecked mode.
     */
    protected buildBeginStatement(opts?: ISqliteTransactionOptions): string;
    beginTransaction(opts?: ISqliteTransactionOptions): Promise<ISqliteTransaction<Schema>>;
    /**
     * libsql's url IS SQLite's connection string; an app
     * whose settings spell it differently overrides this.
     */
    getConnectionString(): ValueOrPromise<string>;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/base.ts`

## `BaseSqliteEntity`

*class*

SQLite-bound entity base. The narrowed `Schema` keeps this barrel's `TTableObject` /
`TTableInsert` intersectable with a subclass's own schema type; the neutral `Table`-branded
bound would leave them uncomposable (TS2344).

```ts
export declare class BaseSqliteEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> extends BaseRelationalEntity<Schema> {
}
```

Source: `packages/connectors/src/relational/sqlite/models/base.ts`

## `DefaultSqliteRepository`

*class*

SQLite binding of `DefaultRelationalRepository` - the
recommended base class for most SQLite repositories.

```ts
export declare class DefaultSqliteRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = ISqliteExtraOptions, TDataSource extends IRelationalDataSource = ISqliteDataSource> extends DefaultRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/core/default.ts`

## `IEntity`

*interface*

Static schema + relations contract every entity model implements.

```ts
export interface IEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
    TABLE_NAME?: string;
    schema: Schema;
    relations?: TValueOrResolver<Array<TRelationConfig>>;
}
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `ISO_TIMESTAMP_NOW`

*const*

SQLite `DEFAULT` takes an expression only in parentheses, and `CURRENT_TIMESTAMP` would yield
second-resolution text that `isoTimestamp` does not round-trip.

```ts
export declare const ISO_TIMESTAMP_NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";
```

Source: `packages/connectors/src/relational/sqlite/models/common/columns.ts`

## `isoTimestamp`

*const*

No date storage class - timestamps live in `text`, normalized to ISO 8601 both ways so
comparisons stay lexicographic. The `data` union brands the read/insert shape with
`TIsoTimestamp` so `TWhereValue` can admit a `Date` for this column only, while a plain string
literal (insert or filter) still matches the bare `string` member.

```ts
export declare const isoTimestamp: (name: string) => import("drizzle-orm/sqlite-core").SQLiteCustomColumnBuilder<{
    name: string;
    dataType: "custom";
    columnType: "SQLiteCustomColumn";
    data: string | TIsoTimestamp;
    driverParam: string;
    enumValues: undefined;
}>;
```

Source: `packages/connectors/src/relational/sqlite/models/common/columns.ts`

## `ISqliteDataSource`

*interface*

SQLite narrowing of `IRelationalDataSource`. `Client` stays `unknown` rather than defaulting to
libsql's `Client` the way Postgres defaults to `pg.Pool`: `@libsql/client` is an optional peer,
and naming its type here would make the `@venizia/ignis-connectors/sqlite` declarations unusable
without it.

```ts
export interface ISqliteDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown> extends IRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TSqliteConnector<Schema>> {
    getQueryDialect(): IRelationalQueryDialect;
    beginTransaction(opts?: ISqliteTransactionOptions): Promise<ISqliteTransaction<Schema>>;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/common/types.ts`

## `ISqliteDataSourceSettings`

*interface*

The settings `getConnectionString()` reads by default
- libsql's url IS SQLite's connection string.

```ts
export interface ISqliteDataSourceSettings {
    /** `:memory:`, `file:./data.db`, `libsql://<host>` or an embedded-replica url. */
    url: string;
    authToken?: string;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/common/types.ts`

## `ISqliteExtraOptions`

*interface*

SQLite's `IRelationalExtraOptions`: narrows `transaction` to
`ISqliteTransaction` so `options.transaction.connector` is an async
`BaseSQLiteDatabase` without a cast. Default for every sqlite repository
class; extend a plain `IExtraOptions` to opt back out to the neutral shape.

```ts
export interface ISqliteExtraOptions extends IRelationalExtraOptions<TSqliteConnector> {
    transaction?: ISqliteTransaction;
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/common/types.ts`

## `ISqliteTransaction`

*interface*

SQLite narrowing: pins the transaction's connector to an async
`BaseSQLiteDatabase` and requires a resolved locking mode. `connector`,
`commit()` and `rollback()` come from `IRelationalTransaction`.

```ts
export interface ISqliteTransaction<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> extends IRelationalTransaction<TSqliteConnector<Schema>> {
    beginMode: TSqliteBeginMode;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/common/types.ts`

## `ISqliteTransactionOptions`

*interface*

SQLite transaction options: a locking mode where Postgres takes an isolation level.

```ts
export interface ISqliteTransactionOptions extends TRelationalTransactionOptions {
    beginMode?: TSqliteBeginMode;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/common/types.ts`

## `PersistableSqliteRepository`

*class*

SQLite binding of `PersistableRelationalRepository` - full CRUD on top of the readable surface.

```ts
export declare class PersistableSqliteRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = ISqliteExtraOptions, TDataSource extends IRelationalDataSource = ISqliteDataSource> extends PersistableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/core/persistable.ts`

## `ReadableSqliteRepository`

*class*

SQLite binding of `ReadableRelationalRepository` - read-only, write operations throw.

```ts
export declare class ReadableSqliteRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = ISqliteExtraOptions, TDataSource extends IRelationalDataSource = ISqliteDataSource> extends ReadableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/core/readable.ts`

## `SoftDeletableSqliteRepository`

*class*

SQLite binding of `SoftDeletableRelationalRepository` - soft-deletes by setting
`deletedAt` instead of physically removing rows. SQLite has no `timestamptz`,
so the column is the ISO 8601 UTC `text` the tz enricher builds.

```ts
export declare class SoftDeletableSqliteRepository<EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = ISqliteExtraOptions, TDataSource extends IRelationalDataSource = ISqliteDataSource> extends SoftDeletableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/core/soft-deletable.ts`

## `SqliteBaseRepository`

*class*

SQLite binding of `RelationalBaseRepository`: rebinds the two engine-facing
defaults so a single-argument subclass resolves `connector` to an async
`BaseSQLiteDatabase` and needs no cast on `options.transaction.connector`.

```ts
export declare abstract class SqliteBaseRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = ISqliteExtraOptions, TDataSource extends IRelationalDataSource = ISqliteDataSource> extends RelationalBaseRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/core/base.ts`

## `SqliteBeginModes`

*class*

SQLite's BEGIN axis is a locking mode, not an isolation level - every SQLite transaction is
serializable, so there is no level left to choose.

```ts
export declare class SqliteBeginModes {
    static readonly DEFERRED = "DEFERRED";
    static readonly IMMEDIATE = "IMMEDIATE";
    static readonly EXCLUSIVE = "EXCLUSIVE";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/connectors/src/relational/sqlite/datasources/common/types.ts`

## `SqliteDataTypeEnricher`

*class*

Adds the generic typed-value columns (`data_type`, `n_value`, `t_value`, `b_value`, `j_value`, `bo_value`) to a table's column definitions.

```ts
export declare class SqliteDataTypeEnricher {
    /**
     * Storage-class mapping of the Postgres twin: `double precision` -> `real`, `bytea` -> `blob`,
     * `boolean` -> `integer` 0/1, `jsonb` -> text-mode json so `json_extract` / `->>` can read it.
     */
    static generateColumnDefs(opts?: TDataTypeEnricherOptions): {
        dataType: import("drizzle-orm/sqlite-core").SQLiteTextBuilderInitial<"data_type", [string, ...string[]], number | undefined>;
        nValue: import("drizzle-orm/sqlite-core").SQLiteRealBuilderInitial<"n_value">;
        tValue: import("drizzle-orm/sqlite-core").SQLiteTextBuilderInitial<"t_value", [string, ...string[]], number | undefined>;
        bValue: import("drizzle-orm/sqlite-core").SQLiteBlobBufferBuilderInitial<"b_value">;
        jValue: import("drizzle-orm").$Type<import("drizzle-orm/sqlite-core").SQLiteTextJsonBuilderInitial<"j_value">, Record<string, any>>;
        boValue: import("drizzle-orm/sqlite-core").SQLiteBooleanBuilderInitial<"bo_value">;
    };
    static enrich(opts: {
        baseSchema: TColumnDefinitions;
        opts?: TDataTypeEnricherOptions;
    }): {
        dataType: import("drizzle-orm/sqlite-core").SQLiteTextBuilderInitial<"data_type", [string, ...string[]], number | undefined>;
        nValue: import("drizzle-orm/sqlite-core").SQLiteRealBuilderInitial<"n_value">;
        tValue: import("drizzle-orm/sqlite-core").SQLiteTextBuilderInitial<"t_value", [string, ...string[]], number | undefined>;
        bValue: import("drizzle-orm/sqlite-core").SQLiteBlobBufferBuilderInitial<"b_value">;
        jValue: import("drizzle-orm").$Type<import("drizzle-orm/sqlite-core").SQLiteTextJsonBuilderInitial<"j_value">, Record<string, any>>;
        boValue: import("drizzle-orm/sqlite-core").SQLiteBooleanBuilderInitial<"bo_value">;
    };
}
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/data-type.enricher.ts`

## `SqliteFilterBuilder`

*class*

Adds the SQLite operator table and `json_extract` path syntax; everything else - merging,
where/orderBy, column selection, include, hidden-column exclusion - is inherited unchanged.

The neutral column check is NARROWED rather than replaced: requiring the declared json mode is
what stops a mistyped `title.tier` compiling to a `json_extract` that silently returns NULL.

```ts
export declare class SqliteFilterBuilder extends FilterBuilder {
    protected get operators(): TQueryOperatorHandlers;
    protected validateJsonColumn(opts: {
        key: string;
        columns: TTableColumns;
        tableName: string;
        methodName: string;
    }): {
        column: TTableColumns[string];
        path: string[];
    };
    /**
     * `json_extract` hands back the JSON value in its own SQLite type - a
     * JSON number arrives INTEGER or REAL - so there is no text extraction
     * to repair. Postgres needs a cast only because `#>>` is always text.
     */
    protected jsonNeedsNumericCast(): boolean;
    protected buildJsonWhereCondition(opts: {
        key: string;
        value: any;
        columns: TTableColumns;
        tableName: string;
    }): SQL[];
    protected buildJsonOrderBy(opts: {
        key: string;
        direction: TConstValue<typeof Sorts>;
        columns: TTableColumns;
        tableName: string;
    }): SQL;
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/dialect/filter.ts`

## `SqliteIdEnricher`

*class*

Adds an `id` primary key to a table's column definitions: an integer rowid or a text key from `generator`. Any other `dataType` throws.

```ts
export declare class SqliteIdEnricher {
    static generateColumnDefs<Opts extends TIdEnricherOptions | undefined>(opts?: Opts): TIdColumnDef<Opts>;
    static enrich(opts: {
        baseColumns: TColumnDefinitions;
        opts?: TIdEnricherOptions;
    }): {
        id: TNumberIdCol;
    };
}

type TIdColumnDef<Opts extends TIdEnricherOptions | undefined = undefined> = Opts extends {
    id: infer IdOpts;
} ? IdOpts extends {
    dataType: 'string';
} ? {
    id: TStringIdCol;
} : {
    id: TNumberIdCol;
} : {
    id: TNumberIdCol;
};

type TStringIdCol = HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<SQLiteTextBuilderInitial<'id', [string, ...string[]], undefined>>>>>;

type TNumberIdCol = IsPrimaryKey<HasDefault<NotNull<SQLiteIntegerBuilderInitial<'id'>>>>;
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/id.enricher.ts`

## `SqlitePrincipalEnricher`

*class*

Adds a polymorphic reference pair to a table: `{discriminator}Id` and `{discriminator}Type` columns. Any other `polymorphicIdType` than `number` or `string` throws.

```ts
export declare class SqlitePrincipalEnricher {
    static generateColumnDefs<Discriminator extends string = 'principal', IdType extends TIdSchemaType = 'number', Nullable extends boolean = false, NullableDiscriminator extends boolean = true>(opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>): TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator>;
    static enrich<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions, Discriminator extends string = string, IdType extends TIdSchemaType = TIdSchemaType, Nullable extends boolean = false, NullableDiscriminator extends boolean = true>(opts: {
        baseSchema: ColumnDefinitions;
        opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>;
    }): ColumnDefinitions & (IdType extends "number" ? { [K in `${Discriminator}Id`]: [Nullable] extends [true] ? SQLiteIntegerBuilderInitial<string> : NotNull<SQLiteIntegerBuilderInitial<string>>; } : { [K_1 in `${Discriminator}Id`]: [Nullable] extends [true] ? TSQLiteTextColumn : NotNull<TSQLiteTextColumn>; }) & { [K_2 in `${Discriminator}Type`]: [NullableDiscriminator] extends [true] ? HasDefault<TSQLiteTextColumn> : NotNull<TSQLiteTextColumn>; };
}

type TPrincipalColumnDef<Discriminator extends string, IdType extends TIdSchemaType, Nullable extends boolean = false, NullableDiscriminator extends boolean = true> = (IdType extends 'number' ? {
    [K in `${Discriminator}Id`]: [Nullable] extends [true] ? SQLiteIntegerBuilderInitial<string> : NotNull<SQLiteIntegerBuilderInitial<string>>;
} : {
    [K in `${Discriminator}Id`]: [Nullable] extends [true] ? TSQLiteTextColumn : NotNull<TSQLiteTextColumn>;
}) & {
    [K in `${Discriminator}Type`]: [NullableDiscriminator] extends [true] ? HasDefault<TSQLiteTextColumn> : NotNull<TSQLiteTextColumn>;
};

type TSQLiteTextColumn = SQLiteTextBuilderInitial<string, [string, ...string[]], undefined>;
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/principal.enricher.ts`

## `SqliteQueryDialect`

*class*

The SQLite `IRelationalQueryDialect`: the neutral `FilterBuilder`'s filter translation plus the
SQLite-only JSON-path update composition (`json_set`) that `SqliteUpdateBuilder` owns. The two
stay in separate files so `SqliteFilterBuilder` keeps its zero sqlite-core imports.

```ts
export declare class SqliteQueryDialect extends SqliteFilterBuilder implements IRelationalQueryDialect {
    private readonly _updateBuilder;
    /** The SQLite update transform, reachable for callers that need the raw builder. */
    get updateBuilder(): SqliteUpdateBuilder;
    transformUpdate<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        data: Record<string, unknown>;
    }): ITransformedUpdateData;
    toUpdateData(opts: {
        transformed: ITransformedUpdateData;
    }): Record<string, unknown>;
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/dialect/query-dialect.ts`

## `SqliteQueryExecutor`

*class*

Translates already-built SQL fragments (`where`, `orderBy`, projections) to Drizzle Core calls.
Filter-to-SQL compilation is dialect work and stays in the repository tier.

The `rows as Array<R>` every write verb ends in is convention, not proof: Drizzle infers
`returning()`'s row type from the table schema, not from the caller-chosen R.

```ts
export declare class SqliteQueryExecutor implements IRelationalQueryExecutor<TSqliteConnector> {
    readonly supportsRowLock = false;
    private readonly logger;
    constructor();
    select<R>(opts: ISelectOptions<TSqliteConnector>): Promise<Array<R>>;
    count(opts: ICountOptions<TSqliteConnector>): Promise<number>;
    findMany<R>(opts: IRelationalQueryOptions<TSqliteConnector>): Promise<Array<R>>;
    findFirst<R>(opts: IRelationalQueryOptions<TSqliteConnector>): Promise<TNullable<R>>;
    insert<R>(opts: IInsertOptions<TSqliteConnector>): Promise<IWriteResult<R>>;
    update<R>(opts: IUpdateOptions<TSqliteConnector>): Promise<IWriteResult<R>>;
    remove<R>(opts: IRemoveOptions<TSqliteConnector>): Promise<IWriteResult<R>>;
    /**
     * The neutral options carry the dialect-free `Table` bound; every Drizzle SQLite verb wants the
     * concrete `SQLiteTable`. Knowing your own input belongs in the engine adapter, so the whole
     * boundary is this one cast.
     */
    private asTable;
    /**
     * Gets the Drizzle relational-query interface, validating schema registration. The error wording
     * names the entity and lists the available keys, and a test asserts it word for word.
     */
    private getQueryInterface;
    /**
     * Rows affected by a write with no RETURNING. Reads libsql's `ResultSet.rowsAffected`
     * off the raw result - engine knowledge the shared repository tier must not hold.
     * Drivers reporting `changes` instead are synchronous, and `TSqliteConnector` is
     * pinned to `'async'`, so none can arrive here.
     */
    private readAffectedRowCount;
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/executor.ts`

## `SqliteQueryOperators`

*class*

Drizzle-backed handlers for the neutral QueryOperators vocabulary. The operator NAMES live in
repositories/common/operators.ts, shared with every connector family.

```ts
export declare class SqliteQueryOperators extends SqlQueryOperators {
    /**
     * Refuses where it cannot translate: approximate SQL returns the wrong rows silently,
     * and a caller cannot tell that from a right answer. The message names the operator
     * and the missing capability, so the caller knows there is nothing to configure.
     */
    private static reject;
    static readonly FNS: {
        contains: () => never;
        containedBy: () => never;
        overlaps: () => never;
        ilike: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        nilike: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        regexp: () => never;
        iregexp: () => never;
        eq: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        ne: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        neq: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        exists: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        notExists: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        gt: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        gte: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        lt: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        lte: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        is: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        isn: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        in: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        inq: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        inSql: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        ninSql: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        nin: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        between: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        notBetween: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        like: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        nlike: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
    };
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/dialect/query.ts`

## `SqliteTzEnricher`

*class*

Adds ISO 8601 UTC timestamp columns to a table: `created_at` and `modified_at`, plus `deleted_at` when enabled.

```ts
export declare class SqliteTzEnricher {
    static generateColumnDefs<Opts extends TTzEnricherOptions | undefined>(opts?: Opts): TTzEnricherResult<Opts>;
    static enrich(opts: {
        baseSchema: TColumnDefinitions;
        opts?: TTzEnricherOptions;
    }): {
        createdAt: NotNull<HasDefault<TIsoTimestampColumn>>;
        modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>>;
    };
}

type TIsoTimestampColumn = ReturnType<typeof isoTimestamp>;
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/tz.enricher.ts`

## `SqliteUpdateBuilder`

*class*

Composes nested JSON path updates as chained `json_set` calls - SQLite's `jsonb_set`. The neutral
base owns the split and the path validation.

```ts
export declare class SqliteUpdateBuilder extends RelationalUpdateBuilder {
    constructor();
    transform<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        data: Record<string, any>;
    }): ITransformedUpdateData;
    /**
     * Path and value are BOUND, never interpolated: unlike the extraction side, nothing here has to
     * survive `sql.raw`. `json(...)` is what keeps an object, an array or `true` from being stored as
     * a JSON string.
     */
    protected composeJsonSet(opts: {
        target: SQL;
        path: string[];
        value: any;
    }): SQL;
}
```

Source: `packages/connectors/src/relational/sqlite/repositories/dialect/update.ts`

## `SqliteUserAuditEnricher`

*class*

Adds `createdBy` and `modifiedBy` columns filled from the current audit user; `modifiedBy` is refreshed on update. A `dataType` other than `number` or `string` throws.

```ts
export declare class SqliteUserAuditEnricher {
    static generateColumnDefs(opts?: TUserAuditEnricherOptions): {
        createdBy: import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<SQLiteIntegerBuilderInitial<string>, number | null>>> | import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<SQLiteTextBuilderInitial<string, [string, ...string[]], number | undefined>, string | null>>>;
        modifiedBy: import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<SQLiteIntegerBuilderInitial<string>, number | null>>> | import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<SQLiteTextBuilderInitial<string, [string, ...string[]], number | undefined>, string | null>>>;
    };
    static enrich<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(opts: {
        baseSchema: ColumnDefinitions;
        opts?: TUserAuditEnricherOptions;
    }): TUserAuditEnricherResult<ColumnDefinitions>;
}
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/user-audit.enricher.ts`

## `TColumnDefinition`

*type*

A single SQLite column builder, as passed to `sqliteTable`.

```ts
export type TColumnDefinition = SQLiteColumnBuilderBase;
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TColumnDefinitions`

*type*

A map of field names to SQLite column builders.

```ts
export type TColumnDefinitions = {
    [field: string | symbol]: TColumnDefinition;
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TDataTypeEnricherOptions`

*type*

Options of `SqliteDataTypeEnricher`: per-column defaults for the generic typed-value columns. A default is applied when its key is present, so `0`, `''` and `false` count.

```ts
export type TDataTypeEnricherOptions = {
    defaultValue: Partial<{
        dataType: string;
        nValue: number;
        tValue: string;
        bValue: Buffer;
        jValue: object;
        boValue: boolean;
    }>;
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/enrichers.ts`

## `TGetIdType`

*type*

The type of the `id` column of the table `T`.

```ts
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TIdColumn`

*type*

A SQLite column whose data type is `IdType`.

```ts
export type TIdColumn = AnySQLiteColumn<{
    data: IdType;
}>;
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TIdEnricherOptions`

*type*

SQLite has no sequences or identity columns - an integer primary key is the table's rowid, which
the engine assigns. `autoIncrement` maps to `AUTOINCREMENT`, which additionally forbids reusing a
deleted row's id, matching Postgres `generatedAlwaysAsIdentity`.

```ts
export type TIdEnricherOptions = {
    /** @default { dataType: 'number' } */
    id?: {
        dataType: 'string';
        /**
         * Builds each new id.
         *
         * @default a UUID v7
         */
        generator?: () => string;
    } | {
        dataType: 'number';
        /** @default true */
        autoIncrement?: boolean;
    };
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/enrichers.ts`

## `TIdEnricherResult`

*type*

The column definitions with an `id` primary key, text or integer, added.

```ts
export type TIdEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> = ColumnDefinitions & {
    id: TStringIdCol | TNumberIdCol;
};

type TStringIdCol = HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<SQLiteTextBuilderInitial<'id', [string, ...string[]], undefined>>>>>;

type TNumberIdCol = IsPrimaryKey<HasDefault<NotNull<SQLiteIntegerBuilderInitial<'id'>>>>;
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/id.enricher.ts`

## `TPrimaryKey`

*type*

Marks the column builder `T` as a not-null primary key.

```ts
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TPrincipalEnricherOptions`

*type*

Options of `SqlitePrincipalEnricher`: the discriminator name, the id column type, and whether the id and the type column are nullable.

```ts
export type TPrincipalEnricherOptions<Discriminator extends string = string, PolymorphicIdType extends TIdSchemaType = TIdSchemaType, Nullable extends boolean = false, NullableDiscriminator extends boolean = true> = {
    /** @default 'principal' */
    discriminator?: Discriminator;
    defaultPolymorphic?: string;
    polymorphicIdType: PolymorphicIdType;
    /** @default false */
    isNullableId?: Nullable;
    /**
     * `true` leaves the `{discriminator}Type` column nullable with a `''` default. `false`
     * makes it `NOT NULL` with no default, so an insert must give the type; a `defaultPolymorphic`
     * keeps that default.
     *
     * @default true
     */
    isNullableDiscriminator?: NullableDiscriminator;
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/enrichers.ts`

## `TSoftDeletableTableSchema`

*type*

Declared here rather than re-exported from the neutral tier: this barrel also exports the
`SQLiteTable`-branded `TTableObject` / `TTableInsert`, and the `Table`-branded neutral schema is
uncomposable with them - `TTableObject<TSoftDeletableTableSchema & {...}>` fails with TS2344.

```ts
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
    deletedAt: TDeletedAtColumn;
};
```

Source: `packages/connectors/src/relational/sqlite/repositories/core/soft-deletable.ts`

## `TSqliteBeginMode`

*type*

One of the `SqliteBeginModes` values: `DEFERRED`, `IMMEDIATE` or `EXCLUSIVE`.

```ts
export type TSqliteBeginMode = TConstValue<typeof SqliteBeginModes>;
```

Source: `packages/connectors/src/relational/sqlite/datasources/common/types.ts`

## `TSqliteConnection`

*type*

SQLite narrowing: the neutral `IRelationalConnection<TConnector>` is parameterized by the
connector type, not by `Schema`. Aliased rather than re-exported so callers keep writing
`TSqliteConnection<Schema>` and getting `connector: TSqliteConnector<Schema>`.

```ts
export type TSqliteConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> = IRelationalConnection<TSqliteConnector<Schema>>;
```

Source: `packages/connectors/src/relational/sqlite/drivers/driver.ts`

## `TSqliteConnector`

*type*

Drizzle connector for any async SQLite driver. Result kind is pinned to `'async'` - a `'sync'`
driver would block the event loop. The run-result type stays open: it is the one thing drivers
disagree on, and pinning it would drag an optional peer's types into this tier.

```ts
export type TSqliteConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> = BaseSQLiteDatabase<'async', AnyType, DataSourceSchema>;
```

Source: `packages/connectors/src/relational/sqlite/drivers/driver.ts`

## `TSqliteDriver`

*type*

SQLite narrowing: the connector is always an async `BaseSQLiteDatabase`.

```ts
export type TSqliteDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, Client = unknown> = IRelationalDriver<TSqliteConnector<Schema>, Client>;
```

Source: `packages/connectors/src/relational/sqlite/drivers/driver.ts`

## `TTableInsert`

*type*

The row shape an insert takes for the table `T`.

```ts
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TTableObject`

*type*

The row shape a select returns for the table `T`.

```ts
export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TTableSchemaWithId`

*type*

A SQLite table that has an `id` column; the bound for a model schema.

```ts
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = SQLiteTable<TC> & {
    id: TIdColumn;
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/table.ts`

## `TTzEnricherOptions`

*type*

No `withTimezone` twin of the Postgres options: with no `timestamptz`, every timestamp is an ISO
8601 UTC string carrying its own offset. Omitting `enable` opts the column IN - only
`enable: false` drops it.

```ts
export type TTzEnricherOptions = {
    /** @default { columnName: 'created_at' } */
    created?: {
        columnName: string;
    };
    /** @default { enable: true, columnName: 'modified_at' } */
    modified?: {
        enable: false;
    } | {
        enable?: true;
        columnName: string;
    };
    /** @default { enable: false } */
    deleted?: {
        enable: false;
    } | {
        enable?: true;
        columnName: string;
    };
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/enrichers.ts`

## `TTzEnricherResult`

*type*

The column definitions with `createdAt`, and `modifiedAt` and `deletedAt` when the options enable them.

```ts
export type TTzEnricherResult<Opts extends TTzEnricherOptions | undefined = undefined> = {
    createdAt: NotNull<HasDefault<TIsoTimestampColumn>>;
} & (Opts extends TTzEnricherOptions ? TIsEnabled<Opts['modified']> extends true ? {
    modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>>;
} : TIsEnabled<Opts['modified']> extends false ? {} : {
    modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>>;
} : {
    modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>>;
}) & // default when opts is undefined
(Opts extends TTzEnricherOptions ? TIsEnabled<Opts['deleted']> extends true ? {
    deletedAt: TIsoTimestampColumn;
} : {} : {});

type TIsoTimestampColumn = ReturnType<typeof isoTimestamp>;

type TIsEnabled<T> = T extends {
    enable: false;
} ? false : T extends object ? true : undefined;
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/tz.enricher.ts`

## `TUserAuditColumnOpts`

*type*

One audit column of `SqliteUserAuditEnricher`: its id type (`number` or `string`), its column name, and whether a missing user is allowed (`allowAnonymous`).

```ts
export type TUserAuditColumnOpts = {
    dataType: TIdSchemaType;
    columnName: string;
    /** @default true */
    allowAnonymous?: boolean;
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/enrichers.ts`

## `TUserAuditEnricherOptions`

*type*

Options of `SqliteUserAuditEnricher`: the `created` and `modified` user columns.

```ts
export type TUserAuditEnricherOptions = {
    /** @default { dataType: 'number', columnName: 'created_by', allowAnonymous: true } */
    created?: TUserAuditColumnOpts;
    /** @default { dataType: 'number', columnName: 'modified_by', allowAnonymous: true } */
    modified?: TUserAuditColumnOpts;
};
```

Source: `packages/connectors/src/relational/sqlite/models/common/types/enrichers.ts`

## `TUserAuditEnricherResult`

*type*

The column definitions with `createdBy` and `modifiedBy` user columns added.

```ts
export type TUserAuditEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> = ColumnDefinitions & {
    createdBy: SQLiteIntegerBuilderInitial<string> | TSQLiteTextColumn;
    modifiedBy: SQLiteIntegerBuilderInitial<string> | TSQLiteTextColumn;
};

type TSQLiteTextColumn = SQLiteTextBuilderInitial<string, [string, ...string[]], undefined>;
```

Source: `packages/connectors/src/relational/sqlite/models/enrichers/user-audit.enricher.ts`

## Re-exported

- `IDefinedEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IManyRelation` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IOneRelation` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRecursiveTreeOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalQueryDialect` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IStatementResult` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ITransformedUpdateData` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `many` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ModelFactory` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `one` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RecursiveTreeDirections` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RecursiveTreeSql` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationalEntityUtility` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationDeclarations` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDefinedEntityClass` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDeletedAtColumn` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TEntityObject` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRecursiveTreeDirection` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinition` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinitions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationMetadata` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableColumns` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
