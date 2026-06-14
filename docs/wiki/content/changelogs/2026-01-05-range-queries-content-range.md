---
title: Range Queries & Content-Range Header
description: Added shouldQueryRange option for paginated API responses with HTTP Content-Range standard support
---

# Changelog - 2026-01-05

## Range Queries & Content-Range Header

This release adds the `shouldQueryRange` option to the `find()` method, enabling paginated API responses with range information following the HTTP Content-Range header standard.

## Overview

- **shouldQueryRange Option**: New option for `find()` that returns data with range information
- **TDataRange Type**: New type for pagination range data (`start`, `end`, `total`)
- **HTTP Content-Range Standard**: Range format follows RFC 7233 for compatibility with browsers and HTTP clients
- **Parallel Execution**: Count and data queries run in parallel for optimal performance

## New Features

### shouldQueryRange Option

**Files:**
- `packages/core/src/base/repositories/common/types.ts`
- `packages/core/src/base/repositories/core/readable.ts`
- `packages/core/src/base/repositories/core/abstract.ts`

**Problem:** When building paginated APIs, you often need to return both the data and total count for pagination UI (showing "Page 1 of 10" or "Showing 1-20 of 200 results"). Previously, this required two separate queries.

**Solution:** Pass `shouldQueryRange: true` to get range information alongside the data:

```typescript
// Without range (default behavior)
const users = await userRepo.find({
  filter: { limit: 10, skip: 20 }
});
// Returns: Array<User>

// With range information
const result = await userRepo.find({
  filter: { limit: 10, skip: 20 },
  options: { shouldQueryRange: true }
});
// Returns: { data: Array<User>, range: TDataRange }
```

**Benefits:**
- Single method call returns both data and count
- Count query runs in parallel with data fetch (no performance penalty)
- Range format follows HTTP Content-Range standard
- Easy to set HTTP headers for RESTful APIs

### TDataRange Type

**File:** `packages/core/src/base/repositories/common/types.ts`

New type for range information following HTTP Content-Range standard:

```typescript
type TDataRange = {
  start: number;  // Starting index (0-based, inclusive)
  end: number;    // Ending index (0-based, inclusive)
  total: number;  // Total count matching the query
};
```

**HTTP Content-Range Header Format:**

```typescript
const { data, range } = await repo.find({
  filter: { limit: 10, skip: 20 },
  options: { shouldQueryRange: true }
});

// Format: "unit start-end/total"
const contentRange = data.length > 0
  ? `records ${range.start}-${range.end}/${range.total}`
  : `records */${range.total}`;

res.setHeader('Content-Range', contentRange);
// → "records 20-29/100"
```

| Scenario | Content-Range Header |
|----------|---------------------|
| Items 0-9 of 100 | `records 0-9/100` |
| Items 20-29 of 100 | `records 20-29/100` |
| No items found | `records */0` |
| Last page (90-99) | `records 90-99/100` |

### Performance Optimization

When `shouldQueryRange: true`, the repository uses `Promise.all` to run the data query and count query in parallel:

```typescript
// Runs in parallel - no extra latency
const [data, { count: total }] = await Promise.all([
  dataPromise,
  this.count({ where: mergedFilter.where ?? {}, options: effectiveOptions }),
]);
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/common/types.ts` | Added `TDataRange` type, updated `IReadableRepository.find()` overloads |
| `src/base/repositories/core/abstract.ts` | Added abstract `find()` overload for `shouldQueryRange: true` |
| `src/base/repositories/core/readable.ts` | Implemented `shouldQueryRange` logic with parallel execution |
| `src/base/controllers/factory/controller.ts` | Updated to use `shouldQueryRange` and set `Content-Range` header |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/common/constants/http.ts` | Added `CONTENT_RANGE` header constant |

## No Breaking Changes

All changes are additive. The default behavior of `find()` remains unchanged:

```typescript
// Still works exactly as before
const users = await repo.find({ filter: { where: { active: true } } });
// Returns: Array<User>
```

The new `shouldQueryRange` option is opt-in only.

## Usage Examples

### Basic Pagination API

```typescript
// In your controller
async list(req, res) {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;

  const { data, range } = await this.repo.find({
    filter: {
      where: req.query.filter,
      limit: pageSize,
      skip: (page - 1) * pageSize,
      order: ['createdAt DESC']
    },
    options: { shouldQueryRange: true }
  });

  res.setHeader('Content-Range', `records ${range.start}-${range.end}/${range.total}`);
  return res.json({
    data,
    pagination: {
      page,
      pageSize,
      totalPages: Math.ceil(range.total / pageSize),
      totalItems: range.total
    }
  });
}
```

### React Admin / Data Grid Integration

Many data grid libraries expect the `Content-Range` header for pagination:

```typescript
// Server response
res.setHeader('Content-Range', `records 0-24/100`);
res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
return res.json(data);

// Client can read the header
const response = await fetch('/api/users?limit=25&skip=0');
const contentRange = response.headers.get('Content-Range');
// → "records 0-24/100"
```

## Documentation

- [Fields, Order & Pagination](/references/base/filter-system/fields-order-pagination) - Range Queries section added
- [Repositories Overview](/references/base/repositories/) - Updated method tables
