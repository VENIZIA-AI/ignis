# Search & Meilisearch

IGNIS ships a **meilisearch connector** under `@venizia/ignis/meilisearch`. It shares the entire search paradigm with the Typesense connector: the same `@model`/`@repository`/`@datasource` decorators and the same `defineSearchCollection` field DSL. It also shares the same repository tiers and controller factory. All of that lives in the engine-neutral `@venizia/ignis/search` module.

What it does **not** share is the pretence that the two engines are the same. Where Meilisearch differs from Typesense, IGNIS surfaces the difference rather than papering over it.

> [!IMPORTANT] Subpath-only import
> `meilisearch` is an **optional peer dependency**. The connector is never re-exported from the `@venizia/ignis` root barrel, so apps that don't use it never pull in the client.
>
> ```typescript
> import { MeilisearchDataSource } from '@venizia/ignis/meilisearch';
> import { BaseSearchEntity, defineSearchCollection, field } from '@venizia/ignis/search';
> ```
>
> Install it alongside the framework:
>
> ```bash
> bun add meilisearch
> ```

## Defining a Collection

The collection DSL is the same one the Typesense connector uses. What changes is which flags matter.

```typescript
import { BaseSearchEntity, defineSearchCollection, field } from '@venizia/ignis/search';
import { model } from '@venizia/ignis';

@model({ type: 'entity' })
export class ArticleDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'articles',
    fields: [
      field.id(),
      field.string('title', { searchable: true }),
      field.string('body', { searchable: true }),
      field.number('score', { filterable: true, sortable: true }),
    ],
    synonyms: [{ id: 'jacket', synonyms: ['jacket', 'coat', 'blazer'] }],
  });
}
```

Meilisearch is **schemaless**: it has no field schema at all. A collection therefore compiles to an index uid plus a settings object, not to a list of typed fields.

| DSL | Meilisearch |
| --- | --- |
| `field.id()` | `primaryKey` |
| `searchable: true` | `searchableAttributes` |
| `filterable: true` | `filterableAttributes` |
| `sortable: true` | `sortableAttributes` |
| `field.vector(...)` | an `embedders` entry |
| `synonyms` | a flat `synonyms` dictionary |
| `engineOverrides.meilisearch` | merged last onto settings |

The `searchable` and `filterable` flags are **load-bearing here** and are silently dropped by the Typesense compiler, which indexes every field by default. If no field declares `searchable`, IGNIS leaves `searchableAttributes` at Meilisearch's own `['*']` default. Emitting an empty array instead would disable search entirely.

## The DataSource

```typescript
import { datasource } from '@venizia/ignis';
import { MeilisearchDataSource } from '@venizia/ignis/meilisearch';

@datasource()
export class ArticleSearchDataSource extends MeilisearchDataSource {}
```

No `driver` in the decorator, and that is not an omission. A relational datasource has to name one, because a single `BasePostgresDataSource` runs on either `pg` or `postgres` and something must pick. A search datasource has already picked: `extends MeilisearchDataSource` **is** the engine reference, and it is what carries the `meilisearch` package into your bundle. Naming the engine twice would just be a second chance to disagree with yourself.

Configured through `IMeilisearchDataSourceSettings`:

```typescript
new ArticleSearchDataSource({
  name: 'search',
  config: {
    host: process.env.APP_ENV_MEILISEARCH_HOST,
    apiKey: process.env.APP_ENV_MEILISEARCH_API_KEY,
    taskTimeoutMs: 5 * 60_000,
  },
});
```

Provisioning is governed by the same `APP_ENV_AUTO_PROVISION_COLLECTION` flag as every other search datasource. It is **off** unless set to `true` or `1`.

## Writes await their task

Every Meilisearch write returns a `taskUid` and the document is **not searchable until that task reaches `succeeded`**. Typesense writes are synchronous.

IGNIS resolves this by awaiting the task inside the connector, so the repository contract is identical on both engines:

```typescript
await repository.create({ data: article });
// The document is retrievable here. No sleep, no retry loop.
```

The cost is real and worth knowing: each write polls until its task completes. The client SDK's own `waitForTask` defaults to a 5-second timeout, which is far too short for a bulk import. IGNIS never relies on it - configure `taskTimeoutMs` instead. A task that fails raises the standard sanitized dependency error; one that never terminates raises a `core.search_engine.task_timeout`.

If you want fire-and-forget writes, reach the raw client:

```typescript
const client = dataSource.getClient(); // the raw `Meilisearch` SDK client
await client.index('articles').addDocuments([article]); // returns a taskUid, does not await
```

## `count()` is exact

Meilisearch's search route reports `estimatedTotalHits`, and its exhaustive `totalHits` is capped by the index-level `pagination.maxTotalHits` setting (default **1000**).

IGNIS never counts through the search route. `count()` calls `POST /documents/fetch` with `limit: 0` and reads the exact `total`, which the engine's own documentation states is unaffected by `maxTotalHits`. A filtered count over 50,000 matching documents returns 50,000.

`ISearchResult.isFoundExact` reports the truth for the **search** route: always `true` on Typesense, and on Meilisearch `true` only in the exhaustive page mode. It travels all the way out through the generated REST response. An API consumer paginating your endpoint can tell an estimate from an exhaustive count.

## Capability differences are compile-time, not runtime

`SearchBaseRepository` is generic on its datasource, so `this.connector` resolves to the concrete connector type. Engine-only verbs are therefore a matter for the compiler, not a runtime capability check:

```typescript
class ArticleRepository extends DefaultSearchRepository<TArticle, MeilisearchDataSource> {
  swap() {
    return this.connector.swap.indexes({ pairs: [['articles', 'articles_next']] }); // required
    // this.connector.alias -> compile error: property does not exist
  }
}

class PortableRepository extends DefaultSearchRepository<TDocument> {
  swap() {
    return this.connector.alias?.upsert({ name, collection }); // the `?.` is forced
  }
}
```

| Verb group | Typesense | Meilisearch |
| --- | --- | --- |
| `collection`, `document`, `search`, `multiSearch` | required | required |
| `document.updateBy` | native | emulated (see below) |
| `document.count` | `per_page: 0` search | `documents/fetch` `limit: 0` |
| `alias` | required | **absent** |
| `swap` | absent | **required** |
| `synonymSet` (named, linkable) | required | absent |
| `synonyms` (flat dictionary) | absent | required |

## Behaviours to know before you commit

**`create()` rejects duplicates, but the check is not atomic.** Meilisearch's `addDocuments` is add-or-replace; it has no conditional insert. The neutral contract says `create()` returns 409 on a duplicate id, matching Typesense.

To honour it, IGNIS reads the id first and throws `409 core.search_engine.already_exists` if it exists. Two concurrent creates of the same id can both pass that check, and the second write wins. If you want last-write-wins, call `upsert()` and say so.

**`updateById` on a missing id throws `404`, it does not upsert.** Meilisearch's `updateDocuments` is add-or-update, so a missing id would silently fabricate a record. IGNIS checks existence before any write and throws `404 core.search_engine.not_found` instead - matching Typesense and the neutral contract. (This is the deliberate search-family divergence from the PostgreSQL connector, where a missing-id `updateById` is a silent `{ count: 0 }`.)

**`updateBy` is emulated and is not atomic.** Meilisearch has no update-by-filter endpoint. IGNIS pages primary keys out of `documents/fetch`, then issues merge-`PUT` batches. A concurrent write to a matched document may be overwritten.

The experimental `documents/edit` route would do this server-side, but it is gated behind a feature flag and documented as breaking between minor versions. It also has an open correctness bug, so IGNIS does not use it.

**`import`/`createAll` is batch-atomic.** Documents are added in batches, each batch's task awaited before the next starts. A batch either lands whole or throws, so `count.fail` is structurally always `0`.

When a batch fails, the batches after the failure point did not land. The thrown error's `details` carry `{ totalCount, processedCount }`, so a caller can resume from `processedCount` rather than replaying the whole import.

**Meilisearch error classification reads the real SDK error shape.** A thrown `MeilisearchApiError` carries its body under `error.cause.code` and its HTTP status under `error.response.status`, not top-level `code`/`httpStatus`. Reading only the flat shape misclassifies a legitimate 404 (for example the existence probe inside `create()`) as an unrelated 503 dependency failure. The classifier checks both the flat shape (task-error responses) and the nested `cause`/`response` shape (thrown SDK errors).

**`createCollection`/`ensureCollection` are idempotent.** An `index_already_exists` failure is tolerated and logged rather than thrown. Boot-time provisioning against an already-provisioned collection (a restart, a second app instance) succeeds instead of crashing.

**`hiddenProperties` is supported on Meilisearch via JS-side stripping, not engine-side exclusion.** Meilisearch has no per-query field-exclusion param (only the index-level `displayedAttributes` setting), so the dialect does not attempt to translate `hiddenFields`. It deliberately passes them through untranslated.

The guarantee is upheld one layer up: `SearchBaseRepository` strips hidden fields from every document `find()`/`findOne()`/`search()` returns before it reaches the caller. A model with `hiddenProperties` works identically to Typesense from the caller's point of view - no throw, no leak.

**A geopoint field must be named `_geo`.** Meilisearch supports exactly one geo field, shaped `{ lat, lng }`, under that reserved name. The compiler throws on any other name, and on a second geo field.

**Vector distance is cosine only.** `field.vector(..., { distance: 'l2' })` throws.

**Engine-specific knobs never reach the neutral schema.** The neutral search input carries only fields every engine supports. Typesense-only tuning (`num_typos`, `pinned_hits`, `preset`, ...) travels through `engineParams` with wire names and is passed verbatim to the engine. Sending it to a Meilisearch datasource is a caller error.

The dialect still raises a named error for known-foreign knobs arriving via untyped input. Use `engineParams` (or `mode: 'raw'`) for Meilisearch-native tuning such as `rankingScoreThreshold`.

**`multiSearch` batches but does not merge.** `union: true` throws. Meilisearch merges results through its `federation` option, which this connector does not model, so `getCapabilities()` honestly reports `union: false`.

**Result grouping does not exist.** `groupBy`, `groupLimit` and `groupMissingValues` all throw. Meilisearch's `distinct` search param deduplicates on one attribute; it does not group hits. Reach the raw client if that is what you want.

## Vector and hybrid search

Vector fields compile to `embedders`, and `mode: 'semantic'` / `mode: 'hybrid'` translate to Meilisearch's `hybrid: { semanticRatio, embedder }` plus an optional `vector`. The neutral `alpha` maps to `semanticRatio`; `mode: 'semantic'` pins it to `1.0`, and an omitted `alpha` on `hybrid` defaults to `0.5`.

This path is compiled and translated but is **not exercised end to end** by the framework's test suite. Meilisearch has also moved its vector store in and out of `/experimental-features` across server versions. Verify against your target server version before depending on it.

## Adding another search engine

The neutral paradigm lives in `@venizia/ignis/search` and imports no engine. To add one:

1. Implement `ISearchConnector`, declaring **only** the optional verb groups your engine actually has.
2. Write a compiler from `ISearchCollectionDefinition` to the engine's schema or settings.
3. Write an `ISearchQueryDialect` - `build`, `toWhere`, `applySearchInput`, `toWireParams`.
4. Subclass `BaseSearchDataSource`.
5. Register a sub-path export and an optional peer dependency.
6. Pass `runConnectorConformance`.

That last step is the contract. A seam only one engine can satisfy is not a seam.
