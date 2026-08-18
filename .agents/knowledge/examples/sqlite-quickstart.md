---
type: Example
title: sqlite-quickstart
description: A CRUD app on SQLite through libsql - the second SQL dialect on the engine-neutral relational tier, and the proof that the tier is genuinely engine-neutral.
resource: examples/sqlite-quickstart
tags: [examples, sqlite, libsql, relational, quickstart]
---

`sqlite-quickstart` is the same five-file CRUD app as
[pglite-quickstart](/examples/pglite-quickstart.md) on a genuinely different engine. Where PGlite is
a driver swap under the Postgres connector, SQLite is a **second connector** on the shared
relational tier: `BaseSQLiteDatabase` is an independent Drizzle root class, so nothing from the
Postgres connector is reusable. What is reused is `connectors/relational` - and this example is the
end-to-end evidence that the lift worked.

## What it demonstrates

- **Two connectors, one tier** - imports come from `@venizia/ignis/sqlite` and
  `@venizia/ignis/sqlite/libsql`, never from `@venizia/ignis/postgres`. The repository is still a
  one-liner - `DefaultSqliteRepository<TNoteSchema>`, the SQLite spelling of the Postgres
  `DefaultCRUDRepository` - and the controller is the unmodified CRUD factory, because both live
  above the engine boundary.
- **Storage classes have neighbours, not equivalents** - SQLite has five, so the model uses `text`
  for the id instead of `uuid`, `text({ mode: 'json' })` instead of `jsonb`, and an ISO-8601 string
  instead of `timestamptz`. The filter layer compensates: JSON-path predicates compile to
  `json_extract` rather than `#>>`.
- **`generateTzColumnDefs` owns the default expression** - it is the enricher, not the caller, that
  wraps `ISO_TIMESTAMP_NOW` in `sql.raw()`. Passing the constant to `.default()` by hand stores the
  literal SQL text as the column value, which then fails on read with `Invalid date string`. This
  example disables `modified` and `deleted` (`{ enable: false }`) and keeps only `createdAt`.
- **libsql spans four deployment shapes** - `file:` for local, `:memory:` for ephemeral, plus remote
  and embedded-replica Turso URLs, all behind one `createClient({ url })`. A remote URL cannot hold
  an explicit transaction, which is a property of the transport, not of the connector.
- **Real migrations, applied in-process** - `src/migration.ts` is a drizzle-kit config pointing at
  the model file; `migrate()` from `drizzle-orm/libsql/migrator` runs inside `configure()`. Unlike
  PGlite nothing forces this - libsql takes no exclusive lock - but an embedded database ships with
  the app, so a separate migrate step only adds a way to forget. `__drizzle_migrations` makes every
  later boot a no-op. Where pglite-quickstart defines `migrate:generate` and `migrate:dev` scripts,
  this example's `package.json` defines neither, so regenerating means invoking drizzle-kit directly
  (`drizzle-kit generate --config=src/migration.ts`). Its README and a datasource comment still
  name those scripts - the scripts are what is missing, not the config.
- **Hand-written DDL is what drift looks like** - the first version of both examples carried a DDL
  string. Generating from the model proved the Postgres one had already diverged: it declared
  `id uuid default gen_random_uuid()` while `generateIdColumnDefs({ id: { dataType: 'string' } })`
  emits `text` with an application-side `$defaultFn`. Both worked, so nothing failed.

## How to run it

```bash
bun install
bun run start        # http://localhost:3000/api/notes, explorer at /doc/explorer
```

Runtime state follows the `vert` layout: `app_data/database/local.db` for the database and
`app_data/logs` for rotating log files. `APP_ENV_SQLITE_URL` overrides the first,
`APP_ENV_LOGGER_FOLDER_PATH` the second, and `.env.example` documents both. `app_data/` is
gitignored repository-wide and survives `clean.sh` - it is state, not a build artifact.

## Notable / non-obvious

- The `count` route needs an explicit `where` parameter (`?where={}`); calling it bare returns a 422
  `invalid_union`, which is validation working rather than a SQLite quirk.
- The same two runtime traps as the PGlite example apply and are not engine-specific:
  `application.init()` before `application.start()`, and the `@inject`ed constructor on the CRUD
  controller subclass.
- The fourth type parameter of `BaseSqliteDataSource` is libsql's `Client`, matching the PGlite
  example's use of the slot for its own raw client type.

## Related
- [pglite-quickstart](/examples/pglite-quickstart.md)
- [SQLite connector](/architecture/sqlite-connector.md)
- [Relational connector](/architecture/relational-connector.md)
