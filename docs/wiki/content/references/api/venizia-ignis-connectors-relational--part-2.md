---
title: "@venizia/ignis-connectors/relational (2 of 3)"
description: "Every export of @venizia/ignis-connectors/relational, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/relational (2 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 3 of [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational).

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
    /** Reach the engine's update transform through `dataSource.getQueryDialect()`. Engines without an update builder return `undefined`. */
    get updateBuilder(): RelationalUpdateBuilder | undefined;
    /** Throw to refuse an update's data. */
    protected validateUpdateData(_opts: {
        data: object;
    }): void;
    /** Reads the caller's `data` once into a plain copy, checks that copy and returns it: the check and the write see the same values, even when `data` is a getter or a proxy. */
    protected checkedUpdateData<Data extends object>(opts: {
        data: Data;
    }): Data;
    /** Guards id-based operations against a null/undefined id */
    protected validateId(opts: {
        id: unknown;
        operationName: string;
    }): void;
    /** Prevents accidental table-wide updates/deletes by requiring an explicit force flag, checked on the caller's own `where` (a scope or a default filter that joins it does not make it non-empty); returns the built where SQL so callers reuse it instead of rebuilding on identical input. */
    protected validateWhereCondition(opts: {
        where: TWhere<DataObject>;
        /** The `where` the caller wrote, before the default filter and the access scope joined it. Empty means "every row" and needs `force`, however narrow the merged `where` is. Required: a subclass that calls this must say which `where` the caller wrote. */
        callerWhere: TWhere<DataObject>;
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
     * One `INSERT ... ON CONFLICT (key) DO UPDATE` statement. The key and `update` are checked before anything else, so a
     * bad one runs no guard and no SQL. The new row passes the CREATE guard; the columns the update branch writes pass the
     * UPDATE guard; the existing row must match the UPDATE scope and the default filter (`setWhere`), read in the same
     * statement, so it cannot change between the check and the write.
     */
    protected _upsert<R = DataObject>(opts: {
        data: PersistObject;
        on?: IUniqueKey<EntitySchema>;
        update?: ReadonlyArray<string>;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
            log?: TRepositoryLogOptions;
        };
    }): Promise<TCount & {
        data: TNullable<R>;
    }>;
    /**
     * Inserts one row, or updates the row that already holds its key: one `INSERT ... ON CONFLICT (key) DO UPDATE`
     * statement, with no read before it.
     *
     * - `on` is a key declared with `UniqueKeys.of`; omitted, the primary key. Every column of the key must hold a value
     *   (a scope column `write.mode: 'assign'` fills counts); a null is refused with a 400 unless the key is
     *   `nullsNotDistinct`.
     * - `update` lists the columns the update branch writes, each one set in `data` and none of the key. Without it, every
     *   column `data` sets except the key, the primary key and the creation audit columns.
     * - The new row is held to the access scope as `create` holds it, the columns written on a conflict as `update` holds
     *   them, and the existing row must be one the caller may update: a row outside the scope or hidden by the default
     *   filter is left as it is and the call fails with the write-denied 403. `options.shouldSkipDefaultFilter` is ignored.
     * - Defaults apply on insert, `$onUpdate` columns (`modifiedAt`, `modifiedBy`) on a conflict, and hidden fields are
     *   written but not returned.
     * @example
     * ```typescript
     * import { UniqueKeys } from '@venizia/ignis-connectors/relational';
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core';
     *
     * const settings = pgTable(
     *   'Setting',
     *   { id: serial('id').primaryKey(), key: text('key').notNull(), value: text('value') },
     *   (t) => [uniqueIndex('setting_key').on(t.key)],
     * );
     * const settingKey = UniqueKeys.of({ table: settings, index: 'setting_key' });
     * declare const repo: DefaultCRUDRepository<typeof settings>;
     * const { data } = await repo.upsert({ data: { key: 'theme', value: 'dark' }, on: settingKey });
     * ```
     */
    upsert(opts: {
        data: PersistObject;
        on?: IUniqueKey<EntitySchema>;
        update?: ReadonlyArray<TUpsertUpdateKey<PersistObject>>;
        options: ExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    upsert<R = DataObject>(opts: {
        data: PersistObject;
        on?: IUniqueKey<EntitySchema>;
        update?: ReadonlyArray<TUpsertUpdateKey<PersistObject>>;
        options?: ExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
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
     * await repo.updateBy({ where: { status: 'ACTIVE' }, data: { status: 'DONE' } });
     * await repo.updateBy({ where: {}, data: { status: 'DONE' }, options: { force: true } });
     * ```
     */
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
     * Deletes the rows matching `where`; an empty `where` needs `options.force`.
     * @example
     * ```typescript
     * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
     * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
     * declare const repo: DefaultCRUDRepository<typeof users>;
     * await repo.deleteBy({ where: { status: 'DONE' } });
     * await repo.deleteBy({ where: {}, options: { force: true } });
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
    /**
     * A request filter is read as `find` reads it: through the Core API (where, then order) when the filter merged with the
     * model's default filter selects no fields and includes nothing, and through `build` (order, where, include) otherwise.
     * Merging with the default filter comes first, so its refusal of a `where` key is the first.
     */
    protected createRequestFilterJudge(): IRequestFilterJudge;
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
     * Yields the rows matching `filter` as pages of `pageSize` rows (default 500), ascending by `id`; each page is a `find`
     * for `id` above the last one read. The first iteration throws a 400 for `order`, `limit`, `skip`, `offset` or `include`
     * in `filter`, a `pageSize` outside 1 to min(10 000, `limit.max` or 1000), a hidden `id` or a composite primary key.
     * @example
     * ```typescript
     * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
     *
     * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
     * declare const repo: ReadableRepository<typeof users>;
     * for await (const page of repo.findEvery({ filter: { where: { status: 'ACTIVE' } }, pageSize: 200 })) {
     *   console.log(page.length);
     * }
     * ```
     */
    findEvery<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
        filter?: Omit<TFilter<DataObject, F>, 'order' | 'limit' | 'skip' | 'offset' | 'include'>;
        pageSize?: number;
        options?: ExtraOptions;
    }): AsyncGenerator<Array<TRow<DataObject, R, F>>, void, undefined>;
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

Source: `packages/connectors/src/relational/core/repositories/core/readable.ts`

## `RecursiveTreeDirections`

*class*

Walk direction relative to `rootId`: DOWN follows `parentColumn -> idColumn` (descendants), UP follows the reverse (ancestors).

```ts
export declare class RecursiveTreeDirections extends ConstClass {
    static readonly UP = "UP";
    static readonly DOWN = "DOWN";
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
    /**
     * Judges a request filter's keys as this repository's query reads them: a JSON path names the column it starts with
     * (`[meta].pin`, `.meta.pin` and `meta.pin` all read `meta`), and a refusal is the error the query gives for a column that does
     * not exist. An include scope is judged by the hidden fields of the model its relation points to. The parts are read in the
     * order `build` reads them (order, where, include), and a piece the query refuses on its own is refused with the query's error.
     */
    protected createRequestFilterJudge(): IRequestFilterJudge;
    private judgeSchema;
    /** The error `task` throws, or `undefined`. */
    private static refusalOf;
    /** Hidden fields as a memoized Set, derived from the base's class-keyed `hiddenFields` array. */
    getHiddenProperties(): Set<string>;
    hasHiddenProperties(): boolean;
    /** Drizzle select/returning column map excluding hidden properties. Undefined if none hidden. Memoized. */
    getVisibleProperties(): Record<string, AnyColumn> | undefined;
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
    protected applyScopeFilter<DO = DataObject>(opts: {
        userFilter?: TFilter<DO>;
        dangerouslySkipScopeFilter?: boolean;
        mutation?: TScopeOperation;
    }): TFilter<DO>;
    /** Merges default filter with user filter. Skippable via shouldSkipDefaultFilter - the row scope from applyScopeFilter is not. */
    applyDefaultFilter<DO = DataObject>(opts: {
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
    /**
     * The connector for one call: the datasource is open first (a datasource that opens on first use opens here, once, for
     * every concurrent first call), then the transaction's connector or the pooled one. Every verb awaits this before it
     * touches the engine.
     */
    protected acquireConnector(opts?: {
        transaction?: ITransaction;
    }): Promise<TRelationalConnectorOf<TDataSource>>;
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
    abstract updateBy(opts: {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract updateBy<R = DataObject>(opts: {
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
    abstract deleteBy(opts: {
        where: TWhere<DataObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    abstract deleteBy<R = DataObject>(opts: {
        where: TWhere<DataObject>;
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

## `RelationalDialects`

*class*

The SQL engines a relational driver can speak. Only the migration ledger reads it today: Postgres has schemas to create, SQLite has only `main`.

```ts
export declare class RelationalDialects extends ConstClass {
    static readonly POSTGRES = "postgres";
    static readonly SQLITE = "sqlite";
}
```

Source: `packages/connectors/src/relational/core/drivers/driver.ts`
