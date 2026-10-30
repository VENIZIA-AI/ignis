---
title: Connectors Consistency Hardening
description: Strict find() and findOne() everywhere, engine tuning moved to engineParams, the memory connector removed, SwaggerComponent renamed, and filter and correctness fixes across Postgres, Typesense and Meilisearch.
packages: ['@venizia/ignis']
---

# Changelog - 2026-07-11

## Connectors Consistency Hardening

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** The Postgres, Typesense and Meilisearch connectors now behave consistently, with a tighter public API and several correctness fixes, including one where a user filter could widen a default scope.

## What changed

- **Strict `find()` / `findOne()`.** `opts` and `filter` are required on every connector. The find-all form is `find({ filter: {} })`.
- **`engineParams`.** Eleven Typesense-only tuning fields left the neutral search input and now travel through `engineParams`, keyed by the engine's wire names.
- **Memory connector removed.** `MemoryDataSource`, `MemoryRepository` and the `@venizia/ignis/memory` export are gone.
- **Internal barrels unexported.** The search, Typesense and Meilisearch `internal/` modules are no longer public.
- **`SwaggerComponent` renamed** to `ApiReferenceComponent`. Old names remain as deprecated aliases.
- **Dead exports removed.** The `node:test` structured testing module (`TestPlan`, `TestCase`, `TestDescribe`, `BaseTestPlan`) and the helpers `transformValueOrPromise`, `getNumberValue`, `toStringDecimal` and `parseArrayToRecordWithKey`.
- **New Postgres operators.** `exists`, `notExists` and `not` now work, including on JSON-path fields. They used to throw `Invalid query operator`.
- **Faster.** Relation resolution is memoized, `WHERE` is built once per call, and Meilisearch write polling backs off exponentially.

## Who is affected

- **Search repository users calling bare `find()`.** Use `find({ filter: {} })`.
- **Callers passing Typesense-only tuning fields on the search input.** Move them to `engineParams`.
- **Memory connector users, and anyone importing an engine `internal` barrel.** Those are gone.
- **`SwaggerComponent` users.** Still works; prefer `ApiReferenceComponent` in new code.
- **Everyone else.** No action needed; the fixes apply automatically.

## Breaking changes

1. **Strict `find()` / `findOne()`.** Bare `find()` and `find({})` are compile errors. In practice this only changes the search repositories.

   ```typescript
   // Before
   const all = await productSearchRepository.find();

   // After
   const all = await productSearchRepository.find({ filter: {} });
   ```

2. **Engine tuning moved to `engineParams`.** The moved fields are `numTypos`, `prefix`, `infix`, `useCache`, `cacheTtl`, `exhaustiveSearch`, `pinnedHits`, `hiddenHits`, `prioritizeExactMatch`, `dropTokensThreshold` and `preset`.

   ```typescript
   // Before
   await productSearchRepository.search({
     mode: 'keyword', query: 'wireless', queryBy: ['name'],
     numTypos: 1, preset: 'listing',
   });

   // After
   await productSearchRepository.search({
     mode: 'keyword', query: 'wireless', queryBy: ['name'],
     engineParams: { num_typos: 1, preset: 'listing' },
   });
   ```

3. **Memory connector removed.** Use `BasePostgresDataSource` and `DefaultCRUDRepository` against a disposable database for prototyping and tests. Use the search connectors' fakes if your use case was search-shaped.
4. **Engine `internal/` barrels unexported.** `SearchConnectorInternal`, `TypesenseInternal` and `MeilisearchInternal` have no public specifier and no compatibility guarantee. `import { TypesenseInternal } from '@venizia/ignis/typesense'` no longer works.
5. **`SwaggerComponent` renamed.**

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

## Details

Bug fixes:

- **`mergeFilter`.** It merged arrays index-wise, so a same-key user filter could widen a default scope. For example, default `{ id: { inq: [1, 2, 3] } }` with user `{ id: { inq: [4] } }` gave `{ id: { inq: [4, 2, 3] } }`. Two `or` arrays could also collapse into one AND. The merge is now at the top key: a user key replaces the default's value, and a user value of `undefined` never overrides a defined default.
- **`409` / `404` alignment.** Typesense `createDocument` on a duplicate id throws `409` (`core.search_engine.already_exists`), not `503`. Meilisearch `updateById` on a missing id throws `404` instead of creating a record.
- **Meilisearch primary key.** The path id is written last and wins, so a patch body carrying the primary key can no longer retarget a write onto another row.
- **`multiSearch` hidden fields.** Each collection's `@model` `hiddenProperties` are now added to that entry's `excludeFields`, as single-collection `search()` already did.
- **`updateAll` / `deleteAll` on search** return `{ count, data: null }` and no longer cap data at `defaultLimit` while reporting a higher `count`.
- **Meilisearch `updateById`** respects a `@model` default filter: a document it excludes now gives `404`.
- **Postgres numerics.** JSON-path numeric operators cast the extracted value consistently, fixing a `text = integer` SQL error. `neq` never matches a `NULL` row.

## See also

- [Unified Repository & Connectors Architecture](/changelogs/2026-07-05-unified-repository-connectors)
- [Typesense Advanced Search](/changelogs/2026-07-08-typesense-advanced-search)
- [Postgres Driver Seam & Supabase](/changelogs/2026-07-11-postgres-driver-seam-supabase)
