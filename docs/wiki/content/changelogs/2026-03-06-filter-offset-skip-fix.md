---
title: Filter Offset/Skip Bug Fix
description: Fixed offset field being ignored in FilterBuilder and removed incorrect .default(0) from Skip/Offset Zod schemas
---

# Changelog - 2026-03-06

## Filter Offset/Skip Bug Fix

Fixed two bugs in the filter/pagination system where the `offset` field was silently ignored and `skip`/`offset` schemas had incorrect `.default(0)` causing unintended pagination behavior.

## Overview

- **Fixed**: `offset` field in filters was not being read by `FilterBuilder` - only `skip` was handled
- **Fixed**: `SkipSchema` and `OffsetSchema` had `.default(0)` which forced pagination offset to 0 even when not provided, interfering with queries that don't use pagination

## Bug Fixes

### 1. `offset` field ignored in FilterBuilder

**File:** `packages/core-server/src/base/repositories/operators/filter.ts`

**Problem:** The `FilterBuilder.build()` method only destructured `skip` from the filter, ignoring the `offset` field entirely. Users passing `{ offset: 20 }` instead of `{ skip: 20 }` would get no pagination offset applied.

**Before:**
```typescript
const { limit, skip, order, fields, where, include } = filter;

return {
  ...(limit !== undefined && { limit }),
  ...(skip !== undefined && { offset: skip }),
  // offset was never read
};
```

**After:**
```typescript
const { limit, skip, offset, order, fields, where, include } = filter;
const effectiveOffset = skip ?? offset;

return {
  ...(limit !== undefined && { limit }),
  ...(effectiveOffset !== undefined && { offset: effectiveOffset }),
};
```

`skip` takes precedence over `offset` when both are provided. Either field now correctly maps to the SQL `OFFSET` clause.

### 2. Incorrect `.default(0)` on Skip/Offset schemas

**File:** `packages/core-server/src/base/repositories/common/types.ts`

**Problem:** `SkipSchema` and `OffsetSchema` used `.default(0)`, which meant any query parsed through these schemas would always have `skip: 0` or `offset: 0` even when the caller didn't provide them. This caused issues when `skip`/`offset` should be `undefined` (no pagination).

**Before:**
```typescript
export const SkipSchema = z.number().optional().default(0).openapi({
  description: 'Number of items to skip for pagination. Default is 0.',
});

export const OffsetSchema = z.number().optional().default(0).openapi({
  description: 'Number of items to offset for pagination. Default is 0.',
});
```

**After:**
```typescript
export const SkipSchema = z.number().optional().openapi({
  description: 'Number of items to skip for pagination.',
});

export const OffsetSchema = z.number().optional().openapi({
  description: 'Number of items to offset for pagination.',
});
```

## Files Changed

### Core Package (`packages/core-server`)

| File | Changes |
|------|---------|
| `src/base/repositories/operators/filter.ts` | Destructure `offset` from filter, use `skip ?? offset` as effective offset |
| `src/base/repositories/common/types.ts` | Removed `.default(0)` from `SkipSchema` and `OffsetSchema` |

## No Breaking Changes

These are bug fixes that correct behavior to match documented intent. The `offset` field was already part of the `TFilter` type but was never handled by `FilterBuilder`. The `.default(0)` removal means queries without explicit pagination will no longer have an implicit `OFFSET 0` - which is the correct SQL behavior (no offset clause).
