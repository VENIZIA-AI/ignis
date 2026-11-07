---
type: Architecture
title: DataSource hierarchy
description: How IGNIS datasources are layered by paradigm family, discover their schema from repository bindings, and pull an engine driver into the bundle through a class reference.
resource: packages/connectors/src
tags: [architecture, datasource, connectors, drizzle, postgres, search]
---

<!-- okf:generated:contents start -->
**Contents**

- [The real layering](#the-real-layering)
- [A raw-SQL engine sits beside the relational branch, not under it](#a-raw-sql-engine-sits-beside-the-relational-branch-not-under-it)
- [Datasources are singletons](#datasources-are-singletons)
- [Schema auto-discovery, not manual config](#schema-auto-discovery-not-manual-config)
- [A datasource can open on first use](#a-datasource-can-open-on-first-use)
- [Lazy resolution](#lazy-resolution)
- [The driver is a CLASS, not a string](#the-driver-is-a-class-not-a-string)
- [Closing](#closing)
- [Related](#related)
<!-- okf:generated:contents end -->

A DataSource owns the connection to one backing engine. IGNIS does not have a single DataSource base class per engine - it has a **paradigm-family** split under `packages/connectors/src`, the `@venizia/ignis-connectors` package, rooted at an engine-neutral base in `packages/kernel/src/base/datasources`. That base sits in the browser-pure `@venizia/ignis-kernel` package, and `@venizia/ignis` re-exports both: the whole kernel, plus `packages/core-server/src/connectors`, which is now only a shim of alias barrels forwarding to `@venizia/ignis-connectors` - import paths for consumers are unchanged.

Sub-path **names** stay flat (`@venizia/ignis-connectors/postgres`, `/sqlite`, `/typesense`, `/meilisearch`) even though the source folders nest each engine under its family, `relational/` or `search/`.

## The real layering

```
AbstractDataSource                    kernel/base/datasources/abstract.ts        (engine-neutral, NO SQL members)
├── AbstractDriverDataSource          connectors/common/driver-data-source.ts    (one client + driver wiring, close once, secret rotation, drain; NO SQL members)
│   ├── AbstractRelationalDataSource  connectors/relational/core/datasources/abstract.ts   (SQL-neutral: connection string, transactions, dialect + executor abstract)
│   │   └── BaseRelationalDataSource  connectors/relational/core/datasources/base.ts       (schema discovery, transaction skeleton; BEGIN text abstract)
│   │       ├── AbstractPostgresDataSource   connectors/relational/postgres/datasources/abstract.ts   (supplies PostgresQueryDialect + PostgresQueryExecutor)
│   │       │   └── BasePostgresDataSource   connectors/relational/postgres/datasources/base.ts       (supplies "BEGIN TRANSACTION ISOLATION LEVEL ...")
│   │       └── AbstractSqliteDataSource     connectors/relational/sqlite/datasources/abstract.ts     (supplies SqliteQueryDialect + SqliteQueryExecutor)
│   │           └── BaseSqliteDataSource     connectors/relational/sqlite/datasources/base.ts         (supplies "BEGIN IMMEDIATE")
│   └── BaseRawSqlDataSource          connectors/raw-sql/datasource.ts           (a raw-SQL engine: execute(query) returns rows; no dialect, no executor, no transactions)
└── AbstractSearchDataSource          connectors/search/core/datasources/abstract.ts
    └── BaseSearchDataSource          connectors/search/core/datasources/base.ts
        ├── TypesenseDataSource       connectors/search/typesense/datasources/datasource.ts
        └── MeilisearchDataSource     connectors/search/meilisearch/datasources/datasource.ts
```

`AbstractDataSource` extends `BaseHelper` and knows only `name`, `settings`, `schema`, `getCapabilities()`, and a `beginTransaction()` that throws NotSupported by default. Each family root adds its own paradigm contract: the relational root adds connector/pool/driver/transactions plus two ports (`getQueryDialect()`, `getQueryExecutor()`) declared abstract, the search root adds `getConnector()`, `getQueryDialect()`, `compileCollection()`, `ensureCollection()`, and `multiSearch()`.

The relational family splits again, into an engine-neutral root and a Postgres branch: `connectors/relational/core` (reachable at the `@venizia/ignis-connectors/relational` sub-path) carries the SQL-neutral half - connector/pool/driver wiring, schema discovery, the transaction skeleton, the entity base, and the five-class repository chain - and `connectors/relational/postgres` supplies the two ports plus everything genuinely Postgres SQL. Full account: [Relational connector](/architecture/relational-connector.md). Every class is declared under a distinct name - the Postgres branch declares `AbstractPostgresDataSource` and `BasePostgresDataSource`, and the neutral `AbstractRelationalDataSource` / `BaseRelationalDataSource` are reachable only through `@venizia/ignis-connectors/relational`. `@venizia/ignis-connectors/postgres` deliberately re-exports neither of those two neutral names; it aliases exactly one, `BaseDataSource` -> `BasePostgresDataSource`. So no name ever means two different classes across the two sub-paths. The root barrel still re-exports the postgres sub-path only, keeping the neutral tier out of the root namespace.

The engines that actually exist in source are **Postgres** (with `node-postgres`, `postgres-js` and `pglite` drivers, plus a `postgres/supabase` sub-path for RLS and pooler concerns), **SQLite** (the `libsql` driver, at the `@venizia/ignis-connectors/sqlite` sub-path - see [SQLite connector](/architecture/sqlite-connector.md)) and **search** (`typesense` and `meilisearch`). `DataSourceDrivers` in `packages/kernel/src/base/datasources/common/types.ts` names exactly those six - the neutral relational root adds no driver of its own, only the seam a third SQL engine (MySQL) would register against.

PGlite is a **driver**, not an engine: it is Postgres compiled to WASM, so `drizzle-orm/pglite` yields a `PgDatabase` and the whole Postgres dialect, every enricher and every `pgTable` model apply unchanged. It has exactly one session, though, and a second `BEGIN` on it silently joins the open transaction rather than nesting or erroring - so `PGliteDriver.acquire()` borrows from a 1-slot `BasePoolHelper` and a concurrent transaction waits instead of corrupting the first. `release({ destroy: true })` cannot throw the single session away, so it discards the slot and scrubs the session with a `ROLLBACK` before the next borrower is served. The wait for that slot is bounded: the constructor forwards the pool's control knobs (`acquireTimeoutMs`, `maxWaitingClients`, `scope`) and pins `size` at 1, with `acquireTimeoutMs` defaulting to `PGliteDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` = 30s - a transaction leaked between `BEGIN` and commit then surfaces as a named error on the next `acquire()` instead of stalling every later transaction in the process forever. One session also means a write issued through `createConnector()` - the path every repository takes - runs inside whatever transaction happens to be open, and that transaction's `ROLLBACK` silently discards it, so concurrent writes belong on `acquire()`.

## A raw-SQL engine sits beside the relational branch, not under it

An analytics engine beside the main database (ClickHouse, DuckDB, BigQuery) runs SQL text and returns rows: no Drizzle dialect, no query executor, no connection string, no transactions. Putting it under `AbstractRelationalDataSource` would force it to stub four abstract members that throw "not supported". So the lifecycle the relational root used to carry alone (driver wiring from `@datasource({ driver })`, close once, soft-eviction after a secret rotation, drain by capability) lives in `AbstractDriverDataSource`, and both the relational root and `BaseRawSqlDataSource` extend it. `IRelationalDriver` extends the neutral `IConnectorDriver` (`createConnector`, `getClient`, `end`) with `acquire`; a raw-SQL driver is the neutral one, so it has no way to open a transaction. `BaseRawSqlRepository<TConnector>` is bound with `@repository({ type: RepositoryTypes.REMOTE, dataSource })` (a datasource and no model) and reads `this.connector`, typed by its generic. No engine connector ships in IGNIS.

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

## A datasource can open on first use

`@datasource({ open: { on: 'first-use' } })` (default `start`). The boot (`registerDynamicBindings`, DATASOURCE namespace) calls `deferOpen({ options })` instead of `configure()`; `AbstractDataSource.ensureOpen()` runs `configure(options)` once on the first call, concurrent callers share the promise, a failure runs `discardPartialOpen()` (the driver base ends the half-built client and clears driver/connector) and frees the slot for a retry, `close()` settles an open in flight first (`settleOpening()`) and refuses any later open. Only a family whose every entry point awaits `ensureOpen()` says `supportsDeferredOpen()`: the relational one does (`acquireConnector()` in the repository, `beginTransaction()`); search and raw SQL refuse `first-use` at boot. `getConnector()`/`getClient()` stay synchronous and throw until the datasource is open ("still opening" while it opens, "closed" after `close()`). **The open's own database work uses explicit handles, not ambient context:** `configure(options, opening)` gets `IDataSourceOpening<TConnector, Client, TTransaction>` (`getConnector`, `getClient`, `beginTransaction`) bound to the UNGATED internals (`createOpening()`, protected; the boot reaches it only through `[OPENING_HANDLES]()`, a symbol made with `Symbol()` in `base/datasources/opening-handles.ts` and NOT exported from the package, so there is no public accessor: an earlier `getOpening()` let any code take the handles during the open and query before the migrations ran; the relational family adds `openTransaction`). A `configure()` that never settles keeps the datasource unopenable until a restart (`timeoutMs` only releases the waiters), passed in start mode too by the boot, so one body serves both modes and no other caller can slip in (AsyncLocalStorage does not exist in a browser Worker, the target of this feature). A repository inside configure waits on itself; `open.timeoutMs` (default 60 s) turns that, or any hang, into a named rejection: the attempt is ABANDONED (`abandoned` promise): no second configure runs while it lives, and when it settles `discardPartialOpen()` closes what it built, so a late configure never publishes a client. `discardPartialOpen` never clears a `closePromise` that a pending `close()` owns. Every connector resolution in the framework awaits `ensureOpen()`: repository verbs via `acquireConnector()`, `beginTransaction()`, and the casbin adapters via `PolicyConnectorResolver.resolve` (async).

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

## Closing

`close()` is the shutdown verb. `IDataSource` declares it optional; `AbstractDataSource` resolves at
once, and the search and HTTP datasources keep that. `AbstractRelationalDataSource.close()` runs once
(later calls return the first promise) and ends the connection through `resolveDriver()` then
`driver.end()`. The driver is wired even if nothing queried yet, because `end()` is the engine's full
teardown: PGlite also destroys its slot and clears the exit status 99 it plants on the host. A client
no driver can wrap is drained with `drainClient()`. A driver without `end()` (a hand-made one cast
past `IRelationalDriver`, a consumer's `ReportDataSource` shape) is drained the same way instead of
rejecting. `application.stop()` calls `close()` on every configured datasource, bounded by
`dataSourceCloseTimeoutMs` - see [Application lifecycle](/architecture/application-lifecycle.md).

## Related

- [Relational connector](/architecture/relational-connector.md)
- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [Transactions](/architecture/transactions.md)
- [Typesense Search](/architecture/search-typesense.md)
- [DI Container](/architecture/di-container.md)
