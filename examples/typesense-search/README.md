# Typesense Search Example

Reference example for IGNIS's Typesense search datasource. This app is pure search - there is no
Postgres, no Drizzle, no `pg` anywhere in this directory - which is itself the point: the search
connector is fully optional and stands on its own, unlike the Postgres connector which every other
IGNIS example depends on implicitly.

## What this demonstrates

- **The entity DSL** (`src/models/entities/article.model.ts`) - `ArticleDocument extends BaseSearchEntity`
  defines its shape with `defineSearchCollection` + the `field` builder instead of a Drizzle `pgTable`.
- **`TInferSearchDocument`** - `TArticleDocument` is derived straight from `ArticleDocument.schema`,
  no hand-written interface duplicating the field list.
- **`@model` settings on a search entity** - `hiddenProperties: ['internalNote']` strips that field
  from every response via Typesense `exclude_fields`; `defaultFilter: { where: { status: 'published' } }`
  is AND-merged into every `find`/`count`/`updateById`/`deleteById` call unless the caller passes
  `shouldSkipDefaultFilter: true`.
- **Factory CRUD over a search repository** (`src/controllers/article.controller.ts`) -
  `ControllerFactory.defineCrudController<TArticleDocument>(...)` works identically over
  `DefaultSearchRepository` as it does over a Postgres `DefaultCRUDRepository` - same six routes,
  same `TFilter`/`where` query syntax, translated to Typesense `filter_by` instead of SQL.
- **A hand-written full-text search endpoint** (`src/controllers/search.controller.ts`) - `GET /search`
  is the one thing the CRUD factory cannot generate: a ranked, typo-tolerant, faceted query. It calls
  `ArticleRepository.search()`, which is a **raw passthrough** to the Typesense driver - no
  `TFilter`/`where` translation, and critically, **no `@model` defaultFilter applied**. The example
  narrates this gap explicitly instead of hiding it (see `status` in the query schema).
- **`TFilter` -> `filter_by` translation** - `GET /articles?filter[where][category]=databases` goes
  through `TypesenseQueryDialect`, the same operator vocabulary (`eq`, `gt`, `inq`, `and`/`or`, ...) as
  the Postgres branch, translated into Typesense's `field:=value` syntax instead of SQL.
- **The NotSupported convention** - Typesense has no transaction primitive and no row-level locking.
  Passing `{ transaction }` or `{ lock }` in any repository call's `options` throws the standardized
  `NotSupported` error (HTTP 501, `core.not_supported`) rather than silently ignoring it.

## Prerequisites

- Bun >= 1.3
- Docker (for the Typesense container) - or any reachable Typesense >= 27 instance

## Run it

```bash
# 1. Start Typesense
docker compose up -d

# 2. Install dependencies (from the repo root - this is a workspace package)
bun install

# 3. Copy the env file (defaults already match docker-compose.yml)
cp .env.example .env.development

# 4. Start the app
bun run server:dev

# 5. In another terminal, seed ~8 sample articles through ArticleRepository
bun run seed
```

The app boots on `http://0.0.0.0:3000` with base path `/api` (see `.env.development`).
Swagger UI is mounted by `SwaggerComponent` (check the log output on boot for the exact path);
health checks live at `/api/health-check`.

## curl walkthrough

```bash
# Factory CRUD - count (defaultFilter applies: only status=published is counted)
curl http://0.0.0.0:3000/api/articles/count

# Factory CRUD - list, TFilter -> filter_by translation
curl 'http://0.0.0.0:3000/api/articles?filter[where][category]=databases'
curl 'http://0.0.0.0:3000/api/articles?filter[where][views][gte]=1000&filter[order][]=views%20DESC'

# Factory CRUD - a single document by id
curl http://0.0.0.0:3000/api/articles/article-1

# Factory CRUD - create (id required - TArticleDocument.id is always a required string)
curl -X POST http://0.0.0.0:3000/api/articles \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "article-9",
    "title": "Hybrid Search in Practice",
    "content": "Combining keyword and vector search for better recall.",
    "category": "programming",
    "status": "published",
    "views": 0,
    "publishedAt": 1751500000000
  }'

# Hand-written full-text search - typo-tolerant, faceted, ranked
curl 'http://0.0.0.0:3000/api/search?q=typescript'
curl 'http://0.0.0.0:3000/api/search?q=*&category=databases&minViews=500'
curl 'http://0.0.0.0:3000/api/search?q=*&status=draft'   # only /search can see drafts - see below
curl 'http://0.0.0.0:3000/api/search?q=*&facetBy=category,status&sortBy=views:desc'
```

## What you CANNOT do (by design)

| Attempt | Result |
| --- | --- |
| `options: { transaction }` on any `ArticleRepository` call | Throws the standardized `NotSupported` error (HTTP 501, `core.not_supported`) - Typesense has no transaction primitive |
| `options: { lock }` on any `ArticleRepository` call | Same `NotSupported` error - no row-level locking equivalent |
| `filter.where` with `like`/`ilike`, a JSON-path field (`'metadata.score'`), or `include` (relations) | `TypesenseQueryDialect` throws instead of silently degrading - these have no `filter_by` equivalent |
| Reading `internalNote` through any endpoint | Never appears - `hiddenProperties` excludes it via `exclude_fields` at the Typesense level, not a post-processing filter |
| `GET /articles` returning a `draft`/`archived` article | Excluded by `defaultFilter`; `GET /search?status=draft` deliberately bypasses this (see the code comment in `search.controller.ts`) because `search()` is a raw driver passthrough |
| Starting the app with Typesense unreachable | Boot fails loudly and the process exits (1) - `SearchDataSource.configure()` provisions the `articles` collection on boot and propagates the driver error instead of starting with a half-configured datasource |

## Project layout

```
src/
  common/environments.ts       - APP_ENV_TYPESENSE_* keys, extends the core EnvironmentKeys
  models/entities/article.model.ts   - ArticleDocument (BaseSearchEntity) + TArticleDocument
  datasources/search.datasource.ts   - SearchDataSource (TypesenseDataSource subclass)
  repositories/article.repository.ts - ArticleRepository (DefaultSearchRepository<TArticleDocument>)
  controllers/article.controller.ts  - factory CRUD (count/find/findById/create/updateById/deleteById)
  controllers/search.controller.ts   - hand-written GET /search
  application.ts                     - manual registration, HealthCheckComponent, SwaggerComponent
  index.ts                           - boot + start, with a graceful failure log on boot error
scripts/seed.ts                      - seeds sample articles through ArticleRepository
docker-compose.yml                   - single Typesense service
```
