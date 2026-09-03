---
type: Example
title: typesense-search
description: A pure Typesense search API with zero Postgres, proving the search connector is fully optional and demonstrating its factory CRUD, filter translation, and NotSupported boundaries.
resource: examples/typesense-search
tags: [examples, search, typesense]
---

`typesense-search-example` has no Postgres, no Drizzle, and no `pg` anywhere in the directory - unlike every other IGNIS example, which depends on the Postgres connector implicitly. It runs entirely on `SearchDataSource` (a `TypesenseDataSource` subclass) and `ArticleRepository` (`DefaultSearchRepository<TArticleDocument>`).

## What it demonstrates

- **The entity DSL** - `ArticleDocument extends BaseSearchEntity`, defined with `defineSearchCollection` + the `field` builder instead of a Drizzle `pgTable`; `TArticleDocument` is derived straight from `ArticleDocument.schema`, no hand-written duplicate interface.
- **`@model` settings on a search entity** - `hiddenProperties: ['internalNote']` strips that field via Typesense's `exclude_fields` at the query level; `defaultFilter: { where: { status: 'published' } }` is AND-merged into every `find`/`count`/`updateById`/`deleteById` unless `shouldSkipDefaultFilter: true` is passed.
- **Factory CRUD over a search repository** - `ControllerFactory.defineCrudController<TArticleDocument>(...)` produces the same six routes over `DefaultSearchRepository` as it does over a Postgres `DefaultCRUDRepository`, with `TFilter`/`where` translated to Typesense `filter_by` via `TypesenseQueryDialect` instead of SQL.
- **Factory search endpoints** - `SearchControllerFactory.defineSearchController(...)` generates `POST /articles/search` (dispatched to `ArticleRepository.search()`) and `POST /articles/multi-search` (cross-collection, forwarded verbatim through `dataSource.multiSearch()`), mirroring how `ControllerFactory.defineCrudController` generates the CRUD controller. Both take a JSON body, not a query string. Search input is discriminated by `mode`: `keyword`/`semantic`/`hybrid` go through the same dialect and `@model` `defaultFilter` path as `find()`, so they cannot see `draft`/`archived` articles; only `mode: 'raw'` is a full passthrough to the Typesense driver - no dialect, no `defaultFilter`, no hidden-field stripping.
- **The NotSupported convention** - passing `{ transaction }` or `{ lock }` in any `ArticleRepository` call throws the standardized `NotSupported` error (HTTP 501, `core.not_supported`), because Typesense has neither transactions nor row-level locking.
- **Fail-loud boot** - `SearchDataSource.configure()` provisions the `articles` collection on boot; if Typesense is unreachable, boot fails and the process exits rather than starting half-configured.

## How to run it

```bash
docker compose up -d       # single Typesense >= 27 service
bun install
cp .env.example .env.development
bun run server:dev          # boots on 0.0.0.0:3000, base path /api
bun run seed                 # seeds ~8 sample articles through ArticleRepository, in another terminal
```

Health check at `/api/health-check`; interactive docs mounted by `ApiReferenceComponent`.

## Notable / non-obvious

- `TypesenseQueryDialect` throws rather than silently degrading when the filter uses `like`/`ilike`, a JSON-path field, or `include` (relations) - none of these have a `filter_by` equivalent.
- `TArticleDocument.id` is always a required string on create, unlike Postgres entities where an id is typically generated.

## Related
- [Search Typesense architecture](/architecture/search-typesense.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
