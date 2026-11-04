---
type: Architecture
title: Typesense search connector
description: How the search connector family mirrors the relational hierarchy, how collections are discovered and provisioned, and why hidden fields must be stripped on the write path.
resource: packages/connectors/src/search
tags: [architecture, search, typesense, connectors]
---

Search is a **paradigm family**, not a single engine. `connectors/search` holds the engine-neutral tier and `connectors/typesense` / `connectors/meilisearch` hold the engines. The neutral tier is the seam and deliberately imports neither engine - a `BaseSearchDataSource` holds its connector through an `ISearchConnector`-bounded generic, and the only engine-specific step of the lifecycle is `createConnector()`.

## The mirror

The search hierarchy is a deliberate reflection of the relational one:

| Relational | Search |
| --- | --- |
| `AbstractPostgresDataSource` | `AbstractSearchDataSource` |
| `BasePostgresDataSource` | `BaseSearchDataSource` |
| `RelationalBaseRepository` | `SearchBaseRepository` |
| `ReadableRelationalRepository` | `ReadableSearchRepository` |
| `PersistableRelationalRepository` | `PersistableSearchRepository` |
| `DefaultCRUDRepository` | `DefaultSearchRepository` |

`TypesenseDataSource` extends `BaseSearchDataSource<ITypesenseDataSourceSettings, TypesenseConnector>`, supplies `TypesenseConnector`, a static stateless `TypesenseQueryDialect` shared across instances, and narrows the neutral `multiSearch(): Promise<unknown>` to Typesense's own `results[]` / union envelopes.

## Collections instead of tables

A collection is declared through a neutral DSL (`SearchCollectionFactory.define`) and discovered from `@repository` bindings exactly as a pgTable schema is. `discoverCollections()` reads a bound model class's static `searchCollection` first - the dual-schema escape hatch for a Postgres entity that also carries a search index - then falls back to a **shape-guarded** static `schema`, so a pgTable is never mistaken for (and provisioned as) a collection. Search-only entities extend `BaseSearchEntity` and carry the DSL directly.

Provisioning is opt-in and additive-only: `autoProvision` (constructor option, or `APP_ENV_AUTO_PROVISION_COLLECTION`, default false) drives `ensureCollection()` per definition plus synonym set-up; destructive migration is caller policy. Failures propagate so boot fails loudly.

## Reading

`find()` / `findOne()` / `findById()` all route through `buildQuery()`, which merges the default filter and always strips hidden fields into the engine's exclude-fields. `findById()` carries a projection filter like the relational tier does, and spreads `where` away last so the projection can never widen the id lookup. `search()` is a single unified entry point discriminated by `mode`:

- `raw` - a full-power passthrough straight to the connector: no dialect, no default filter, **no hidden-field handling**. The caller owns exclusion there.
- `keyword` / `semantic` / `hybrid` - `where` / default filter / hidden fields are translated through the dialect the same way `find()` does, then `ISearchQueryDialect.applySearchInput` applies every engine-specific parameter. Mode dispatch, the vector clause, and the tuning knobs all live in the dialect - nothing engine-specific leaks into the repository.

`multiSearch()` lives on the **datasource**, not a repository, because it spans collections. It unions each collection's `@model` hiddenProperties into that entry's `excludeFields` using a memoized `hiddenFieldsByCollection()` map; an entry naming an unknown collection passes through untouched.

## Hidden fields on the write path

This is the non-derivable one. Reads exclude `@model({ settings: { hiddenProperties } })` at query time via the engine's exclude-fields parameter - but **a write response comes back from the write itself and never passes through that filter**. Search write responses therefore used to leak hidden properties. The relational branch never had the bug, because it gets the same guarantee for free from `.returning(visibleProperties)`.

The fix lives in `SearchBaseRepository`:

```typescript
protected omitHiddenFields<R>(document: R): R
protected omitHiddenFieldsAll<R>(documents: R[]): R[]
```

`create()`, `createAll()`, and `updateById()` in `PersistableSearchRepository` pass their returned documents through it, and `ReadableSearchRepository.find()` / `search()` apply it to hits as a second line of defence. The result is that `hiddenProperties` holds on every path except the explicit `raw` escape hatch.

## Read-after-write is engine-specific

Typesense indexing is not synchronous with the write acknowledgement. On a live cluster a document created and immediately searched can legitimately be missing from the result set. This is engine behaviour, not a framework bug - do not "fix" it with a retry inside the repository, and do not write tests that assume write-then-search consistency.

Meilisearch is the opposite by construction: every write is enqueued as a task and `MeilisearchConnector` polls that task to completion before resolving, so `create()` returns only once the document is retrievable. The cost is a write that blocks for as long as the task takes - `taskTimeoutMs` caps the wait at five minutes by default, deliberately far above the SDK's own few-second `waitForTask`, which is too short for bulk imports, and the poll interval backs off to a one-second ceiling.

The same repository code therefore has different write timing on each engine. Neither rule generalises: a test written against one of them will be wrong on the other.

## Transactions

There is none. `SearchBaseRepository.assertNoTransaction()` throws when `options.transaction` is passed, rather than silently running outside the transaction the caller expected. `assertNoLock()` does the same for row locks.

## Signature divergences from the base contract

Method parameters are bivariant in TypeScript, so a search repository can drop a parameter the base declares and still satisfy `ICrudRepository`. `tsc` will not catch it, and the generated CRUD controller passes the request's `filter` through the base type. Assume a divergence is a bug until it appears below.

| Verb | Search signature | Why |
| --- | --- | --- |
| `findById` | matches the base, including `filter?: Omit<TFilter, 'where'>` | `fields` becomes the engine's include-fields; only `include` is unsupported, and the dialect throws for it |
| `updateAll` | `where?` where the base requires it | the `@model` defaultFilter alone can supply the effective filter; Persistable refuses the write when neither is present |
| `deleteAll` | the whole options object is optional | same rule, plus `deleteAll()` with no argument must refuse rather than truncate |
| `updateAll` / `deleteAll` | return `data: null`, no `shouldReturn` overloads | no engine here has RETURNING, and no extra read is bolted on |

## Big collections: streaming export, per-call timeout, import errors

`TypesenseConnector.streamDocuments` reads `documents().exportStream()` and yields NDJSON lines through `TypesenseInternal.toLines`, which holds one chunk and one partial line (one streaming `TextDecoder`, so a multi-byte character split between chunks is read whole); `exportDocuments` still builds one string. `TypesenseInternal.toExportParams` writes `filter_by`, `include_fields` and `exclude_fields` for both. `typesense-js` has one timeout per client (`connectionTimeoutSeconds`) and no per-call one, so `timeoutMs` (`ITypesenseCallOptions`) runs the call on a second client built by `createClient` (the connector option; the default builds a `Client` from `nodes`, `apiKey`, `numRetries`) - an injected `client` needs `createClient` too. `importDocuments` always passes `throwOnFail: false` to `typesense-js`; its own opt-in `throwOnFail: true` throws `422` after the last batch with the counts in `extra.details` and the per-row responses on `error.responses` (off `extra`, which goes on the wire). `findDocument` is `getDocument` with the not-found tolerance of `getAlias` (answers `null`); `updateByFilter` refuses an empty `document` before the engine.

## Counting a search, facets, suggest, tuning and scores

`count({ where })` asks `document.count` (the filter-only, never-estimated total). `searchCount({ query, queryBy?, where? })` goes through `search()` with a page of 0 and answers `{ count, isFoundExact }`, because a text search can stop at `search_cutoff` and then `found` is an estimate. `facets` and `suggest` are keyword `search()` calls too, so they take `buildQuery`'s default filter, hidden fields and `defaultQueryBy`, the `matchNone` short-circuit, and the connector's empty answer for a missing collection. `suggest` sends no `prefix`: engine-only knobs stay out of the neutral input, and both engines already match the last word as a prefix; the neutral keyword input has `highlight` (false is `highlight_fields: none` on Typesense, nothing on Meilisearch).

`ISearchResult.facetCounts` is `ISearchFacetCount[]` in camelCase (`fieldName`, `counts[{ value, count, highlighted? }]`, `sampled`, `stats`); `value` is always the string the engine sent. The Typesense mapper drops a malformed entry; Meilisearch's `facetDistribution` / `facetStats` map to the same shape (its stats carry only `min` and `max`).

Typesense tuning (`ITypesenseTuning`: `numTypos`, `infix`, `useCache`, `cacheTtl`, `maxCandidates`, ...) is accepted as fields of `ITypesenseSearchQuery` and as camelCase keys of `engineParams`; `TypesenseQueryDialect.toWireParams` maps both to the wire names, joins a list, and refuses a numeric value that is not a non-negative integer (`maxCandidates`: positive). The cache switches (`use_cache`, `cache_ttl`) are the one tuning that `TypesenseConnector.search` moves out of the per-search body into the multi-search common params, where Typesense reads them. Naming a param in both spellings is refused. `search()` refuses a hidden field in `facetBy`, `facetQuery`, `queryBy`, `groupBy` and the highlight fields. `searchCount`, `facets` and `suggest` take `engineParams` and hand it to `search()`, so they match what a tuned search matches. `engineParams` stays the only door to engine-native params, so the scoped search controller's refusal covers the typed names too; its routes call `search()` and `multiSearch()` only. Sort by a declared field is `filter.order` (neutral), sent as `sort_by` by `search()`; `suggest()` takes no `order`. The special forms (`_text_match`, `_eval(...)`) go through `ITypesenseTuning.sortBy` in `engineParams` (or its wire name `sort_by`): `sortBy` is a `TuningWireKeys` entry, so the given-once check of `setTuning` covers it; `SortByWire.assert` requires a non-empty, balanced string with at most three top-level entries (commas inside `()`, `[]` or a backtick string are not separators), and the same entry check serves `filter.order` through `assertFieldCount`. It is refused together with `filter.order` (labelled `query.sortBy`) or the other spelling instead of letting one win; `{ sortBy: undefined }` is skipped. Field names are not checked. A field declared `{ optional: true, nullable: true }` (`ISearchFieldDefinition.nullable`, refused by `SearchCollectionFactory.define` without `optional`) is read back as `null` when Typesense dropped the key: `BaseSearchRepository.shapeDocument`/`shapeDocuments` fill it (memoized `nullableFields`, like `collectionFields`) and then drop the hidden fields, at the two read choke points (`find`, `search` hits, hence `findOne`/`findById`/`suggest`) and the three write responses; `mode: 'raw'` and `multiSearch` are not touched. A `filter.fields` selection (names via `SearchDialectHelper.toFieldNames`, which `toFieldsCsv` now uses) limits the fill to selected fields, and an empty selection counts as none: both dialects skip an empty include list, so the engine returns whole documents. A selection given only through `engineParams` (`include_fields`, `exclude_fields`, `attributesToRetrieve`) or a dotted path is NOT seen by the fill: seeing it would need either engine key names in this engine-neutral tier or a new `ISearchQueryDialect` method, so it is a documented limit. The fill is engine-neutral, so Meilisearch fills a never-set nullable field too (one behaviour on both engines). `deriveDocumentSchema` follows: `select` is `.nullable().default(null)`, `create`/`update` are `.nullable().optional()`; `TSearchDocument` types it `T | null`. `nullable` is never compiled (the Typesense compiler builds each field from named flags, and the Meilisearch plan reads three). A stored null and a never-set field are indistinguishable after a round trip. A hit's `score` is `text_match` in every mode; a hybrid hit also carries `rankFusionScore` and `vectorDistance`.

## Related

- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [Filter System](/architecture/filter-system.md)
- [Typesense Search Example](/examples/typesense-search.md)
