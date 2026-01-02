---
title: Nested Relations & Generic Types
description: Added support for deep nested inclusions and generic return types in repositories
---

# Changelog - 2025-12-26

## Nested Relations Support & Generic Repository Types

This update introduces support for deeply nested relation queries in repositories and enables stronger type safety via generic return types.

## Overview

- **Nested Inclusions**: `include` filters now work recursively to any depth.
- **Generic Repository Methods**: `find<R>`, `findOne<R>`, etc. now support custom return types.
- **FilterBuilder Decoupling**: Decoupled filter builder from MetadataRegistry for cleaner architecture.

## New Features

### Nested Relations Support

**File:** `packages/core/src/base/repositories/operators/filter.ts`

**Problem:** Previously, the `FilterBuilder` could only resolve relations for the root entity. Nested includes (e.g., `include: [{ relation: 'a', scope: { include: [{ relation: 'b' }] } }]`) failed because it didn't know the schema of relation 'a'.

**Solution:** The builder now accepts a `relationResolver` function (injected from the Repository) which allows it to dynamically lookup schemas and relations for any entity during recursive traversal.

```typescript
// Now works recursively!
const result = await repo.findOne({
  filter: {
    include: [{
      relation: 'orders',
      scope: {
        include: [{ relation: 'items' }] // Level 2
      }
    }]
  }
});
```

### Generic Repository Methods

**File:** `packages/core/src/base/repositories/common/types.ts`

**Problem:** Repository methods like `findOne` were hardcoded to return the base `DataObject`. When using `include`, the return type didn't reflect the added relations, forcing users to use `as any` or unsafe casts.

**Solution:** All read and write methods now accept a generic type parameter `<R>` which defaults to the entity's schema but can be overridden.

```typescript
// Define expected shape
type UserWithPosts = User & { posts: Post[] };

// Type-safe call
const user = await userRepo.findOne<UserWithPosts>({
  filter: { include: [{ relation: 'posts' }] }
});

// TypeScript knows 'posts' exists!
console.log(user?.posts.length);
```

**Benefits:**
- Stronger type safety in application code.
- Reduces need for `as any` casting.
- Better IDE auto-completion.

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/common/types.ts` | Added generic `<R>` to all repository interface methods |
| `src/base/repositories/core/base.ts` | Implemented `getRelationResolver` and updated abstract signatures |
| `src/base/repositories/core/readable.ts` | Updated `find`, `findOne`, `findById` to support generics |
| `src/base/repositories/core/persistable.ts` | Updated `create`, `update`, `delete` methods to support generics |
| `src/base/repositories/operators/filter.ts` | Added `relationResolver` support for recursive includes |

## Migration Guide

### No Breaking Changes

This update is fully backward compatible.
- Existing calls to repository methods will continue to work (using the default `DataObject` return type).
- The new generic type parameter is optional.
