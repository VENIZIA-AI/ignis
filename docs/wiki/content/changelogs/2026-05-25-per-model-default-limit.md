---
title: Per-Model Default Limit via @model Settings
description: Configure a default query limit per model with settings.defaultLimit - applied to top-level find() and to-many relations, validated at boot time
---

# Changelog - 2026-05-25

## Per-Model Default Limit

Models can now declare their own default page size with `@model({ settings: { defaultLimit } })`. When a query omits `limit`, the repository uses the model's `defaultLimit` instead of the hard-coded global `DEFAULT_LIMIT` (10). This builds directly on the [consistent default-limit work](/changelogs/2026-05-20-relation-scope-default-limit) by making the default configurable per model rather than a single framework-wide constant.

## Overview

- **New `settings.defaultLimit`**: a per-model positive integer used when a query omits `limit`
- **Resolution precedence**: `query.limit ?? settings.defaultLimit ?? DEFAULT_LIMIT (10)`
- **Applies everywhere a default limit applies**: top-level `find()` and every to-many relation (each relation uses its own model's `defaultLimit`)
- **Boot-time validation**: `@model` throws if `defaultLimit` is not a positive integer
- **Independent of `defaultFilter`**: bypassing the default filter via `shouldSkipDefaultFilter` does not drop the default limit

## New Features

### `settings.defaultLimit`

**File:** `packages/core/src/helpers/inversion/common/types.ts`

**Problem:** `DEFAULT_LIMIT` (10) was a hard-coded constant with no per-model override. A small lookup table (e.g. `Country`, `Role`) had to receive an explicit `limit` on every query to return more than 10 rows, while large tables (e.g. `AuditLog`) wanted to keep the conservative cap. The only workaround - putting `limit` inside `defaultFilter` - was semantically muddy and got dropped when `shouldSkipDefaultFilter` was used.

**Solution:** A dedicated, validated `defaultLimit` model setting resolved at the query-building layer, independent of the `where`-oriented `defaultFilter`.

```typescript
import { BaseEntity, model } from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: { defaultLimit: 200 }, // Default to 200 rows when no limit is given
})
export class Country extends BaseEntity<typeof Country.schema> {
  static override schema = pgTable('Country', {
    /* ... */
  });
}

await countryRepo.find({ filter: {} });            // LIMIT 200
await countryRepo.find({ filter: { limit: 10 } }); // LIMIT 10  (explicit wins)
```

For to-many relations, each relation uses **its own model's** `defaultLimit`:

```typescript
// `categories` relation targets a model with defaultLimit: 50
await productRepo.find({
  filter: { include: [{ relation: 'categories' }] }, // categories capped at 50
});
```

**Benefits:**

- Per-model tuning - small lookup tables and large audit tables can each have a sensible default
- No need to repeat `limit` on every query for naturally small tables
- Boot-time validation catches misconfiguration before it reaches the query layer
- Clean separation from `defaultFilter` - not affected by `shouldSkipDefaultFilter`

> [!NOTE]
> There is no "unbounded" sentinel. `defaultLimit` must be a positive integer; to fetch more rows than the default, pass an explicit `limit` in the query.

## Implementation

### Model setting + boot-time validation

**File:** `packages/core/src/base/metadata/persistents.ts`

```typescript
export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    const defaultLimit = metadata.settings?.defaultLimit;
    if (defaultLimit !== undefined && (!Number.isInteger(defaultLimit) || defaultLimit <= 0)) {
      throw getError({
        message: `[model][${target.name}] Invalid 'defaultLimit' | Expected a positive integer | Got: ${defaultLimit}`,
      });
    }
    // ...
  };
};
```

### Top-level default in `find()`

**File:** `packages/core/src/base/repositories/core/readable.ts`

```typescript
const mergedFilter: TFilter<DataObject> = {
  ...baseFilter,
  limit: baseFilter.limit ?? this.getDefaultLimit() ?? DEFAULT_LIMIT,
};
```

`getDefaultLimit()` lives on `DefaultFilterMixin` (cached after first access, like `getDefaultFilter()`).

### To-many relation default in `toInclude()`

**File:** `packages/core/src/base/repositories/operators/filter.ts`

```typescript
const scopedFilter: TFilter =
  relationConfig.type === RelationTypes.MANY
    ? {
        ...mergedScope,
        limit:
          mergedScope.limit ??
          this.resolveDefaultLimit({ schema: relationConfig.schema }) ??
          DEFAULT_LIMIT,
      }
    : mergedScope;
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/helpers/inversion/common/types.ts` | Added `defaultLimit?: number` to `IModelSettings` |
| `src/base/metadata/persistents.ts` | `model()` validates `defaultLimit` is a positive integer at decoration time |
| `src/base/repositories/mixins/default-filter.ts` | Added cached `getDefaultLimit()` reading `settings.defaultLimit` |
| `src/base/repositories/core/readable.ts` | `find()` resolves `query.limit ?? defaultLimit ?? DEFAULT_LIMIT` for the top-level query |
| `src/base/repositories/operators/filter.ts` | Added `resolveDefaultLimit({ schema })`; to-many relation scopes use the relation model's `defaultLimit` |

## No Breaking Changes

`defaultLimit` is opt-in. Models that don't set it keep the existing behavior - the global `DEFAULT_LIMIT` (10). No API changes or migration required.
