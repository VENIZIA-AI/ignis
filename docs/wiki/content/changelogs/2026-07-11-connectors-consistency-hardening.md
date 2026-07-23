---
title: Connectors Consistency Hardening
description: Strict find()/findOne() everywhere, engine-specific search tuning moved to engineParams, the memory connector removed, internal barrels unexported, plus filter and correctness fixes across Postgres, Typesense, and Meilisearch.
---

# Changelog - 2026-07-11

## Connectors Consistency Hardening

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A full review of the connector layer (Postgres, Typesense, Meilisearch) closed a batch of cross-engine inconsistencies. It also tightened the public API and fixed several correctness bugs.

## The problem it solves

Postgres, Typesense, and Meilisearch had drifted independently. `find()` compiled bare on the search repositories but always required a filter on Postgres, and Typesense-only tuning fields sat on the neutral search input shared by every engine.

The sharpest bug: a same-key user filter could silently widen a default scope instead of narrowing it.

```
default: { id: { inq: [1, 2, 3] } }
user:    { id: { inq: [4] } }
before:  { id: { inq: [4, 2, 3] } }   // index-wise merge - wrong
```

A full review across all three connectors closed this and a dozen other gaps - see What changed and Details.

## What changed

- **Strict `find()` / `findOne()` everywhere.** `opts` and `filter` are both required on every connector now; the find-all form is the explicit `find({ filter: {} })`.
- **Engine tuning moved to `engineParams`.** Eleven Typesense-only fields left the neutral search input. Engine-specific tuning now travels through `engineParams`, keyed by the engine's own wire names.
- **Memory connector removed.** `MemoryDataSource` / `MemoryRepository` had no known consumers and were deleted entirely, including the `@venizia/ignis/memory` export.
- **Internal barrels are no longer public.** The search, Typesense, and Meilisearch `internal/` modules are no longer exported from the connector barrels.
- **`SwaggerComponent` renamed to `ApiReferenceComponent`.** Swagger UI is one pluggable UI provider among several, so the component now has a vendor-neutral name.
- **Dead exports removed.** The `node:test`-based structured testing module (`TestPlan`, `TestCase`, `TestDescribe`, `BaseTestPlan`) and four unused helper utilities (`transformValueOrPromise`, `getNumberValue`, `toStringDecimal`, `parseArrayToRecordWithKey`).
- **New operators on Postgres.** `exists`, `notExists`, and `not` now work (previously threw `Invalid query operator`), including on JSON-path fields.
- **Filter fix.** `mergeFilter` no longer corrupts filters when combining a caller's `where` with a `@model` default filter (see Details).
- **Cross-engine alignment.** Typesense and Meilisearch now return the same `409` / `404` behavior for duplicate and missing document IDs.
- **Search fixes.** `multiSearch` no longer leaks hidden fields. `updateAll` / `deleteAll` on the search connectors are now count-only, and no longer silently cap at `defaultLimit`.
- **Performance.** Relation resolution is memoized, `WHERE` is built once per call, and Meilisearch write polling backs off exponentially instead of polling at a fixed interval.

## Who is affected

- **Every application using search repositories (`find()`/`findOne()`).** Bare `find()` no longer compiles - see Breaking change 1.
- **Any caller passing Typesense-only tuning fields directly on the search input** (`numTypos`, `preset`, etc.). Move them into `engineParams` - see Breaking change 2.
- **Anyone using the memory connector.** It is gone - see Breaking change 3.
- **Anyone importing an engine `internal` barrel.** No longer resolvable - see Breaking change 4.
- **Anyone importing `SwaggerComponent`.** Still works via a deprecated alias, but new code should use `ApiReferenceComponent` - see Breaking change 6.
- **Everyone else.** No action needed; the bug fixes and performance work apply automatically.

## Breaking changes

### 1. Strict `find()` / `findOne()` signatures

`opts` and `filter` are both required on every connector - Postgres and the search family. Bare `find()` and `find({})` are now compile errors. This only changes the search repositories in practice; Postgres already required a filter.

**Before**
```typescript
// worked on the search repositories only
const all = await productSearchRepository.find();
```

**After**
```typescript
// the find-all form is explicit on every connector
const all = await productSearchRepository.find({ filter: {} });
```

### 2. Engine-specific search knobs moved to `engineParams`

Eleven Typesense-only tuning fields left the neutral search input: `numTypos`, `prefix`, `infix`, `useCache`, `cacheTtl`, `exhaustiveSearch`, `pinnedHits`, `hiddenHits`, `prioritizeExactMatch`, `dropTokensThreshold`, and `preset`. They now travel through `engineParams`, keyed by the engine's own wire name (snake_case).

**Before**
```typescript
await productSearchRepository.search({
  mode: 'keyword',
  query: 'wireless',
  queryBy: ['name'],
  numTypos: 1,       // camelCase neutral field
  preset: 'listing',
});
```

**After**
```typescript
await productSearchRepository.search({
  mode: 'keyword',
  query: 'wireless',
  queryBy: ['name'],
  engineParams: { num_typos: 1, preset: 'listing' }, // engine wire names, passed verbatim
});
```

### 3. Memory connector removed

`MemoryDataSource` / `MemoryRepository` and the `@venizia/ignis/memory` export are gone - code, tests, and all.

**What to do:** use `BasePostgresDataSource` / `DefaultCRUDRepository` against a disposable database for prototyping and tests. Use the search connectors' fakes if your use case was search-shaped.

### 4. Engine `internal/` barrels no longer exported

`SearchConnectorInternal`, `TypesenseInternal`, and `MeilisearchInternal` are no longer part of the public API.

**Before**
```typescript
import { TypesenseInternal } from '@venizia/ignis/typesense';
```

**After**
```typescript
// Gone from the public surface - there is no specifier that resolves to it.
// These were engine-internal helpers with no compatibility guarantee.
```

### 5. `SwaggerComponent` renamed to `ApiReferenceComponent`

**Before**
```typescript
import { ISwaggerOptions, SwaggerBindingKeys, SwaggerComponent } from '@venizia/ignis';
this.bind({ key: SwaggerBindingKeys.SWAGGER_OPTIONS }).toValue(options);
this.component(SwaggerComponent);
```

**After**
```typescript
import { ApiReferenceBindingKeys, ApiReferenceComponent, IApiReferenceOptions } from '@venizia/ignis';
this.bind({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS }).toValue(options);
this.component(ApiReferenceComponent);
```

<details>
<summary>Not urgent - old names still work</summary>

The old names remain as deprecated aliases, so existing applications compile and run unchanged.

</details>

## Details

### Bug fixes

- **`mergeFilter` no longer corrupts filters.** The merge combined arrays index-wise, so a same-key collision could silently widen a default tenant scope:

  ```
  default: { id: { inq: [1, 2, 3] } }
  user:    { id: { inq: [4] } }
  before:  { id: { inq: [4, 2, 3] } }   // index-wise merge - wrong
  ```

  Two `or` arrays could collapse into one AND-of-both the same way. The merge is now top-key level: a user-supplied key replaces the default's value wholesale, and a user value of `undefined` never overrides a defined default.
- **Cross-engine `409` / `404` alignment.** Typesense `createDocument` on a duplicate id now throws `409` (`core.search_engine.already_exists`) instead of a misleading `503`. Meilisearch `updateById` on a missing id now throws `404` instead of silently creating a new record.
- **Meilisearch primary-key authority.** Update payloads now write the path id last and authoritative. A patch body carrying the primary key can no longer retarget a write onto a different row.
- **`multiSearch` no longer leaks hidden fields.** Each collection's `@model` `hiddenProperties` are now injected into that entry's `excludeFields`, matching what single-collection `search()` already did.
- **`updateAll` / `deleteAll` on search are count-only.** They now return `{ count, data: null }` and never issue an extra read. The previous behavior silently capped the returned data at `defaultLimit`, while reporting a higher `count`.
- **Meilisearch `updateById` respects `defaultFilter`.** A document excluded by a `@model` default filter now reports the same `404` as a genuinely missing one. Previously, the filter still let an update through.
- **Numeric consistency on Postgres.** JSON-path numeric operators now cast the extracted value consistently, fixing a `text = integer` SQL error. `neq` correctly never matches a `NULL` row.

### Performance

| Scenario | Improvement |
|----------|-------------|
| Reads without `include` | Relation resolution runs only when `include` is present, and is memoized per schema |
| `update` / `delete` | The `WHERE` condition is built once and reused, not built twice per call |
| Meilisearch writes | Task polling backs off exponentially (50ms doubling, 1s cap) instead of a fixed 50ms interval |
| Typesense wire mapping | camelCase-to-wire key mapping is O(1) |

<details>
<summary>Files changed</summary>

| File | Changes |
|------|---------|
| `src/connectors/search/repositories/common/constants.ts` | 11 engine knobs removed from `TSearchInput`; `engineParams` added |
| `src/connectors/search/repositories/core/readable.ts` | Strict `find` / `findOne`; `search` dispatch |
| `src/connectors/search/repositories/core/persistable.ts` | `updateAll`/`deleteAll` count-only contract; `updateById` default-filter guard |
| `src/connectors/search/datasources/base.ts` | `multiSearch` injects hidden fields into `excludeFields` per entry |
| `src/connectors/search/index.ts` | Stop re-exporting `./internal` |
| `src/connectors/postgres/repositories/dialect/filter.ts` | `mergeFilter` top-key merge; `not` operator; JSON numeric cast; memoized relations |
| `src/connectors/postgres/repositories/dialect/query.ts` | `exists` / `notExists` operators; NULL-aware `neq` / `ne` |
| `src/connectors/postgres/repositories/core/readable.ts` | Strict `find` / `findOne` |
| `src/connectors/postgres/repositories/core/persistable.ts` | Build the `WHERE` once and reuse it |
| `src/connectors/memory/**` | Removed entirely |
| `src/connectors/meilisearch/connector.ts` | Missing-id `404`; primary-key authority; exponential poll backoff; batch-atomic import |
| `src/connectors/typesense/connector.ts` | Duplicate-id `409` `already_exists` (was a misleading `503`) |
| `src/connectors/typesense/compiler.ts` | Clear error for a `defaultSort` naming a nonexistent field |

</details>

## See also

- [Unified Repository & Connectors Architecture](/changelogs/2026-07-05-unified-repository-connectors) - introduced the connectors this hardening pass reviews
- [Typesense Advanced Search](/changelogs/2026-07-08-typesense-advanced-search) - the neutral search input tightened here
- [Postgres Driver Seam & Supabase](/changelogs/2026-07-11-postgres-driver-seam-supabase) - the same-day Postgres driver work
