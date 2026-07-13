---
title: Repository Mixins (Removed)
description: FieldsVisibilityMixin and DefaultFilterMixin were removed - the behavior now lives on AbstractRepository and PostgresBaseRepository
difficulty: intermediate
lastUpdated: 2026-07-06
---

# Repository Mixins <Badge type="danger" text="removed" />

> [!WARNING] Removed
> `FieldsVisibilityMixin` and `DefaultFilterMixin` have been **removed** from IGNIS. They are no longer exported and must not be imported or composed in new code. This page remains as a tombstone documenting where the equivalent behavior now lives.

## What They Were

Before the connectors restructure, `AbstractRepository` composed two mixins onto `BaseHelper`:

| Mixin | Responsibility |
|-------|----------------|
| `FieldsVisibilityMixin` | Hidden-properties exclusion at SQL level (reads `hiddenProperties` from `@model` settings) |
| `DefaultFilterMixin` | Automatic default-filter merging (reads `defaultFilter` from `@model` settings) |

## Where the Behavior Lives Now

The functionality was not dropped - it was folded directly into the repository hierarchy.

### Engine-neutral: `AbstractRepository`

**File:** `packages/core/src/base/repositories/core/abstract.ts`

`AbstractRepository` resolves `@model` settings by class (Reflect target) via `MetadataRegistry` and exposes them as protected getters, memoized after first access:

```typescript
protected get modelSettings(): IModelMetadata['settings'];  // full @model settings
protected get hiddenFields(): string[];                     // settings.hiddenProperties ?? []
protected get defaultWhere(): TWhere | undefined;           // settings.defaultFilter?.where
protected get defaultLimit(): number | undefined;           // settings.defaultLimit
```

### PostgreSQL: `PostgresBaseRepository`

**File:** `packages/core/src/connectors/postgres/repositories/core/base.ts`

Builds on those getters to implement SQL-level column exclusion and full-filter merging for Drizzle:

```typescript
getHiddenProperties(): Set<string>;                       // memoized Set of hiddenFields
hasHiddenProperties(): boolean;
getVisibleProperties(): Record<string, any> | undefined;  // memoized Drizzle column-selection map

getDefaultFilter(): TFilter | undefined;                  // full settings.defaultFilter (where/order/limit/...)
getDefaultLimit(): number | undefined;
hasDefaultFilter(): boolean;
applyDefaultFilter(opts: {
  userFilter?: TFilter;
  shouldSkipDefaultFilter?: boolean;
}): TFilter;                                              // merges via FilterBuilder.mergeFilter
```

Hidden columns are excluded from `select()` and `returning()` calls at query time - the same SQL-level guarantee the mixins provided. The typesense connector implements its own equivalent natively since it is not Drizzle-aware.

## Migration

| Old (mixin) | New |
|-------------|-----|
| `FieldsVisibilityMixin` -> `getHiddenProperties()` | `PostgresBaseRepository.getHiddenProperties()` |
| `FieldsVisibilityMixin` -> `getVisibleProperties()` | `PostgresBaseRepository.getVisibleProperties()` |
| `FieldsVisibilityMixin` -> `hasHiddenProperties()` | `PostgresBaseRepository.hasHiddenProperties()` |
| `DefaultFilterMixin` -> `getDefaultFilter()` | `PostgresBaseRepository.getDefaultFilter()` |
| `DefaultFilterMixin` -> `hasDefaultFilter()` | `PostgresBaseRepository.hasDefaultFilter()` |
| `DefaultFilterMixin` -> `applyDefaultFilter()` | `PostgresBaseRepository.applyDefaultFilter()` |

If you extended `DefaultCRUDRepository` (or any class in the PostgreSQL hierarchy), no change is needed - these methods have always been available on your repository instances; only the internal composition changed.

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

## See Also

- [Repository Overview](./index.md) - Current class hierarchy
- [Advanced Features](./advanced.md) - Hidden properties and default-filter bypass in practice
- [Default Filter](../filter-system/default-filter.md) - Configuring `@model` default filters
