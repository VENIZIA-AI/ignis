---
type: Architecture
title: Relational connector
description: The engine-neutral SQL tier under connectors/relational, the two ports a datasource supplies, and what stays Postgres-only.
resource: packages/core/src/connectors/relational
tags: [architecture, connectors, drizzle, postgres, sqlite, relational]
---

`connectors/relational` is the engine-neutral SQL tier: datasource root, driver contract, entity
base and the five-class repository chain, all free of `drizzle-orm/pg-core`. `connectors/postgres`
is the first branch built on it - it supplies the two ports the neutral tier declares abstract, plus
everything that is genuinely Postgres SQL. A second SQL engine (SQLite, or a `pg`-compatible driver
like PGlite) adds a branch the same way; it does not touch the neutral tier.

## The split

```
AbstractRelationalDataSource   connectors/relational/datasources/abstract.ts   (connector/pool/driver wiring; dialect + executor abstract)
└── BaseRelationalDataSource   connectors/relational/datasources/base.ts       (schema discovery, transaction skeleton; BEGIN text abstract)
    └── AbstractPostgresDataSource   connectors/postgres/datasources/abstract.ts   (supplies PostgresQueryDialect + PostgresQueryExecutor)
        └── BasePostgresDataSource   connectors/postgres/datasources/base.ts       (supplies "BEGIN TRANSACTION ISOLATION LEVEL ...")

RelationalBaseRepository       connectors/relational/repositories/core/base.ts
└── ReadableRelationalRepository
    └── PersistableRelationalRepository
        └── DefaultRelationalRepository
            └── SoftDeletableRelationalRepository
```

Every class is **declared** under a distinct name. The Postgres branch declares
`AbstractPostgresDataSource` and `BasePostgresDataSource`; only the neutral tier declares
`AbstractRelationalDataSource` and `BaseRelationalDataSource`. Two classes never share a declaration
name across the two barrels.

The `*RelationalDataSource` spellings are still **exported** from `@venizia/ignis/postgres`, as
aliases of the Postgres classes, because that is what apps imported before the lift. So the same
name means different classes depending on the sub-path you import from - which is why
`connectors/index.ts` never gains `export * from './relational'`. Reach the neutral tier only
through the `@venizia/ignis/relational` sub-path, never through the root.

The repository chain forks the same way: `RelationalBaseRepository` and its four subclasses are
declared only in `connectors/relational`, and `connectors/postgres/repositories/core/*.ts` declares
five thin subclasses of them (`PostgresBaseRepository`, `ReadableRepository`, `PersistableRepository`,
`DefaultCRUDRepository`, `SoftDeletableRepository`). Those subclasses add no behavior - their only
job is to rebind `ExtraOptions` to `IDatabaseExtraOptions` and `TDataSource` to `IPostgresDataSource`
so a single-argument subclass keeps a `PgDatabase` connector with no cast. The neutral tier names no
Postgres type at all; a second engine declares its own five subclasses and its own bindings.

## The two ports

A `RelationalBaseRepository` never touches Drizzle directly. It asks its datasource for two ports:

| Port | Obtained via | Answers |
|---|---|---|
| `IRelationalQueryDialect` | `dataSource.getQueryDialect()` | How does a neutral `TFilter`/`TWhere`/update payload become this engine's SQL fragments? |
| `IRelationalQueryExecutor<TConnector>` | `dataSource.getQueryExecutor()` | How do I run those fragments against this engine's Drizzle connector? |

Two ports, not one, because they vary independently. PGlite reuses BOTH unchanged - `PgliteDatabase
extends PgDatabase`, so `PostgresQueryDialect` and `PostgresQueryExecutor` both already work against
it. A SQLite branch would keep most of the dialect (see below) but needs its own executor, because
`BaseSQLiteDatabase`'s builder chain is a different shape (no `.for(lock)`, a different `.returning()`
gate on `insert`/`update`/`delete`).

Both ports are resolved from the datasource, never constructed inside a repository - the same
pattern `getSchema()` and `getConnector()` already use, so a repository's behaviour follows whichever
datasource it is bound to.

## The seven-verb executor

`IRelationalQueryExecutor` is every Drizzle call the repository tier used to make, now behind one
interface. `PostgresQueryExecutor` is the only place in `connectors/postgres` that calls a Drizzle
query builder - `FilterBuilder` composes SQL fragments, `PostgresQueryExecutor` is what hands them to
`.from()`/`.where()`/`.returning()`.

| Verb | Replaces | Drizzle chain it now owns |
|---|---|---|
| `select` | `readable.ts`'s `findWithCoreAPI` | `.select(columns?).from(table).$dynamic()` + `.where`/`.orderBy`/`.limit`/`.offset`/`.for(lock)` |
| `count` | `readable.ts`'s `count` | `connector.$count(table, where)` |
| `findMany` | `readable.ts`'s `findWithQueryAPI` | `connector.query[entityName].findMany(queryOptions)` |
| `findFirst` | `readable.ts`'s `findOne` (relational branch) | `connector.query[entityName].findFirst(queryOptions)`, `limit` stripped (the config type forbids it) |
| `insert` | `persistable.ts`'s `_create` | `.insert(table).values(data)`, then `.returning()` or the driver's affected-row count |
| `update` | `persistable.ts`'s `_update` | `.update(table).set(data).where(where)`, same two branches |
| `remove` | `persistable.ts`'s `_delete` | `.delete(table).where(where)`, same two branches |

Every write verb returns `IWriteResult<R>` (`{ count, rows }`) instead of the raw driver result.
`count` is authoritative in both branches: with `shouldReturn: true` it is `rows.length`; with it
`false` the executor reads the driver's own affected-row field (`pg`'s `rowCount`, postgres-js's
`count`) - a single `Array<R>` cannot express the second mode, which is why writes never return one.

## `TTableSchemaWithId`: `PgTable` widened to `Table`

```typescript
export type TTableSchemaWithId<TC extends TableConfig = TableConfig> = Table<TC> & {
  id: TIdColumn;
};
```

`PgTable` and `SQLiteTable` both extend Drizzle's root `Table` and both carry `$inferSelect` /
`$inferInsert` - `Table` is the real shared bound the repository tier needs, not a workaround.
`TIdColumn` follows the same move: `AnyColumn<{ data: IdType }>` is drizzle's dialect-free twin of
`AnyPgColumn<{ data: IdType }>`, a rename, not a widening. Pinned by
`__tests__/connectors/relational/neutral-table-types.test.ts`: it asserts a `sqliteTable` satisfies
the bound and fails if it is narrowed back to `PgTable`.

## `buildBeginStatement` is abstract

BEGIN syntax is not portable: Postgres interpolates an isolation level
(`BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED`), SQLite has no isolation levels and instead
picks a locking mode (`BEGIN DEFERRED`/`IMMEDIATE`/`EXCLUSIVE`). The neutral
`BaseRelationalDataSource.beginTransaction()` owns everything ELSE about a transaction - acquiring a
dedicated connection, running whatever statement `buildBeginStatement()` returns, building the
`commit`/`rollback` closures with their discard-on-failure semantics - but the BEGIN text itself is
declared `protected abstract`, because neutral code has no portable way to say it. Falsified by
`__tests__/connectors/relational/begin-statement.test.ts`'s `SqliteShapedFixture`: a second
`BaseRelationalDataSource` subclass, no SQLite driver involved, that returns `'BEGIN IMMEDIATE'` and
proves the seam is real rather than Postgres-only in disguise.

## What stays Postgres-only

| Stays in `connectors/postgres` | Why |
|---|---|
| The five model enrichers (`data-type`, `id`, `principal`, `tz`, `user-audit`) | Build columns with pg-core factories (`varchar`, `jsonb`, `timestamp` with timezone) |
| `isoTimestamp`, `PgSequenceOptions` | pg-core column/sequence concepts with no SQLite equivalent |
| `IsolationLevels` (`READ COMMITTED`/`REPEATABLE READ`/`SERIALIZABLE`) | SQLite has no isolation levels - its BEGIN axis is a locking mode, not a level |
| `PostgresQueryOperators` (`dialect/query.ts`) | Drizzle root exports (`ilike`, `arrayContains`, `arrayContained`, `arrayOverlaps`) that compile to literal Postgres SQL and fail on SQLite at the database |
| `UpdateBuilder` (`dialect/update.ts`) | Composes chained `jsonb_set(...)` calls and `::jsonb` casts - Postgres SQL text, even though its only drizzle import is the neutral `sql` tag |
| `PostgresFilterBuilder` (`dialect/filter.ts`) | Binds the neutral `FilterBuilder`'s abstract `operators` to `PostgresQueryOperators.FNS`; the whole file is that one override |

`FilterBuilder` lives in the neutral tier
(`connectors/relational/repositories/dialect/filter.ts`), not in `connectors/postgres`. It has
**zero** `drizzle-orm/pg-core` imports, and filter merging, plain `where`/`orderBy`, column selection
and relation `include` carry no engine-specific SQL. The class is `abstract`. Its operator table is
`protected abstract get operators(): TQueryOperatorHandlers`, so the class names no engine at all.
Only the JSON-path methods still carry Postgres defaults - they hardcode `#>>`/`#>`.

`connectors/postgres` declares `PostgresFilterBuilder extends FilterBuilder`, whose entire body is
the one `operators` override returning `PostgresQueryOperators.FNS`. `PostgresQueryDialect extends
PostgresFilterBuilder`.

### Subclassing `FilterBuilder` for a second engine

The seam is the `abstract` member plus six `protected` ones. Override `operators` - you have no
choice, `tsc` requires it - and reach for the other six only when your JSON syntax differs. You
inherit the other ~700 lines either way:

| Member | Override to |
|---|---|
| `get operators()` | **Required.** Return your own `TQueryOperatorHandlers` table; the base declares it abstract and supplies nothing |
| `buildJsonWhereCondition()` | Emit your JSON path syntax instead of `#>>` and the `::numeric` guard cast |
| `buildJsonOrderBy()` | Emit your JSON path syntax instead of `#>` |
| `buildJsonOperatorConditions()` | Only if per-operator cast placement differs; the Postgres logic is engine-neutral |
| `jsonNeedsNumericCast()` | Only if your extraction is not text-typed |
| `validateJsonColumn()` | Only if your JSON column type check differs |
| `buildOperatorConditions()` | Only if `not` needs different composition; it already resolves handlers via `operators` |

Falsified by `__tests__/connectors/postgres/repositories/dialect-seam.test.ts`: a
`SqliteShapedDialect extends FilterBuilder` that emits `json_extract(..., '$.tier')` and its own
operator table, with no SQLite driver involved. The same file asserts `PostgresQueryDialect` still
emits exactly what a bare `PostgresFilterBuilder` does.

`UpdateBuilder` has no such seam - a second engine writes its own and composes it into its dialect
class, the way `PostgresQueryDialect` does. Full measurement in
[the SQLite connector research spec](https://github.com/VENIZIA-AI/ignis/blob/main/docs/superpowers/specs/2026-07-31-sqlite-connector-research.md).

## `UpdateBuilder` is reachable two ways - use the dialect

`UpdateBuilder` is exported directly from `connectors/postgres/repositories/dialect` AND reachable as
`PostgresQueryDialect.updateBuilder` (both existed before this lift and both stay - this project does
not delete a public export on a hunch). **New code should go through the dialect**:
`dataSource.getQueryDialect().updateBuilder`, or - inside a `RelationalBaseRepository` subclass -
`this.updateBuilder` (kept as a structural `@deprecated` passthrough for source compatibility). The
direct `new UpdateBuilder()` constructor bypasses the datasource's port resolution and only makes
sense for a caller that already knows it is talking to Postgres.

## Historical names off `@venizia/ignis/postgres`

Two different mechanisms keep the pre-lift names resolving, and the difference matters if you ever
compare classes by identity.

**Postgres subclasses** - a real class, distinct from its neutral parent, verified by a runtime probe
against the built package:

| Name (`@venizia/ignis/postgres`) | Extends | Declared in |
|---|---|---|
| `PostgresBaseRepository` (abstract) | `RelationalBaseRepository` | `connectors/postgres` |
| `ReadableRepository` | `ReadableRelationalRepository` | `connectors/postgres` |
| `PersistableRepository` | `PersistableRelationalRepository` | `connectors/postgres` |
| `DefaultCRUDRepository` | `DefaultRelationalRepository` | `connectors/postgres` |
| `SoftDeletableRepository` | `SoftDeletableRelationalRepository` | `connectors/postgres` |

`ReadableRepository === ReadableRelationalRepository` is therefore **false**, and so on down the
chain. `instanceof` still holds - a `SoftDeletableRepository` instance is a
`DefaultRelationalRepository` - and nothing in the framework or in BANA compares repository classes
by `===`, `instanceof` against the neutral name, or `.constructor ===`. The neutral names are no
longer exported from `@venizia/ignis/postgres`; import them from `@venizia/ignis/relational`.

**Alias re-exports** - the SAME class object under a second name:

| Alias (`@venizia/ignis/postgres`) | Canonical name | Declared in |
|---|---|---|
| `BaseEntity`, `BasePostgresEntity` | `BaseRelationalEntity` | `connectors/relational` |
| `AbstractRelationalDataSource` | `AbstractPostgresDataSource` | `connectors/postgres` (Postgres branch, not the neutral root) |
| `BaseRelationalDataSource`, `BaseDataSource` | `BasePostgresDataSource` | `connectors/postgres` (Postgres branch, not the neutral root) |

The last two rows are the only aliases whose spelling collides with a different class: from
`@venizia/ignis/relational`, `AbstractRelationalDataSource` and `BaseRelationalDataSource` are the
neutral classes. Import one sub-path per file and the collision never surfaces.

**Withdrawn - `FilterBuilder`.** A third collision existed and was removed rather than kept.
`connectors/postgres` used to re-export its subclass as `FilterBuilder`, so `@venizia/ignis/postgres`
served the Postgres class while `@venizia/ignis/relational` served the abstract neutral base under
the identical name. That alias is gone. Verified against the built `dist`:

| Name | `@venizia/ignis` (root) | `@venizia/ignis/postgres` | `@venizia/ignis/relational` |
|---|---|---|---|
| `FilterBuilder` | absent | absent | the abstract neutral base |
| `PostgresFilterBuilder` | present | present | absent |

The name disappeared from the root entry as a side effect: `connectors/index.ts` re-exports only
`./postgres`, so withdrawing the alias there withdrew it from the root too. BANA imports
`FilterBuilder` in zero files, but it was a documented public import - recorded in
[the 2026-08-01 changelog](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/changelogs/2026-08-01-relational-connector-lift.md).

`NodePostgresDriver` is unaffected by the lift - it always lived at its own
`@venizia/ignis/postgres/node-postgres` sub-path (it eagerly imports `pg`, so it stays out of the
root `./postgres` barrel by the same rule every other optional-peer driver follows).

## Related

- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Filter system](/architecture/filter-system.md)
- [Transactions](/architecture/transactions.md)
