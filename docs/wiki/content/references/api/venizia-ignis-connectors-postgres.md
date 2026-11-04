---
title: "@venizia/ignis-connectors/postgres"
description: "Every export of @venizia/ignis-connectors/postgres, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/postgres`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

53 exports, 53 with TSDoc. 26 more are re-exported from other entries (listed at the end).

## `AbstractPostgresDataSource`

*class*

Postgres branch root: supplies the Postgres dialect and executor on top of the engine-neutral
`BaseRelationalDataSource`. The BEGIN statement stays abstract - `BasePostgresDataSource`
supplies it.

```ts
export declare abstract class AbstractPostgresDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = Pool> extends BaseRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TRelationalConnector<Schema>> {
    private static queryDialect?;
    private static queryExecutor?;
    getQueryDialect(): IRelationalQueryDialect;
    getQueryExecutor(): IRelationalQueryExecutor<TRelationalConnector<Schema>>;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/abstract.ts`

## `BaseDataSource`

*class*

Postgres's half of the transaction seam: supplies the BEGIN statement the inherited
`beginTransaction()` delegates to, then attaches `isolationLevel` - a Postgres-only field the
neutral `IRelationalTransaction` has no concept of.

**Example**
```typescript
import { BasePostgresDataSource, datasource } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { Pool } from 'pg';

export @datasource({ driver: NodePostgresDriver }) class AppDataSource extends BasePostgresDataSource<{ host: string }> {
  constructor() {
    super({ name: 'AppDataSource', config: { host: 'localhost' } });
  }

  override configure() {
    this.client = new Pool(this.settings);
  }

  override getConnectionString() {
    return `postgresql://${this.settings.host}/app`;
  }
}
```

```ts
export declare abstract class BasePostgresDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = Pool> extends AbstractPostgresDataSource<Settings, Schema, ConfigurableOptions, Client> {
    private resolveIsolationLevel;
    protected buildBeginStatement(opts?: IDatabaseTransactionOptions): string;
    beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/base.ts`

## `BaseEntity`

*class*

Base entity with Drizzle ORM support. Supports static schema or constructor-based schema.

```ts
export declare class BaseRelationalEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> extends AbstractEntity implements IEntity<Schema> {
    schema: Schema;
    readonly $inferData?: TTableObject<Schema>;
    readonly $inferPersist?: TTableInsert<Schema>;
    static TABLE_NAME?: string;
    static AUTHORIZATION_SUBJECT?: string;
    /** A carrier, deliberately widened to `Table`: a factory-built entity knows its table precisely, and a narrower static would reject that precise type. The CONTRACT stays on the instance, typed `Schema`. */
    static schema: Table;
    static relations?: TValueOrResolver<Array<TRelationConfig>>;
    constructor(opts?: {
        name?: string;
        schema?: Schema;
    });
    /** Maps the schema's id column's Drizzle `dataType` to 'number' (serial/integer) or 'string' (everything else, including bigint/unknown). */
    getIdType(): TIdSchemaType;
    /** The audit keys whose column carries a default or `$onUpdate`; an audit column with neither is left to the client. */
    getServerStampedKeys(): string[];
    getSchema<T = unknown>(opts: {
        type: TSchemaType;
    }): T;
}
```

Source: `packages/connectors/src/relational/core/models/base.ts`

## `BasePostgresDataSource`

*class*

Postgres's half of the transaction seam: supplies the BEGIN statement the inherited
`beginTransaction()` delegates to, then attaches `isolationLevel` - a Postgres-only field the
neutral `IRelationalTransaction` has no concept of.

**Example**
```typescript
import { BasePostgresDataSource, datasource } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { Pool } from 'pg';

export @datasource({ driver: NodePostgresDriver }) class AppDataSource extends BasePostgresDataSource<{ host: string }> {
  constructor() {
    super({ name: 'AppDataSource', config: { host: 'localhost' } });
  }

  override configure() {
    this.client = new Pool(this.settings);
  }

  override getConnectionString() {
    return `postgresql://${this.settings.host}/app`;
  }
}
```

```ts
export declare abstract class BasePostgresDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = Pool> extends AbstractPostgresDataSource<Settings, Schema, ConfigurableOptions, Client> {
    private resolveIsolationLevel;
    protected buildBeginStatement(opts?: IDatabaseTransactionOptions): string;
    beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/base.ts`

## `BasePostgresEntity`

*class*

Base entity with Drizzle ORM support. Supports static schema or constructor-based schema.

```ts
export declare class BaseRelationalEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> extends AbstractEntity implements IEntity<Schema> {
    schema: Schema;
    readonly $inferData?: TTableObject<Schema>;
    readonly $inferPersist?: TTableInsert<Schema>;
    static TABLE_NAME?: string;
    static AUTHORIZATION_SUBJECT?: string;
    /** A carrier, deliberately widened to `Table`: a factory-built entity knows its table precisely, and a narrower static would reject that precise type. The CONTRACT stays on the instance, typed `Schema`. */
    static schema: Table;
    static relations?: TValueOrResolver<Array<TRelationConfig>>;
    constructor(opts?: {
        name?: string;
        schema?: Schema;
    });
    /** Maps the schema's id column's Drizzle `dataType` to 'number' (serial/integer) or 'string' (everything else, including bigint/unknown). */
    getIdType(): TIdSchemaType;
    /** The audit keys whose column carries a default or `$onUpdate`; an audit column with neither is left to the client. */
    getServerStampedKeys(): string[];
    getSchema<T = unknown>(opts: {
        type: TSchemaType;
    }): T;
}
```

Source: `packages/connectors/src/relational/core/models/base.ts`

## `BigIntModes`

*class*

How a `big-number` id column is read back: as a JavaScript NUMBER or as a BIGINT (drizzle's `bigint` column `mode`).

```ts
export declare class BigIntModes {
    static readonly NUMBER = "number";
    static readonly BIGINT = "bigint";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/connectors/src/relational/postgres/models/common/constants.ts`

## `DefaultCRUDRepository`

*class*

Postgres binding of `DefaultRelationalRepository` - the recommended base class for most Postgres repositories.

```ts
export declare class DefaultCRUDRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IDatabaseExtraOptions, TDataSource extends IRelationalDataSource = IPostgresDataSource> extends DefaultRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/postgres/repositories/core/default.ts`

## `IDatabaseExtraOptions`

*interface*

Postgres's `IRelationalExtraOptions`: narrows `transaction` to `IDatabaseTransaction` so
`options.transaction.connector` is a `PgDatabase` without a cast. Default for every postgres
repository class; extend a plain `IExtraOptions` to opt back out to the neutral shape.

```ts
export interface IDatabaseExtraOptions extends IRelationalExtraOptions<TRelationalConnector> {
    transaction?: IDatabaseTransaction;
}
```

Source: `packages/connectors/src/relational/postgres/repositories/common/types.ts`

## `IDatabaseTransaction`

*interface*

Postgres narrowing: pins the transaction's connector to a `PgDatabase` and requires a resolved
isolation level. `connector`, `commit()` and `rollback()` come from `IRelationalTransaction`.

```ts
export interface IDatabaseTransaction<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> extends IRelationalTransaction<TRelationalConnector<Schema>> {
    isolationLevel: TIsolationLevel;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

## `IDatabaseTransactionOptions`

*interface*

Postgres transaction options: a typed `isolationLevel` on top of the string-only neutral one.

```ts
export interface IDatabaseTransactionOptions extends TRelationalTransactionOptions {
    isolationLevel?: TIsolationLevel;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

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

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `IPostgresDataSource`

*interface*

Postgres narrowing of `IRelationalDataSource`: pins the connector to `PgDatabase` and narrows
`beginTransaction` to the isolation-level-aware `IDatabaseTransaction`.

```ts
export interface IPostgresDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = Pool> extends IRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TRelationalConnector<Schema>> {
    getQueryDialect(): IRelationalQueryDialect;
    beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

## `isDatabaseTransaction`

*const*

Narrows the neutral `ITransaction` to the Postgres handle before accessing `.connector`. The
runtime check is the neutral guard's; only the narrowed type differs.

```ts
export declare const isDatabaseTransaction: (transaction: ITransaction | undefined) => transaction is IDatabaseTransaction;
```

Source: `packages/connectors/src/relational/postgres/datasources/common/guards.ts`

## `IsolationLevels`

*class*

Postgres transaction isolation levels accepted by `isolationLevel`.

```ts
export declare class IsolationLevels {
    static readonly READ_COMMITTED = "READ COMMITTED";
    static readonly REPEATABLE_READ = "REPEATABLE READ";
    static readonly SERIALIZABLE = "SERIALIZABLE";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

## `isoTimestamp`

*const*

Normalizes timestamps to ISO 8601 both ways - Drizzle's `mode: 'date'` isn't JSON-friendly and
`mode: 'string'` returns Postgres's raw format. The `data` union brands the read/insert shape
with `TIsoTimestamp` so `TWhereValue` can admit a `Date` for this column only, while a plain
string literal (insert or filter) still matches the bare `string` member.

```ts
export declare const isoTimestamp: (name: string, config?: {
    withTimezone?: boolean;
}) => import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
    name: string;
    dataType: "custom";
    columnType: "PgCustomColumn";
    data: string | TIsoTimestamp;
    driverParam: string;
    enumValues: undefined;
}>;
```

Source: `packages/connectors/src/relational/postgres/models/common/columns.ts`

## `PersistableRepository`

*class*

Postgres binding of `PersistableRelationalRepository` - full CRUD on top of the readable surface.

```ts
export declare class PersistableRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IDatabaseExtraOptions, TDataSource extends IRelationalDataSource = IPostgresDataSource> extends PersistableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/postgres/repositories/core/persistable.ts`

## `PostgresBaseRepository`

*class*

Postgres binding of `RelationalBaseRepository`: rebinds the two engine-facing defaults so a
single-argument subclass resolves `connector` to a `PgDatabase` and needs no cast on
`options.transaction.connector`.

```ts
export declare abstract class PostgresBaseRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IDatabaseExtraOptions, TDataSource extends IRelationalDataSource = IPostgresDataSource> extends RelationalBaseRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/postgres/repositories/core/base.ts`

## `PostgresDataTypeEnricher`

*class*

Adds the typed value columns `data_type`, `n_value`, `t_value`, `b_value`, `j_value` and `bo_value`; `defaultValue` sets a column default only when the key is present.

```ts
export declare class PostgresDataTypeEnricher {
    static generateColumnDefs(opts?: TDataTypeEnricherOptions): {
        dataType: import("drizzle-orm/pg-core").PgTextBuilderInitial<"data_type", [string, ...string[]]>;
        nValue: import("drizzle-orm/pg-core").PgDoublePrecisionBuilderInitial<"n_value">;
        tValue: import("drizzle-orm/pg-core").PgTextBuilderInitial<"t_value", [string, ...string[]]>;
        bValue: import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
            name: "b_value";
            dataType: "custom";
            columnType: "PgCustomColumn";
            data: Buffer<ArrayBufferLike>;
            driverParam: unknown;
            enumValues: undefined;
        }>;
        jValue: import("drizzle-orm").$Type<import("drizzle-orm/pg-core").PgJsonbBuilderInitial<"j_value">, Record<string, any>>;
        boValue: import("drizzle-orm/pg-core").PgBooleanBuilderInitial<"bo_value">;
    };
    static enrich(opts: {
        baseSchema: TColumnDefinitions;
        opts?: TDataTypeEnricherOptions;
    }): {
        dataType: import("drizzle-orm/pg-core").PgTextBuilderInitial<"data_type", [string, ...string[]]>;
        nValue: import("drizzle-orm/pg-core").PgDoublePrecisionBuilderInitial<"n_value">;
        tValue: import("drizzle-orm/pg-core").PgTextBuilderInitial<"t_value", [string, ...string[]]>;
        bValue: import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
            name: "b_value";
            dataType: "custom";
            columnType: "PgCustomColumn";
            data: Buffer<ArrayBufferLike>;
            driverParam: unknown;
            enumValues: undefined;
        }>;
        jValue: import("drizzle-orm").$Type<import("drizzle-orm/pg-core").PgJsonbBuilderInitial<"j_value">, Record<string, any>>;
        boValue: import("drizzle-orm/pg-core").PgBooleanBuilderInitial<"bo_value">;
    };
}
```

Source: `packages/connectors/src/relational/postgres/models/enrichers/data-type.enricher.ts`

## `PostgresFilterBuilder`

*class*

Adds the Postgres operator table and `#>>`/`#>` JSON-path syntax to the neutral translation.

```ts
export declare class PostgresFilterBuilder extends FilterBuilder {
    protected get operators(): TQueryOperatorHandlers;
    protected buildJsonWhereCondition(opts: {
        key: string;
        value: any;
        columns: TTableColumns;
        tableName: string;
    }): SQL[];
    /** One flat fragment: every nested `SQL` level costs a render pass. */
    private toSafeNumericCast;
    protected buildJsonOrderBy(opts: {
        key: string;
        direction: TConstValue<typeof Sorts>;
        columns: TTableColumns;
        tableName: string;
    }): SQL;
}
```

Source: `packages/connectors/src/relational/postgres/repositories/dialect/filter.ts`

## `PostgresIdEnricher`

*class*

Adds the `id` primary key column. Without options it is an integer identity; string ids default to a time-ordered UUID v7.

````ts
export declare class PostgresIdEnricher {
    /**
     * Returns the `id` primary key column definition to spread into a table.
     *
     * @example
     * ```typescript
     * import { PostgresIdEnricher } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, text } from 'drizzle-orm/pg-core';
     *
     * export const tags = pgTable('Tag', {
     *   ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
     *   name: text('name').notNull(),
     * });
     * ```
     */
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
} : IdOpts extends {
    dataType: 'number';
} ? {
    id: TNumberIdCol;
} : IdOpts extends {
    dataType: 'big-number';
} ? IdOpts extends {
    numberMode: 'number';
} ? {
    id: TBigInt53IdCol;
} : {
    id: TBigInt64IdCol;
} : {
    id: TNumberIdCol;
} : {
    id: TNumberIdCol;
};

type TStringIdCol = HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<PgTextBuilderInitial<'id', [string, ...string[]]>>>>>;

type TNumberIdCol = IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'>;

type TBigInt53IdCol = IsIdentity<IsPrimaryKey<NotNull<PgBigInt53BuilderInitial<'id'>>>, 'always'>;

type TBigInt64IdCol = IsIdentity<IsPrimaryKey<NotNull<PgBigInt64BuilderInitial<'id'>>>, 'always'>;
````

Source: `packages/connectors/src/relational/postgres/models/enrichers/id.enricher.ts`

## `PostgresPrincipalEnricher`

*class*

Adds the polymorphic `{discriminator}Type` and `{discriminator}Id` columns. Throws on a `polymorphicIdType` other than `number` or `string`.

```ts
export declare class PostgresPrincipalEnricher {
    static generateColumnDefs<Discriminator extends string = 'principal', IdType extends TIdSchemaType = 'number', Nullable extends boolean = false, NullableDiscriminator extends boolean = true>(opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>): TPrincipalColumnDef<Discriminator, IdType, Nullable, NullableDiscriminator>;
    static enrich<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions, Discriminator extends string = string, IdType extends TIdSchemaType = TIdSchemaType, Nullable extends boolean = false, NullableDiscriminator extends boolean = true>(opts: {
        baseSchema: ColumnDefinitions;
        opts: TPrincipalEnricherOptions<Discriminator, IdType, Nullable, NullableDiscriminator>;
    }): ColumnDefinitions & (IdType extends "number" ? { [K in `${Discriminator}Id`]: [Nullable] extends [true] ? PgIntegerBuilderInitial<string> : NotNull<PgIntegerBuilderInitial<string>>; } : { [K_1 in `${Discriminator}Id`]: [Nullable] extends [true] ? PgTextBuilderInitial<string, [string, ...string[]]> : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>; }) & { [K_2 in `${Discriminator}Type`]: [NullableDiscriminator] extends [true] ? HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>> : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>; };
}

type TPrincipalColumnDef<Discriminator extends string, IdType extends TIdSchemaType, Nullable extends boolean = false, NullableDiscriminator extends boolean = true> = (IdType extends 'number' ? {
    [K in `${Discriminator}Id`]: [Nullable] extends [true] ? PgIntegerBuilderInitial<string> : NotNull<PgIntegerBuilderInitial<string>>;
} : {
    [K in `${Discriminator}Id`]: [Nullable] extends [true] ? PgTextBuilderInitial<string, [string, ...string[]]> : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
}) & {
    [K in `${Discriminator}Type`]: [NullableDiscriminator] extends [true] ? HasDefault<PgTextBuilderInitial<string, [string, ...string[]]>> : NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
};
```

Source: `packages/connectors/src/relational/postgres/models/enrichers/principal.enricher.ts`

## `PostgresQueryDialect`

*class*

The Postgres `IRelationalQueryDialect`: the neutral `FilterBuilder`'s filter translation plus the
Postgres-only JSON-path update composition (`jsonb_set`, `::jsonb` literals) that `UpdateBuilder`
owns. The two stay in separate files so `FilterBuilder` keeps its zero pg-core imports.

```ts
export declare class PostgresQueryDialect extends PostgresFilterBuilder implements IRelationalQueryDialect {
    private readonly _updateBuilder;
    /** The Postgres update transform, reachable for callers that need the raw builder. */
    get updateBuilder(): UpdateBuilder;
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

Source: `packages/connectors/src/relational/postgres/repositories/dialect/query-dialect.ts`

## `PostgresQueryExecutor`

*class*

Translates already-built SQL fragments (`where`, `orderBy`, projections) to Drizzle Core calls.
Filter-to-SQL compilation is dialect work and stays in the repository tier.

The `rows as Array<R>` every write verb ends in is convention, not proof: Drizzle infers
`returning()`'s row type from the table schema, not from the caller-chosen R.

```ts
export declare class PostgresQueryExecutor implements IRelationalQueryExecutor<TRelationalConnector> {
    readonly supportsRowLock = true;
    select<R>(opts: ISelectOptions<TRelationalConnector>): Promise<Array<R>>;
    count(opts: ICountOptions<TRelationalConnector>): Promise<number>;
    findMany<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<Array<R>>;
    findFirst<R>(opts: IRelationalQueryOptions<TRelationalConnector>): Promise<TNullable<R>>;
    insert<R>(opts: IInsertOptions<TRelationalConnector>): Promise<IWriteResult<R>>;
    update<R>(opts: IUpdateOptions<TRelationalConnector>): Promise<IWriteResult<R>>;
    remove<R>(opts: IRemoveOptions<TRelationalConnector>): Promise<IWriteResult<R>>;
    /**
     * Gets the Drizzle relational-query interface, validating schema registration. The error wording
     * names the entity and lists the available keys, and a test asserts it word for word.
     */
    private getQueryInterface;
    /**
     * Rows affected by a write executed without RETURNING. Reads `pg`'s `rowCount`, postgres-js's
     * `count` or PGlite's `affectedRows` off the raw driver result - engine knowledge the shared
     * repository tier must not hold.
     */
    private readAffectedRowCount;
}
```

Source: `packages/connectors/src/relational/postgres/repositories/executor.ts`

## `PostgresQueryOperators`

*class*

Drizzle-backed handlers for the neutral QueryOperators vocabulary (SQL branch only); the operator NAMES live in repositories/common/operators.ts, shared with the Search dialects.

```ts
export declare class PostgresQueryOperators extends SqlQueryOperators {
    static readonly FNS: {
        contains: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        containedBy: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        overlaps: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        ilike: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        nilike: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        regexp: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
        iregexp: (opts: IQueryHandlerOptions) => import("drizzle-orm").SQL<unknown>;
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

Source: `packages/connectors/src/relational/postgres/repositories/dialect/query.ts`

## `PostgresTzEnricher`

*class*

Adds `createdAt` (default `NOW()`), `modifiedAt` (default `NOW()`, refreshed on update) and, when enabled, a nullable `deletedAt`.

````ts
export declare class PostgresTzEnricher {
    /**
     * Returns the `createdAt`, `modifiedAt` and optional `deletedAt` column definitions to spread into a table.
     *
     * @example
     * ```typescript
     * import { PostgresTzEnricher } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable } from 'drizzle-orm/pg-core';
     *
     * export const posts = pgTable('Post', {
     *   id: integer('id').primaryKey(),
     *   ...PostgresTzEnricher.generateColumnDefs({
     *     deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
     *   }),
     * });
     * ```
     */
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
````

Source: `packages/connectors/src/relational/postgres/models/enrichers/tz.enricher.ts`

## `PostgresUserAuditEnricher`

*class*

Adds `createdBy` and `modifiedBy` columns filled from the current audit user.

```ts
export declare class PostgresUserAuditEnricher {
    static generateColumnDefs(opts?: TUserAuditEnricherOptions): {
        createdBy: import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<PgIntegerBuilderInitial<string>, number | null>>> | import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<PgTextBuilderInitial<string, [string, ...string[]]>, string | null>>>;
        modifiedBy: import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<PgIntegerBuilderInitial<string>, number | null>>> | import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").$Type<PgTextBuilderInitial<string, [string, ...string[]]>, string | null>>>;
    };
    static enrich<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(opts: {
        baseSchema: ColumnDefinitions;
        opts?: TUserAuditEnricherOptions;
    }): TUserAuditEnricherResult<ColumnDefinitions>;
}
```

Source: `packages/connectors/src/relational/postgres/models/enrichers/user-audit.enricher.ts`

## `ReadableRepository`

*class*

Postgres binding of `ReadableRelationalRepository` - read-only, write operations throw.

```ts
export declare class ReadableRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IDatabaseExtraOptions, TDataSource extends IRelationalDataSource = IPostgresDataSource> extends ReadableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/postgres/repositories/core/readable.ts`

## `SoftDeletableRepository`

*class*

Postgres binding of `SoftDeletableRelationalRepository` - soft-deletes by setting `deletedAt` instead of physically removing rows.

```ts
export declare class SoftDeletableRepository<EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IDatabaseExtraOptions, TDataSource extends IRelationalDataSource = IPostgresDataSource> extends SoftDeletableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/postgres/repositories/core/soft-deletable.ts`

## `TAnyConnector`

*type*

Alias of {@link TRelationalConnector}: a Drizzle connector for any Postgres driver.

```ts
export type TAnyConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> = TRelationalConnector<DataSourceSchema>;
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

## `TBigIntMode`

*type*

Valid big-number id mode values.

```ts
export type TBigIntMode = TConstValue<typeof BigIntModes>;
```

Source: `packages/connectors/src/relational/postgres/models/common/constants.ts`

## `TColumnDefinition`

*type*

A single Postgres column builder, as passed to `pgTable`.

```ts
export type TColumnDefinition = PgColumnBuilderBase;
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TColumnDefinitions`

*type*

A map of field names to Postgres column builders.

```ts
export type TColumnDefinitions = {
    [field: string | symbol]: TColumnDefinition;
};
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TDataTypeEnricherOptions`

*type*

Options of `PostgresDataTypeEnricher`: per-column defaults for the generic typed-value columns. A default is applied when its key is present, so `0`, `''` and `false` count.

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

Source: `packages/connectors/src/relational/postgres/models/common/types/enrichers.ts`

## `TGetIdType`

*type*

The type of the `id` column of the table `T`.

```ts
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TIdColumn`

*type*

A Postgres column whose data type is `IdType`.

```ts
export type TIdColumn = AnyPgColumn<{
    data: IdType;
}>;
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TIdEnricherOptions`

*type*

Options for the `id` primary-key column: `string` (generated text id), `number` (identity) or `big-number` (identity, `numberMode` picks the JS type).

```ts
export type TIdEnricherOptions = {
    /** @default { dataType: 'number' } */
    id?: {
        columnName?: string;
    } & ({
        dataType: 'string';
        generator?: () => string;
    } | {
        dataType: 'number';
        sequenceOptions?: PgSequenceOptions;
    } | {
        dataType: 'big-number';
        numberMode: TBigIntMode;
        sequenceOptions?: PgSequenceOptions;
    });
};
```

Source: `packages/connectors/src/relational/postgres/models/common/types/enrichers.ts`

## `TIdEnricherResult`

*type*

The column definitions with an `id` primary key, text or integer, added.

```ts
export type TIdEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> = ColumnDefinitions & {
    id: TStringIdCol | TNumberIdCol | TPrimaryKey<PgSerialBuilderInitial<'id'>>;
};

type TStringIdCol = HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<PgTextBuilderInitial<'id', [string, ...string[]]>>>>>;

type TNumberIdCol = IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'>;
```

Source: `packages/connectors/src/relational/postgres/models/enrichers/id.enricher.ts`

## `TIsolationLevel`

*type*

One of the {@link IsolationLevels} values.

```ts
export type TIsolationLevel = TConstValue<typeof IsolationLevels>;
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

## `TPrimaryKey`

*type*

Marks the column builder `T` as a not-null primary key.

```ts
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TPrincipalEnricherOptions`

*type*

Options of `PostgresPrincipalEnricher`: the discriminator name, the id column type `polymorphicIdType` (required), and whether the id and the type column are nullable.

```ts
export type TPrincipalEnricherOptions<Discriminator extends string = string, PolymorphicIdType extends TIdSchemaType = TIdSchemaType, Nullable extends boolean = false, NullableDiscriminator extends boolean = true> = {
    /**
     * The prefix of the `{discriminator}Type` and `{discriminator}Id` columns.
     *
     * @default 'principal'
     */
    discriminator?: Discriminator;
    defaultPolymorphic?: string;
    polymorphicIdType: PolymorphicIdType;
    /**
     * Whether the `{discriminator}Id` column allows NULL.
     *
     * @default false
     */
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

Source: `packages/connectors/src/relational/postgres/models/common/types/enrichers.ts`

## `TRelationalConnection`

*type*

Postgres narrowing: the neutral `IRelationalConnection<TConnector>` is parameterized by the
connector type, not by `Schema`. Aliased rather than re-exported so callers keep writing
`TRelationalConnection<Schema>` and getting `connector: TRelationalConnector<Schema>`.

```ts
export type TRelationalConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> = IRelationalConnection<TRelationalConnector<Schema>>;
```

Source: `packages/connectors/src/relational/postgres/drivers/driver.ts`

## `TRelationalConnector`

*type*

Drizzle connector for any Postgres driver: `NodePgDatabase` and `PostgresJsDatabase` both extend
`PgDatabase`, differing only in the query-result HKT.

```ts
export type TRelationalConnector<DataSourceSchema extends TAnyDataSourceSchema = TAnyDataSourceSchema> = PgDatabase<PgQueryResultHKT, DataSourceSchema>;
```

Source: `packages/connectors/src/relational/postgres/datasources/common/types.ts`

## `TRelationalDriver`

*type*

Postgres narrowing: the connector is always a `PgDatabase`.

```ts
export type TRelationalDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, Client = unknown> = IRelationalDriver<TRelationalConnector<Schema>, Client>;
```

Source: `packages/connectors/src/relational/postgres/drivers/driver.ts`

## `TSoftDeletableTableSchema`

*type*

Declared here rather than re-exported from the neutral tier: this barrel also exports the
`PgTable`-branded `TTableObject` / `TTableInsert`, and the `Table`-branded neutral schema is
uncomposable with them - `TTableObject<TSoftDeletableTableSchema & {...}>` fails with TS2344.

```ts
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
    deletedAt: TDeletedAtColumn;
};
```

Source: `packages/connectors/src/relational/postgres/repositories/core/soft-deletable.ts`

## `TTableInsert`

*type*

The row shape an insert takes for the table `T`.

```ts
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TTableObject`

*type*

The row shape a select returns for the table `T`.

```ts
export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TTableSchemaWithId`

*type*

A Postgres table that has an `id` column; the bound for a model schema.

```ts
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = PgTable<TC> & {
    id: TIdColumn;
};
```

Source: `packages/connectors/src/relational/postgres/models/common/types/table.ts`

## `TTzEnricherOptions`

*type*

Options for the timestamp columns. `created` is always present.

```ts
export type TTzEnricherOptions = {
    /** @default { columnName: 'created_at', withTimezone: true } */
    created?: {
        columnName: string;
        withTimezone: boolean;
    };
    /** @default { enable: true, columnName: 'modified_at', withTimezone: true } */
    modified?: {
        enable: false;
    } | {
        enable?: true;
        columnName: string;
        withTimezone: boolean;
    };
    /** @default { enable: false } */
    deleted?: {
        enable: false;
    } | {
        enable?: true;
        columnName: string;
        withTimezone: boolean;
    };
};
```

Source: `packages/connectors/src/relational/postgres/models/common/types/enrichers.ts`

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

Source: `packages/connectors/src/relational/postgres/models/enrichers/tz.enricher.ts`

## `TUserAuditColumnOpts`

*type*

One audit column of `PostgresUserAuditEnricher`: its id type (`number` or `string`), its column name, and whether a missing user is allowed.

```ts
export type TUserAuditColumnOpts = {
    dataType: TIdSchemaType;
    columnName: string;
    /** @default true */
    allowAnonymous?: boolean;
};
```

Source: `packages/connectors/src/relational/postgres/models/common/types/enrichers.ts`

## `TUserAuditEnricherOptions`

*type*

Options of `PostgresUserAuditEnricher`: the `created` and `modified` user columns.

```ts
export type TUserAuditEnricherOptions = {
    /** @default { dataType: 'number', columnName: 'created_by', allowAnonymous: true } */
    created?: TUserAuditColumnOpts;
    /** @default { dataType: 'number', columnName: 'modified_by', allowAnonymous: true } */
    modified?: TUserAuditColumnOpts;
};
```

Source: `packages/connectors/src/relational/postgres/models/common/types/enrichers.ts`

## `TUserAuditEnricherResult`

*type*

The column definitions with `createdBy` and `modifiedBy` user columns added.

```ts
export type TUserAuditEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> = ColumnDefinitions & {
    createdBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
    modifiedBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
};
```

Source: `packages/connectors/src/relational/postgres/models/enrichers/user-audit.enricher.ts`

## `UpdateBuilder`

*class*

Composes nested JSON path updates as chained `jsonb_set` calls.
The neutral base owns the split and the path validation.

```ts
export declare class UpdateBuilder extends RelationalUpdateBuilder {
    private static readonly SOURCE_TABLE;
    private static readonly DOCUMENT_COLUMN;
    private static readonly SOURCE_DOCUMENT;
    constructor();
    /**
     * The path and the value are RAW, not bound: `jsonb_set` takes a `text[]` and a `jsonb`, and a
     * bound parameter arrives as untyped text. Safe only because the base has already run every path
     * component through `JsonPathUtility.validateJsonPathComponents`, whose pattern admits no quote.
     */
    protected composeJsonSet(opts: {
        target: SQL;
        path: string[];
        value: any;
    }): SQL;
    private toPathLiteral;
    /** The document at `path`: `{}` when missing, NULL when it is a scalar nothing can be set inside. */
    private toParentNode;
    /** Serializes a JavaScript value to a PostgreSQL JSONB literal. */
    private serializeJsonValue;
}
```

Source: `packages/connectors/src/relational/postgres/repositories/dialect/update.ts`

## Re-exported

- `BaseRelationalEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
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
- `RelationsFactory` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TableColumnCache` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDefinedEntityClass` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDeletedAtColumn` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TEntityObject` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRecursiveTreeDirection` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationConfig` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinition` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinitions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationMetadata` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableColumns` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
