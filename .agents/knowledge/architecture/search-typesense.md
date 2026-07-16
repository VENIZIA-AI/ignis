---
type: Architecture
title: Typesense search connector
description: How the search connector family mirrors the relational hierarchy, how collections are discovered and provisioned, and why hidden fields must be stripped on the write path.
resource: packages/core/src/connectors/search
tags: [architecture, search, typesense, connectors]
---

Search is a **paradigm family**, not a single engine. `connectors/search` holds the engine-neutral tier and `connectors/typesense` / `connectors/meilisearch` hold the engines. The neutral tier is the seam and deliberately imports neither engine - a `BaseSearchDataSource` holds its connector through an `ISearchConnector`-bounded generic, and the only engine-specific step of the lifecycle is `createConnector()`.

## The mirror

The search hierarchy is a deliberate reflection of the relational one:

| Relational | Search |
| --- | --- |
| `AbstractRelationalDataSource` | `AbstractSearchDataSource` |
| `BaseRelationalDataSource` | `BaseSearchDataSource` |
| `RelationalBaseRepository` | `SearchBaseRepository` |
| `ReadableRelationalRepository` | `ReadableSearchRepository` |
| `PersistableRelationalRepository` | `PersistableSearchRepository` |
| `DefaultCRUDRepository` | `DefaultSearchRepository` |

`TypesenseDataSource` extends `BaseSearchDataSource<ITypesenseDataSourceSettings, TypesenseConnector>`, supplies `TypesenseConnector`, a static stateless `TypesenseQueryDialect` shared across instances, and narrows the neutral `multiSearch(): Promise<unknown>` to Typesense's own `results[]` / union envelopes.

## Collections instead of tables

A collection is declared through a neutral DSL (`defineSearchCollection`) and discovered from `@repository` bindings exactly as a pgTable schema is. `discoverCollections()` reads a bound model class's static `searchCollection` first - the dual-schema escape hatch for a Postgres entity that also carries a search index - then falls back to a **shape-guarded** static `schema`, so a pgTable is never mistaken for (and provisioned as) a collection. Search-only entities extend `BaseSearchEntity` and carry the DSL directly.

Provisioning is opt-in and additive-only: `autoProvision` (constructor option, or `APP_ENV_AUTO_PROVISION_COLLECTION`, default false) drives `ensureCollection()` per definition plus synonym set-up; destructive migration is caller policy. Failures propagate so boot fails loudly.

## Reading

`find()` / `findOne()` / `findById()` all route through `buildQuery()`, which merges the default filter and always strips hidden fields into the engine's exclude-fields. `search()` is a single unified entry point discriminated by `mode`:

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

## Read-after-write lag is real

Typesense indexing is not synchronous with the write acknowledgement. On a live cluster a document created and immediately searched can legitimately be missing from the result set. This is engine behaviour, not a framework bug - do not "fix" it with a retry inside the repository, and do not write tests that assume write-then-search consistency.

## Transactions

There is none. `SearchBaseRepository.assertNoTransaction()` throws when `options.transaction` is passed, rather than silently running outside the transaction the caller expected. `assertNoLock()` does the same for row locks.

## Related

- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [Filter System](/architecture/filter-system.md)
- [Typesense Search Example](/examples/typesense-search.md)
