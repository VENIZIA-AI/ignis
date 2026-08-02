# SQLite quickstart

IGNIS on SQLite through [libsql](https://github.com/tursodatabase/libsql-client-ts). A second SQL
dialect on the same engine-neutral repository tier Postgres uses.

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
├── database/local.db   the SQLite database file, created on first boot
└── logs/               rotating log files
```

Both paths are overridable, and `.env.example` documents them:

| Variable | Default |
|---|---|
| `APP_ENV_SQLITE_URL` | `file:./app_data/database/local.db` - `:memory:` dies with the process |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./app_data/logs`, set by the `start` script - file logging is opt-in |

The datasource creates the parent directory itself: libsql opens a database file but never creates
the folder holding it, so a missing `app_data/database` would be `SQLITE_CANTOPEN` at boot.

## What is different from Postgres

Read this before porting a Postgres model - the gaps are real, and IGNIS throws rather than emitting
approximate SQL.

| Feature | Postgres | SQLite |
|---|---|---|
| Storage classes | ~28 column types | 5: `integer`, `real`, `text`, `blob`, `numeric` |
| `uuid`, `jsonb`, `timestamptz` | native | text columns - see `src/models/note.model.ts` |
| `ilike` | native | maps to `LIKE`, which SQLite already folds for ASCII |
| `like` | case-**sensitive** | case-**insensitive** - the same filter matches more rows |
| Regex (`~`, `~*`) | native | **throws** - SQLite defines no `regexp()` and libsql registers none |
| Array operators | native | **throws** - no array storage class |
| Row locking (`FOR UPDATE`) | native | **throws** |
| Isolation levels | `READ COMMITTED` and friends | none - `BEGIN DEFERRED \| IMMEDIATE \| EXCLUSIVE` |
| JSON paths | `#>>`, `::numeric` | `json_extract` |
| `.returning()` | yes | **yes** - unlike MySQL |
| NULL sort order | NULL sorts high | NULL sorts low - `ORDER BY x ASC` puts it first |

The two silent ones are `like` folding and NULL ordering: identical caller code returns different
rows. Both are pinned by the conformance suite so they cannot drift unnoticed.

## What is the same

Everything above the datasource:

| File | What is SQLite-specific |
|---|---|
| `src/datasources/sqlite.datasource.ts` | `createClient({ url })` and `@datasource({ driver: LibSqlDriver })` |
| `src/models/note.model.ts` | `sqliteTable` and the column shapes above |
| `src/repositories/note.repository.ts` | only the class name - `DefaultSqliteRepository` rebinds two type parameters |
| `src/controllers/note.controller.ts` | nothing - the standard CRUD factory |

## Transactions

`BEGIN IMMEDIATE`, not `DEFERRED`: a deferred transaction that later upgrades to a write can
deadlock with `SQLITE_BUSY`. Pass `beginMode` to choose another.

Explicit transactions need a local database. A remote Turso URL runs every statement on its own
connection, so `BEGIN` cannot hold - `LibSqlDriver` refuses rather than letting it silently not
apply. Use `file:` or `:memory:`, or an embedded replica.

## Out of scope in this release

The auth, authorize and static-asset components are Postgres-only - their models are `pgTable`.
Use them with a Postgres datasource, or supply your own models.

## Schema

Real drizzle-kit migrations, committed under `migration/`, applied **in-process at boot** by
`migrate()` from `drizzle-orm/libsql/migrator`. Nothing hand-writes DDL.

```bash
bun run migrate:generate   # after changing the model - writes migration/NNNN_*.sql
bun run start              # applies whatever is pending, then serves
```

Two reasons the app applies them itself rather than a CLI step preceding it:

- An embedded database ships **with** the app. There is no deploy window between generating a
  migration and needing it, so a separate `migrate` step only adds a way to forget.
- `migrate()` records each applied file in `__drizzle_migrations`, so every boot after the first is
  a no-op. Re-running is free.

`bun run migrate:dev` still exists for applying migrations without booting the app.

The config lives in `src/migration.ts` and points drizzle-kit straight at
`src/models/note.model.ts` - it bundles with esbuild, so the `@model` decorator and the framework
import are erased before the table export is read. An entity whose table sits on a `.schema` static
needs the compiled re-export step [`vert`](../vert/src/migration-schema.ts) uses; this one does not.
