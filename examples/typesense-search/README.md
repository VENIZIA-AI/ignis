# Typesense search

An IGNIS search API for articles on [Typesense](https://typesense.org) - a typo-tolerant, faceted
search engine. Reads and writes go through `SearchControllerFactory`, the search-engine counterpart
of `ControllerFactory.defineCrudController`.

```bash
docker compose up -d
bun install
bun run start
```

The app listens on `http://localhost:3000` (set `PORT` to change it). Browse the API at
`http://localhost:3000/api/doc/explorer`.

## What it shows

| File | What it does |
|---|---|
| `src/models/article.model.ts` | One collection: `defineSearchCollection` + the `field` DSL, no Drizzle `pgTable` anywhere |
| `src/repositories/article.repository.ts` | An empty class under `@repository({ model, dataSource })`, same shape as the Postgres branch |
| `src/controllers/article.controller.ts` | Factory CRUD from `ControllerFactory.defineCrudController` - indexes and reads documents |
| `src/controllers/search.controller.ts` | `POST /articles/search` and `/multi-search` from `SearchControllerFactory.defineSearchController` |
| `src/datasources/search.datasource.ts` | The only Typesense-specific file: node/API key config, `autoProvision: true` |
| `src/application.ts` | Imports each decorated class; `discoverArtifacts: true` registers them |
| `src/index.ts` | Starts the server |

## Endpoints

Every route sits under `/api`.

| Method | Path | Does |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/articles` | List documents; takes a `filter` query |
| `GET` | `/articles/count?where={...}` | Count documents matching `where` (required; `{}` counts all) |
| `GET` | `/articles/find-one` | First document matching `filter` |
| `GET` | `/articles/{id}` | One document |
| `POST` | `/articles` | Index a document - `id` is required, Typesense has no server-side default |
| `PATCH` | `/articles/{id}` | Update one document |
| `DELETE` | `/articles/{id}` | Delete one document |
| `PATCH` | `/articles?where={...}` | Update every document matching `where` |
| `DELETE` | `/articles?where={...}` | Delete every document matching `where` |
| `POST` | `/articles/search` | Keyword, semantic, hybrid, or raw search, discriminated by `mode` |
| `POST` | `/articles/multi-search` | Cross-collection search (one collection here, but the route always exists) |
| `GET` | `/doc/openapi.json` | The OpenAPI document |

## Index and search

Index two articles, then search them:

```bash
curl -s -X POST localhost:3000/api/articles \
  -H 'content-type: application/json' -d '{
    "id": "a1",
    "title": "Getting started with TypeScript",
    "content": "TypeScript adds static typing on top of JavaScript.",
    "category": "programming"
  }'

curl -s -X POST localhost:3000/api/articles \
  -H 'content-type: application/json' -d '{
    "id": "a2",
    "title": "Draft roadmap notes",
    "content": "Unfinished notes about next quarter.",
    "category": "company"
  }'
```

Keyword search matches a term against the fields named in `queryBy`:

```bash
curl -s -X POST localhost:3000/api/articles/search \
  -H 'content-type: application/json' \
  -d '{"mode":"keyword","query":"TypeScript","queryBy":["title","content"]}'
```

A wildcard query plus `filter.where` narrows by field with no keyword term at all:

```bash
curl -s -X POST localhost:3000/api/articles/search \
  -H 'content-type: application/json' \
  -d '{"mode":"keyword","query":"*","queryBy":["title"],"filter":{"where":{"category":"company"}}}'
```

## Transactions and locking

Typesense has no transaction or row-lock primitive. Passing `options: { transaction }` or
`options: { lock }` to any repository call throws the standard `NotSupported` error (`501`,
`core.not_supported`).

## Test it

```bash
docker compose up -d
bun test
```

The smoke test boots the same `Application` on a free port and calls its endpoints over HTTP. It
skips itself (`test.skipIf`) when Typesense at `TYPESENSE_URL` (default `http://127.0.0.1:18108`) is
unreachable, so `bun test` stays green with no docker running.

## Where the data goes

`bun run start` logs to `app_data/logs`; `app_data/` is gitignored. Documents live in the Typesense
container's `typesense-data` volume - `docker compose down -v` clears it.

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV_TYPESENSE_HOST` | `127.0.0.1` | Typesense host |
| `APP_ENV_TYPESENSE_PORT` | `18108` | Typesense port - matches `docker-compose.yml` |
| `APP_ENV_TYPESENSE_PROTOCOL` | `http` | `http` or `https` |
| `APP_ENV_TYPESENSE_API_KEY` | `xyz` | Matches `docker-compose.yml`'s `--api-key` |
| `APP_ENV_LOGGER_FOLDER_PATH` | set to `./app_data/logs` by `bun run start` | Unset: console logging only |
| `PORT` | `3000` | The port the server listens on |
| `TYPESENSE_URL` (smoke test only) | `http://127.0.0.1:18108` | Where the smoke test checks reachability before running |

## Next

- [PGlite quickstart](../pglite-quickstart) - CRUD and a relation on Postgres
- [`vert`](../vert) - the production reference: authentication, authorization, transactions
