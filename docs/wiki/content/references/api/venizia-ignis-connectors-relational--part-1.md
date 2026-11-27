---
title: "@venizia/ignis-connectors/relational (1 of 3)"
description: "Every export of @venizia/ignis-connectors/relational, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/relational (1 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 3 of [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational).

## `AbstractRelationalDataSource`

*class*

SQL branch root: connector, pool, transactions. Engine-neutral - dialect and executor are
declared abstract here and supplied by each engine branch. The driver lifecycle (wiring, close,
secret rotation, drain) is `AbstractDriverDataSource`, shared with the raw-SQL family; this class
adds what only a relational engine has: a connection string, transactions, a query dialect and a
query executor.

```ts
export declare abstract class AbstractRelationalDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown, TConnector = unknown> extends AbstractDriverDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector, IRelationalDriver<TConnector>> implements IRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector> {
    /** Every repository verb and `beginTransaction()` awaits `ensureOpen()` first, so a relational datasource can open on first use. */
    protected supportsDeferredOpen(): boolean;
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
    /** Adds the transaction to the handles of the open: `configure()` can run its migrations in one, through the ungated internals. */
    protected createOpening(): TRelationalDataSourceOpening<TConnector, Client>;
    /** A transaction on a connection of its own, with no gate: for `beginTransaction()` (after the open) and for the open itself. */
    private openTransaction;
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
    /**
     * What an authorization rule names this model by: the `authorize.principal` of `@model`, else the model's name (the class
     * name, which a minified build changes: give the principal to any model a rule names). `@model` defines the principal on
     * the class; a class that is not decorated, or has no principal, answers its name, so the value is never `undefined` and
     * `Model.AUTHORIZATION_SUBJECT` needs no `!`.
     */
    static get AUTHORIZATION_SUBJECT(): string;
    /**
     * A subclass that declares `static readonly AUTHORIZATION_SUBJECT = '...'` is compiled by `tsc` (with
     * `useDefineForClassFields: false`, which IGNIS needs) to an assignment: this setter turns it into the class's own value,
     * as a field declaration would be under Bun.
     */
    static set AUTHORIZATION_SUBJECT(value: string);
    /** A carrier, deliberately widened to `Table`: a factory-built entity knows its table precisely, and a narrower static would reject that precise type. The CONTRACT stays on the instance, typed `Schema`. */
    static schema: Table;
    static relations?: TValueOrResolver<Array<TRelationConfig>>;
    constructor(opts?: {
        name?: string;
        schema?: Schema;
    });
    /** Maps the schema's id column's Drizzle `dataType` to 'number' (serial/integer) or 'string' (everything else, including bigint/unknown). */
    getIdType(): TIdSchemaType;
    getSchema<T = unknown>(opts: {
        type: TSchemaType;
    }): T;
}
```

Source: `packages/connectors/src/relational/core/models/base.ts`

## `CommitOutcomes`

*class*

What a `COMMIT` may have answered.

```ts
export declare class CommitOutcomes {
    /** Throws {@link TransactionErrors.COMMIT_ROLLED_BACK} when `result`, the answer to a `COMMIT`, carries the tag `ROLLBACK`: the server aborted the transaction after an earlier statement failed, and kept none of its writes. */
    static assertCommitted(opts: {
        result: IStatementResult;
    }): void;
}
```

Source: `packages/connectors/src/relational/core/datasources/errors.ts`

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
     * Holds `userFilter` to the row scope: the scope and the caller's `where` are ANDed, never merged by key, so a
     * scope written as `{ tenantId: 'a' }` holds against a caller's `where: { tenantId: 'b' }` whatever the shapes.
     * The caller can only narrow a scope. Every other part of the filter (order, limit, fields, include) is the caller's.
     */
    composeScope<T>(opts: {
        scopeWhere: TWhere<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
    /**
     * Merges default and user filters. `where` merges at the TOP KEY LEVEL, never index-wise - that
     * corrupts operator arrays. Every collision AND-composes, scalars included (equal scalars collapse to one condition),
     * so a default can only be narrowed, and a user `undefined` never overrides a defined default. A key that would
     * change the merged object's prototype (`__proto__`, `constructor`, `prototype`) is refused. Other parts user-wins.
     */
    mergeFilter<T>(opts: {
        defaultFilter?: TFilter<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
    /**
     * Top-key merge: every collision of a key both sides constrain AND-composes under the reserved `and` key
     * (merging with an existing `and` rather than clobbering it), so a caller's `where` can only narrow the default
     * and never replace it: a caller cannot ask for `deletedAt: { not: null }` and read the rows the default hides.
     * A caller's value equal to the default's scalar is a no-op. A server that needs the rows the default hides says so
     * with `shouldSkipDefaultFilter`, which is not on the wire schema.
     */
    private mergeWhere;
    /** Two values that are the same scalar: equal primitives (`null` included) or the same instant. Operator objects and lists are never "the same": they compose. */
    private isSameScalar;
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
     * A `where` value for a column Drizzle maps from a `Date`, with every string or number in it parsed to a `Date`.
     * `null` stays `null`; anything that is no timestamp is a 400.
     */
    private toDateOperand;
    private toDateList;
    /** A list operator given something that is no list: the membership operators read it as one value, `between` leaves its own refusal to the operator. */
    private toDateMembershipOperand;
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
     * The relation one `include` entry (a relation name, or an object with `relation`) names, read as `toInclude` reads it.
     * Throws the query's refusal of a malformed entry or of a relation the schema does not declare.
     */
    resolveInclusion(opts: {
        inclusion: unknown;
        relations: {
            [relationName: string]: TRelationConfig;
        };
    }): {
        relationName: string;
        relationConfig: TRelationConfig;
    };
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
        value: unknown;
    }): boolean;
    /** The operand as the operator object it is - a non-empty plain object whose every key is an operator - or `undefined` for a bare value. */
    protected toOperatorObject(opts: {
        value: unknown;
    }): Record<string, unknown> | undefined;
    /**
     * Builds a SQL condition for a simple value (null, array, or
     * equality). Protected for the same reason as `isOperatorObject`: an
     * overridden `buildJsonWhereCondition` needs the bare-value branch.
     */
    protected buildValueCondition(opts: {
        column: AnyColumn | SQL;
        value: unknown;
    }): SQL;
    protected buildOperatorConditions(opts: {
        column: AnyColumn | SQL;
        value: Record<string, unknown>;
    }): SQL[];
    /**
     * Negates a nested condition: `not: <operatorObject>` recurses into the
     * operators, `not: <bareValue>` negates that value equality/array/null condition.
     */
    private buildNotCondition;
    /** Builds SQL conditions for logical groups (AND/OR). */
    private buildLogicalGroupCondition;
    /** The refusal of a key that names no column, as the query words it. One builder, so a refusal made before the query (a request guard) is the very same text. */
    protected columnNotFoundMessage(opts: {
        method: string;
        tableName: string;
        key: string;
    }): Error;
    /**
     * The error the query gives for a `where` key or an `order` field that names no column: a JSON path is judged by its first
     * part, with the JSON method's wording, and any other key by itself. A request guard throws it for a hidden field, so a caller
     * cannot tell a hidden column from one that does not exist.
     */
    columnNotFoundError(opts: {
        clause: TRequestFilterClause;
        key: string;
        tableName: string;
    }): Error;
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
        operators: Record<string, unknown>;
    }): boolean;
    /**
     * Emits the engine JSON extraction for one where key. Abstract because the syntax is
     * engine-owned: a default would hand the next engine one branch's SQL with no compile error.
     */
    protected abstract buildJsonWhereCondition(opts: {
        key: string;
        value: unknown;
        columns: TTableColumns;
        tableName: string;
    }): SQL[];
    /**
     * A bare JSON operand IS its operator equivalent - `isOperatorObject` counts an array
     * as primitive, so `[10, 20]` must take the same cast `{ inq: [10, 20] }` does.
     */
    protected toBareJsonOperators(opts: {
        value: unknown;
    }): Record<string, unknown>;
    /**
     * The cast belongs to each OPERATOR, not the object: one object-wide cast misses the operand in
     * `{ not: { gt: 50 } }` (-> `text > integer`) and over-casts the extraction `like` shares in
     * `{ gte: 1, like: '%a%' }` (-> `numeric ~~ text`).
     */
    protected buildJsonOperatorConditions(opts: {
        jsonPath: string | SQL;
        safeNumericCast: string | SQL;
        operators: Record<string, unknown>;
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

## `IInsertConflictOptions`

*interface*

The conflict branch of an upsert; the repository reads `target` and `targetWhere` from a declared unique key before it gets here.

```ts
export interface IInsertConflictOptions {
    /** The key's columns, from the table schema. */
    target: AnyColumn[];
    /** The predicate of a partial unique index, so the engine infers that index as the arbiter. */
    targetWhere?: SQL;
    /** Property to value for the update branch; columns with `$onUpdate` are added by Drizzle, as for an update. */
    set: Record<string, SQL>;
    /** Which existing rows the update branch may touch, read against the existing row. */
    setWhere?: SQL;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/executor.ts`

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
    /** Turns the insert into an upsert: `ON CONFLICT (target) [WHERE targetWhere] DO UPDATE SET set [WHERE setWhere]`. A conflicting row that fails `setWhere` is left as it is and returned by nothing. */
    onConflict?: IInsertConflictOptions;
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
    connector?: TConnector;
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
    /** The engine this driver speaks. The built-in drivers declare it; a hand-made driver may omit it, and the migration ledger then accepts no `ledger.schema` (it cannot know whether the engine has schemas). */
    readonly dialect?: TRelationalDialect;
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
    /** The relations a schema declares, by name. */
    resolveRelations(opts: {
        schema: TTableSchemaWithId;
    }): Record<string, TRelationConfig>;
    /** The relation one `include` entry names; throws the query's refusal of a malformed entry or an undeclared relation. */
    resolveInclusion(opts: {
        inclusion: unknown;
        relations: Record<string, TRelationConfig>;
    }): {
        relationName: string;
        relationConfig: TRelationConfig;
    };
    /** The error the query gives for a `where` key or an `order` field that names no column. */
    columnNotFoundError(opts: {
        clause: TRequestFilterClause;
        key: string;
        tableName: string;
    }): Error;
    /** The fields the model of a schema hides. */
    resolveHiddenProperties(opts: {
        schema: TTableSchemaWithId;
    }): Set<string>;
    /** The engine's update transform; an engine without one leaves it out. */
    readonly updateBuilder?: RelationalUpdateBuilder;
    mergeFilter<T>(opts: {
        defaultFilter?: TFilter<T>;
        userFilter?: TFilter<T>;
    }): TFilter<T>;
    composeScope<T>(opts: {
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
    /** The command tag the server answered with (`COMMIT`, `ROLLBACK`), where the driver reports one. A `COMMIT` answered `ROLLBACK` means the server aborted the transaction. */
    command?: string;
}
```

Source: `packages/connectors/src/relational/core/drivers/driver.ts`

## `ITransformedUpdateData`

*interface*

Update data split into plain column values and JSON-path updates that need SQL expressions.

```ts
export interface ITransformedUpdateData {
    /** Regular field updates (non-JSON-path keys) */
    regularFields: Record<string, unknown>;
    /** SQL expressions for JSON path updates, keyed by the schema PROPERTY name - not the column name, which is what the emitted SQL quotes. The two diverge whenever a column is declared as `jsonb('meta_data')` under a property called `metadata`. */
    jsonExpressions: Record<string, SQL>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `IUniqueKey`

*interface*

A unique index or unique constraint of one table, read from its Drizzle declaration by `UniqueKeys.of`. It carries the
table itself, so a key of one table does not type-check where another table's key is expected, even when the two
tables share their column names.

```ts
export interface IUniqueKey<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
    /** The table the key belongs to; a repository refuses a key whose table is not its own. */
    readonly table: Schema;
    /** The name of the index or constraint, as declared. */
    readonly name: string;
    /** The key's columns, as table properties, in the declared order. */
    readonly columns: ReadonlyArray<TTableColumnKey<Schema>>;
    /** The predicate of a partial unique index (`uniqueIndex(...).where(...)`), sent as the conflict target's `WHERE`. */
    readonly where?: SQL;
    /** Whether two nulls count as equal for this key (Postgres `NULLS NOT DISTINCT`); a null key column is refused otherwise. */
    readonly nullsNotDistinct: boolean;
}
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

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
