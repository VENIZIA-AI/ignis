---
title: Repository Mixins (Removed)
description: FieldsVisibilityMixin and DefaultFilterMixin were removed - the behavior now lives on AbstractRepository and PostgresBaseRepository
difficulty: intermediate
lastUpdated: 2026-07-06
---

# Repository Mixins <Badge type="danger" text="removed" />

`FieldsVisibilityMixin` and `DefaultFilterMixin` were removed from IGNIS - this page is a tombstone documenting where their behavior lives now. For the current repository hierarchy, start with the [Repositories overview](/references/base/repositories/).

**Files:**

- [`packages/core/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/core/abstract.ts) - `AbstractRepository` - `hiddenFields`/`defaultWhere`/`defaultLimit` getters
- [`packages/core/src/connectors/postgres/repositories/core/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/base.ts) - `RelationalBaseRepository` (alias `PostgresBaseRepository`) - `getHiddenProperties`, `getVisibleProperties`, `getDefaultFilter`, `applyDefaultFilter`

> [!WARNING] Removed
> `FieldsVisibilityMixin` and `DefaultFilterMixin` are no longer exported and must not be imported or composed in new code.

## What They Were

Before the connectors restructure, `AbstractRepository` composed two mixins onto `BaseHelper`:

| Mixin | Responsibility |
|-------|----------------|
| `FieldsVisibilityMixin` | Hidden-properties exclusion at SQL level (reads `hiddenProperties` from `@model` settings) |
| `DefaultFilterMixin` | Automatic default-filter merging (reads `defaultFilter` from `@model` settings) |

## Where the Behavior Lives Now

IGNIS didn't drop the functionality - it folded it directly into the repository hierarchy.

### Engine-neutral: `AbstractRepository`

`AbstractRepository` resolves `@model` settings by class (Reflect target) via `MetadataRegistry` and exposes them as protected getters, memoized after first access:

```typescript
protected get modelSettings(): IModelMetadata['settings'];  // full @model settings
protected get hiddenFields(): string[];                     // settings.hiddenProperties ?? []
protected get defaultWhere(): TWhere | undefined;           // settings.defaultFilter?.where
protected get defaultLimit(): number | undefined;           // settings.defaultLimit
```

### PostgreSQL: `RelationalBaseRepository`

Builds on those getters to implement SQL-level column exclusion and full-filter merging for Drizzle:

```typescript
getHiddenProperties(): Set<string>;                       // memoized Set of hiddenFields
hasHiddenProperties(): boolean;
getVisibleProperties(): Record<string, any> | undefined;  // memoized Drizzle column-selection map

getDefaultFilter(): TFilter | undefined;                  // settings.defaultFilter
getDefaultLimit(): number | undefined;
hasDefaultFilter(): boolean;
applyDefaultFilter(opts: {
  userFilter?: TFilter;
  shouldSkipDefaultFilter?: boolean;
}): TFilter;                                              // merges via queryDialect.mergeFilter
```

The query builder excludes hidden columns from `select()` and `returning()` calls at query time - the same SQL-level guarantee the mixins provided. The typesense connector implements its own equivalent natively, since it is not Drizzle-aware.

## Migration

| Old (mixin) | New |
|-------------|-----|
| `FieldsVisibilityMixin` -> `getHiddenProperties()` | `RelationalBaseRepository.getHiddenProperties()` |
| `FieldsVisibilityMixin` -> `getVisibleProperties()` | `RelationalBaseRepository.getVisibleProperties()` |
| `FieldsVisibilityMixin` -> `hasHiddenProperties()` | `RelationalBaseRepository.hasHiddenProperties()` |
| `DefaultFilterMixin` -> `getDefaultFilter()` | `RelationalBaseRepository.getDefaultFilter()` |
| `DefaultFilterMixin` -> `hasDefaultFilter()` | `RelationalBaseRepository.hasDefaultFilter()` |
| `DefaultFilterMixin` -> `applyDefaultFilter()` | `RelationalBaseRepository.applyDefaultFilter()` |

If you extended `DefaultCRUDRepository` (or any class in the PostgreSQL hierarchy), you don't need to change anything - these methods have always been available on your repository instances. Only the internal composition changed.

## Custom Mixins Still Work

The mixin *pattern* remains a valid technique for your own repository code, via `TMixinTarget` from `@venizia/ignis-helpers`:

```typescript
import { TMixinTarget } from '@venizia/ignis-helpers';

export const AuditLogMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  class Mixed extends baseClass {
    logOperation(opts: { operation: string; data: unknown }): void {
      // custom behavior
    }
  }
  return Mixed;
};

export class ProductRepository extends AuditLogMixin(
  DefaultCRUDRepository<typeof Product.schema>,
) {}
```

## See also

- [Repositories overview](/references/base/repositories/) - CRUD basics, common tasks
- [Advanced Features](./advanced) - hidden properties and default-filter bypass in practice
- [SoftDeletableRepository](./soft-deletable) - concrete default-filter usage (soft delete)
- [Default Filter](/references/base/filter-system/default-filter) - configuring `@model` default filters
