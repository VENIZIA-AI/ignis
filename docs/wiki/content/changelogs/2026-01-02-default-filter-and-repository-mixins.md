---
title: Default Filter & Repository Mixins
description: Added default filter support for models and refactored repository architecture with composable mixins
---

# Changelog - 2026-01-02

## Default Filter & Repository Mixins

This release introduces **Default Filter** - a powerful feature that automatically applies predefined filter conditions to all repository queries. Additionally, the repository architecture has been refactored to use composable mixins for better code organization and reusability.

## Overview

- **Default Filter**: Configure automatic filter conditions at the model level (e.g., soft delete, tenant isolation)
- **Skip Default Filter**: Bypass default filters with `shouldSkipDefaultFilter: true` for admin/maintenance operations
- **Repository Mixins**: Extracted `DefaultFilterMixin` and `FieldsVisibilityMixin` for composable repository features
- **FilterBuilder Enhancement**: Renamed `DrizzleFilterBuilder` to `FilterBuilder`, added `mergeFilter` method
- **IExtraOptions Interface**: New interface replacing `TTransactionOption` with `shouldSkipDefaultFilter` support

## New Features

### Default Filter

**Files:**
- `packages/core/src/base/repositories/mixins/default-filter.ts`
- `packages/core/src/base/repositories/operators/filter.ts`

**Problem:** Applications often need to apply the same filter conditions to every query - soft delete (`isDeleted: false`), tenant isolation (`tenantId: 'xxx'`), or active record patterns. Without a centralized solution, developers must manually add these conditions to every repository call.

**Solution:** Configure a `defaultFilter` in your model settings. The repository automatically merges this filter with user-provided filters for all read, update, and delete operations.

```typescript
// Model configuration with default filter
@model({
  type: 'entity',
  settings: {
    // Automatically applied to all queries
    defaultFilter: {
      where: { isDeleted: false },
      limit: 100,  // Prevent unbounded queries
    },
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}
```

**Automatic Application:**

```typescript
// User query - default filter automatically merged
await userRepo.find({
  filter: { where: { status: 'active' } }
});
// Actual query: WHERE isDeleted = false AND status = 'active' LIMIT 100

// Default filter also applies to count, update, delete
await userRepo.count({ where: { role: 'admin' } });
// Actual query: WHERE isDeleted = false AND role = 'admin'
```

**Filter Merge Strategy:**

| Property | Strategy |
|----------|----------|
| `where` | Deep merge (user overrides matching keys) |
| `limit` | User replaces default (if provided) |
| `offset`/`skip` | User replaces default (if provided) |
| `order` | User replaces default (if provided) |
| `fields` | User replaces default (if provided) |
| `include` | User replaces default (if provided) |

```typescript
// Default: { where: { isDeleted: false, status: 'pending' }, limit: 100 }
// User: { where: { status: 'active' }, limit: 10 }
// Result: { where: { isDeleted: false, status: 'active' }, limit: 10 }
```

### Skip Default Filter

**Problem:** Admin users or maintenance scripts sometimes need to query all records, including soft-deleted ones or records from all tenants.

**Solution:** Pass `shouldSkipDefaultFilter: true` in the options to bypass the default filter:

```typescript
// Normal query - default filter applies
await repo.find({ filter: { where: { role: 'admin' } } });
// WHERE isDeleted = false AND role = 'admin'

// Admin query - bypass default filter
await repo.find({
  filter: { where: { role: 'admin' } },
  options: { shouldSkipDefaultFilter: true }
});
// WHERE role = 'admin' (includes deleted records)

// Works with all operations
await repo.count({ where: {}, options: { shouldSkipDefaultFilter: true } });
await repo.updateAll({
  where: { status: 'archived' },
  data: { isDeleted: true },
  options: { shouldSkipDefaultFilter: true }
});
await repo.deleteAll({
  where: { createdAt: { lt: '2020-01-01' } },
  options: { shouldSkipDefaultFilter: true, force: true }
});
```

**Benefits:**
- Automatic soft-delete filtering without manual `where` additions
- Multi-tenant isolation at the data layer
- Consistent query behavior across the application
- Easy bypass for admin/maintenance operations

### Repository Mixins

**Files:**
- `packages/core/src/base/repositories/mixins/default-filter.ts`
- `packages/core/src/base/repositories/mixins/fields-visibility.ts`
- `packages/core/src/base/repositories/mixins/index.ts`

**Problem:** Repository base classes were becoming monolithic with multiple concerns (hidden properties, default filters, transaction handling) mixed together.

**Solution:** Extract cross-cutting concerns into composable mixins:

```typescript
// DefaultFilterMixin - Provides default filter functionality
export const DefaultFilterMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    getDefaultFilter(): TFilter | undefined;
    hasDefaultFilter(): boolean;
    applyDefaultFilter(opts: { userFilter?: TFilter; shouldSkipDefaultFilter?: boolean }): TFilter;
  }
  return Mixed;
};

// FieldsVisibilityMixin - Provides hidden properties functionality
export const FieldsVisibilityMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    get hiddenProperties(): Set<string>;
    get visibleProperties(): Record<string, any> | undefined;
    getHiddenProperties(): Set<string>;
    hasHiddenProperties(): boolean;
    getVisibleProperties(): Record<string, any> | undefined;
  }
  return Mixed;
};
```

**Usage in AbstractRepository:**

```typescript
export abstract class AbstractRepository<...>
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  implements IPersistableRepository<...>
{
  // Mixins provide getDefaultFilter, applyDefaultFilter,
  // getHiddenProperties, getVisibleProperties, etc.
}
```

**Benefits:**
- Separation of concerns
- Reusable logic across different repository types
- Easier testing of individual features
- Clear dependency chain

### IExtraOptions Interface

**File:** `packages/core/src/base/repositories/common/types.ts`

**Problem:** The `TTransactionOption` type only supported `transaction` option. With the new default filter feature, we need additional options.

**Solution:** Introduced `IExtraOptions` interface that extends beyond transactions:

```typescript
// New interface
export interface IExtraOptions extends IWithTransaction {
  /**
   * If true, bypass the default filter configured in model settings.
   * Use this when you need to query all records regardless of default filter constraints.
   */
  shouldSkipDefaultFilter?: boolean;
}

// Base transaction interface
export interface IWithTransaction {
  transaction?: ITransaction;
}

// Deprecated alias for backward compatibility
/** @deprecated Use IExtraOptions instead */
export type TTransactionOption = IExtraOptions;
```

### FilterBuilder Enhancements

**File:** `packages/core/src/base/repositories/operators/filter.ts`

**Changes:**
- Renamed `DrizzleFilterBuilder` to `FilterBuilder`
- Added `mergeFilter` method for combining default and user filters
- Added `resolveHiddenProperties` and `resolveRelations` methods
- Simplified `build` method signature (relations resolved internally)

```typescript
// New mergeFilter method
const filterBuilder = new FilterBuilder();

const result = filterBuilder.mergeFilter({
  defaultFilter: { where: { isDeleted: false }, limit: 100 },
  userFilter: { where: { status: 'active' }, limit: 10 }
});
// Result: { where: { isDeleted: false, status: 'active' }, limit: 10 }
```

**Internal Changes:**
- Relations now resolved internally via `resolveRelations` method
- Hidden properties resolved via `resolveHiddenProperties` method
- Simplified API for `build` method (no need to pass resolvers)

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/mixins/default-filter.ts` | **NEW** - DefaultFilterMixin implementation |
| `src/base/repositories/mixins/fields-visibility.ts` | **NEW** - FieldsVisibilityMixin implementation |
| `src/base/repositories/mixins/index.ts` | **NEW** - Barrel export for mixins |
| `src/base/repositories/common/types.ts` | Added `IExtraOptions`, `IWithTransaction` interfaces |
| `src/base/repositories/core/base.ts` | Refactored to use mixins, updated method signatures |
| `src/base/repositories/core/readable.ts` | Added `applyDefaultFilter` calls to read operations |
| `src/base/repositories/core/persistable.ts` | Added `applyDefaultFilter` calls to update/delete |
| `src/base/repositories/core/default-crud.ts` | Updated type parameters |
| `src/base/repositories/operators/filter.ts` | Renamed to `FilterBuilder`, added `mergeFilter` |
| `src/helpers/inversion/common/types.ts` | Added `defaultFilter` to model settings type |

### Tests (`packages/core/src/__tests__`)

| File | Changes |
|------|---------|
| `default-filter/default-filter.test.ts` | **NEW** - Comprehensive test suite (150+ test cases) |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/services/tests/default-filter-test.service.ts` | **NEW** - Integration test service |
| `src/services/tests/TEST_CASES.md` | **NEW** - Test case documentation |

## Breaking Changes

### DrizzleFilterBuilder Renamed to FilterBuilder

**Before:**
```typescript
import { DrizzleFilterBuilder } from '@venizia/ignis';
const builder = new DrizzleFilterBuilder();
```

**After:**
```typescript
import { FilterBuilder } from '@venizia/ignis';
const builder = new FilterBuilder();
```

### FilterBuilder.build() Signature Changed

**Before:**
```typescript
filterBuilder.build({
  tableName: 'users',
  schema: userSchema,
  relations: { posts: { ... } },
  filter: myFilter,
  relationResolver: (schema) => { ... },
  hiddenPropertiesResolver: (relationName) => { ... },
});
```

**After:**
```typescript
// Relations and hidden properties resolved internally
filterBuilder.build({
  tableName: 'users',
  schema: userSchema,
  filter: myFilter,
});
```

### TTransactionOption Deprecated

**Before:**
```typescript
import { TTransactionOption } from '@venizia/ignis';

class MyRepo extends AbstractRepository<Schema, Data, Persist, TTransactionOption> {}
```

**After:**
```typescript
import { IExtraOptions } from '@venizia/ignis';

class MyRepo extends AbstractRepository<Schema, Data, Persist, IExtraOptions> {}
```

## Migration Guide

### Step 1: Update FilterBuilder Usage

If you're using `DrizzleFilterBuilder` directly (rare), rename to `FilterBuilder`:

```typescript
// Before
import { DrizzleFilterBuilder } from '@venizia/ignis';

// After
import { FilterBuilder } from '@venizia/ignis';
```

### Step 2: Update Custom Repository Generic Types

If you have custom repositories with explicit generic types:

```typescript
// Before
class MyRepo extends PersistableRepository<Schema, Data, Persist, TTransactionOption> {}

// After
class MyRepo extends PersistableRepository<Schema, Data, Persist, IExtraOptions> {}
```

### Step 3: Add Default Filters to Models (Optional)

To enable automatic filtering, add `defaultFilter` to your model settings:

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { isDeleted: false },
    },
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}
```

## Common Use Cases

### Soft Delete Pattern

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { deletedAt: null },  // or { isDeleted: false }
    },
  },
})
export class Post extends BaseEntity<typeof Post.schema> {}

// All queries automatically exclude deleted posts
await postRepo.find({ filter: { where: { published: true } } });
// WHERE deletedAt IS NULL AND published = true

// Restore deleted post (bypass default filter)
await postRepo.updateById({
  id: postId,
  data: { deletedAt: null },
  options: { shouldSkipDefaultFilter: true }
});
```

### Multi-Tenant Isolation

```typescript
// Note: tenantId would be injected per-request in real applications
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { tenantId: 'current-tenant-id' },
    },
  },
})
export class Document extends BaseEntity<typeof Document.schema> {}
```

### Active Records Only

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: {
        isActive: true,
        expiresAt: { gt: new Date().toISOString() },
      },
      limit: 50,  // Prevent unbounded queries
    },
  },
})
export class Subscription extends BaseEntity<typeof Subscription.schema> {}
```

## Documentation

- [Default Filter Guide](/references/base/filter-system/default-filter) - Full documentation
- [Repository Mixins](/references/base/repositories/mixins) - Mixin architecture
- [Advanced Repository Features](/references/base/repositories/advanced) - Updated with shouldSkipDefaultFilter
