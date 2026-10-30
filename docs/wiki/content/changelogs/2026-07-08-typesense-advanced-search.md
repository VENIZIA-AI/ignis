---
title: Typesense Advanced Search - Vector/Semantic, Multi-Search, Synonyms
description: The Typesense connector adds vector, semantic and hybrid search, multi-search across collections, declarative synonyms and a search controller factory.
packages: ['@venizia/ignis']
---

# Changelog - 2026-07-08

## Typesense Advanced Search

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** The Typesense connector now supports vector, semantic and hybrid search, multi-search across collections, and declarative synonyms, all through one `search({ mode })` method.

## What changed

- **Unified `search({ mode })`.** `mode` is `keyword`, `semantic` (vector), `hybrid` or `raw` (native passthrough). It has one typed, OpenAPI-generated schema.
- **Vector fields.** `field.vector('embedding', ...)` in the collection DSL. Give `dimensions` and `distance` for client-provided vectors, or `embed: { from, model }` to have Typesense generate the vector at index time.
- **`multiSearch`.** `dataSource.multiSearch({ searches, union?, commonParams?, options? })` returns side-by-side results per collection. Pass `union: true` to merge them into one ranked set.
- **Declarative synonyms.** `synonyms: [{ id, synonyms, root? }]` on `defineSearchCollection`, provisioned at `configure()`. Without `root` every listed term is interchangeable. With `root`, a query for the root expands to its synonyms.
- **`defineSearchController`.** Generates `POST /search` and `POST /multi-search` from a repository. Each endpoint can be customized or disabled.
- **Capabilities.** `getCapabilities()` now reports `search: { vector, multi, union, synonyms }`.
- **Extra search parameters.** Faceting, highlighting, grouping and result-tuning fields are accepted as optional camelCase fields on every non-raw mode.
- **Raw escape hatches.** `search({ mode: 'raw', params })`, `getConnector().multiSearch(...)` and `getClient()` reach anything the typed API does not model.

```typescript
await articleRepository.search({
  mode: 'semantic',
  vectorField: 'embedding',
  queryText: 'wireless earbuds',
});
```

## Who is affected

- **Typesense keyword search users.** No action needed. The new features are opt-in.
- **Callers of the raw `search({ params })` form from 2026-07-05.** Add `mode: 'raw'`.

## Breaking changes

> [!WARNING]
> `search()` now requires a `mode` field. A bare `search({ params })` call no longer type-checks.

**Before:**

```typescript
const result = await articleRepository.search({ params: { q: 'typescript', query_by: ['title'] } });
```

**After:**

```typescript
const result = await articleRepository.search({ mode: 'raw', params: { q: 'typescript', query_by: ['title'] } });
```

## Details

- `semantic` and `hybrid` default to `prefix: false`, because prefix matching is meaningless for vector search and remote embedders (OpenAI, Google, ...) reject it. You can still set `prefix`.
- Synonyms use the Typesense v30+ global synonym-sets model, one set per collection, linked at `configure()`. Manage them at runtime with `upsertSynonymSet`, `getSynonymSet`, `listSynonymSets`, `deleteSynonymSet` and `linkSynonymSets` on the connector.
- The framework has no retry, circuit breaker or change-data-capture. Keeping the database and the search index in sync is up to you.

## See also

- [Unified Repository & Connectors Architecture](/changelogs/2026-07-05-unified-repository-connectors)
- [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening)
