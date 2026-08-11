# PGlite quickstart

IGNIS on [PGlite](https://pglite.dev) - PostgreSQL compiled to WASM, running inside your process.
No server to install, no connection string, no `createdb`.

```bash
bun install
bun run start
# http://localhost:3000/api/notes
# http://localhost:3000/doc/explorer
```

## Where runtime state goes

Same layout as [`vert`](../vert): everything the running app writes lives under `app_data/`, which
is gitignored repository-wide and survives `bun run clean`.

```
app_data/
├── database/pgdata/   the PGlite data directory, created on first boot
└── logs/              rotating log files
```

Both paths are overridable, and `.env.example` documents them:

| Variable | Default |
|---|---|
| `APP_ENV_PGLITE_DATA_DIR` | `./app_data/database/pgdata` - unset it entirely for an in-memory database |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./app_data/logs`, set by the `start` script - file logging is opt-in |

## What this example shows

PGlite is a **driver**, not a connector. `PgliteDatabase` extends Drizzle's `PgDatabase`, so it
satisfies the Postgres connector type unchanged - the whole Postgres tier works on top of it:

| File | What is PGlite-specific |
|---|---|
| `src/datasources/pglite.datasource.ts` | `new PGlite(dataDir)` and `@datasource({ driver: PGliteDriver })` |
| `src/models/note.model.ts` | nothing - a normal `pgTable` with `uuid`, `jsonb`, `timestamptz` |
| `src/repositories/note.repository.ts` | nothing - `DefaultCRUDRepository<TNoteSchema>` |
| `src/controllers/note.controller.ts` | nothing - the standard CRUD factory |

Only the datasource changes. Swap it for a `node-postgres` one and nothing else moves.

## Two constraints worth knowing

**One connection.** PGlite has a single session, so transactions serialise: a second
`beginTransaction()` waits for the first to finish. `PGliteDriver` enforces that with a one-slot
pool, because a raw second `BEGIN` silently joins the open transaction instead of failing - and then
one caller's `COMMIT` commits the other's work.

The wait is bounded by `acquireTimeoutMs`, 30 seconds by default. Pass your own by building the
driver yourself in `configure()` and calling `useDriver({ driver: new PGliteDriver({ client, acquireTimeoutMs }) })`.

**Writes outside a transaction can be swallowed by one.** A write through the repository while
another transaction is open runs *inside* that transaction, and its rollback discards the write.
That is PGlite's single session, not the driver. Under concurrency, route writes through a
transaction.

## Schema

Real drizzle-kit migrations, committed under `migration/`, applied **in-process at boot** by
`migrate()` from `drizzle-orm/pglite/migrator`. Nothing hand-writes DDL.

```bash
bun run migrate:generate   # after changing the model - writes migration/NNNN_*.sql
bun run start              # applies whatever is pending, then serves
```

Here the app *must* apply them itself: PGlite holds an **exclusive lock** on its data directory, so
`drizzle-kit migrate` cannot run against a database the app already opened. Use `bun run
migrate:dev` only while the app is stopped.

`migrate()` records each applied file in `drizzle.__drizzle_migrations`, so every boot after the
first is a no-op.

The config lives in `src/migration.ts`. Two things about it are PGlite-specific:

```ts
dialect: 'postgresql',
driver: 'pglite',
dbCredentials: { url: './app_data/database/pgdata' },   // a FOLDER, not a connection string
```

It points drizzle-kit straight at `src/models/note.model.ts` - esbuild erases the `@model`
decorator and the framework import before the table export is read. An entity whose table sits on a
`.schema` static needs the compiled re-export step [`vert`](../vert/src/migration-schema.ts) uses;
this one does not.

## When to reach for it

A test database with real Postgres semantics and no Docker, or a single-file embedded deployment.
For a Postgres-compatible database that a SQLite user would recognise, see the
[SQLite quickstart](../sqlite-quickstart) instead - it uses libsql and a genuinely different dialect.
