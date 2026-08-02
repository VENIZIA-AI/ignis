---
type: Architecture
title: DataSource hierarchy
description: How IGNIS datasources are layered by paradigm family, discover their schema from repository bindings, and pull an engine driver into the bundle through a class reference.
resource: packages/core/src/connectors
tags: [architecture, datasource, connectors, drizzle, postgres, search]
---

A DataSource owns the connection to one backing engine. IGNIS does not have a single DataSource base class per engine - it has a **paradigm-family** split under `packages/core/src/connectors`, rooted at an engine-neutral base in `packages/core/src/base/datasources`.

## The real layering

```
AbstractDataSource                    base/datasources/abstract.ts               (engine-neutral, NO SQL members)
├── AbstractRelationalDataSource      connectors/relational/datasources/abstract.ts   (SQL-neutral: connector/pool/driver wiring; dialect + executor abstract)
│   └── BaseRelationalDataSource      connectors/relational/datasources/base.ts       (schema discovery, transaction skeleton; BEGIN text abstract)
│       ├── AbstractPostgresDataSource   connectors/postgres/datasources/abstract.ts   (supplies PostgresQueryDialect + PostgresQueryExecutor)
│       │   └── BasePostgresDataSource   connectors/postgres/datasources/base.ts       (supplies "BEGIN TRANSACTION ISOLATION LEVEL ...")
│       └── AbstractSqliteDataSource     connectors/sqlite/datasources/abstract.ts     (supplies SqliteQueryDialect + SqliteQueryExecutor)
│           └── BaseSqliteDataSource     connectors/sqlite/datasources/base.ts         (supplies "BEGIN IMMEDIATE")
└── AbstractSearchDataSource          connectors/search/datasources/abstract.ts
    └── BaseSearchDataSource          connectors/search/datasources/base.ts
        ├── TypesenseDataSource       connectors/typesense/datasources/datasource.ts
        └── MeilisearchDataSource     connectors/meilisearch/datasources/datasource.ts
```

`AbstractDataSource` extends `BaseHelper` and knows only `name`, `settings`, `schema`, `getCapabilities()`, and a `beginTransaction()` that throws NotSupported by default. Each family root adds its own paradigm contract: the relational root adds connector/pool/driver/transactions plus two ports (`getQueryDialect()`, `getQueryExecutor()`) declared abstract, the search root adds `getConnector()`, `getQueryDialect()`, `compileCollection()`, `ensureCollection()`, and `multiSearch()`.

The relational family splits again, into an engine-neutral root and a Postgres branch: `connectors/relational` (reachable at the `@venizia/ignis/relational` sub-path) carries the SQL-neutral half - connector/pool/driver wiring, schema discovery, the transaction skeleton, the entity base, and the five-class repository chain - and `connectors/postgres` supplies the two ports plus everything genuinely Postgres SQL. Full account: [Relational connector](/architecture/relational-connector.md). Every class is declared under a distinct name - the Postgres branch declares `AbstractPostgresDataSource` and `BasePostgresDataSource`. `@venizia/ignis/postgres` also *exports* those two under their pre-lift names (`AbstractRelationalDataSource`, `BaseRelationalDataSource`), which the neutral tier declares for its own classes, so one name means different classes on different sub-paths. That is why `connectors/index.ts` exports `./postgres` only and never adds `./relational` to the same namespace.

The engines that actually exist in source are **Postgres** (with `node-postgres`, `postgres-js` and `pglite` drivers, plus a `postgres/supabase` sub-path for RLS and pooler concerns), **SQLite** (the `libsql` driver, at the `@venizia/ignis/sqlite` sub-path - see [SQLite connector](/architecture/sqlite-connector.md)) and **search** (`typesense` and `meilisearch`). `DataSourceDrivers` in `base/datasources/common/types.ts` names exactly those six - the neutral relational root adds no driver of its own, only the seam a third SQL engine (MySQL) would register against.

PGlite is a **driver**, not an engine: it is Postgres compiled to WASM, so `drizzle-orm/pglite` yields a `PgDatabase` and the whole Postgres dialect, every enricher and every `pgTable` model apply unchanged. It has exactly one session, though, and a second `BEGIN` on it silently joins the open transaction rather than nesting or erroring - so `PGliteDriver.acquire()` borrows from a 1-slot `BasePoolHelper` and a concurrent transaction waits instead of corrupting the first. `release({ destroy: true })` cannot throw the single session away, so it discards the slot and scrubs the session with a `ROLLBACK` before the next borrower is served. The wait for that slot is bounded: the constructor forwards the pool's control knobs (`acquireTimeoutMs`, `maxWaitingClients`, `scope`) and pins `size` at 1, with `acquireTimeoutMs` defaulting to `PGliteDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` = 30s - a transaction leaked between `BEGIN` and commit then surfaces as a named error on the next `acquire()` instead of stalling every later transaction in the process forever. One session also means a write issued through `createConnector()` - the path every repository takes - runs inside whatever transaction happens to be open, and that transaction's `ROLLBACK` silently discards it, so concurrent writes belong on `acquire()`.

## Datasources are singletons

`BaseApplication.dataSource()` binds the class under `datasources.<ClassName>` and calls `.setScope(BindingScopes.SINGLETON)`. That is what makes the connection pool shared: every repository injected with the same datasource key gets the same instance, therefore the same `pg.Pool` or the same Typesense client. Repositories and controllers are *not* forced to singleton scope - only datasources are.

## Schema auto-discovery, not manual config

`@repository({ model, dataSource })` registers a repository/model/datasource triple in the `MetadataRegistry`. `BaseRelationalDataSource.getSchema()` then walks that registry rather than reading a hand-written schema map:

```typescript
override getSchema(): Schema {
  if (!this.schema) {
    this.schema = this.discoverSchema();
  }
  return this.schema;
}
```

`discoverSchema()` calls `registry.buildSchema({ dataSource })` and merges `schema` with `relations`. `BaseSearchDataSource` mirrors it with `discoverCollections()` over the shared `discoverDefinitions()` helper, reading each bound model's static `searchCollection` (the dual-schema escape hatch for a Postgres entity that also carries a search index) and falling back to a shape-guarded static `schema`. Passing `schema` into the constructor, or `@datasource({ autoDiscovery: false })`, opts out.

## Lazy resolution

Nothing resolves eagerly. `getSchema()` memoizes on first access. `wireDriverFromMetadata()` builds the driver and connector on first `getConnector()` and is idempotent. `hiddenFieldsByCollection()` memoizes the same way. The justification is uniform: `@model` settings and `@repository` bindings are frozen once boot completes, so a first-use computation never needs invalidation.

## The driver is a CLASS, not a string

`@datasource({ driver: NodePostgresDriver })` takes a class reference, and `TDataSourceDriverClass` is typed as a class for a reason spelled out in source: a class reference is what carries `pg` or `postgres` into the application's bundle. A driver-name **string** carries no module - dynamic `import()` defers *execution*, not *packaging* - and a bare side-effect import added to compensate is one a bundler may delete. `wireDriverFromMetadata()` rejects a non-function driver explicitly, because an untyped JavaScript caller passing a string is exactly the mistake that produces a bundle missing its peer.

```typescript
@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource {
  configure() {
    this.client = new Pool({ connectionString: /* ... */ });
  }
}
```

`configure()` stays app-written - connection config varies per deployment, and the framework never builds the driver for you. Assigning `this.client` is enough; the driver named in the decorator is constructed over it lazily. A custom driver skips metadata entirely via `useDriver({ driver })`, which assigns driver *and* connector in one step so the "driver set, connector forgotten" state is unrepresentable.

## Related

- [Relational connector](/architecture/relational-connector.md)
- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [Transactions](/architecture/transactions.md)
- [Typesense Search](/architecture/search-typesense.md)
- [DI Container](/architecture/di-container.md)
