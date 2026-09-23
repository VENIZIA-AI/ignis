---
type: Example
title: typesense-search
description: A pure Typesense search API with zero Postgres, proving the search connector is fully optional and demonstrating factory CRUD plus factory search endpoints.
resource: examples/typesense-search
tags: [examples, search, typesense]
---

`typesense-search` has no Postgres, no Drizzle, and no `pg` anywhere in the directory - unlike every
Postgres/SQLite example. It runs on one datasource, `SearchDataSource` (a `TypesenseDataSource`
subclass), one model, `ArticleDocument`, and one repository, `ArticleRepository` (an empty class
under `@repository({ model, dataSource })`).

## What it demonstrates

- **The entity DSL** - `src/models/article.model.ts` defines `ArticleDocument extends
  BaseSearchEntity` with `defineSearchCollection` + the `field.*` builder instead of a Drizzle
  `pgTable`; `id` is auto-prepended, never listed. `TArticleDocument` derives from
  `ArticleDocument.schema`.
- **Factory CRUD over a search repository** - `src/controllers/article.controller.ts` calls
  `ControllerFactory.defineCrudController` exactly as the Postgres examples do; `TFilter`/`where`
  translates to Typesense `filter_by` instead of SQL.
- **Factory search endpoints** -
  `SearchControllerFactory.defineSearchController` in `src/controllers/search.controller.ts`
  generates `POST /articles/search` (keyword/semantic/hybrid/raw, dispatched to
  `repository.search()`) and `POST /articles/multi-search` (forwarded to `dataSource.multiSearch()`).
  Like `ControllerFactory.defineCrudController`, it injects the repository named in
  `repository.name`, so the subclass is empty.
- **The NotSupported convention** - passing `{ transaction }` or `{ lock }` in any repository call
  throws the standardized `NotSupported` error (HTTP 501, `core.not_supported`), because Typesense
  has neither transactions nor row-level locking.
- **`autoProvision: true`** - `SearchDataSource` provisions (create-if-absent) the `articles`
  collection at boot from every `@repository` binding that targets it. A production datasource would
  leave this off and provision out of band.

## How to run it

```bash
docker compose up -d       # Typesense, host port 18108 -> container 8108
bun install
bun run start                # http://localhost:3000/api/articles, explorer at /api/doc/explorer
bun test                      # smoke test: skips itself (test.skipIf) when Typesense is unreachable
```

## Notable / non-obvious

- `POST /articles` requires `id` in the body - Typesense has no server-side default, unlike a
  Postgres entity where an id is generated.
- `/articles/multi-search` always exists, even with one collection - it is the cross-collection
  route the factory always registers.
- This example's `bun test` needs `docker compose up -d` first; it is not in the root Makefile's
  `EXAMPLES_SMOKE` list, so it runs locally, not in CI.

## Related
- [Typesense search connector](/architecture/search-typesense.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
