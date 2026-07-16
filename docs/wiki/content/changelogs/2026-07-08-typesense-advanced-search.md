---
title: Typesense Advanced Search - Vector/Semantic, Multi-Search, Synonyms
description: The Typesense connector adds vector/semantic and hybrid search, cross-collection multi-search, declarative synonyms, and a search controller factory - with a typed default and a raw escape hatch at every layer.
---

# Changelog - 2026-07-08

## Typesense Advanced Search

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** The Typesense connector now supports vector/semantic and hybrid search, federated and union multi-search across collections, and declarative synonyms - reachable through one unified `search({ mode })` method.

## What changed

- **Unified `search({ mode })`.** One repository method discriminated by `mode`: `keyword` (full-text), `semantic` (vector), `hybrid` (blended), and `raw` (native passthrough) - replacing many specialized methods with a single, typed, OpenAPI-generated schema.
- **Vector fields, both embedding modes.** `field.vector('embedding', ...)` in the collection DSL. Supply `dimensions` + `distance` for client-provided vectors, or `embed: { from, model }` to have Typesense generate the vector at index time - no external embedding pipeline required.
- **Cross-collection `multiSearch`.** `dataSource.multiSearch({ searches, union?, commonParams?, options? })` - federated by default (side-by-side results per collection), or merged into one ranked set with `union: true`.
- **Declarative synonyms.** `synonyms: [{ id, synonyms, root? }]` on `defineSearchCollection`, provisioned automatically at `configure()`. Multi-way synonyms (no `root`) make every listed term interchangeable; one-way synonyms (`root` set) expand a root query to its synonyms.
- **`defineSearchController` factory.** Generates a `POST /search` and `POST /multi-search` endpoint from a repository, mirroring the existing CRUD controller factory - each endpoint is customizable or can be disabled.
- **Capabilities model.** `getCapabilities()` now reports `search: { vector, multi, union, synonyms }`, so calling code can probe what the connected engine supports at runtime.
- **Extended search parameters.** Faceting, highlighting, grouping, and result-tuning fields are now accepted as optional camelCase fields on every non-raw mode, mapped to Typesense's snake_case wire names automatically.
- **Raw escape hatches, everywhere.** `search({ mode: 'raw', params })` for native single-collection params, `getConnector().multiSearch(...)` for native multi-search, and `getClient()` for the underlying Typesense client - any engine feature the typed API doesn't model is still reachable.

## Who is affected

- **Anyone using Typesense search.** Vector/semantic search, multi-search, synonyms, and the controller factory are all new and opt-in - no action needed to keep existing keyword search working.
- **Anyone who adopted the raw `search({ params })` passthrough introduced on 2026-07-05.** The call now requires `mode: 'raw'` - see Breaking changes below.
- **Everyone else.** No action needed.

## Breaking changes

### 1. Raw search now requires `mode: 'raw'`

`search()` is a single method discriminated by a required `mode` field, so a bare `search({ params })` call (the shape introduced on 2026-07-05) no longer type-checks.

**Before**
```typescript
const result = await articleRepository.search({ params: { q: 'typescript', query_by: ['title'] } });
```

**After**
```typescript
const result = await articleRepository.search({ mode: 'raw', params: { q: 'typescript', query_by: ['title'] } });
```

## Details

- **No engine lock-in in the base layer.** All new verbs sit on neutral contracts (`ISearchConnector`, `ISearchQueryDialect`, the `search()` mode union) with engine-agnostic shapes, so a second search engine can slot in later without touching `src/base`.
- **Vector search and prefix matching don't mix.** `semantic` and `hybrid` default to `prefix: false`, since prefix matching is meaningless for vector search and remote embedders (OpenAI, Google, ...) reject it outright. Callers can still override via the `prefix` field.
- **Synonyms use the v30+ global synonym-sets model** - one Typesense synonym set per collection, linked at `configure()`. Runtime management is available via the connector (`upsertSynonymSet` / `getSynonymSet` / `listSynonymSets` / `deleteSynonymSet` / `linkSynonymSets`).
- **No sync guarantees.** No retry, circuit-breaker, or change-data-capture is built into the framework - keeping the database and the search index in sync remains caller policy.
