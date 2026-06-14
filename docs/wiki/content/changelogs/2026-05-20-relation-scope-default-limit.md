---
title: Consistent Default Limit for To-Many Relations
description: To-many relations are now capped at DEFAULT_LIMIT by default (with or without order); default limit moved out of the Zod schema into the query layer
---

# Changelog - 2026-05-20

## Consistent Default Limit for To-Many Relations

The default pagination limit (`DEFAULT_LIMIT` = 10) is now applied **consistently** at the query-building layer: to the top-level query and to every **to-many** relation. The schema-level Zod default was removed because it leaked into relation scopes inconsistently - present when a `scope` existed, absent when it didn't.

## Overview

- **Schema default removed**: `LimitSchema` no longer carries a Zod `.default(10)`
- **Top-level default in `find()`**: `ReadableRepository.find()` applies `DEFAULT_LIMIT` to the top-level query when no `limit` is given
- **To-many relations default in `toInclude()`**: every `hasMany` relation is capped at `DEFAULT_LIMIT` unless its scope sets an explicit `limit`
- **To-one relations are never limited**: `hasOne`/`belongsTo` relations are returned as-is
- **`order` now behaves predictably in scopes**: adding `order` to a relation scope no longer changes whether a limit is applied

## Breaking Changes

> [!WARNING]
> To-many relations included via `include` are now capped at `DEFAULT_LIMIT` (10) by default. Code that relied on a relation returning **all** rows must pass an explicit `limit` in the relation scope.

### Background - the inconsistency

Previously `LimitSchema` had `.default(DEFAULT_LIMIT)`. Zod only fills a default into a value that exists, so the limit appeared **only when a `scope` object was present**:

**Before:**
```jsonc
// no scope -> relation returned ALL rows (no limit)
{ "include": [{ "relation": "categories" }] }

// scope present (e.g. just adding order) -> relation capped at 10
{ "include": [{ "relation": "categories", "scope": { "order": ["createdAt DESC"] } }] }
```

Adding an `order` clause silently changed the result count - a confusing footgun.

**After:**
```jsonc
// Both forms now cap to-many relations at DEFAULT_LIMIT (10)
{ "include": [{ "relation": "categories" }] }
{ "include": [{ "relation": "categories", "scope": { "order": ["createdAt DESC"] } }] }

// Opt out / change the cap with an explicit limit
{ "include": [{ "relation": "categories", "scope": { "limit": 1000 } }] }
```

### Migration

For relations where you want every related row, set an explicit (large) `limit` in the scope:

```typescript
await repo.find({
  filter: {
    include: [{ relation: 'categories', scope: { limit: 1000, order: ['createdAt DESC'] } }],
  },
});
```

## Implementation

### Default removed from the schema

**File:** `packages/core/src/base/repositories/common/types.ts`

```typescript
// Before: .default(DEFAULT_LIMIT) leaked into every scope object
// After: no schema default - limit is applied in the query layer
export const LimitSchema = z.number().optional().openapi({
  description: 'Maximum number of items to return. Defaults to 10 for top-level list queries.',
});
```

### Top-level default in `find()`

**File:** `packages/core/src/base/repositories/core/readable.ts`

```typescript
const baseFilter = this.applyDefaultFilter({ userFilter: filter, shouldSkipDefaultFilter });
const mergedFilter: TFilter<DataObject> = {
  ...baseFilter,
  limit: baseFilter.limit ?? DEFAULT_LIMIT, // top-level query only
};
```

### To-many default in `toInclude()`

**File:** `packages/core/src/base/repositories/operators/filter.ts`

```typescript
const mergedScope = this.mergeFilter({ defaultFilter, userFilter: scope });

// To-many relations are paginated with DEFAULT_LIMIT unless the scope sets an
// explicit limit. To-one relations are never limited.
const scopedFilter: TFilter =
  relationConfig.type === RelationTypes.MANY
    ? { ...mergedScope, limit: mergedScope.limit ?? DEFAULT_LIMIT }
    : mergedScope;
```

> [!NOTE]
> Drizzle applies a per-relation `limit` to to-many relations via a lateral join/subquery. Applying a limit to a to-one relation is meaningless, so the cap is intentionally restricted to `RelationTypes.MANY`.

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/common/types.ts` | Removed `.default(DEFAULT_LIMIT)` from `LimitSchema`; dropped now-unused `DEFAULT_LIMIT` import |
| `src/base/repositories/core/readable.ts` | `find()` applies `DEFAULT_LIMIT` to the top-level query only |
| `src/base/repositories/operators/filter.ts` | `toInclude()` caps to-many relation scopes at `DEFAULT_LIMIT`; to-one relations untouched |

## Migration Guide

> [!NOTE]
> Only needed if you include to-many relations and expect more than 10 related rows.

### Step 1: Audit `include` usage

Find queries that include to-many relations without a scope `limit`.

### Step 2: Add explicit `limit` where you need more than 10

```typescript
// Before - implicitly returned all related rows
{ include: [{ relation: 'orders' }] }

// After - request the count you actually need
{ include: [{ relation: 'orders', scope: { limit: 500 } }] }
```
