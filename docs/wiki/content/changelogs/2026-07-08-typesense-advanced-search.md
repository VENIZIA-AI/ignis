---
title: Typesense Advanced Search - Vector/Semantic, Multi-Search, Synonyms
description: A unified search({ mode }) API (keyword/semantic/hybrid/raw), cross-collection multiSearch, declarative synonyms, vector fields with both embedding modes, and a defineSearchController factory
---

# Changelog - 2026-07-08

## Typesense Advanced Search

The Typesense connector gains first-class support for the three high-value search features it was missing: **vector/semantic and hybrid search**, **federated and union multi-search**, and **synonyms**. Every layer keeps a typed camelCase default and an always-available raw escape to the engine, so common cases stay trivial while nothing is locked away.

## Overview

- **Unified `search({ mode })`**: one repository method discriminated by `mode` - `keyword` (full-text), `semantic` (vector), `hybrid` (blended), and `raw` (native passthrough) - instead of many specialized methods. The payload is a single `zod` discriminated union, so the same schema drives runtime validation, OpenAPI generation, and the controller request body. `keyword`/`semantic`/`hybrid` reuse the filter translation (`defaultFilter`, `hiddenFields`, sort) that `find()` uses; `raw` bypasses it for full-power access.
- **Vector fields, both embedding modes**: `field.vector('embedding', ...)` in the collection DSL. Supply `dimensions` + `distance` for client-provided vectors, or `embed: { from, model }` for server-side auto-embedding (Typesense generates the vector at index time, no external pipeline). Auto-embedded fields are omitted from `TSearchDocument` since the server owns them. Compiled to Typesense `float[]` with `num_dim`/`vec_dist`/`embed`.
- **Cross-collection `multiSearch`**: `dataSource.multiSearch({ searches, union?, commonParams?, options? })` - federated by default (side-by-side `results[]`), merged into one ranked set with `union: true`. It lives on the datasource, not the repository, because it spans many collections. `searches` entries and `commonParams` are camelCase (`filterBy`, `queryBy`, `perPage`); the datasource maps them to the engine's snake_case wire format via the same dialect the single-collection `search()` uses.
- **Declarative synonyms**: `synonyms: [{ id, synonyms, root? }]` on `defineSearchCollection`. At `configure()` they are provisioned as one Typesense **synonym set** per collection (`<collection>_synonyms`) and linked to it - the v30+ global synonym-sets model (the pre-v30 per-collection synonyms API was removed). Multi-way (no `root`) makes every term interchangeable; one-way (`root` set) expands a root query to its synonyms. Runtime management is available via the connector (`upsertSynonymSet`/`getSynonymSet`/`listSynonymSets`/`deleteSynonymSet`/`linkSynonymSets`).
- **`defineSearchController` factory**: `SearchControllerFactory.defineSearchController({ entity, repository, controller, routes? })` generates a `POST /search` (body is the mode-discriminated schema) and a `POST /multi-search` endpoint, each customizable or disable-able - mirroring `ControllerFactory.defineCrudController` for the CRUD side.
- **Vector-search prefix handling**: `semantic` and `hybrid` default `prefix=false`, since prefix matching is meaningless for vector search and remote embedders (OpenAI/Google/...) reject it outright. Callers can still override via the `prefix` field.
- **Capabilities model**: `getCapabilities()` now reports `search: { vector, multi, union, synonyms }` on top of the base `{ transactions }`, so callers can probe engine support at runtime.
- **Extended common search params**: faceting (`facetBy`/`facetQuery`/`maxFacetValues`), highlighting (`highlightFields`/`highlightFullFields`/tags/`snippetThreshold`), grouping (`groupBy`/`groupLimit`/`groupMissingValues`), and tuning (`numTypos`/`prefix`/`infix`/`useCache`/`cacheTtl`/`exhaustiveSearch`/`pinnedHits`/`hiddenHits`/`queryByWeights`/`prioritizeExactMatch`/`dropTokensThreshold`/`preset`) are accepted on every non-raw mode as optional camelCase fields, mapped to the snake_case wire names at the dialect boundary.
- **Raw escape hatches, everywhere**: `search({ mode: 'raw', params })` for native single-collection params, `getConnector().multiSearch(...)` for native multi-search, and `getClient()` for the underlying Typesense `Client` - so any unmodeled engine feature stays reachable.

## Notes

- No engine-specific code leaks into `src/base`: all new verbs sit on the neutral contracts (`ISearchConnector`, `ISearchQueryDialect`, the `search()` mode union) with engine-agnostic shapes, so a second search engine can slot in later.
- No retry, circuit-breaker, or change-data-capture is built into the framework - keeping the database and index in sync remains caller policy.
