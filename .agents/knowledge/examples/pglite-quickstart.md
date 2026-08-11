---
type: Example
title: pglite-quickstart
description: A Postgres CRUD app on PGlite - Postgres compiled to WASM running in-process - proving PGlite is a driver swap that leaves the model, repository and controller untouched.
resource: examples/pglite-quickstart
tags: [examples, postgres, pglite, quickstart]
---

`pglite-quickstart` is a five-file CRUD app whose database is a folder. PGlite is PostgreSQL
compiled to WASM, so `PgliteDatabase` extends Drizzle's `PgDatabase` and satisfies the Postgres
connector type unmodified - the entire Postgres tier runs on top of it with no adaptation. The
example exists to make that visible: only the datasource is PGlite-aware.

## What it demonstrates

- **The driver seam, at its narrowest** - `@datasource({ driver: PGliteDriver })` plus
  `new PGlite(dataDir)` in `configure()`. The model is a plain `pgTable` with `uuid`, `jsonb` and
  `timestamptz`; the repository is `DefaultCRUDRepository<TNoteSchema>` with an empty body; the
  controller is the unmodified CRUD factory. Swapping in a `node-postgres` datasource moves nothing
  else.
- **The fourth type parameter is the raw client** - `BasePostgresDataSource<IDataSourceConfigs,
  TNoteDataSourceSchema, {}, PGlite>`. Leaving it off makes `getClient()` return `pg.Pool` and the
  assignment in `configure()` fails with TS2740.
- **Real migrations, applied in-process** - `src/migration.ts` is a drizzle-kit config with
  `driver: 'pglite'` and a data DIRECTORY as `dbCredentials.url`; `migrate()` from
  `drizzle-orm/pglite/migrator` runs inside `configure()`. The app has to apply them itself because
  PGlite holds an exclusive lock on its data directory, so `drizzle-kit migrate` cannot reach a
  database the app already opened. `drizzle.__drizzle_migrations` makes every later boot a no-op.
- **drizzle-kit reads the model file directly** - esbuild erases the `@model` decorator and the
  framework import before the table export is evaluated, so no compiled `migration-schema.js`
  re-export is needed. `vert` needs one only because its tables live on a `.schema` static.
- **`getConnectionString()` returns the data directory** - PGlite has no URL. The framework never
  calls this method, only application code does, so the honest answer is the folder.
- **Postgres-only operators still work** - `ilike` and `#>>` JSON-path filtering behave exactly as
  they do against a real server, which is the point of choosing PGlite over SQLite for a test
  substitute.

## How to run it

```bash
bun install
bun run start        # http://localhost:3000/api/notes, explorer at /doc/explorer
```

Runtime state follows the `vert` layout: `app_data/database/pgdata` for the data directory and
`app_data/logs` for rotating log files, both created on first boot. `app_data/` is gitignored
repository-wide, `.env.example` documents the overrides, and `clean.sh` deliberately leaves it
alone - it is state, not a build artifact.

## Notable / non-obvious

- **One connection.** PGlite has a single session, so transactions serialise. `PGliteDriver`
  enforces this with a one-slot pool bounded by `acquireTimeoutMs` (30 seconds by default), because
  a raw second `BEGIN` silently joins the open transaction rather than failing - and then one
  caller's `COMMIT` commits the other's work. Override it by constructing the driver yourself and
  passing it to `useDriver()`.
- **A write outside a transaction can be swallowed by one.** With a single session, a repository
  write issued while another transaction is open runs inside that transaction and dies with its
  rollback. That is PGlite, not the driver. Under concurrency, route writes through a transaction.
- `application.init()` must run before `application.start()`, or resolving the controller fails with
  `@app/instance is not bounded`.
- The CRUD controller subclass needs its own `@inject`ed constructor forwarding the repository to
  `super()`; the factory base cannot supply it, and without it `this.repository` is undefined.

## Related
- [sqlite-quickstart](/examples/sqlite-quickstart.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Relational connector](/architecture/relational-connector.md)
