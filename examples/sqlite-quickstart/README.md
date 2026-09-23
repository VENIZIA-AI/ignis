# SQLite quickstart

An IGNIS CRUD API for notes and their comments on [SQLite](https://sqlite.org), through
[libsql](https://github.com/tursodatabase/libsql-client-ts) - a second SQL dialect on the same
engine-neutral repository tier Postgres uses.

```bash
bun install
bun run start
```

The app listens on `http://localhost:3000` (set `PORT` to change it). Browse the API at
`http://localhost:3000/api/doc/explorer`.

## What it shows

| File | What it does |
|---|---|
| `src/models/note.model.ts` | Two tables and their entities. `one(noteTable)` finds its columns from the `note_id` foreign key |
| `src/repositories/*.repository.ts` | An empty class under `@repository({ model, dataSource })` |
| `src/controllers/*.controller.ts` | The CRUD routes from `ControllerFactory.defineCrudController` |
| `src/datasources/sqlite.datasource.ts` | The only libsql-specific file: opens the client and applies migrations |
| `src/application.ts` | Imports each decorated class; `discoverArtifacts: true` registers them |
| `src/index.ts` | Starts the server |

Swap the datasource for a PGlite or `node-postgres` one and the models, repositories and
controllers stay as they are - see the [PGlite quickstart](../pglite-quickstart).

## Endpoints

Every route sits under `/api`.

| Method | Path | Does |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/notes`, `/comments` | List rows; takes a `filter` query |
| `GET` | `/notes/count?where={...}` | Count rows matching `where` (required; `{}` counts all) |
| `GET` | `/notes/find-one` | First row matching `filter` |
| `GET` | `/notes/{id}` | One row |
| `POST` | `/notes`, `/comments` | Create a row |
| `PATCH` | `/notes/{id}` | Update one row |
| `DELETE` | `/notes/{id}` | Delete one row |
| `PATCH` | `/notes?where={...}` | Update every row matching `where` |
| `DELETE` | `/notes?where={...}` | Delete every row matching `where` |
| `GET` | `/doc/openapi.json` | The OpenAPI document |

`/comments` has the same routes as `/notes`. CRUD routes answer `{ count, data }`; `/count` answers
`{ count }`. Deleting a note that does not exist still answers `200`: a read for that id afterward
returns `{ count: 0, data: null }`, not `404`.

## Read a note with its comments

Create a note, then a comment on it:

```bash
curl -s -X POST localhost:3000/api/notes \
  -H 'content-type: application/json' -d '{"title":"First note"}'
# {"count":1,"data":{"id":"01a0cd2c-...","title":"First note",...}}

curl -s -X POST localhost:3000/api/comments \
  -H 'content-type: application/json' -d '{"noteId":"<the note id>","text":"A comment"}'
```

Name the relation in `include` to get the comments inside each note:

```bash
curl -s -G localhost:3000/api/notes \
  --data-urlencode 'filter={"include":[{"relation":"comments"}]}'
# {"count":1,"data":[{"id":"01a0cd2c-...","title":"First note",...,"comments":[{"id":"...","noteId":"01a0cd2c-...","text":"A comment"}]}]}
```

## Test it

```bash
bun test
```

The smoke test boots the same `Application` on a free port against an in-memory database
(`APP_ENV_SQLITE_URL=:memory:`), then calls each endpoint over HTTP.

## Where the data goes

`bun run start` keeps the database in `app_data/database/local.db` and logs in `app_data/logs`.
`app_data/` is gitignored.

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV_SQLITE_URL` | `file:./app_data/database/local.db` | `:memory:` for a database that dies with the process; a remote Turso `libsql://` url cannot hold an explicit transaction |
| `APP_ENV_LOGGER_FOLDER_PATH` | `./app_data/logs`, set by the `start` script | Unset: console logging only |
| `PORT` | `3000` | The port the server listens on |

## Change the schema

Edit `src/models/note.model.ts`, then generate a migration:

```bash
bun run migrate:generate   # writes migration/NNNN_*.sql
bun run start              # applies what is pending, then serves
```

The app applies migrations itself at boot, the same as [PGlite](../pglite-quickstart): an embedded
database ships with the app, so there is no deploy step between generating a migration and needing
it. `bun run migrate:dev` applies migrations without booting the app.

## What is different from Postgres

Read this before porting a Postgres model - the gaps are real, and IGNIS throws rather than
emitting approximate SQL.

| Feature | Postgres | SQLite |
|---|---|---|
| Storage classes | ~28 column types | 5: `integer`, `real`, `text`, `blob`, `numeric` |
| `uuid`, `jsonb`, `timestamptz` | native | text columns - see `src/models/note.model.ts` |
| `like` | case-sensitive | case-insensitive - the same filter matches more rows |
| Regex (`~`, `~*`) | native | throws - SQLite defines no `regexp()` |
| Row locking (`FOR UPDATE`) | native | throws |
| Isolation levels | `READ COMMITTED` and friends | none - `BEGIN DEFERRED \| IMMEDIATE \| EXCLUSIVE` |

## Transactions

`BEGIN IMMEDIATE`, not `DEFERRED`: a deferred transaction that later upgrades to a write can
deadlock with `SQLITE_BUSY`. Pass `beginMode` to choose another.

Explicit transactions need a local database. A remote Turso url runs every statement on its own
connection, so `BEGIN` cannot hold - `LibSqlDriver` refuses rather than letting it silently not
apply. Use `file:` or `:memory:`, or an embedded replica.

## Next

- [PGlite quickstart](../pglite-quickstart) - the same API on Postgres compiled to WASM
- [`vert`](../vert) - the production reference: authentication, authorization, transactions
