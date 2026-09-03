---
type: Architecture
title: Relational connector
description: The engine-neutral SQL tier under connectors/relational, the two ports a datasource supplies, and what stays Postgres-only.
resource: packages/core-server/src/connectors/relational
tags: [architecture, connectors, drizzle, postgres, sqlite, relational]
---

`connectors/relational` is the engine-neutral SQL tier: datasource root, driver contract, entity
base and the five-class repository chain, all free of `drizzle-orm/pg-core`. `connectors/postgres`
is the first branch built on it - it supplies the two ports the neutral tier declares abstract, plus
everything that is genuinely Postgres SQL. `connectors/sqlite` is the second, and it touches no part
of the neutral tier - see [SQLite connector](/architecture/sqlite-connector.md).

## The split

```
AbstractRelationalDataSource   connectors/relational/datasources/abstract.ts   (connector/pool/driver wiring; dialect + executor abstract)
└── BaseRelationalDataSource   connectors/relational/datasources/base.ts       (schema discovery, transaction skeleton; BEGIN text abstract)
    ├── AbstractPostgresDataSource   connectors/postgres/datasources/abstract.ts   (supplies PostgresQueryDialect + PostgresQueryExecutor)
    │   └── BasePostgresDataSource   connectors/postgres/datasources/base.ts       (supplies "BEGIN TRANSACTION ISOLATION LEVEL ...")
    └── AbstractSqliteDataSource     connectors/sqlite/datasources/abstract.ts     (supplies SqliteQueryDialect + SqliteQueryExecutor)
        └── BaseSqliteDataSource     connectors/sqlite/datasources/base.ts         (supplies "BEGIN IMMEDIATE")

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

The `*RelationalDataSource` spellings are served **only** from `@venizia/ignis/relational`:
`connectors/postgres/datasources/index.ts` deliberately declines to alias them, so no datasource
name resolves to two different classes across sibling sub-paths. `connectors/index.ts` still
re-exports `./postgres` alone, so reach the neutral tier through the `@venizia/ignis/relational`
sub-path, never through the root.

The repository chain forks the same way: `RelationalBaseRepository` and its four subclasses are
declared only in `connectors/relational`, and `connectors/postgres/repositories/core/*.ts` declares
five thin subclasses of them (`PostgresBaseRepository`, `ReadableRepository`, `PersistableRepository`,
`DefaultCRUDRepository`, `SoftDeletableRepository`). Those subclasses add no behavior - their only
job is to rebind `ExtraOptions` to `IDatabaseExtraOptions` and `TDataSource` to `IPostgresDataSource`
so a single-argument subclass keeps a `PgDatabase` connector with no cast. The neutral tier names no
Postgres type at all. `connectors/sqlite/repositories/core/*.ts` is the same five under SQLite names
(`SqliteBaseRepository`, `ReadableSqliteRepository`, `PersistableSqliteRepository`,
`DefaultSqliteRepository`, `SoftDeletableSqliteRepository`), rebinding `ISqliteExtraOptions` and
`ISqliteDataSource`.

## The two ports

A `RelationalBaseRepository` never touches Drizzle directly. It asks its datasource for two ports:

| Port | Obtained via | Answers |
|---|---|---|
| `IRelationalQueryDialect` | `dataSource.getQueryDialect()` | How does a neutral `TFilter`/`TWhere`/update payload become this engine's SQL fragments? |
| `IRelationalQueryExecutor<TConnector>` | `dataSource.getQueryExecutor()` | How do I run those fragments against this engine's Drizzle connector? |

Two ports, not one, because they vary independently. PGlite reuses BOTH unchanged - `PgliteDatabase
extends PgDatabase`, so `PostgresQueryDialect` and `PostgresQueryExecutor` both already work against
it. The SQLite branch keeps most of the dialect (see below) and supplies its own executor, because
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
`false` the executor reads the driver's own affected-row field - a single `Array<R>` cannot express
the second mode, which is why writes never return one. Every driver spells that field differently:
`pg` says `rowCount`, postgres-js says `count`, PGlite says `affectedRows`, libsql says
`rowsAffected`. An unrecognized result throws with the observed keys rather than reporting zero.

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

The statement reaches `IRelationalConnection.execute()` **verbatim** - `BEGIN ... ISOLATION LEVEL $1`
is not valid SQL, so nothing about it can be parameterized, which makes whatever a branch splices in
raw SQL. The two branches guard that differently. `BaseSqliteDataSource` validates at runtime:
`assertBeginMode()` runs `SqliteBeginModes.isValid` and throws on an unknown mode.
`BasePostgresDataSource` relies on the compile-time `TIsolationLevel` type only - `IsolationLevels.isValid`
exists but has no call site on the BEGIN path, so an untyped JavaScript caller can splice an
arbitrary string into `BEGIN TRANSACTION ISOLATION LEVEL ...`. Both `buildBeginStatement` overrides
live on the `Base*` classes; the `Abstract*` ones supply the dialect and executor instead.

## Relation building crosses the kernel boundary through a registry

`RepositoryMetadataMixin` builds Drizzle relations but must never import Drizzle: one value import
of `createRelations` drags `drizzle-orm` into every graph that uses `@repository`. The seam is
`RelationBuilderRegistry` (`packages/kernel/src/helpers/inversion/common/relation-builder.ts`), a
class with static `set`/`resolve` whose `TRelationBuilder` signature is typed in `unknown`s, so the
kernel names no engine type. `resolveModelRelations()` calls `RelationBuilderRegistry.resolve()`,
and the mixin has zero `drizzle-orm` imports.

The concrete builder is installed from the **module body** of
`connectors/relational/datasources/base.ts` - its last line - not from `dialect/relation.ts`, which
it deep-imports rather than reaching through a barrel. Both choices are about packaging: a
`sideEffects: false` bundler drops a module reached only through an unused `export *` re-export, and
`discoverSchema()` in that same file is the sole production caller of `resolveModelRelations()`, so
this is the one module guaranteed to load whenever relations are actually needed.

A model that declares relations with no builder installed makes `resolveModelRelations()` throw a
named `getError` rather than emit an empty `with` clause that would surface much later. Falsified by
`__tests__/connectors/relational/relation-builder-wiring.test.ts` and
`__tests__/mixins/repository-mixin-imports.test.ts`.

## Rotation drains by capability, not by class

`AbstractRelationalDataSource.onSecretRotated()` soft-evicts three clients - a half-built one when
`configure()` throws, the rebuilt one when the driver fails to wire, and the old one after a
successful swap. All three go through `drainClient()`, which **probes for `end()` and falls back to
`close()`**. The verb is not portable: `pg.Pool` and postgres.js end, PGlite and libsql close.
Testing for a client class instead would name an engine from the neutral tier, and a client that
matches neither verb is logged rather than silently skipped - an undrained PGlite keeps a WASM
instance alive and an undrained libsql keeps a file handle open, so repeated rotations accumulate
live instances. Falsified by `__tests__/connectors/relational/rotation-drain.test.ts`, whose fake
client offers `close()` only.

## What stays Postgres-only

| Stays in `connectors/postgres` | Why |
|---|---|
| The five model enrichers (`data-type`, `id`, `principal`, `tz`, `user-audit`) | Build columns with pg-core factories (`varchar`, `jsonb`, `timestamp` with timezone) |
| `isoTimestamp`, `PgSequenceOptions` | pg-core column/sequence concepts with no SQLite equivalent |
| `IsolationLevels` (`READ COMMITTED`/`REPEATABLE READ`/`SERIALIZABLE`) | SQLite has no isolation levels - its BEGIN axis is a locking mode, not a level |
| `PostgresQueryOperators` (`dialect/query.ts`) | Drizzle root exports (`ilike`, `arrayContains`, `arrayContained`, `arrayOverlaps`) that compile to literal Postgres SQL and fail on SQLite at the database |
| `UpdateBuilder.composeJsonSet()` (`dialect/update.ts`) | Chained `jsonb_set(...)` and `::jsonb` casts. Only that one method: the split, the validation and `toUpdateData` sit in the neutral `RelationalUpdateBuilder` |
| `PostgresFilterBuilder` (`dialect/filter.ts`) | Binds the neutral `FilterBuilder`'s abstract `operators` to `PostgresQueryOperators.FNS`, and owns the `#>>`/`#>` JSON extractions and the `::numeric` guard cast |

`FilterBuilder` lives in the neutral tier
(`connectors/relational/repositories/dialect/filter.ts`), not in `connectors/postgres`. It has
**zero** `drizzle-orm/pg-core` imports, and filter merging, plain `where`/`orderBy`, column selection
and relation `include` carry no engine-specific SQL. The class is `abstract`, and it emits no
engine-specific SQL at all: `operators`, `buildJsonWhereCondition` and `buildJsonOrderBy` are all
declared `protected abstract`, so a second engine that forgets one gets a compile error rather than
Postgres SQL.

`connectors/postgres` declares `PostgresFilterBuilder extends FilterBuilder`, which supplies those
three: `PostgresQueryOperators.FNS`, the `#>>` extraction with its `::numeric` guard cast, and the
`#>` order-by extraction. `PostgresQueryDialect extends PostgresFilterBuilder`.

### Subclassing `FilterBuilder` for a second engine

The seam is three `abstract` members plus seven `protected` ones. `tsc` requires the three; reach for
the rest only when your JSON semantics differ. You inherit the other ~700 lines either way:

| Member | Override to |
|---|---|
| `get operators()` | **Required.** Return your own `TQueryOperatorHandlers` table |
| `buildJsonWhereCondition()` | **Required.** Emit your JSON path syntax, and the cast variant if your extraction is text |
| `buildJsonOrderBy()` | **Required.** Emit your JSON path syntax for one order key |
| `buildJsonOperatorConditions()` | Only if per-operator cast placement differs; it takes both extractions as arguments and names no engine |
| `jsonNeedsNumericCast()` | Only if your extraction is not text-typed; it picks between the two extractions you passed in |
| `validateJsonColumn()` | Only if your JSON column type check differs |
| `buildOperatorConditions()` | Only if `not` needs different composition; it already resolves handlers via `operators` |
| `toBareJsonOperators()` | Never. Call it - it maps a bare JSON operand to the operator object that decides its cast |
| `isOperatorObject()` | Never. Call it - your `buildJsonWhereCondition` needs it to tell an operator object from a bare value |
| `buildValueCondition()` | Never. Call it - it is the bare-value branch (null, array, equality) of your `buildJsonWhereCondition` |

The last three are call-only, and they are `protected` for that reason: without them a second engine
has to copy the base's own bare-value logic into its JSON override.

Falsified twice. `__tests__/connectors/postgres/repositories/dialect-seam.test.ts` builds a
`SqliteShapedDialect extends FilterBuilder` that emits `json_extract(..., '$.tier')` and its own
operator table, with no SQLite driver involved, and asserts `PostgresQueryDialect` still emits
exactly what a bare `PostgresFilterBuilder` does. `__tests__/connectors/sqlite/dialect.test.ts` runs
the shipped `SqliteQueryDialect` through Drizzle's `SQLiteSyncDialect`: `SqliteFilterBuilder`
overrides only `operators`, `jsonNeedsNumericCast`, `buildJsonWhereCondition` and `buildJsonOrderBy`.

### The update builder has the same shape

`RelationalUpdateBuilder` (`connectors/relational/repositories/dialect/update.ts`) is `abstract` with
**one** abstract member, `composeJsonSet({ target, path, value })`. It owns the plain-versus-JSON
split, the column-not-found throws, `toUpdateData`, and the two path validators - and that last part
is why it is a base rather than a copied skeleton: an engine composing through `sql.raw` is
injectable the moment it forgets `validateJsonPathComponents`.

Each call receives the expression built so far, so two paths on one column nest rather than discard
each other. `UpdateBuilder` returns `jsonb_set(target, '{a,b}', '"v"'::jsonb, true)` with the path
and value RAW - `jsonb_set` takes `text[]` and `jsonb`, and a bound parameter arrives untyped.
`SqliteUpdateBuilder` returns `json_set(target, ?, json(?))` with both BOUND.

Error messages interpolate `this.scope`, the concrete subclass name, so `[UpdateBuilder][transform]`
and `[SqliteUpdateBuilder.transform]` still name the builder that actually ran. Full measurement is
in the SQLite connector research spec, a local planning artifact under `docs/superpowers/`
(gitignored, not published).

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
| `BaseDataSource` | `BasePostgresDataSource` | `connectors/postgres` |

`BaseDataSource` is the only datasource alias on that sub-path. `AbstractRelationalDataSource` and
`BaseRelationalDataSource` are deliberately NOT aliased there - they are served only from
`@venizia/ignis/relational` - so no datasource name means a different class depending on which of
the two sub-paths you import from.

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

## The tier is falsified by one suite, run twice

`__tests__/connectors/relational/conformance/repository-conformance.ts` runs one repository-level
suite against two real in-process databases - PGlite and libsql `:memory:`. Same tests, same
assertions, two engines, no mocks.

Each engine passes a `capabilities` object covering two kinds of difference. A **refusal** -
`rowLocking`, `regexp`, `arrayOperators` - is asserted as a NotSupported throw when `false`. A
**divergence** is worse, because identical caller code succeeds on both engines and answers
differently, so each engine pins the answer it gives:

| Capability | Postgres | SQLite |
|---|---|---|
| `caseInsensitiveLike` | `false` - `like: 'alpha'` misses `Alpha` | `true` - native `LIKE` folds ASCII case, so `like` widens and `nlike` silently drops rows |
| `nullsSortHigh` | `true` - NULL last ascending, first descending | `false` - NULL sorts smaller than every value, so both directions invert |

Skipping a difference would prove nothing, so nothing is skipped. Add a third engine by adding one
harness file.

`__tests__/connectors/relational/no-engine-cycle.test.ts` walks the built `dist` and asserts the
neutral tier reaches **no** engine adapter. The adapter set is discovered by listing the siblings of
`dist/connectors/relational`, never named, so a third connector is guarded the day its directory
appears.

## Related

- [SQLite connector](/architecture/sqlite-connector.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Filter system](/architecture/filter-system.md)
- [Transactions](/architecture/transactions.md)
