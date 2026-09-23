# PGlite quickstart

An IGNIS CRUD API for notes and their comments on [PGlite](https://pglite.dev) - PostgreSQL compiled to
WASM, running inside your process. No database server, no connection string.

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
| `src/datasources/pglite.datasource.ts` | The only PGlite-specific file: opens the database and applies migrations |
| `src/application.ts` | Imports each decorated class; `discoverArtifacts: true` registers them |
| `src/index.ts` | Starts the server |

Swap the datasource for a `node-postgres` one and the models, repositories and controllers stay as
they are.

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
`{ count }`.

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

The smoke test boots the same `Application` on a free port with an in-memory database, then calls
each endpoint over HTTP.

## Where the data goes

`bun run start` keeps the database in `app_data/database/pgdata` and logs in `app_data/logs`.
`app_data/` is gitignored.

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV_PGLITE_DATA_DIR` | set to `./app_data/database/pgdata` by `bun run start` | Unset: an in-memory database that dies with the process |
| `APP_ENV_LOGGER_FOLDER_PATH` | set to `./app_data/logs` by `bun run start` | Unset: console logging only |
| `PORT` | `3000` | The port the server listens on |

## Change the schema

Edit `src/models/note.model.ts`, then generate a migration:

```bash
bun run migrate:generate   # writes migration/NNNN_*.sql
bun run start              # applies what is pending, then serves
```

The app applies migrations itself at boot. PGlite locks its data directory, so `drizzle-kit
migrate` cannot run while the app is open.

## Two PGlite limits

**One connection.** Transactions wait for each other. `PGliteDriver` hands out its single session
one transaction at a time, and gives up after 30 seconds (`acquireTimeoutMs`).

**A write outside a transaction can land inside one.** While a transaction is open, a repository
write joins it, and a rollback discards the write. Under concurrency, send writes through a
transaction.

## Next

- [SQLite quickstart](../sqlite-quickstart) - the same API on libsql
- [`vert`](../vert) - the production reference: authentication, authorization, transactions
