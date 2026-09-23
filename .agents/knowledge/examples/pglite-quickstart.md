---
type: Example
title: pglite-quickstart
description: A Postgres CRUD-plus-relation app on PGlite - Postgres compiled to WASM running in-process - proving PGlite is a driver swap that leaves the model, repository and controller untouched.
resource: examples/pglite-quickstart
tags: [examples, postgres, pglite, quickstart]
---

`pglite-quickstart` is a notes-and-comments CRUD app whose database is a folder. PGlite is
PostgreSQL compiled to WASM, so `PgliteDatabase` extends Drizzle's `PgDatabase` and satisfies the
Postgres connector type unmodified - the entire Postgres tier runs on top of it with no adaptation.
The example exists to make that visible: only the datasource is PGlite-aware.

## What it demonstrates

- **The driver seam, at its narrowest** - `@datasource({ driver: PGliteDriver })` plus
  `new PGlite(dataDir)` in `configure()`. `src/models/note.model.ts` defines two `pgTable`s (`notes`,
  `comments`) and two `ModelFactory.defineEntity({ table, relations })` entities - `Comment.note` is
  `one(noteTable)`, its columns read off the `note_id` foreign key; `Note.comments` is
  `many(commentTable)`. Each repository is an empty class under `@repository({ model, dataSource })`.
  Swapping in a `node-postgres` datasource moves nothing else.
- **The fourth type parameter is the raw client** - `BasePostgresDataSource<IPGliteSettings,
  TAnyDataSourceSchema, {}, PGlite>`. Leaving it off makes `getClient()` return `pg.Pool` and the
  assignment in `configure()` fails to typecheck.
- **`ControllerFactory.defineCrudController` needs no constructor on the subclass** - the factory
  injects `repository.name` at parameter 0 itself; `NoteController extends BaseCrudController {}` is
  the whole class body.
- **Real migrations, applied in-process** - `src/migration.ts` is a drizzle-kit config with
  `driver: 'pglite'` and a data directory as `dbCredentials.url`; `migrate()` from
  `drizzle-orm/pglite/migrator` runs inside `configure()`. The app has to apply them itself because
  PGlite holds an exclusive lock on its data directory, so `drizzle-kit migrate` cannot reach a
  database the app already opened.
- **`getConnectionString()` returns the data directory** - PGlite has no URL. The framework never
  calls this method, only application code does, so the honest answer is the folder.

## How to run it

```bash
bun install
bun run start        # http://localhost:3000/api/notes, explorer at /api/doc/explorer
bun test              # smoke test: same Application, free port, in-memory database
```

Runtime state: `app_data/database/pgdata` for the data directory and `app_data/logs` for rotating
log files, both created on first boot by the `start` script. `app_data/` is gitignored.

## Notable / non-obvious

- **One connection.** PGlite has a single session, so transactions serialise. `PGliteDriver`
  enforces this with a one-slot pool bounded by `acquireTimeoutMs` (30 seconds by default).
- **A write outside a transaction can be swallowed by one.** With a single session, a repository
  write issued while another transaction is open runs inside that transaction and dies with its
  rollback. Under concurrency, route writes through a transaction.
- `application.init()` must run before `application.start()`, or resolving the controller fails with
  `@app/instance is not bounded`.
- This example is one of `EXAMPLES_SMOKE` in the root `Makefile` - `make examples-smoke` runs its
  `bun test` in CI, no docker needed.

## Related
- [sqlite-quickstart](/examples/sqlite-quickstart.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Relational connector](/architecture/relational-connector.md)
