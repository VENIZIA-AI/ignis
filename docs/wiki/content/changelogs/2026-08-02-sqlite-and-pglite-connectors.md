---
title: SQLite and PGlite - Two Embedded Relational Engines
description: A SQLite connector at @venizia/ignis/sqlite driven by libsql, and a PGliteDriver that runs Postgres in-process as WebAssembly. Both sit on the engine-neutral relational tier, proven by one repository conformance suite that runs against both.
---

# Changelog - 2026-08-02

## SQLite and PGlite - Two Embedded Relational Engines

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** IGNIS gains two embedded databases - a SQLite connector at `@venizia/ignis/sqlite`
driven by libsql, and a `PGliteDriver` that runs real Postgres in your process as WebAssembly - both
on the engine-neutral relational tier, and both proven by one repository suite that runs against
each for real.

Nothing breaks. Existing Postgres code is untouched.

## The problem it solves

[The relational lift](./2026-08-01-relational-connector-lift) split IGNIS's SQL tier into an
engine-neutral `connectors/relational` and a Postgres branch on top of it. That left a claim
untested: a seam only one engine satisfies is not a seam.

Two engines now sit on it. Every port `connectors/relational` declares abstract has two
implementations, not one.

## What changed

- **New SQLite connector** at `@venizia/ignis/sqlite`, with the libsql driver at
  `@venizia/ignis/sqlite/libsql`. Datasource, entity base, five repository classes, five column
  enrichers, and a SQLite dialect for filters and JSON updates.
- **New `PGliteDriver`** at `@venizia/ignis/postgres/pglite`. PGlite is Postgres compiled to
  WebAssembly, so it reuses the entire Postgres connector - same dialect, same enrichers, same
  `pgTable` models. It is a driver, not an engine.
- **One repository conformance suite, run against both engines in-process.** 23 tests per engine,
  46 total, against a real PGlite database and a real libsql `:memory:` database.
- **Every SQLite gap throws rather than faking.** Row locking, `regexp`, array operators and
  isolation levels raise `501 Not Implemented` with `normalized.code: 'core.not_supported'`.
- **`@electric-sql/pglite` and `@libsql/client` are optional peer dependencies.** Neither reaches
  the `@venizia/ignis` root barrel, so apps that use neither pull in neither.

## Migration

Nothing to migrate. This release is purely additive: four new sub-path exports, no symbol removed,
renamed or re-signatured. Every existing import resolves exactly as before.

If you are upgrading across both releases at once, the renames live in the
[Relational Connector Lift](./2026-08-01-relational-connector-lift#migration-guide) migration guide,
which carries the detection grep and the codemod.

## Who is affected

- **Every existing Postgres application.** No action needed. Nothing on the Postgres path changed.
- **Anyone writing tests against a database.** `PGliteDriver` gives you real Postgres semantics with
  no Docker and no fixture server. See [PGlite](/guides/core-concepts/persistent/pglite).
- **Anyone shipping a CLI, desktop app or edge worker.** Both engines run embedded - one data
  directory or one file, no service. See [SQLite](/guides/core-concepts/persistent/sqlite).
- **Anyone considering SQLite as a production engine.** Read the capability table on the SQLite page
  first. `like` is case-insensitive there and `nlike` silently drops rows a Postgres `nlike` keeps.
- **Anyone using the `Authentication`, `Authorization` or `StaticAssetComponent` components.** They
  stay Postgres-only in this release - their models are `pgTable`.
- **Anyone building a third SQL engine.** The seam is now falsified rather than asserted. Supply a
  dialect, an executor and a driver; inherit the rest.

## The conformance suite

`src/__tests__/connectors/relational/conformance/repository-conformance.ts` is one repository-level
suite, run against two real in-process databases. It asserts behaviour a repository consumer depends
on - CRUD verbs, filter composition, default-filter merging, hidden properties, commit and rollback -
and never an engine's SQL text.

Each engine declares what it can do, and the suite asserts the **refusal** where a capability is
`false`:

```typescript
runRepositoryConformance({
  engine: 'sqlite (libsql :memory:)',
  capabilities: {
    rowLocking: false,
    regexp: false,
    arrayOperators: false,
    caseInsensitiveLike: true,
    nullsSortHigh: false,
  },
  build: () => harness,
});
```

The last two are not refusals. They are divergences - the same call succeeds on both engines and
answers differently - so each engine pins the answer it actually gives:

| Divergence | PostgreSQL | SQLite |
|---|---|---|
| `{ like: 'alpha' }` | matches `alpha` | matches `Alpha` and `alpha` |
| `{ nlike: 'alpha' }` | keeps `Alpha` | **drops** `Alpha` |
| `order: ['score ASC']` with a NULL | NULL last | NULL first |

A suite that skipped the differences would prove nothing, so nothing is skipped. It found a real
defect on its first run: `PostgresQueryExecutor.readAffectedRowCount` knew `pg`'s `rowCount` and
postgres-js's `count`, but PGlite reports `affectedRows` and nothing else. Every Postgres write with
`shouldReturn: false` threw against PGlite until that was fixed.

## Details

### SQLite

`BaseSqliteDataSource` inherits `getConnectionString()` - the libsql URL **is** SQLite's connection
string, so there is nothing for an application to guess. `:memory:`, `file:./data.db`, a Turso
`libsql://` URL and an embedded replica all run on the one driver.

SQLite has no isolation levels, because every SQLite transaction is already serializable. The axis is
a locking mode instead - `SqliteBeginModes.DEFERRED | IMMEDIATE | EXCLUSIVE`, defaulting to
`IMMEDIATE`. `BEGIN DEFERRED` takes its write lock at the first write, and that upgrade fails outright
with `SQLITE_BUSY` when another writer got there first. `IMMEDIATE` waits on the busy timeout instead.
Passing `isolationLevel` throws rather than being ignored.

The driver is libsql and not `bun:sqlite` or `better-sqlite3` for one reason: those are synchronous,
and IGNIS repositories return promises. A synchronous driver blocks the event loop on every query.
Drizzle also types `bun:sqlite`'s run result as `void`, which puts affected-row counts out of reach.

`.returning()` works on insert, update and delete - MySQL cannot do that, so nothing is emulated with
a read-then-write.

### PGlite

PGlite reports `PostgreSQL 18.3`, so `#>>` JSON paths, `ILIKE`, regex operators, arrays and
`SELECT ... FOR UPDATE` all work unchanged. What it does not have is a second connection.

`PGliteDriver.acquire()` borrows the one session from a 1-slot pool, so transactions serialise. A
second `BEGIN` on that session would not nest and would not error - it joins the open transaction
silently, and the outer `COMMIT` commits the inner writer's rows. The pool is what prevents that.

The wait for that slot is bounded by `acquireTimeoutMs`, defaulting to
`PGliteDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` (30000). A transaction leaked between `BEGIN` and commit
then surfaces as a named error on the next `acquire()`, instead of hanging every later transaction in
the process forever. The timeout bounds the wait for the slot, never the transaction, so a migration
running alone never trips it.

One session has a consequence worth stating plainly: a write through `createConnector()` - the path
every repository takes without `options.transaction` - runs inside whatever transaction is open at
that moment, and that transaction's `ROLLBACK` discards it. That is PGlite, not the driver. Under
concurrency, pass the transaction.

### Two quickstart examples

`examples/pglite-quickstart` and `examples/sqlite-quickstart` are the same CRUD app on both engines.
Reading them side by side is the fastest way to see where the boundary falls: the models differ
because the storage classes do, and the datasources differ because the clients do. The repositories
and controllers are byte-identical apart from their imports.

Neither needs a server, a container or a connection string:

```bash
cd examples/pglite-quickstart   # or examples/sqlite-quickstart
bun install
bun run start
```

Both carry generated drizzle-kit migrations under `migration/` and apply them in-process at boot,
rather than hand-writing DDL. Runtime state - the database and rotating logs - lives under
`app_data/`, the same layout `vert` uses.

| File | Package |
|------|---------|
| `src/connectors/sqlite/**` | core |
| `src/connectors/postgres/drivers/pglite.ts` | core |
| `src/__tests__/connectors/relational/conformance/**` | core |
| `src/__tests__/connectors/sqlite/**` | core |
| `src/__tests__/connectors/postgres/drivers/pglite.test.ts` | core |
| `examples/pglite-quickstart/**` | - |
| `examples/sqlite-quickstart/**` | - |

See also: [SQLite](/guides/core-concepts/persistent/sqlite) and
[PGlite](/guides/core-concepts/persistent/pglite) for the guides,
[Relational Connector Lift](./2026-08-01-relational-connector-lift) for the tier they sit on, and
[Connectors](/references/base/connectors) for the engine-neutral contract.
