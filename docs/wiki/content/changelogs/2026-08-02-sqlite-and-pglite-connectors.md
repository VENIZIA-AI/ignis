---
title: SQLite and PGlite - Two Embedded Relational Engines
description: You can now run IGNIS on embedded SQLite through @venizia/ignis/sqlite, or on Postgres in-process through PGliteDriver, with no database server.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-02

## SQLite and PGlite - Two Embedded Relational Engines

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** IGNIS gains a SQLite connector at `@venizia/ignis/sqlite` (driven by libsql) and a `PGliteDriver` that runs real Postgres in your process as WebAssembly. Nothing breaks, and existing Postgres code is untouched.

## What changed

- **SQLite connector** at `@venizia/ignis/sqlite`, with the libsql driver at `@venizia/ignis/sqlite/libsql`. It has a datasource, an entity base, five repository classes, five column enrichers, and a SQLite dialect for filters and JSON updates.
- **`PGliteDriver`** at `@venizia/ignis/postgres/pglite`. It reuses the whole Postgres connector - same dialect, enrichers and `pgTable` models.
- **Unsupported SQLite features throw.** Row locking, `regexp`, array operators and isolation levels raise `501 Not Implemented` with `normalized.code: 'core.not_supported'`.
- **Optional peer dependencies.** `@electric-sql/pglite` and `@libsql/client` are optional, and neither reaches the `@venizia/ignis` root barrel, so apps that use neither pull in neither.

## Who is affected

- **Every existing Postgres application.** No action needed. No symbol was removed, renamed or re-signatured.
- **Anyone writing tests against a database.** `PGliteDriver` gives real Postgres semantics with no Docker. See [PGlite](/guides/core-concepts/persistent/pglite).
- **Anyone shipping a CLI, desktop app or edge worker.** Both engines run embedded. See [SQLite](/guides/core-concepts/persistent/sqlite).
- **Anyone considering SQLite in production.** Read the capability table on the SQLite page first.
- **Anyone using the `Authentication`, `Authorization` or `StaticAssetComponent` components.** They stay Postgres-only in this release, because their models are `pgTable`.
- **Upgrading across the relational lift too.** The renames are in the [Relational Connector Lift](./2026-08-01-relational-connector-lift#migration-guide) migration guide.

## Details

Where SQLite and Postgres answer differently:

| Call | PostgreSQL | SQLite |
|---|---|---|
| `{ like: 'alpha' }` | matches `alpha` | matches `Alpha` and `alpha` |
| `{ nlike: 'alpha' }` | keeps `Alpha` | **drops** `Alpha` |
| `order: ['score ASC']` with a NULL | NULL last | NULL first |

**SQLite**

- `:memory:`, `file:./data.db`, a Turso `libsql://` URL and an embedded replica all run on the one driver. `BaseSqliteDataSource` inherits `getConnectionString()`.
- SQLite has no isolation levels. Use the locking mode `SqliteBeginModes.DEFERRED | IMMEDIATE | EXCLUSIVE`, which defaults to `IMMEDIATE`. `BEGIN DEFERRED` fails with `SQLITE_BUSY` if another writer got there first. Passing `isolationLevel` throws.
- `.returning()` works on insert, update and delete.

**PGlite**

- PGlite reports `PostgreSQL 18.3`, so `#>>` JSON paths, `ILIKE`, regex operators, arrays and `SELECT ... FOR UPDATE` work unchanged. It has one session, so transactions serialise.
- The wait for the session is bounded by `acquireTimeoutMs`, default `PGliteDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` (30000). A leaked transaction then surfaces as a named error on the next `acquire()`. The timeout bounds the wait, never the transaction.
- A write through `createConnector()` without `options.transaction` runs inside whatever transaction is open, and that transaction's `ROLLBACK` discards it. Under concurrency, pass the transaction.
- Postgres writes with `shouldReturn: false` now work on PGlite, which reports `affectedRows` only.

See also: [SQLite](/guides/core-concepts/persistent/sqlite), [PGlite](/guides/core-concepts/persistent/pglite), [Relational Connector Lift](./2026-08-01-relational-connector-lift) and [Connectors](/references/base/connectors).
