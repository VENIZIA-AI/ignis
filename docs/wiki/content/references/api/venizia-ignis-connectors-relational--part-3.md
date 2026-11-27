---
title: "@venizia/ignis-connectors/relational (3 of 3)"
description: "Every export of @venizia/ignis-connectors/relational, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/relational (3 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 3 of [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational).

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
    /** `undefined` is the engine's default schema: the table is then written unqualified, as it always was. */
    private readonly ledgerSchema;
    /** Set when a ROLLBACK itself fails, so the connection is destroyed rather than pooled. */
    private isSessionPoisoned;
    constructor(opts: {
        driver: IRelationalDriver<unknown>;
        /**
         * Where the applied migrations are recorded. Both names are validated like a migration name and
         * written quoted.
         *
         * - `table` defaults to `'ignis_migrations'`.
         * - `schema` defaults to the engine's default schema. On Postgres a `schema` is created when it
         *   is missing (checked first, so an existing one needs no `CREATE` privilege), in the same
         *   transaction as the ledger table. SQLite has only `main`: any other
         *   schema is refused here, and so is any schema on a driver that declares no `dialect`.
         */
        ledger?: {
            schema?: string;
            table?: string;
        };
        scope?: string;
    });
    /**
     * Placeholder syntax is not portable (`$1` on Postgres, `?` on SQLite), so the ledger name is
     * embedded as a literal rather than bound. That is only safe because it is checked first: these
     * names are authored in code, never taken from a request, and anything outside the character set
     * is refused rather than escaped. Escaping is what gets this wrong; refusing cannot.
     */
    private static assertSafeName;
    /** A schema is accepted only on an engine known to have it: Postgres, or SQLite's `main`. A driver that names no dialect cannot be asked, so it gets none. Never ignored, never guessed. */
    private assertSchemaSupported;
    /** The ledger table as SQL: `"schema"."table"`, or `"table"` when the engine's default schema is used. */
    private get ledgerName();
    /** Splits on `drizzle-kit`'s own breakpoint marker; a hand-written single-statement migration has none and comes back whole. */
    static splitStatements(opts: {
        sql: string;
    }): Array<string>;
    run(opts: {
        migrations: ReadonlyArray<IMigration>;
    }): Promise<void>;
    /** The ledger's schema (Postgres only, and only when one is named, and only when it is missing) and its table. */
    private createLedger;
    /**
     * Creates the schema only when it is missing. `CREATE SCHEMA IF NOT EXISTS` is not enough: Postgres checks the
     * `CREATE` privilege on the database before it looks at `IF NOT EXISTS`, so a role without it would fail even for
     * `public`. Asking `pg_namespace` first lets such a role use an existing schema; it fails only when it must create one.
     * The name passed the safe-name check, so it is embedded as a literal like the others.
     */
    private ensureSchema;
    /** One migration and its ledger row, in one transaction. */
    private applyOne;
    /** BEGIN/COMMIT written here rather than through `beginTransaction()`: that acquires its OWN connection, and the ledger read has to see the same session on a single-connection engine. */
    private transact;
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
        value: unknown;
    }): SQL;
    /** Separates regular fields from JSON path updates and builds the SQL expressions. */
    transform<Schema extends TTableSchemaWithId>(opts: {
        tableName: string;
        schema: Schema;
        data: Record<string, unknown>;
    }): ITransformedUpdateData;
    /** Combines regular fields and JSON expressions into the final payload for Drizzle's `.set()`. */
    toUpdateData(opts: {
        transformed: ITransformedUpdateData;
    }): Record<string, unknown>;
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
    static where<DataObject>(): TWhere<DataObject>;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/scope-filter.ts`

## `ScopeResolution`

*class*

What a model's `access.resolve` returned, read once, the same way by the read path and the write guard.

A scope is the symbol `ScopeFilters.UNRESTRICTED`, a usable `where`, or nothing (`null` / `undefined`). Anything else
is a resolver that built something wrong, such as `false`, `0`, `''`, a list, `{}`, or an object with a key that is
`undefined` (`{ merchantId: user.merchantId }` for a user without one). Reading it as "no restriction" would open
every row, so it is nothing: the scope was not resolved, and `onMissing` decides (deny by default).

```ts
export declare class ScopeResolution {
    /** A non-empty plain object whose every value is defined, and whose `and` / `or` branches are themselves usable (an `and` has at least one). */
    private static isUsableWhere;
    static normalize<DataObject>(opts: {
        value: unknown;
    }): TNullable<TWhere<DataObject>> | typeof ScopeFilters.UNRESTRICTED;
}
```

Source: `packages/connectors/src/relational/core/repositories/common/scope-filter.ts`

## `SoftDeletableRelationalRepository`

*class*

Repository that soft-deletes (sets `deletedAt`) instead of physically removing rows; models need a `deletedAt` column and `query: { filter: { where: { deletedAt: null } } }` in `@model` settings.

````ts
export declare class SoftDeletableRelationalRepository<EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema, DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>, PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>, ExtraOptions extends IExtraOptions = IRelationalExtraOptions, TDataSource extends IRelationalDataSource = IRelationalDataSource> extends DefaultRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions, TDataSource> {
    private softDeletePatch;
    /** `deletedAt` changes only through delete and restore. */
    protected validateUpdateData(opts: {
        data: object;
    }): void;
    /** The `data` a soft delete writes, read once into a plain copy and checked: the check and the write see the same values. */
    private checkedDeleteData;
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
        data?: TSoftDeleteData<PersistObject>;
        options: ExtraOptions & {
            shouldReturn: false;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = DataObject>(opts: {
        id: DataObject['id'];
        data?: TSoftDeleteData<PersistObject>;
        options?: ExtraOptions & {
            shouldReturn?: true;
            shouldHardDelete?: boolean;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    deleteBy(opts: {
        where: TWhere<DataObject>;
        data?: TSoftDeleteData<PersistObject>;
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
        data?: TSoftDeleteData<PersistObject>;
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
     * await repo.restoreBy({ where: { id: { gt: 10 } } });
     * await repo.restoreBy({ where: {}, options: { force: true, shouldReturn: false } });
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

type TSoftDeleteData<PersistObject> = Partial<Omit<PersistObject, typeof ID_KEY | typeof AuditFields.DELETED_AT>>;

declare const ID_KEY = "id";
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

Column subset for a projection: a flat record of name to column or SQL expression (`SQL`, `SQL.Aliased`). A nested object or a whole table is refused by the executors. `undefined` selects every column.

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

## `TransactionErrors`

*const*

Codes a caller branches on when a transaction did not end the way it asked. A 500, not a 409: the client sent nothing it can
correct, the cause is a statement the application let fail and went on past, and a 4xx would hide that server bug.

```ts
export declare const TransactionErrors: {
    /** `COMMIT` was answered with `ROLLBACK`: an earlier statement failed, so the server aborted the transaction and kept none of its writes. */
    readonly COMMIT_ROLLED_BACK: {
        readonly message: {
            readonly text: "The transaction was rolled back and nothing was saved";
            readonly code: "core.database.commit_rolled_back";
        };
        readonly statusCode: 500;
        readonly category: "system";
    };
};
```

Source: `packages/connectors/src/relational/core/datasources/errors.ts`

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

## `TRelationalDataSourceOpening`

*type*

The handles a relational datasource's `configure()` is given as its second argument, typed by the datasource's own
connector and client: `opening.getClient()` of a PGlite datasource is a `PGlite`.

**Example**
```typescript
override async configure(
  _options?: object,
  opening?: TRelationalDataSourceOpening<TRelationalConnector, PGlite>,
): Promise<void> {
  this.client = new PGlite(this.settings.dataDir);
  const transaction = await opening!.beginTransaction(); // migrations, seeding
}
```

```ts
export type TRelationalDataSourceOpening<TConnector, Client> = IDataSourceOpening<TConnector, Client, IRelationalTransaction<TConnector>, TRelationalTransactionOptions>;
```

Source: `packages/connectors/src/relational/core/datasources/common/types.ts`

## `TRelationalDialect`

*type*

Union of the `RelationalDialects` values.

```ts
export type TRelationalDialect = TConstValue<typeof RelationalDialects>;
```

Source: `packages/connectors/src/relational/core/drivers/driver.ts`

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

## `TTableColumnKey`

*type*

A column property of the table `Schema`: the key it has in the table object, not the database name.

```ts
export type TTableColumnKey<Schema extends TTableSchemaWithId> = keyof Schema['_']['columns'] & string;
```

Source: `packages/connectors/src/relational/core/models/common/types.ts`

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

## `TUpsertUpdateKey`

*type*

A column an upsert's update branch may write: any insert property but the creation audit columns, which only the insert sets.

```ts
export type TUpsertUpdateKey<PersistObject> = Exclude<keyof PersistObject & string, 'createdAt' | 'createdBy'>;
```

Source: `packages/connectors/src/relational/core/repositories/common/types.ts`

## `UniqueKeys`

*class*

Typed handles on the unique keys a table declares, for `upsert({ on })`. Declare each one once, next to the table or
as a `static keys` of the entity: `UniqueKeys.of` runs when that module loads, so a wrong name fails at boot, not at
the first upsert.

````ts
export declare class UniqueKeys {
    /**
     * The unique index, unique constraint or unique column named `index` on `table`. Throws when no key of the table has
     * that name, when the index is not unique, when one of its columns is an expression (`lower(email)`), or when the
     * table is neither a Postgres nor a SQLite table. A partial index keeps its predicate in `where`; write that predicate
     * with literals, not a bound value, as SQLite cannot match a partial index from a bound parameter. The primary key needs
     * no handle: `upsert` uses it when `on` is omitted.
     * @example
     * ```typescript
     * import { UniqueKeys } from '@venizia/ignis-connectors/relational';
     * import { sql } from 'drizzle-orm';
     * import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
     *
     * const cache = pgTable(
     *   'SelfOrderCache',
     *   {
     *     id: uuid('id').primaryKey().defaultRandom(),
     *     merchantId: text('merchant_id').notNull(),
     *     cacheKey: text('cache_key').notNull(),
     *     deletedAt: timestamp('deleted_at'),
     *   },
     *   (t) => [
     *     uniqueIndex('self_order_cache_merchant_key')
     *       .on(t.merchantId, t.cacheKey)
     *       .where(sql`${t.deletedAt} is null`),
     *   ],
     * );
     * const merchantCacheKey = UniqueKeys.of({ table: cache, index: 'self_order_cache_merchant_key' });
     * ```
     */
    static of<Schema extends TTableSchemaWithId>(opts: {
        table: Schema;
        index: string;
    }): IUniqueKey<Schema>;
}
````

Source: `packages/connectors/src/relational/core/models/unique-keys.ts`
