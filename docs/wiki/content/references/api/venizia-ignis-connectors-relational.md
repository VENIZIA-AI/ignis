---
title: "@venizia/ignis-connectors/relational"
description: "Every export of @venizia/ignis-connectors/relational, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/relational`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

70 exports, 70 with TSDoc.

## `AbstractRelationalDataSource`

*class*

SQL branch root: connector, pool, transactions. Engine-neutral - dialect and executor are
declared abstract here and supplied by each engine branch. The driver lifecycle (wiring, close,
secret rotation, drain) is `AbstractDriverDataSource`, shared with the raw-SQL family; this class
adds what only a relational engine has: a connection string, transactions, a query dialect and a
query executor.

```ts
export declare abstract class AbstractRelationalDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown, TConnector = unknown> extends AbstractDriverDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector, IRelationalDriver<TConnector>> implements IRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector> {
    abstract getConnectionString(): ValueOrPromise<string>;
    abstract beginTransaction(opts?: TRelationalTransactionOptions): Promise<IRelationalTransaction<TConnector>>;
    abstract getQueryDialect(): IRelationalQueryDialect;
    abstract getQueryExecutor(): IRelationalQueryExecutor<TConnector>;
}
```

Source: `packages/connectors/src/relational/core/datasources/abstract.ts`

## `AuditUserResolver`

*class*

Who to stamp on `created_by` / `modified_by`. Engine-neutral on purpose: the column BUILDERS
differ per dialect, this decision does not, and it was byte-identical in the postgres and sqlite
enrichers - so every review of this security-adjacent path had to happen twice.

CAUTION: fire-and-forget promises may run outside async context, losing AUDIT_USER_ID.

The context comes from the registry, never from `hono/context-storage` directly: that module
constructs an `AsyncLocalStorage` in its own body, which is a `TypeError` at import in a browser.
A host with no resolver installed reports "no request context" - the first branch below.

```ts
export declare class AuditUserResolver {
    static resolveAuditUserId<T>(opts: {
        allowAnonymous: boolean;
        columnField: string;
    }): T | null;
}
```

Source: `packages/connectors/src/relational/core/models/enrichers/audit-user.ts`

## `BaseRelationalDataSource`

*class*

Base DataSource with schema auto-discovery from registered repositories.

```ts
export declare abstract class BaseRelationalDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown, TConnector = unknown> extends AbstractRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector> {
    constructor(opts: {
        name: string;
        config: Settings;
        schema?: Schema;
    });
    /** Auto-discovers schema from repositories if not manually provided. */
    getSchema(): Schema;
    protected discoverSchema(): Schema;
    hasDiscoverableModels(): boolean;
    getCapabilities(): {
        transactions: boolean;
    };
    beginTransaction(opts?: TRelationalTransactionOptions): Promise<IRelationalTransaction<TConnector>>;
    /** The engine's own BEGIN. Postgres interpolates an isolation level; SQLite has none and uses `BEGIN IMMEDIATE`. Never parameterized - `BEGIN ... ISOLATION LEVEL $1` is not valid SQL. */
    protected abstract buildBeginStatement(opts?: TRelationalTransactionOptions): string;
}
```

Source: `packages/connectors/src/relational/core/datasources/base.ts`

## `BaseRelationalEntity`

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

## `DefaultRelationalRepository`

*class*

Recommended base class for most repositories - full CRUD. Engine-neutral: an engine binds `ExtraOptions` and `TDataSource` by subclassing, the way `DefaultCRUDRepository` does for Postgres.

```ts
export declare class DefaultRelationalRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IRelationalExtraOptions, TDataSource extends IRelationalDataSource = IRelationalDataSource> extends PersistableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
}
```

Source: `packages/connectors/src/relational/core/repositories/core/default.ts`

## `FilterBuilder`

*class*

Converts filter objects into Drizzle query options (where, order, columns, relations). The
operator table and both JSON extractions are abstract rather than defaulted, so this tier
emits no engine-specific SQL.

```ts
export declare abstract class FilterBuilder extends BaseHelper {
    /**
     * Per-schema memo of resolved relations. `@model` settings are
     * immutable after boot, so the lookup and resolver run once per schema.
     */
    private readonly _relationsCache;
    /** `asc`/`desc` allocate an SQL node (~75 ns) that drizzle never mutates - built once per column or expression. */
    private readonly _orderNodeCache;
    /** A freshly sliced field is hashed again on every column lookup; a remembered one is hashed once. */
    private readonly _orderEntryCache;
    constructor();
    /** Handler table for `where` translation. Abstract so this class names no engine. */
    protected abstract get operators(): TQueryOperatorHandlers;
    /**
     * Holds `userFilter` to the row scope: the scope and the caller's `where` are ANDed, never merged by key. A key merge
     * treats a scalar on both sides as a replacement (that is the soft-delete opt-out), so a scope written as
     * `{ tenantId: 'a' }` would lose to a caller's `where: { tenantId: 'b' }`. The caller can only narrow a scope.
     * Every other part of the filter (order, limit, fields, include) is the caller's.
     */
    composeScope<T = any>(opts: {
        scopeWhere: TWhere<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
    /**
     * Merges default and user filters. `where` merges at the TOP KEY LEVEL, never index-wise - that
     * corrupts operator arrays. Operator-object collisions AND-compose, so a default scope can only
     * be narrowed, and a user `undefined` never overrides a defined default. Other parts user-wins.
     */
    mergeFilter<T = any>(opts: {
        defaultFilter?: TFilter<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
    /**
     * Top-key merge: operator-object collisions AND-compose under the reserved `and` key, merging
     * with an existing `and` rather than clobbering it. Every other collision is user-wins.
     */
    private mergeWhere;
    /**
     * Registry lookup shared by the resolvers below. A failure degrades to no settings rather than
     * failing the query, and is never silent - a degraded `resolveHiddenProperties` would stop
     * hidden columns being omitted.
     */
    private resolveModelEntry;
    /**
     * Resolves hidden properties from the relation's SCHEMA object, falling back to its SQL table name -
     * `toInclude` has the schema and no class reference. A table claimed by two models answers by name
     * only, since the schema no longer names one of them.
     */
    resolveHiddenProperties(opts: {
        schema: TTableSchemaWithId;
        modelEntry?: TResolvedModelEntry;
    }): Set<string>;
    /** Resolves default filter for a schema from MetadataRegistry. */
    resolveDefaultFilter(opts: {
        schema: TTableSchemaWithId;
        modelEntry?: TResolvedModelEntry;
    }): TFilter | undefined;
    /** Resolves row-scope settings for a schema from MetadataRegistry - the relation's OWN `@model` entry, never the parent's. */
    resolveScopeFilter(opts: {
        schema: TTableSchemaWithId;
        modelEntry?: TResolvedModelEntry;
    }): TModelAccessSettings | undefined;
    /**
     * The foreign key link of a `through` model and the scope its parent resolves for `operation` (the same operation
     * at every hop). The parent's default filter is not applied: scope only. For a write the parent's scope is narrowed as a
     * direct write to the parent is (`ScopeWriteGuard.mutationWhere`), so its `write.sharedRows` holds on the hop.
     */
    resolveThrough(opts: {
        settings: IModelAccessThroughSettings;
        schema: TTableSchemaWithId;
        operation: TScopeOperation;
        depth?: number;
    }): {
        link: ReturnType<typeof ScopeThroughLink.of>;
        scope: TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;
    };
    /** The parent's scope as a `where` on the parent table: the part both the read subquery and the write check build. */
    toParentWhere(opts: {
        link: ReturnType<typeof ScopeThroughLink.of>;
        scope: TWhere;
    }): SQL<unknown> | undefined;
    /**
     * The scope of a model for one call. A `through` model keeps the child rows whose foreign key is in the set of
     * parent keys the parent's scope allows: `child.fk IN (SELECT parent.pk FROM parent WHERE <parent scope>)`, built with
     * the existing `inSql` operator.
     */
    resolveAccessScope(opts: {
        settings: TModelAccessSettings;
        schema: TTableSchemaWithId;
        operation: TScopeOperation;
        depth?: number;
    }): TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;
    /**
     * Row scope for an included relation, mirroring `applyScopeFilter` in the repository tier
     * exactly: unconditional - never gated by `shouldSkipDefaultFilter` - and deny-by-default when
     * `resolve()` cannot determine a scope. A throwing `resolve()` is never caught here, so it
     * propagates the same way it does on the parent.
     */
    private applyRelationScopeFilter;
    /** Resolves default row limit for a schema from MetadataRegistry. */
    resolveDefaultLimit(opts: {
        schema: TTableSchemaWithId;
        modelEntry?: TResolvedModelEntry;
    }): number | undefined;
    /** Resolves relation configurations for a schema from MetadataRegistry. Memoized per schema. */
    resolveRelations(opts: {
        schema: TTableSchemaWithId;
    }): Record<string, TRelationConfig>;
    private resolveRelationsUncached;
    /** Builds Drizzle query options from a filter object. */
    build<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        filter: TFilter<TTableObject<Schema>>;
    }): TDrizzleQueryOptions;
    /** Converts fields selection to Drizzle columns format. */
    toColumns(opts: {
        fields: TFields;
    }): Record<string, boolean>;
    /**
     * Converts a where clause to a Drizzle SQL condition (supports operators, JSON paths, AND/OR).
     */
    toWhere<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        where: TWhere<TTableObject<Schema>>;
    }): SQL | undefined;
    /**
     * Conditions contributed by a single where key: a logical
     * group, a JSON path, a bare value or an operator object.
     */
    private buildWhereKeyConditions;
    /**
     * Converts order entries to Drizzle SQL order nodes. A key resolves against `expressions` first
     * (a joined column or a computed `SQL`), then as a JSON path, then as a schema column.
     */
    toOrderBy<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        order: string[];
        expressions?: Readonly<Record<string, AnyColumn | SQLWrapper>>;
    }): SQL[];
    private readOrderEntry;
    private getOrderNode;
    /**
     * Converts include clause to Drizzle 'with' options
     * with nested filtering and hidden prop exclusion.
     */
    toInclude(opts: {
        include: TInclusion[];
        relations: {
            [relationName: string]: TRelationConfig;
        };
    }): Record<string, true | TDrizzleQueryOptions>;
    /**
     * Column selection with hidden properties removed;
     * a nullish `columns` means "every schema column".
     */
    private omitHiddenColumns;
    private getColumns;
    private isPrimitiveValue;
    /**
     * Protected, not private: an engine overriding `buildJsonWhereCondition` must tell an operator
     * object from a bare value, and cannot reach the base's own walk to do it.
     */
    protected isOperatorObject(opts: {
        value: any;
    }): boolean;
    /**
     * Builds a SQL condition for a simple value (null, array, or
     * equality). Protected for the same reason as `isOperatorObject`: an
     * overridden `buildJsonWhereCondition` needs the bare-value branch.
     */
    protected buildValueCondition(opts: {
        column: any;
        value: any;
    }): SQL;
    protected buildOperatorConditions(opts: {
        column: any;
        value: Record<string, any>;
    }): SQL[];
    /**
     * Negates a nested condition: `not: <operatorObject>` recurses into the
     * operators, `not: <bareValue>` negates that value equality/array/null condition.
     */
    private buildNotCondition;
    /** Builds SQL conditions for logical groups (AND/OR). */
    private buildLogicalGroupCondition;
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
     * Whether a JSON operand needs the engine's numeric extraction: numeric comparisons, eq/ne/neq
     * with a number, in/inq/nin with an all-number array. Only picks between the two fragments the
     * engine passed in, so an engine with already-typed extraction returns false.
     */
    protected jsonNeedsNumericCast(opts: {
        operators: Record<string, any>;
    }): boolean;
    /**
     * Emits the engine JSON extraction for one where key. Abstract because the syntax is
     * engine-owned: a default would hand the next engine one branch's SQL with no compile error.
     */
    protected abstract buildJsonWhereCondition(opts: {
        key: string;
        value: any;
        columns: TTableColumns;
        tableName: string;
    }): SQL[];
    /**
     * A bare JSON operand IS its operator equivalent - `isOperatorObject` counts an array
     * as primitive, so `[10, 20]` must take the same cast `{ inq: [10, 20] }` does.
     */
    protected toBareJsonOperators(opts: {
        value: any;
    }): Record<string, any>;
    /**
     * The cast belongs to each OPERATOR, not the object: one object-wide cast misses the operand in
     * `{ not: { gt: 50 } }` (-> `text > integer`) and over-casts the extraction `like` shares in
     * `{ gte: 1, like: '%a%' }` (-> `numeric ~~ text`).
     */
    protected buildJsonOperatorConditions(opts: {
        jsonPath: string | SQL;
        safeNumericCast: string | SQL;
        operators: Record<string, any>;
    }): SQL[];
    /**
     * Emits the engine's JSON extraction for one order key.
     * Abstract for the same reason as `buildJsonWhereCondition`.
     */
    protected abstract buildJsonOrderBy(opts: {
        key: string;
        direction: TConstValue<typeof Sorts>;
        columns: TTableColumns;
        tableName: string;
    }): SQL;
}

/** What one registry lookup yields - named so the three setting readers can accept an already-resolved entry instead of each repeating the lookup. */
type TResolvedModelEntry = ReturnType<MetadataRegistry['getModelEntry']>;
```

Source: `packages/connectors/src/relational/core/repositories/dialect/filter.ts`

## `ICountOptions`

*interface*

Input of a `count` call on the query executor; `where` omitted counts every row.

```ts
export interface ICountOptions<TConnector> {
    connector: TConnector;
    table: TTableSchemaWithId;
    where?: SQL;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `IDefinedEntity`

*interface*

The entity shape {@link TEntityObject} reads: a class whose instances carry their row type, plus
its relations. The row is read off the INSTANCE - the class's static `schema` is widened to
`Table` on the base, and a row read through it would take `Table`'s index signature and let
every unknown key through.

```ts
export interface IDefinedEntity<Relations extends TRelationDefinitions = TRelationDefinitions> {
    new (...args: never): {
        $inferData?: unknown;
    };
    /** Undefined when the entity declares no relations. */
    relationDefinitions: Relations | undefined;
}
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

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

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `IInsertOptions`

*interface*

Input of an `insert` call on the query executor; `shouldReturn` selects whether inserted rows are read back.

```ts
export interface IInsertOptions<TConnector> {
    connector: TConnector;
    table: TTableSchemaWithId;
    values: Record<string, unknown> | Array<Record<string, unknown>>;
    /** `undefined` returns every column; omit the key entirely to return nothing. */
    returning?: TColumnSelection;
    shouldReturn: boolean;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `IManyRelation`

*interface*

A to-many relation to `schema`, as built by `many()`; `metadata` is the Drizzle relation options.

```ts
export interface IManyRelation<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
    type: typeof RelationTypes.MANY;
    schema: Schema;
    metadata?: TRelationMetadata<typeof RelationTypes.MANY>;
}
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `IMigration`

*interface*

One migration to apply. `sql` may hold several statements separated by `--> statement-breakpoint`, as `drizzle-kit generate` writes them.

```ts
export interface IMigration {
    /** Ledger key. Never rewrite an applied one - see the hashing note on {@link RelationalMigrationRunner}. */
    name: string;
    sql: string;
}
```

Source: `packages/connectors/src/relational/core/migrations/runner.ts`

## `IOneRelation`

*interface*

A to-one relation to `schema`, as built by `one()`; `metadata` is the Drizzle relation options.

```ts
export interface IOneRelation<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
    type: typeof RelationTypes.ONE;
    schema: Schema;
    metadata?: TRelationMetadata<typeof RelationTypes.ONE>;
}
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `IRecursiveTreeOptions`

*interface*

Options for the recursive CTE fragment that walks a parent/child tree, up to ancestors or down to descendants.

```ts
export interface IRecursiveTreeOptions {
    /** CTE name the caller references in the SELECT it writes around this fragment. */
    name: string;
    /** Runtime-checked with `is(table, Table)`; also the sole dialect selector (Postgres vs SQLite) - see {@link RecursiveTreeSql}. */
    table: unknown;
    /**
     * Where the walk starts: one id, several ids (each is a root of the walk), or none. With no root a DOWN walk
     * starts from every row whose parent column is NULL; an UP walk needs a root (the ancestors of every row is never
     * what is meant) and an empty list is refused, because it would silently return nothing.
     */
    rootId?: string | ReadonlyArray<string>;
    /**
     * `'all'` makes every row a root of the walk, narrowed only by `filter` and `anchorFilter`. Use it when the
     * closure of every row is wanted, not the tree under one root. Cannot be combined with `rootId`. A row shows up
     * once per root that reaches it: in a DOWN walk a node at depth 3 below the top is returned four times (as its own
     * root and under each of its three ancestors), each time with its own `depth`; select `depth = 0` to get
     * each row once. Works for both directions; an UP walk then returns every row with all of its ancestors.
     */
    start?: 'all';
    direction: TRecursiveTreeDirection;
    /**
     * Counts EDGES, not rows: the root is at depth 0, so `N` returns up to `N+1` rows.
     * No default - `0` type-checks but silently produces an empty result, so `walk` throws at
     * runtime for `maxDepth <= 0`.
     */
    maxDepth: number;
    idColumn?: string;
    parentColumn?: string;
    /** Extra columns, beyond `idColumn`/`parentColumn`, carried into every row of the walk. */
    columns?: string[];
    /**
     * ANDed into BOTH terms (the anchor and the recursive one): a row it rejects is not in the walk and its subtree is
     * cut off. Build it with Drizzle's own `sql` tag and name the table by its alias `t`, which both terms use for it when this option is set:
     * `sql\`t.deleted_at IS NULL\``. An unqualified column is ambiguous in the recursive term when the walk carries it too
     * (`id`, `parent_id`, anything in `columns`). It is the same as passing the fragment as {@link anchorFilter} and as
     * {@link recursiveFilter}, written once.
     */
    filter?: SQL;
    /**
     * ANDed into the anchor term's WHERE clause, next to the root match - build it with
     * Drizzle's own `sql` tag, columns unqualified. Together with {@link recursiveFilter} it keeps a
     * row out of the walk at both ends, e.g. `sql\`deleted_at IS NULL\`` on each term.
     *
     * `walk` takes a table, not a model, so it never applies a model's soft delete or `access` scope by
     * itself: both terms are filtered only by what the caller passes here and in `recursiveFilter`.
     */
    anchorFilter?: SQL;
    /** ANDed into the recursive term's WHERE clause - build it with Drizzle's own `sql` tag. */
    recursiveFilter?: SQL;
    /**
     * Emits `path`/`is_cycle` and stops expanding once a row re-visits an id in its own path. Row
     * shape differs per engine and nothing in this signature shows it: Postgres returns a real array
     * and boolean; SQLite returns delimited text and `1`/`0` - so `row.path.length` throws on SQLite
     * and `row.is_cycle === true` is always false there.
     */
    trackPath?: boolean;
    startDepth?: number;
}
```

Source: `packages/connectors/src/relational/core/repositories/sqls/recursive-tree.ts`

## `IRelationalConnection`

*interface*

One dedicated physical connection, held for the lifetime of a single explicit transaction.

```ts
export interface IRelationalConnection<TConnector> {
    /** Drizzle bound to THIS connection, not to the pool. */
    connector: TConnector;
    /** Runs a control statement verbatim (BEGIN / COMMIT / ROLLBACK / SET LOCAL) - never parameterized, `BEGIN ... ISOLATION LEVEL $1` is not valid SQL. Use `connector` for rows. */
    execute(opts: {
        statement: string;
    }): Promise<IStatementResult>;
    /** Rows from a verbatim statement, for the few callers that have no Drizzle schema to query through - the migration ledger is the one in-tree case. Also unparameterized: placeholder syntax is not portable (`$1` on Postgres, `?` on SQLite), so a caller needing a value must prove it is a literal. */
    query<R>(opts: {
        statement: string;
    }): Promise<Array<R>>;
    /** Returns the connection; `destroy` discards instead of pooling - required after a failed COMMIT/ROLLBACK, where the next borrower would inherit an open transaction. A driver that cannot destroy must say so in its own docs. */
    release(opts?: {
        destroy?: boolean;
    }): void;
}
```

Source: `packages/connectors/src/relational/core/drivers/driver.ts`

## `IRelationalDataSource`

*interface*

SQL-branch contract, engine-free. Extends `AbstractDataSource` itself, not just `IDataSource`, so repositories can narrow safely. `getConnectionString()` is app-implemented and never called by the framework - an embedded engine with no URL returns its data directory.

```ts
export interface IRelationalDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown, TConnector = unknown> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
    connector: TConnector;
    getConnectionString(): ValueOrPromise<string>;
    getConnector(): TConnector;
    getClient(): Client;
    getQueryDialect(): IRelationalQueryDialect;
    getQueryExecutor(): IRelationalQueryExecutor<TConnector>;
    beginTransaction(opts?: TRelationalTransactionOptions): Promise<IRelationalTransaction<TConnector>>;
}
```

Source: `packages/connectors/src/relational/core/datasources/common/types.ts`

## `IRelationalDriver`

*interface*

The common driver (connector, client, end) plus connection acquisition and raw control statements - the only places hard-wired to a client library. `configure()` stays app-written: the framework never builds the driver for you.

```ts
export interface IRelationalDriver<TConnector, Client = unknown> extends IConnectorDriver<TConnector, Client> {
    acquire(opts: {
        schema: TAnyDataSourceSchema;
    }): Promise<IRelationalConnection<TConnector>>;
}
```

Source: `packages/connectors/src/relational/core/drivers/driver.ts`

## `IRelationalExtraOptions`

*interface*

The SQL branch's `IExtraOptions`: narrows `transaction` to a connector-bearing SQL handle so `options.transaction.connector` needs no cast. An engine binds `TConnector` to keep that access typed; unbound it is `unknown`, which is all neutral code can know.

```ts
export interface IRelationalExtraOptions<TConnector = unknown> extends IExtraOptions {
    transaction?: IRelationalTransaction<TConnector>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `IRelationalQueryDialect`

*interface*

The engine-neutral query-dialect surface a repository consumes via `dataSource.getQueryDialect()`, never constructed inside the repository.

```ts
export interface IRelationalQueryDialect {
    mergeFilter<T = any>(opts: {
        defaultFilter?: TFilter<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
    composeScope<T = any>(opts: {
        scopeWhere: TWhere<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
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
    toUpdateData(opts: {
        transformed: ITransformedUpdateData;
    }): Record<string, unknown>;
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
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `IRelationalQueryExecutor`

*interface*

Every Drizzle call the shared repository tier makes, behind one engine-supplied port obtained via `dataSource.getQueryExecutor()`. Stateless: the connector is passed per call because the repository resolves a transaction-bound connector per operation.

```ts
export interface IRelationalQueryExecutor<TConnector> {
    /** Whether `select` takes a row lock. SQLite locks the whole database, so it does not, and a lock there throws. */
    readonly supportsRowLock: boolean;
    select<R>(opts: ISelectOptions<TConnector>): Promise<Array<R>>;
    count(opts: ICountOptions<TConnector>): Promise<number>;
    findMany<R>(opts: IRelationalQueryOptions<TConnector>): Promise<Array<R>>;
    findFirst<R>(opts: IRelationalQueryOptions<TConnector>): Promise<TNullable<R>>;
    insert<R>(opts: IInsertOptions<TConnector>): Promise<IWriteResult<R>>;
    update<R>(opts: IUpdateOptions<TConnector>): Promise<IWriteResult<R>>;
    remove<R>(opts: IRemoveOptions<TConnector>): Promise<IWriteResult<R>>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `IRelationalQueryOptions`

*interface*

Input of a relational (`findMany`/`findFirst` style) query on the query executor, run through Drizzle's relational query interface.

```ts
export interface IRelationalQueryOptions<TConnector> {
    connector: TConnector;
    /** Schema registration key - the entity's `TABLE_NAME`, used to reach Drizzle's relational query interface. */
    entityName: string;
    query: TDrizzleQueryOptions;
    /** The calling repository's class name, so a thrown error names the class that failed rather than the executor. Falls back to the executor's own name when absent. */
    scope?: string;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `IRelationalTransaction`

*interface*

Transaction handle for a SQL datasource: `connector` runs queries inside the transaction, `commit()` and `rollback()` end it.

```ts
export interface IRelationalTransaction<TConnector> extends ITransaction {
    /** Bound to the transaction's own connection, whichever driver acquired it. */
    connector: TConnector;
    /** Throws if COMMIT fails, per {@link ITransaction.commit}. The connection is discarded where the driver supports it (node-postgres `release(error)`); postgres-js has no destroy semantics, so a poisoned connection returns to its pool. */
    commit(): Promise<void>;
    /** Throws if ROLLBACK fails (same connection-discard caveat as {@link commit}) - but is a silent no-op after the transaction already ended BY FAILURE, keeping `catch (error) { await transaction.rollback(); throw error; }` safe. */
    rollback(): Promise<void>;
}
```

Source: `packages/connectors/src/relational/core/datasources/common/types.ts`

## `IRemoveOptions`

*interface*

Input of a `remove` call on the query executor; `where` omitted removes every row.

```ts
export interface IRemoveOptions<TConnector> {
    connector: TConnector;
    table: TTableSchemaWithId;
    where?: SQL;
    returning?: TColumnSelection;
    shouldReturn: boolean;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `ISelectOptions`

*interface*

Input of a `select` call on the query executor; `connector` is the one resolved for the current operation or transaction.

```ts
export interface ISelectOptions<TConnector> {
    connector: TConnector;
    table: TTableSchemaWithId;
    columns?: TColumnSelection;
    where?: SQL;
    orderBy?: SQL[];
    limit?: number;
    offset?: number;
    /** Postgres `FOR UPDATE` and friends. Engines without row locking throw NotSupported. */
    lock?: TLockOptions;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `isRelationalTransaction`

*const*

Narrows the neutral `ITransaction` to a SQL transaction handle before accessing `.connector`.

```ts
export declare const isRelationalTransaction: (transaction: ITransaction | undefined) => transaction is IRelationalTransaction<unknown>;
```

Source: `packages/connectors/src/relational/core/datasources/common/guards.ts`

## `IStatementResult`

*interface*

Neutral result of a raw statement. Each driver maps its native shape (pg `rowCount`, postgres-js `count`) at its own boundary - callers never sniff shapes at runtime.

```ts
export interface IStatementResult {
    /** Rows affected - the same `count` the repository verbs return; `0` for control statements (BEGIN / COMMIT / SET LOCAL). */
    count: number;
}
```

Source: `packages/connectors/src/relational/core/drivers/driver.ts`

## `ITransformedUpdateData`

*interface*

Update data split into plain column values and JSON-path updates that need SQL expressions.

```ts
export interface ITransformedUpdateData {
    /** Regular field updates (non-JSON-path keys) */
    regularFields: Record<string, any>;
    /** SQL expressions for JSON path updates, keyed by the schema PROPERTY name - not the column name, which is what the emitted SQL quotes. The two diverge whenever a column is declared as `jsonb('meta_data')` under a property called `metadata`. */
    jsonExpressions: Record<string, SQL>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `IUpdateOptions`

*interface*

Input of an `update` call on the query executor; `where` omitted updates every row.

```ts
export interface IUpdateOptions<TConnector> {
    connector: TConnector;
    table: TTableSchemaWithId;
    data: Record<string, unknown>;
    where?: SQL;
    returning?: TColumnSelection;
    shouldReturn: boolean;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `IWriteResult`

*interface*

A write's outcome. `count` is authoritative in both modes: with `shouldReturn` true it is `rows.length`, with it false the engine reads its driver's affected-row field and `rows` is empty. A bare `Array<R>` cannot express the second mode, which is why writes do not return one.

```ts
export interface IWriteResult<R> {
    count: number;
    rows: Array<R>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `JSON_PATH_PATTERN`

*const*

Regex for validating JSON path components (identifiers, kebab-case, array indices).

```ts
export declare const JSON_PATH_PATTERN: RegExp;
```

Source: `packages/connectors/src/relational/core/repositories/dialect/internal/json-utils.ts`

## `JsonPathUtility`

*class*

Parses and validates JSON-path keys such as `meta.tags[0]` used in update data and filters.

```ts
export declare class JsonPathUtility {
    static isJsonPath(opts: {
        key: string;
    }): boolean;
    static parseJsonPath(opts: {
        key: string;
    }): {
        columnName: string;
        path: string[];
    };
    /** @throws Error if any path component is invalid. */
    static validateJsonPathComponents(opts: {
        path: string[];
        tableName: string;
        methodName: string;
    }): void;
    /**
     * @throws Error if the column is not a JSON column. Names no engine type: `jsonb` is unreachable
     * off Postgres.
     */
    static validateJsonColumnType(opts: {
        column: {
            dataType: string;
        };
        columnName: string;
        tableName: string;
        methodName: string;
    }): void;
}
```

Source: `packages/connectors/src/relational/core/repositories/dialect/internal/json-utils.ts`

## `many`

*const*

Declares a to-many relation to `schema`.

```ts
export declare const many: <Schema extends TTableSchemaWithId>(schema: Schema, metadata?: TRelationMetadata<typeof RelationTypes.MANY>) => IManyRelation<Schema>;
```

Source: `packages/connectors/src/relational/core/models/relations.ts`

## `ModelFactory`

*class*

Builds an entity class from its table, so a model states each fact once.

````ts
export declare class ModelFactory {
    /**
     * The table comes first, as a plain drizzle table (`pgTable`, `pgSchema(...).table`,
     * `sqliteTable`): relations point at TABLES, so two entities that relate to each other never
     * import each other, and the compiler keeps both row types.
     *
     * @example
     * ```typescript
     * import { ModelFactory, one } from '@venizia/ignis-connectors/relational';
     * import { integer, pgTable } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey() });
     * const posts = pgTable('Post', { id: integer('id').primaryKey(), authorId: integer('author_id') });
     *
     * export class Post extends ModelFactory.defineEntity({
     *   table: posts,
     *   relations: () => ({ author: one(users, { fields: [posts.authorId], references: [users.id] }) }),
     * }) {}
     * ```
     */
    static defineEntity<Schema extends TTableSchemaWithId, Relations extends TRelationDefinitions = {}>(opts: {
        table: Schema;
        relations?: () => Relations;
    }): TDefinedEntityClass<Schema, Relations>;
}
````

Source: `packages/connectors/src/relational/core/models/factory.ts`

## `one`

*const*

Declares a to-one relation to `schema`.

```ts
export declare const one: <Schema extends TTableSchemaWithId>(schema: Schema, metadata?: TRelationMetadata<typeof RelationTypes.ONE>) => IOneRelation<Schema>;
```

Source: `packages/connectors/src/relational/core/models/relations.ts`

## `PersistableRelationalRepository`

*class*

Full CRUD repository extending ReadableRelationalRepository with create, update, and delete.

````ts
export declare class PersistableRelationalRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IRelationalExtraOptions, TDataSource extends IRelationalDataSource = IRelationalDataSource> extends ReadableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
    constructor(ds?: TDataSource, opts?: {
        entityClass?: TClass<BaseRelationalEntity<EntitySchema>>;
    });
    /** Reach the engine's update transform through `dataSource.getQueryDialect()`. Engines without an update builder return `undefined`. `AnyType` rather than `unknown`: the concrete builder is engine-specific, and `unknown` breaks every `updateBuilder.transform(...)` call site. */
    get updateBuilder(): AnyType;
    /** Guards id-based operations against a null/undefined id */
    protected validateId(opts: {
        id: unknown;
        operationName: string;
    }): void;
    /** Prevents accidental table-wide updates/deletes by requiring an explicit force flag; returns the built where SQL so callers reuse it instead of rebuilding on identical input. */
    protected validateWhereCondition(opts: {
        where: TWhere<DataObject>;
        force?: boolean;
        operationName: string;
    }): {
        condition: SQL | undefined;
        isEmptyWhere: boolean;
    };
    protected _create<R = DataObject>(opts: {
        data: Array<PersistObject>;
        options: ExtraOptions & {
            shouldReturn?: boolean;
            log?: TRepositoryLogOptions;
        };
    }): Promise<TCount & {
        data: TNullable<Array<R>>;
    }>;
    /**
     * Inserts one row; `shouldReturn: false` skips reading it back.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * const { data } = await repo.create({ data: { status: 'ACTIVE' } });
     * await repo.create({ data: { status: 'ACTIVE' }, options: { shouldReturn: false } });
     * ```
     */
    create(opts: {
        data: PersistObject;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    create<R = DataObject>(opts: {
        data: PersistObject;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /**
     * Inserts many rows in one statement.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * const { count } = await repo.createAll({ data: [{ status: 'ACTIVE' }, { status: 'DONE' }] });
     * ```
     */
    createAll(opts: {
        data: Array<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    createAll<R = DataObject>(opts: {
        data: Array<PersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    /**
     * `operation` is what the row scope sees: UPDATE for an update (and a restore), DELETE for a
     * soft delete, which is a delete to the caller even though it is stored as an update.
     */
    protected _update<R = DataObject>(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options?: IExtraOptions & {
            shouldReturn?: boolean;
            force?: boolean;
        };
        operation?: typeof ScopeOperations.UPDATE | typeof ScopeOperations.DELETE;
    }): Promise<TCount & {
        data: TNullable<Array<R>>;
    }>;
    /**
     * Updates the row with this `id`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * const { data } = await repo.updateById({ id: 1, data: { status: 'DONE' } });
     * ```
     */
    updateById(opts: {
        id: DataObject['id'];
        data: Partial<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateById<R = DataObject>(opts: {
        id: DataObject['id'];
        data: Partial<PersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /**
     * Gives each row its own `data`: one update per row, all in one transaction. A row that matches nothing (missing, outside the scope, soft deleted) is `null` in `data` and adds 0 to `count`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * const rows = [{ id: 1, data: { status: 'DONE' } }, { id: 2, data: { status: 'ACTIVE' } }];
     * await repo.updateEach({ rows, options: { shouldReturn: false } });
     * ```
     */
    updateEach<R = DataObject>(opts: {
        rows: Array<{
            id: DataObject['id'];
            data: Partial<PersistObject>;
        }>;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
            transaction?: TRelationalTransactionOf<TDataSource>;
        };
    }): Promise<TCount & {
        data: TNullable<Array<TNullable<R>>>;
    }>;
    /**
     * Applies one `data` patch to every row matching `where`; an empty `where` needs `options.force`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * await repo.updateAll({ where: { status: 'ACTIVE' }, data: { status: 'DONE' } });
     * await repo.updateAll({ where: {}, data: { status: 'DONE' }, options: { force: true } });
     * ```
     */
    updateAll(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateAll<R = DataObject>(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    protected _delete<R = DataObject>(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: TNullable<Array<R>>;
    }>;
    /**
     * Deletes the row with this `id`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * const { count } = await repo.deleteById({ id: 1 });
     * ```
     */
    deleteById(opts: {
        id: DataObject['id'];
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = DataObject>(opts: {
        id: DataObject['id'];
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /**
     * Deletes the rows matching `where`; without `where` it needs `options.force`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * await repo.deleteAll({ where: { status: 'DONE' } });
     * await repo.deleteAll({ options: { force: true } });
     * ```
     */
    deleteAll(opts: {
        where?: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteAll<R = DataObject>(opts: {
        where?: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    /**
     * Deletes the rows matching `where`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * const { count } = await repo.deleteBy({ where: { status: 'DONE' } });
     * ```
     */
    deleteBy(opts: {
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteBy<R = DataObject>(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
}
````

Source: `packages/connectors/src/relational/core/repositories/core/persistable.ts`

## `ReadableRelationalRepository`

*class*

Read-only repository. Write operations throw errors.

````ts
export declare class ReadableRelationalRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IRelationalExtraOptions, TDataSource extends IRelationalDataSource = IRelationalDataSource> extends RelationalBaseRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
    constructor(ds?: TDataSource, opts?: {
        entityClass?: TClass<BaseRelationalEntity<EntitySchema>>;
    });
    /** Core API is ~15-20% faster but supports neither relations nor field selection. */
    protected canUseCoreAPI(filter: TFilter<DataObject>): boolean;
    /** Executes a query through the executor's Core-API `select`. */
    protected findWithCoreAPI<R = DataObject>(opts: {
        filter: TFilter<DataObject>;
        isFindOne?: boolean;
        options?: ExtraOptions;
        /** True only for the recursive call from `find()`, whose `filter` is already scope+default merged - prevents the row scope from being AND-composed twice. Never set from `findOne()`, whose `filter` here is still raw. */
        dangerouslySkipScopeFilter?: boolean;
    }): Promise<Array<R>>;
    /** Executes a query using the executor's relational Query API (supports relations and field selection). */
    protected findWithQueryAPI<R = DataObject>(opts: {
        filter: TFilter<DataObject>;
        options?: ExtraOptions;
    }): Promise<Array<R>>;
    /**
     * Returns the rows matching `filter`; `options.shouldQueryRange` returns them with their range.
     * @example
     * ```typescript
     * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
     * declare const repo: ReadableRepository<typeof users>;
     * const rows = await repo.find({ filter: { where: { status: 'ACTIVE' }, order: ['id DESC'], limit: 10 } });
     * const page = await repo.find({ filter: { limit: 10 }, options: { shouldQueryRange: true } });
     * ```
     */
    find<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter: TFilter<DataObject, F>;
        options: TFindRangeOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<TDataWithRange<TRow<DataObject, R, F>>>;
    find<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter: TFilter<DataObject, F>;
        options?: TFindOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<Array<TRow<DataObject, R, F>>>;
    /**
     * Auto-selects Core API or Query API based on filter complexity.
     * @example
     * ```typescript
     * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
     * declare const repo: ReadableRepository<typeof users>;
     * const user = await repo.findOne({ filter: { where: { status: 'ACTIVE' } } });
     * ```
     */
    findOne<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter: TFilter<DataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<TNullable<TRow<DataObject, R, F>>>;
    /**
     * Delegates to findOne with id in the where clause.
     * @example
     * ```typescript
     * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
     * declare const repo: ReadableRepository<typeof users>;
     * const user = await repo.findById({ id: 1 });
     * ```
     */
    findById<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        id: DataObject['id'];
        filter?: TByIdFilter<DataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<TNullable<TRow<DataObject, R, F>>>;
    /**
     * Counts the rows matching `where`.
     * @example
     * ```typescript
     * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
     * declare const repo: ReadableRepository<typeof users>;
     * const { count } = await repo.count({ where: { status: 'ACTIVE' } });
     * ```
     */
    count(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions;
    }): Promise<TCount>;
    /**
     * Tells whether at least one row matches `where`.
     * @example
     * ```typescript
     * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
     * declare const repo: ReadableRepository<typeof users>;
     * const found = await repo.existsWith({ where: { status: 'ACTIVE' } });
     * ```
     */
    existsWith(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions;
    }): Promise<boolean>;
    /** @throws Error - disabled in read-only repository. */
    create(opts: {
        data: PersistObject;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    create(opts: {
        data: PersistObject;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: DataObject;
    }>;
    /** @throws Error - disabled in read-only repository. */
    createAll(opts: {
        data: Array<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    createAll(opts: {
        data: Array<PersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: Array<DataObject>;
    }>;
    /** @throws Error - disabled in read-only repository. */
    updateById(opts: {
        id: DataObject['id'];
        data: Partial<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateById<R = DataObject>(opts: {
        id: DataObject['id'];
        data: Partial<R>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: DataObject;
    }>;
    /** @throws Error - disabled in read-only repository. */
    updateAll(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateAll<R = DataObject>(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    /** @throws Error - disabled in read-only repository. */
    deleteById(opts: {
        id: DataObject['id'];
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = DataObject>(opts: {
        id: DataObject['id'];
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /** @throws Error - disabled in read-only repository. */
    deleteAll(opts: {
        where?: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteAll<R = DataObject>(opts: {
        where?: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
}
````

Source: `packages/connectors/src/relational/core/repositories/core/readable.ts`

## `RecursiveTreeDirections`

*class*

Walk direction relative to `rootId`: DOWN follows `parentColumn -> idColumn` (descendants), UP follows the reverse (ancestors).

```ts
export declare class RecursiveTreeDirections {
    static readonly UP = "UP";
    static readonly DOWN = "DOWN";
    static readonly SCHEME_SET: Set<string>;
    static isValid(direction: string): boolean;
}
```

Source: `packages/connectors/src/relational/core/repositories/sqls/recursive-tree.ts`

## `RecursiveTreeSql`

*class*

Returns the CTE definition only - the caller writes its own `SELECT ... FROM <name>` around it.
Engine is read off `table`, never asked of the caller, so no option can disagree with the schema.
SQLite's `path` is `char(31)`-delimited text, not an array: exact unless an id contains that byte,
which this class does not reject. Identifiers cannot be parameterized, so `name`/`idColumn`/
`parentColumn`/`columns` are allowlist-checked before reaching a template.

```ts
export declare class RecursiveTreeSql {
    private static assertValidIdentifier;
    static walk(opts: IRecursiveTreeOptions): SQL;
    /** The anchor's root match: one id keeps the SQL it always had; several ids are an IN list; none is every row without a parent; `start: 'all'` is every row. */
    private static compileRootCondition;
    /** See {@link RecursiveTreeSql} for why there is no separate `engine` option. */
    private static detectEngine;
    /** Postgres needs an explicit cast so the base and recursive terms agree on the `depth` column's type; SQLite's looser typing does not, but casts anyway for parity and to fail loudly on a non-numeric `startDepth`. */
    private static compileDepthCast;
    /** See {@link RecursiveTreeSql} for why Postgres and SQLite need different `path`/`is_cycle` shapes. */
    private static compileCycleGuardFragments;
}
```

Source: `packages/connectors/src/relational/core/repositories/sqls/recursive-tree.ts`

## `RelationalBaseRepository`

*class*

Relational implementation of `AbstractRepository`: adds the query dialect + hidden-column exclusion on top of the neutral base, and reaches the database only through `IRelationalQueryExecutor`. Both engine-facing parameters default to the neutral SQL contracts; an engine binds them by subclassing.

```ts
export declare abstract class RelationalBaseRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IRelationalExtraOptions, TDataSource extends IRelationalDataSource = IRelationalDataSource> extends AbstractRepository<DataObject, PersistObject, ExtraOptions> implements IPersistableRepository<DataObject, PersistObject, ExtraOptions> {
    /**
     * The `Pick` return type is load-bearing, not decoration. `TWhere<DataObject>` is a homomorphic
     * mapped type over an unresolved type parameter, and TypeScript cannot check a one-key literal
     * against it - `{ id }` fails even though `id` is a real key. `Pick<..., 'id'>` resolves that one
     * key, and the result still assigns to `TWhere<DataObject>` because every key there is optional.
     * Without it every `*ById` method needs a cast, which would hide a genuinely wrong id type.
     */
    protected whereById(opts: {
        id: DataObject['id'];
    }): Pick<TWhere<DataObject>, 'id'>;
    /** Memoized Set view of the base's `hiddenFields` array - built once on first access. */
    private _hiddenPropertySet;
    /** Memoized Drizzle column-selection map derived from hidden fields. `null` = not yet computed; `undefined` = computed, no hidden fields. */
    private _visibleColumns;
    constructor(dataSource?: TDataSource, opts?: {
        scope?: string;
        entityClass?: TClass<BaseRelationalEntity<EntitySchema>>;
        operationScope?: TRepositoryOperationScope;
    });
    get dataSource(): TDataSource;
    set dataSource(value: TDataSource);
    get entity(): BaseRelationalEntity<EntitySchema>;
    set entity(value: BaseRelationalEntity<EntitySchema>);
    get queryDialect(): IRelationalQueryDialect;
    /** Every Drizzle call the repository tier makes goes through this port, supplied by the engine branch via the datasource. */
    protected get queryExecutor(): IRelationalQueryExecutor<TRelationalConnectorOf<TDataSource>>;
    get connector(): TRelationalConnectorOf<TDataSource>;
    setDataSource(opts: {
        dataSource: TDataSource;
    }): void;
    getEntitySchema(): EntitySchema;
    /** Hidden fields as a memoized Set, derived from the base's class-keyed `hiddenFields` array. */
    getHiddenProperties(): Set<string>;
    hasHiddenProperties(): boolean;
    /** Drizzle select/returning column map excluding hidden properties. Undefined if none hidden. Memoized. */
    getVisibleProperties(): Record<string, any> | undefined;
    getDefaultFilter(): TFilter | undefined;
    getDefaultLimit(): number | undefined;
    hasDefaultFilter(): boolean;
    /**
     * The model's `access` settings. Same override seam as `getDefaultFilter()` - a repository with no
     * resolvable `@model` entity (a synthetic test double, a hand-built stub) overrides this to avoid
     * touching `modelSettings`/`entity` at all.
     */
    getAccessSettings(): TModelAccessSettings | undefined;
    /**
     * Holds written rows to the resolved row scope (`access.write`): refuses a row outside
     * it, and for `assign` returns copies with the scope columns filled in. Nothing is written when it
     * throws. Like the read scope, it is not skippable by `shouldSkipDefaultFilter`; a caller that is
     * trusted to write across scopes resolves to `ScopeFilters.UNRESTRICTED`.
     */
    protected guardScopedWrite<Row extends Record<string, unknown>>(opts: {
        rows: Row[];
        operation: TScopeOperation;
        transaction?: ITransaction;
    }): Promise<Row[]>;
    /**
     * A write to a model scoped through its parent: every parent key the rows name must be one the parent's own scope
     * allows for this operation. One query for the batch, read in the write's transaction (with `FOR SHARE` where the
     * engine can lock a row, so a parent that moves tenant after the check cannot be missed). A key that is null, absent,
     * missing from the parent table or outside the scope is the same refusal. An update names a key only to move the
     * row, so a payload without it checks nothing.
     */
    protected assertParentsInScope(opts: {
        settings: IModelAccessThroughSettings;
        rows: Array<Record<string, unknown>>;
        operation: TScopeOperation;
        transaction?: ITransaction;
    }): Promise<void>;
    /**
     * Row scope from `@model` settings.access - AND-composed like a default filter, but never
     * skippable via `shouldSkipDefaultFilter`: that flag serves `restore()`'s deliberate reach past
     * soft-delete, which must not also reach past tenant/ownership scoping.
     *
     * `dangerouslySkipScopeFilter` is framework-internal only, never part of `IExtraOptions` and never
     * wire-reachable: it exists so a filter this repository already scoped (find()'s own recursive
     * call) is not scoped a second time, and for explicitly-unscoped administrative code written and
     * reviewed at the repository - never inferable from a request.
     */
    protected applyScopeFilter<DO = any>(opts: {
        userFilter?: TFilter<DO>;
        dangerouslySkipScopeFilter?: boolean;
        mutation?: TScopeOperation;
    }): TFilter<DO>;
    /** Merges default filter with user filter. Skippable via shouldSkipDefaultFilter - the row scope from applyScopeFilter is not. */
    applyDefaultFilter<DO = any>(opts: {
        userFilter?: TFilter<DO>;
        shouldSkipDefaultFilter?: boolean;
        dangerouslySkipScopeFilter?: boolean;
        /** The name of the write (`update`, `delete`) when the filter selects rows to change: the row scope then leaves out the shared rows unless `write.sharedRows`. */
        mutation?: TScopeOperation;
    }): TFilter<DO>;
    beginTransaction(opts?: TRelationalTransactionOptionsOf<TDataSource>): Promise<TRelationalTransactionOf<TDataSource>>;
    /**
     * Runs `execute` inside a transaction. Given a `transaction`, joins it: its owner commits or rolls
     * back, so this never does. Given none, owns one: begins it, commits when `execute` resolves, and
     * rolls back when `execute` or the commit throws - rethrowing the original error either way. An
     * owned transaction that `execute` already ended is never ended a second time.
     */
    runInTransaction<ResultType>(opts: {
        transaction?: TRelationalTransactionOf<TDataSource>;
        transactionOptions?: TRelationalTransactionOptionsOf<TDataSource>;
        execute: (opts: {
            transaction: TRelationalTransactionOf<TDataSource>;
        }) => Promise<ResultType>;
    }): Promise<ResultType>;
    /** `execute` resolved after ending the owned transaction itself: its work stands only if it committed. */
    private resolveEndedByExecute;
    /** A rollback failure is only logged: the caller needs the error that made the rollback necessary. */
    private rollbackOwnedTransaction;
    /** Builds Drizzle query options from a filter, excluding hidden properties. */
    buildQuery(opts: {
        filter: TFilter<DataObject>;
    }): TDrizzleQueryOptions;
    /** Copy of a Drizzle column selection with hidden properties dropped. */
    private omitHiddenColumns;
    /** Resolves the database connector, using the transaction's connector if provided. */
    protected resolveConnector(opts?: {
        transaction?: ITransaction;
    }): TRelationalConnectorOf<TDataSource>;
    /** Validates lock options: requires transaction, incompatible with Query API (include/fields). */
    protected validateLockOptions(opts: {
        lock?: TLockOptions;
        transaction?: ITransaction;
        usesQueryAPI?: boolean;
    }): void;
    abstract count(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions;
    }): Promise<TCount>;
    abstract existsWith(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions;
    }): Promise<boolean>;
    abstract find<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter: TFilter<DataObject, F>;
        options: TFindRangeOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<{
        data: Array<TRow<DataObject, R, F>>;
        range: TDataRange;
    }>;
    abstract find<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter: TFilter<DataObject, F>;
        options?: TFindOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<Array<TRow<DataObject, R, F>>>;
    abstract findOne<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter: TFilter<DataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<TNullable<TRow<DataObject, R, F>>>;
    abstract findById<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        id: IdType;
        filter?: TByIdFilter<DataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>>;
    }): Promise<TNullable<TRow<DataObject, R, F>>>;
    abstract create(opts: {
        data: PersistObject;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract create<R = DataObject>(opts: {
        data: PersistObject;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    abstract createAll(opts: {
        data: Array<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract createAll<R = DataObject>(opts: {
        data: Array<PersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    abstract updateById(opts: {
        id: IdType;
        data: Partial<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract updateById<R = DataObject>(opts: {
        id: IdType;
        data: Partial<PersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    abstract updateAll(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract updateAll<R = DataObject>(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    updateBy(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateBy<R = DataObject>(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    abstract deleteById(opts: {
        id: IdType;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract deleteById<R = DataObject>(opts: {
        id: IdType;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    abstract deleteAll(opts: {
        where?: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract deleteAll<R = DataObject>(opts: {
        where?: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    deleteBy(opts: {
        where?: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteBy<R = DataObject>(opts: {
        where?: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
}
```

Source: `packages/connectors/src/relational/core/repositories/core/base.ts`

## `RelationalEntityUtility`

*class*

Helpers for reading facts off an entity table schema.

```ts
export declare class RelationalEntityUtility {
    static getIdType<T extends TTableSchemaWithId>(opts: {
        entity: T;
    }): import("drizzle-orm").ColumnDataType;
}
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `RelationalMigrationRunner`

*class*

Applies every migration not already in the ledger, each with its ledger row, in ONE transaction.

Exists because Drizzle's own migrator cannot run everywhere: `drizzle-orm/*\/migrator` reads the
migration folder through `node:fs`, so it resolves to nothing in a browser. This runs off a driver
connection instead, which every engine already implements.

The property that matters is that the DDL and its ledger row commit together. Run as two
statements they would not: a bare `exec` commits when it returns, so a process killed between
them leaves the table present and the ledger empty, and the next boot re-runs a bare
`CREATE TABLE` and dies with `already exists` from then on. In a browser that window lands on the
FIRST visit, while the page is still fetching WASM - the likeliest moment for a user to close the
tab. A storage-quota failure on the INSERT does the same.

TWO LIMITS THE TRANSACTION AND THE MINIMAL LEDGER IMPOSE, both deliberate:

1. Postgres refuses some DDL inside a transaction block, so a migration may not contain
   `CREATE INDEX CONCURRENTLY` - which Drizzle emits for any `.concurrently()` index. Measured: it
   fails with `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`, while a bare
   `exec` accepts it. Atomicity is worth more than a concurrent index build.
2. The ledger keys on the NAME and stores no content hash, so editing an already-applied migration
   is silently skipped rather than reported. Drizzle's own migrator hashes for this reason. Add a
   migration; never rewrite one.

```ts
export declare class RelationalMigrationRunner extends BaseHelper {
    private readonly driver;
    private readonly ledgerTable;
    /** Set when a ROLLBACK itself fails, so the connection is destroyed rather than pooled. */
    private isSessionPoisoned;
    constructor(opts: {
        driver: IRelationalDriver<unknown>;
        /**
         * The table that records applied migrations. Validated like a migration name.
         *
         * @default 'ignis_migrations'
         */
        ledgerTable?: string;
        scope?: string;
    });
    /**
     * Placeholder syntax is not portable (`$1` on Postgres, `?` on SQLite), so the ledger name is
     * embedded as a literal rather than bound. That is only safe because it is checked first: these
     * names are authored in code, never taken from a request, and anything outside the character set
     * is refused rather than escaped. Escaping is what gets this wrong; refusing cannot.
     */
    private static assertSafeName;
    /** Splits on `drizzle-kit`'s own breakpoint marker; a hand-written single-statement migration has none and comes back whole. */
    static splitStatements(opts: {
        sql: string;
    }): Array<string>;
    run(opts: {
        migrations: ReadonlyArray<IMigration>;
    }): Promise<void>;
    /** BEGIN/COMMIT written here rather than through `beginTransaction()`: that acquires its OWN connection, and the ledger read above has to see the same session on a single-connection engine. */
    private applyOne;
}
```

Source: `packages/connectors/src/relational/core/migrations/runner.ts`

## `RelationalUpdateBuilder`

*class*

Splits `data` into plain columns and JSON-path writes, validating every JSON key before any of it
becomes SQL. That validation is why this is a base and not a copied skeleton: an engine composing
through `sql.raw` is injectable the moment it forgets `JsonPathUtility.validateJsonPathComponents`.

Subclasses supply only the JSON composition: `jsonb_set` on Postgres, `json_set` on SQLite.

```ts
export declare abstract class RelationalUpdateBuilder extends BaseHelper {
    /**
     * Wraps `target` so the value lands at `path`. Called once per path, each call receiving the
     * expression built so far, so two paths on one column nest instead of discarding each other.
     */
    protected abstract composeJsonSet(opts: {
        target: SQL;
        path: string[];
        value: any;
    }): SQL;
    /** Separates regular fields from JSON path updates and builds the SQL expressions. */
    transform<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        data: Record<string, any>;
    }): ITransformedUpdateData;
    /** Combines regular fields and JSON expressions into the final payload for Drizzle's `.set()`. */
    toUpdateData(opts: {
        transformed: ITransformedUpdateData;
    }): Record<string, any>;
    /**
     * Resolves a JSON-path key to its schema PROPERTY name plus the validated path. The property
     * is what `jsonExpressions` is keyed by, while the emitted SQL quotes the DB column.
     */
    private resolveJsonTarget;
}
```

Source: `packages/connectors/src/relational/core/repositories/dialect/update.ts`

## `RelationDeclarations`

*class*

Converts relations declared with `many()` and `one()` into the config array the query dialect reads.

```ts
export declare class RelationDeclarations {
    /** Flattens the keyed form into the array shape the query dialect reads, taking each relation's name from its key. */
    static toRelationConfigs(opts: {
        relations: TRelationDefinitions;
    }): Array<TRelationConfig>;
}
```

Source: `packages/connectors/src/relational/core/models/relations.ts`

## `RelationsFactory`

*class*

Builds Drizzle relations for a source table from a declarative relation config array.

```ts
export declare class RelationsFactory {
    /** Creates Drizzle ORM relations from a declarative configuration array. */
    static create<Schema extends TTableSchemaWithId = TTableSchemaWithId>(opts: {
        source: Schema;
        relations: Array<TRelationConfig>;
    }): {
        definitions: Record<string, TRelationConfig>;
        relations: import("drizzle-orm").Relations<string, Record<string, Relation<string>>>;
    };
}
```

Source: `packages/connectors/src/relational/core/repositories/dialect/relations/create.ts`

## `ScopeFilterDenial`

*class*

The `where` that matches zero rows - shared by the repository tier's `applyScopeFilter` and the
dialect tier's `toInclude`, so an unresolved or denied row scope compiles to the same deny
predicate everywhere rather than two copies of a security predicate that could drift apart.

```ts
export declare class ScopeFilterDenial {
    /** The empty `inq` compiles to `sql\`false\`` in every dialect, deterministically matching zero rows. */
    static where<DataObject = any>(): TWhere<DataObject>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/scope-filter.ts`

## `SoftDeletableRelationalRepository`

*class*

Repository that soft-deletes (sets `deletedAt`) instead of physically removing rows; models need a `deletedAt` column and `query: { filter: { where: { deletedAt: null } } }` in `@model` settings.

````ts
export declare class SoftDeletableRelationalRepository<EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IRelationalExtraOptions, TDataSource extends IRelationalDataSource = IRelationalDataSource> extends DefaultRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
    private softDeletePatch;
    /** `isStrict` is evaluated AFTER `options.retry` has been exhausted - the retry loop lives inside `super.findById` -> `findOne`, so a strict read waits out replica lag before it 404s. */
    findById<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        id: DataObject['id'];
        filter?: TByIdFilter<DataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>> & {
            isStrict?: false;
        };
    }): Promise<TNullable<TRow<DataObject, R, F>>>;
    findById<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        id: DataObject['id'];
        filter?: TByIdFilter<DataObject, F>;
        options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>> & {
            isStrict?: true;
        };
    }): Promise<TRow<DataObject, R, F>>;
    deleteById(opts: {
        id: DataObject['id'];
        options: ExtraOptions & {
            shouldReturn: false;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = DataObject>(opts: {
        id: DataObject['id'];
        options?: ExtraOptions & {
            shouldReturn?: true;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    deleteAll(opts: {
        where?: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteAll<R = DataObject>(opts: {
        where?: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    deleteBy(opts: {
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteBy<R = DataObject>(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            force?: boolean;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    /**
     * Clears `deletedAt` on the soft-deleted row with this `id`.
     * @example
     * ```typescript
     * import { SoftDeletableRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), deletedAt: timestamp('deleted_at') });
     * declare const repo: SoftDeletableRepository<typeof users>;
     * const { data } = await repo.restoreById({ id: 1 });
     * ```
     */
    restoreById<R = DataObject>(opts: {
        id: DataObject['id'];
        options?: ExtraOptions & {
            shouldReturn?: boolean;
        };
    }): Promise<TCount & {
        data: TNullable<R>;
    }>;
    /**
     * Clears `deletedAt` on the soft-deleted rows matching `where`; an empty `where` needs `options.force`.
     * @example
     * ```typescript
     * import { SoftDeletableRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), deletedAt: timestamp('deleted_at') });
     * declare const repo: SoftDeletableRepository<typeof users>;
     * await repo.restoreAll({ where: { id: { gt: 10 } } });
     * await repo.restoreAll({ options: { force: true, shouldReturn: false } });
     * ```
     */
    restoreAll<R = DataObject>(opts: {
        where?: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: TNullable<Array<R>>;
    }>;
    /**
     * Clears `deletedAt` on the soft-deleted rows matching `where`.
     * @example
     * ```typescript
     * import { SoftDeletableRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), deletedAt: timestamp('deleted_at') });
     * declare const repo: SoftDeletableRepository<typeof users>;
     * const { count } = await repo.restoreBy({ where: { id: { inq: [1, 2] } } });
     * ```
     */
    restoreBy<R = DataObject>(opts: {
        where: TWhere<DataObject>;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: TNullable<Array<R>>;
    }>;
}
````

Source: `packages/connectors/src/relational/core/repositories/core/soft-deletable.ts`

## `TableColumnCache`

*class*

Keyed by the schema object itself, so a schema that goes out of scope is collectable with its columns.

```ts
export declare class TableColumnCache {
    private static readonly columns;
    /**
     * Null-prototype, so a column lookup cannot answer with something off `Object.prototype`.
     *
     * `getTableColumns()` returns an ordinary object, and every caller resolves a column by
     * truthiness - `const column = columns[key]; if (!column) { throw NOT FOUND }`. A caller-supplied
     * filter key of `toString` therefore found a function, passed the guard, and compiled to a
     * vacuous `$1 = $2` predicate; `constructor.a` reached the JSON path validator and threw a raw
     * TypeError. Fixing the object here closes all five call sites at once, in one line, instead of
     * five `Object.hasOwn` guards that a sixth call site would forget.
     */
    static get<Schema extends TTableSchemaWithId>(schema: Schema): TTableColumns;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/shared.ts`

## `TColumnDefinition`

*type*

A single Drizzle column builder, whatever the engine.

```ts
export type TColumnDefinition = ColumnBuilderBase;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TColumnDefinitions`

*type*

A map of field names to column builders.

```ts
export type TColumnDefinitions = {
    [field: string | symbol]: TColumnDefinition;
};
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TColumnSelection`

*type*

Column subset for a projection, in Drizzle's own shape. `undefined` selects every column.

```ts
export type TColumnSelection = Record<string, unknown> | undefined;
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

## `TDefinedEntityClass`

*type*

The class `defineEntity` returns: every static and instance member of a hand-written
`BaseRelationalEntity<Schema>`, with the table and the relations typed precisely. Named, so a
consumer's declaration output can reference it.

```ts
export type TDefinedEntityClass<Schema extends TTableSchemaWithId, Relations extends TRelationDefinitions> = typeof BaseRelationalEntity<Schema> & {
    readonly TABLE_NAME: string;
    readonly schema: Schema;
    /** Undefined when the entity declares no relations. */
    readonly relationDefinitions: Relations | undefined;
    readonly relations: TValueOrResolver<Array<TRelationConfig>>;
};
```

Source: `packages/connectors/src/relational/core/models/factory.ts`

## `TDeletedAtColumn`

*type*

Drizzle's root `AnyColumn<TPartial>` is the exact dialect-free twin of `AnyPgColumn<TPartial>`, so a `timestamp('deleted_at')` still satisfies this bound.

```ts
export type TDeletedAtColumn = AnyColumn<{
    data: Date | string | null;
}>;
```

Source: `packages/connectors/src/relational/core/repositories/core/soft-deletable.ts`

## `TEntityObject`

*type*

A row of the entity plus its relations, so a relation is declared once instead of twice.

```ts
export type TEntityObject<Entity extends IDefinedEntity> = TRowOf<Entity> & {
    [Name in keyof TDefinitionsOf<Entity>]?: TDefinitionsOf<Entity>[Name] extends {
        type: typeof RelationTypes.MANY;
    } ? Array<TTableObject<TDefinitionsOf<Entity>[Name]['schema']>> : TTableObject<TDefinitionsOf<Entity>[Name]['schema']>;
};

type TRowOf<Entity> = Entity extends new (...args: never) => {
    $inferData?: infer Row;
} ? NonNullable<Row> : never;

type TDefinitionsOf<Entity extends IDefinedEntity> = NonNullable<Entity['relationDefinitions']>;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TGetIdType`

*type*

The type of the `id` column of the table `T`.

```ts
export type TGetIdType<T extends TTableSchemaWithId> = TTableObject<T>['id'];
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TIdColumn`

*type*

Any Drizzle column whose runtime value is a valid entity id. Drizzle's root `AnyColumn<TPartial>` is the exact dialect-free twin of `AnyPgColumn<TPartial>`, so this does not widen the bound.

```ts
export type TIdColumn = AnyColumn<{
    data: IdType;
}>;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TPrimaryKey`

*type*

Marks the column builder `T` as a not-null primary key.

```ts
export type TPrimaryKey<T extends TColumnDefinition> = IsPrimaryKey<NotNull<T>>;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TRecursiveTreeDirection`

*type*

`UP` or `DOWN`; see {@link RecursiveTreeDirections}.

```ts
export type TRecursiveTreeDirection = TConstValue<typeof RecursiveTreeDirections>;
```

Source: `packages/connectors/src/relational/core/repositories/sqls/recursive-tree.ts`

## `TRelationalConnectorOf`

*type*

The connector type a given datasource hands out, so a repository's `resolveConnector` stays as specific as the datasource it was bound to.

```ts
export type TRelationalConnectorOf<TDataSource extends IRelationalDataSource> = ReturnType<TDataSource['getConnector']>;
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `TRelationalTransactionOf`

*type*

The transaction handle a given datasource's own `beginTransaction` resolves to.

```ts
export type TRelationalTransactionOf<TDataSource extends IRelationalDataSource> = Awaited<ReturnType<TDataSource['beginTransaction']>>;
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `TRelationalTransactionOptions`

*type*

Neutral SQL transaction options; each engine adds its own knobs. An alias, not an empty `interface ... extends`, which `@typescript-eslint/no-empty-object-type` rejects.

```ts
export type TRelationalTransactionOptions = ITransactionOptions;
```

Source: `packages/connectors/src/relational/core/datasources/common/types.ts`

## `TRelationalTransactionOptionsOf`

*type*

The transaction-options shape a given datasource's own `beginTransaction` accepts - Postgres adds `isolationLevel`.

```ts
export type TRelationalTransactionOptionsOf<TDataSource extends IRelationalDataSource> = Parameters<TDataSource['beginTransaction']>[0];
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `TRelationConfig`

*type*

Entity relationship config (one-to-one/many-to-one, one-to-many); Drizzle-specific.

```ts
export type TRelationConfig = {
    name: string;
} & ({
    type: typeof RelationTypes.ONE;
    schema: TTableSchemaWithId;
    /** `fields` and `references` may be left out: they are read off the table's foreign key. */
    metadata?: Partial<NonNullable<Parameters<ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.ONE]>[1]>>;
} | {
    type: typeof RelationTypes.MANY;
    schema: TTableSchemaWithId;
    metadata: Parameters<ReturnType<typeof createTableRelationsHelpers>[typeof RelationTypes.MANY]>[1];
});
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `TRelationDefinition`

*type*

A relation declared with `many()` or `one()`, before its name is attached.

```ts
export type TRelationDefinition = IManyRelation | IOneRelation;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TRelationDefinitions`

*type*

Relations keyed by name. Each points at a SCHEMA, never at another entity: an entity reference
across two files that import each other collapses to `any` under TS7022, silently.

```ts
export type TRelationDefinitions = Record<string, TRelationDefinition>;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TRelationMetadata`

*type*

The drizzle relation options for a given relation type, as its helper declares them.

```ts
export type TRelationMetadata<Type extends TRelationConfig['type']> = Extract<TRelationConfig, {
    type: Type;
}>['metadata'];
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TSoftDeletableTableSchema`

*type*

A table schema with an `id` column and a nullable `deletedAt` column, as soft deletion requires.

```ts
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
    deletedAt: TDeletedAtColumn;
};
```

Source: `packages/connectors/src/relational/core/repositories/core/soft-deletable.ts`

## `TTableColumns`

*type*

The column map of a table, as returned by Drizzle's `getTableColumns`.

```ts
export type TTableColumns = ReturnType<typeof getTableColumns>;
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `TTableInsert`

*type*

The row shape an insert takes for the table `T`.

```ts
export type TTableInsert<T extends TTableSchemaWithId> = T['$inferInsert'];
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TTableObject`

*type*

The row shape a select returns for the table `T`.

```ts
export type TTableObject<T extends TTableSchemaWithId> = T['$inferSelect'];
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

## `TTableSchemaWithId`

*type*

The engine-neutral bound. `PgTable` and `SQLiteTable` both extend `Table`, and `Table` carries `$inferSelect` / `$inferInsert`.

```ts
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = Table<TC> & {
    id: TIdColumn;
};
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`
