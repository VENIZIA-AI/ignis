---
type: Example
title: sqlite-quickstart
description: The same notes-and-comments CRUD app as pglite-quickstart on SQLite through libsql - the second SQL dialect on the engine-neutral relational tier, and the proof that the tier is genuinely engine-neutral.
resource: examples/sqlite-quickstart
tags: [examples, sqlite, libsql, relational, quickstart]
---

`sqlite-quickstart` is the same notes-and-comments CRUD app as
[pglite-quickstart](/examples/pglite-quickstart.md) on a genuinely different engine. Where PGlite is
a driver swap under the Postgres connector, SQLite is a **second connector** on the shared
relational tier: `BaseSQLiteDatabase` is an independent Drizzle root class, so nothing from the
Postgres connector is reusable. What is reused is `connectors/relational` - and this example is the
end-to-end evidence that the lift worked.

## What it demonstrates

- **Two connectors, one tier** - imports come from `@venizia/ignis/sqlite` and
  `@venizia/ignis/sqlite/libsql`, never from `@venizia/ignis/postgres`. The repository is still an
  empty class under `@repository({ model, dataSource })`, and the controller is the unmodified
  `ControllerFactory.defineCrudController` output, because both live above the engine boundary. The
  model has the same shape as PGlite's: `notes` and `comments` tables, `Comment.note` a `one()`
  reading its foreign key, `Note.comments` a `many()`.
- **Storage classes have neighbours, not equivalents** - SQLite has five, so the model uses `text`
  for the id and body columns instead of `uuid`/`varchar`, `text({ mode: 'json' })` instead of
  `jsonb`, and `generateTzColumnDefs` for the created-at default instead of `timestamptz`. The filter
  layer compensates: JSON-path predicates compile to `json_extract` rather than `#>>`.
- **`generateTzColumnDefs` owns the default expression** - it is the enricher, not the caller, that
  wraps the ISO-timestamp constant in `sql.raw()`. This example disables `modified` and `deleted`
  (`{ enable: false }`) and keeps only `createdAt`.
- **libsql spans four deployment shapes** - `file:` for local, `:memory:` for ephemeral, plus remote
  and embedded-replica Turso URLs, all behind one `createClient({ url })`. A remote URL cannot hold
  an explicit transaction, which is a property of the transport, not of the connector.
- **Real migrations, applied in-process** - `src/migration.ts` is a drizzle-kit config pointing at
  the model file; `migrate()` from `drizzle-orm/libsql/migrator` runs inside `configure()`. Unlike
  PGlite nothing forces this - libsql takes no exclusive lock - but an embedded database ships with
  the app, so a separate migrate step only adds a way to forget. `migrate:generate` and `migrate:dev`
  are real scripts here, the same as in `pglite-quickstart`.

## How to run it

```bash
bun install
bun run start        # http://localhost:3000/api/notes, explorer at /api/doc/explorer
bun test              # smoke test: same Application, free port, APP_ENV_SQLITE_URL=:memory:
```

Runtime state: `app_data/database/local.db` for the database and `app_data/logs` for rotating log
files. `APP_ENV_SQLITE_URL` overrides the first, `APP_ENV_LOGGER_FOLDER_PATH` the second.
`app_data/` is gitignored repository-wide and survives `clean.sh` - it is state, not a build
artifact.

## Notable / non-obvious

- Deleting a note that does not exist still answers `200`: a read for that id afterward returns
  `{ count: 0, data: null }`, not `404`.
- `ControllerFactory.defineCrudController` needs no constructor on the subclass - same as
  `pglite-quickstart`, since both use the same factory.
- The fourth type parameter of `BaseSqliteDataSource` is libsql's `Client`, matching the PGlite
  example's use of the slot for its own raw client type.
- **Explicit transactions need a local database.** A remote Turso url runs every statement on its
  own connection, so `BEGIN` cannot hold - `LibSqlDriver` refuses rather than letting it silently
  not apply.
- This example is one of `EXAMPLES_SMOKE` in the root `Makefile` - `make examples-smoke` runs its
  `bun test` in CI, no docker needed.

## Related
- [pglite-quickstart](/examples/pglite-quickstart.md)
- [SQLite connector](/architecture/sqlite-connector.md)
- [Relational connector](/architecture/relational-connector.md)
