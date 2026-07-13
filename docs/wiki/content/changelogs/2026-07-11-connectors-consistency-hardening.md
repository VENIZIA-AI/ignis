---
title: Connectors Consistency Hardening
description: Strict find()/findOne() everywhere, engine knobs moved to engineParams, the memory connector removed, internal barrels unexported, plus fixes
---

# Changelog - 2026-07-11

## Connectors Consistency Hardening

A full review of the unified connector layer (Postgres and the search family - Typesense and Meilisearch) turned up a batch of inconsistencies: signatures that drifted between engines, engine-specific tuning leaking into the neutral search input, and internal modules that were accidentally public. The review also found the memory connector had no known consumers, so it has been removed entirely rather than hardened further. This release closes the remaining inconsistencies. The breaking changes come first, each with before/after code; the non-breaking fixes and performance work follow.

## Overview

- **Strict `find()` / `findOne()` everywhere** - `opts` and `filter` are both required on every connector; the find-all form is the explicit `find({ filter: {} })`.
- **Engine knobs moved to `engineParams`** - 11 Typesense-only tuning fields removed from the neutral search input; engine tuning now travels through `engineParams` under the engine's own wire names.
- **Memory connector removed** - `MemoryDataSource`/`MemoryRepository` had no known consumers and have been deleted entirely; see [Removed: the memory connector](#3-removed-the-memory-connector).
- **`internal/` barrels unexported** - engine `internal` modules are no longer part of the public API.
- **Operator + correctness fixes** - `mergeFilter` no longer corrupts filters, `exists` / `notExists` / `not` now work, cross-engine `409` / `404` behavior is aligned, hidden fields no longer leak on multi-search, and `updateAll` returns an accurate post-update view.

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. Strict `find()` / `findOne()` signatures

Every connector - Postgres and the search family - now types `find` and `findOne` as `find(opts: { filter: TFilter; options? })`: `opts` and `filter` are both required. The single explicit find-all form is `find({ filter: {} })`. Bare `find()` and `find({})` are compile errors everywhere.

The search family previously allowed a bare `find()`; that is the breaking side of this change.

**Before:**

```typescript
// worked on the search repositories only
const all = await productSearchRepository.find();
```

**After:**

```typescript
// the find-all form is explicit on every connector
const all = await productSearchRepository.find({ filter: {} });

// a filtered read is unchanged
const some = await productSearchRepository.find({ filter: { where: { inStock: true } } });
```

### 2. Engine-specific search knobs moved to `engineParams`

Eleven Typesense-only tuning fields were removed from the neutral `TSearchInput` schemas (the `keyword` / `semantic` / `hybrid` modes and multi-search entries): `numTypos`, `prefix`, `infix`, `useCache`, `cacheTtl`, `exhaustiveSearch`, `pinnedHits`, `hiddenHits`, `prioritizeExactMatch`, `dropTokensThreshold`, and `preset`.

Engine tuning now goes through `engineParams` - a `Record<string, unknown>` keyed by the **engine's own wire names** (snake_case), merged verbatim into the wire query after every neutral param. Neutral fields that stay on the input: `facetBy` / `facetQuery` / `maxFacetValues`, the `highlight*` group, `snippetThreshold`, `groupBy` / `groupLimit` / `groupMissingValues`, `queryByWeights`, `queryBy`, `filter`, and pagination.

**Before:**

```typescript
await productSearchRepository.search({
  mode: 'keyword',
  query: 'wireless',
  queryBy: ['name'],
  numTypos: 1,       // camelCase neutral field
  preset: 'listing',
});
```

**After:**

```typescript
await productSearchRepository.search({
  mode: 'keyword',
  query: 'wireless',
  queryBy: ['name'],
  engineParams: { num_typos: 1, preset: 'listing' }, // engine wire names, passed verbatim
});
```

### 3. Removed: the memory connector

The in-memory connector (`MemoryDataSource`/`MemoryRepository`, `@venizia/ignis/memory`) has been removed entirely. It had no known consumers, so rather than continuing to harden its SQL-parity semantics it was deleted outright - code, tests, and the `./memory` export are all gone.

Prototyping and testing use cases it used to serve are covered by the PostgreSQL connector against a disposable database, or by the search connectors' fakes.

### 4. `internal/` barrels are no longer exported

The search, Typesense, and Meilisearch `index.ts` files no longer `export * from './internal'`. `SearchConnectorInternal`, `TypesenseInternal`, and `MeilisearchInternal` are no longer public API - they were engine-internal error classifiers and helpers with no compatibility guarantee.

**Before:**

```typescript
import { TypesenseInternal } from '@venizia/ignis/typesense';
```

**After:**

```typescript
// GONE from the public surface. `internal/` has no sub-path export, and package `exports` blocks
// deep imports - so there is no specifier that resolves to it. That is the point: it is
// implementation detail. If you depended on it, open an issue for a supported API instead.
```

### 5. Removed dead utility exports

The structured testing module (`TestPlan`, `TestCase`, `TestDescribe`, `BaseTestPlan` - built on `node:test`, no known consumers) has been removed; use your project's own test runner directly. Also removed: dead exports from `@venizia/ignis-helpers` with zero call sites in the framework, the examples, and every known consumer: `transformValueOrPromise` (`fn(await valueOrPromise)` says the same in one line), `getNumberValue`, `toStringDecimal`, and `parseArrayToRecordWithKey`.

### 6. `SwaggerComponent` renamed to `ApiReferenceComponent`

Swagger UI is one pluggable UI provider among several (Scalar is the default), so the component now carries a vendor-neutral name. Same for its option types and binding keys.

```typescript
// Before
import { ISwaggerOptions, SwaggerBindingKeys, SwaggerComponent } from '@venizia/ignis';
this.bind({ key: SwaggerBindingKeys.SWAGGER_OPTIONS }).toValue(options);
this.component(SwaggerComponent);

// After
import { ApiReferenceBindingKeys, ApiReferenceComponent, IApiReferenceOptions } from '@venizia/ignis';
this.bind({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS }).toValue(options);
this.component(ApiReferenceComponent);
```

The old names remain as deprecated aliases (the binding-key VALUE moved to `@app/api-reference/options` - reachable through either constant), so existing applications compile and run unchanged.

## New Features

### `exists`, `notExists`, and `not` operators

**File:** `packages/core/src/connectors/postgres/repositories/dialect/query.ts`

**Problem:** These three operators were listed in the neutral vocabulary but threw `Invalid query operator` at execution time.

**Solution:** All three now work on Postgres:

- `exists: true` compiles to `IS NOT NULL`, `exists: false` to `IS NULL`.
- `notExists` is the inverse.
- `not: <operatorObject>` negates a nested condition; `not: <bareValue>` negates the equality (`NOT(eq)`).

JSON-path `exists` works on Postgres too.

```typescript
// rows whose deletedAt column is set
await userRepository.find({ filter: { where: { deletedAt: { exists: true } } } });

// negate a nested condition
await orderRepository.find({ filter: { where: { status: { not: { inq: ['cancelled', 'refunded'] } } } } });
```

## Bug Fixes

### `mergeFilter` no longer corrupts filters

**File:** `packages/core/src/connectors/postgres/repositories/dialect/filter.ts`

Previously the default-filter merge used a `lodash` deep merge, which combined arrays **index-wise**: a user `{ id: { inq: [4] } }` merged onto a default `{ id: { inq: [1, 2, 3] } }` produced `inq: [4, 2, 3]`, and two `or` arrays collapsed into one AND-of-both. Either could silently widen a default tenant scope.

`mergeFilter` now merges `where` at the **top-key level**: a user-supplied key replaces the default's value wholesale, never index-wise. A user value of `undefined` **never** overrides a defined default - so a caller cannot blow away a tenant or soft-delete scope by passing `undefined`.

### Cross-engine `409` / `404` alignment

**Files:** `packages/core/src/connectors/typesense/connector.ts`, `packages/core/src/connectors/meilisearch/connector.ts`

- **Typesense** `createDocument` with a duplicate id now throws `409` `core.search_engine.already_exists` (it was surfacing a misleading sanitized `503`). Identical to Meilisearch; pinned in the shared conformance suite for both engines.
- **Meilisearch** `updateById` on a missing id now throws `404` `core.search_engine.not_found`. It was a silent upsert that **fabricated** a record - a cross-engine divergence, since Typesense (and the neutral contract) throws.

### Meilisearch primary-key authority

**File:** `packages/core/src/connectors/meilisearch/connector.ts`

Update payloads now write `{ ...document, [primaryKey]: id }` with the path id **last** and authoritative. A patch that happened to carry the primary key can no longer retarget the write onto a different row (single update and update-by-filter both).

### `multiSearch` no longer leaks hidden fields

**File:** `packages/core/src/connectors/search/datasources/base.ts`

`multiSearch` now injects each collection's `@model` `hiddenProperties` into that entry's `excludeFields`, unioned with anything the caller already supplied - so hidden fields no longer leak on the multi-search route the way a single `search()` already prevented. An entry whose collection is unknown (not a discovered definition) passes through untouched: the caller owns exclusion there, exactly as the raw connector escape hatch does.

### `updateAll` returns an accurate post-update view

**File:** `packages/core/src/connectors/search/repositories/core/persistable.ts`

Update-by-filter has no `RETURNING` equivalent, and the previous behavior (a bolted-on `find()` read) was both an extra engine round-trip per bulk write and silently capped at `defaultLimit` - `{ count: 500, data: <10 rows> }`. Search `updateAll`/`deleteAll` are now **count-only**: they return `{ count, data: null }`, never issue an extra read, and reject `shouldReturn` at the type level. Callers that need the affected documents read them explicitly before the write. Single-document verbs (`updateById`/`deleteById`) and `create`/`createAll` are unchanged - their `data` comes from the engine natively.

### Meilisearch `updateById` default-filter guard

**File:** `packages/core/src/connectors/search/repositories/core/persistable.ts`

`updateById` re-reads via `findById` first when a `@model` `defaultFilter` is present (skippable with `shouldSkipDefaultFilter`), so a document excluded by the default filter reports the same sanitized `404` as a genuinely missing one instead of being updated through the filter.

### Numeric consistency (Postgres)

**File:** `packages/core/src/connectors/postgres/repositories/dialect/filter.ts`

- JSON-path numeric operators are now consistent. `{ 'metadata.score': { eq: 50 } }` numeric-casts the extracted text the same way the bare `{ 'metadata.score': 50 }` form already did, fixing a `text = integer` SQL error. The same cast applies to `inq` / `nin` with all-number arrays.
- `neq` keeps SQL three-valued semantics: a `NULL` row never matches `neq`.

## Performance Improvements

### Relations, single WHERE build, and search polling

**Files:** `packages/core/src/connectors/postgres/repositories/dialect/filter.ts`, `packages/core/src/connectors/postgres/repositories/core/persistable.ts`, `packages/core/src/connectors/meilisearch/connector.ts`, `packages/core/src/connectors/typesense/connector.ts`

| Scenario | Improvement |
|----------|-------------|
| Reads without `include` | Relation resolution runs only when `include` is present, and is memoized per schema (was resolved unconditionally) |
| `update` / `delete` | The `WHERE` condition is built once and reused, not built twice per call |
| Meilisearch writes | Task polling backs off exponentially (50ms doubling, 1s cap) instead of a fixed 50ms (~20 requests/second) per write; write-and-await deduped into one helper |
| Typesense wire mapping | camelCase-to-wire key mapping is O(1) |

### Meilisearch import and error hygiene

**File:** `packages/core/src/connectors/meilisearch/connector.ts`

- `importDocuments` is batch-atomic, so `count.fail` is structurally always `0`; a failed batch throws with `details { totalCount, processedCount }` so callers can resume from the failure point.
- `resolvePrimaryKey` engine errors are sanitized through `runEngineCall`, so raw engine detail no longer leaks through whichever write triggered the lookup.

### Typesense compiler

**File:** `packages/core/src/connectors/typesense/compiler.ts`

A `defaultSort` naming a nonexistent field now throws a clear framework error (naming the field), instead of being forwarded to the engine and rejected with an opaque message.

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/connectors/search/repositories/common/constants.ts` | 11 engine knobs removed from `TSearchInput`; `engineParams` added |
| `src/connectors/search/repositories/core/readable.ts` | Strict `find` / `findOne`; `search` dispatch |
| `src/connectors/search/repositories/core/persistable.ts` | `updateAll`/`deleteAll` count-only contract; `updateById` default-filter guard |
| `src/connectors/search/repositories/common/dialect-helpers.ts` | New. Shared friendly-to-wire dialect helpers |
| `src/connectors/search/datasources/base.ts` | `multiSearch` injects hidden fields into `excludeFields` per entry |
| `src/connectors/search/index.ts` | Stop re-exporting `./internal` |
| `src/connectors/postgres/repositories/dialect/filter.ts` | `mergeFilter` top-key merge; `not` operator; JSON numeric cast; memoized relations |
| `src/connectors/postgres/repositories/dialect/query.ts` | `exists` / `notExists` operators; NULL-aware `neq` / `ne` |
| `src/connectors/postgres/repositories/core/readable.ts` | Strict `find` / `findOne` |
| `src/connectors/postgres/repositories/core/persistable.ts` | Build the `WHERE` once and reuse it |
| `src/connectors/memory/**` | Removed entirely |
| `src/connectors/meilisearch/connector.ts` | Missing-id `404`; primary-key authority; exponential poll backoff; batch-atomic import; sanitized `resolvePrimaryKey` |
| `src/connectors/meilisearch/index.ts` | Stop re-exporting `./internal` |
| `src/connectors/meilisearch/repositories/dialect/query-dialect.ts` | Dialect parity with the neutral search input |
| `src/connectors/typesense/connector.ts` | Duplicate-id `409` `already_exists` (was a misleading `503`) |
| `src/connectors/typesense/compiler.ts` | Clear error for a `defaultSort` naming a nonexistent field |
| `src/connectors/typesense/index.ts` | Stop re-exporting `./internal` |
| `src/connectors/typesense/repositories/dialect/query-dialect.ts` | `engineParams` merge; wire-key mapping |

## Migration Guide

> [!NOTE]
> Follow these steps if you are upgrading from a previous version.

### Step 1: Make every `find()` / `findOne()` pass a filter

Replace any bare `find()` (search repositories only) with the explicit find-all form:

```typescript
// before
const all = await productSearchRepository.find();
// after
const all = await productSearchRepository.find({ filter: {} });
```

### Step 2: Move engine tuning into `engineParams`

Any of the 11 removed knobs (`numTypos`, `prefix`, `infix`, `useCache`, `cacheTtl`, `exhaustiveSearch`, `pinnedHits`, `hiddenHits`, `prioritizeExactMatch`, `dropTokensThreshold`, `preset`) moves under `engineParams`, keyed by the engine's own wire name:

```typescript
// before: { mode: 'keyword', query: 'x', numTypos: 1, preset: 'listing' }
// after:
{ mode: 'keyword', query: 'x', engineParams: { num_typos: 1, preset: 'listing' } }
```

### Step 3: Replace any use of the memory connector

If you imported `MemoryDataSource` or `MemoryRepository` from `@venizia/ignis` or `@venizia/ignis/memory`, those exports are gone. Switch to `BasePostgresDataSource`/`DefaultCRUDRepository` against a disposable database for prototyping and tests, or use the search connectors' fakes if your use case was search-shaped.

### Step 4: Replace any import of an engine `internal` barrel

If you imported `SearchConnectorInternal`, `TypesenseInternal`, or `MeilisearchInternal` from a connector barrel, import it by direct module path (accepting no compatibility guarantee) or - preferably - stop depending on it.
