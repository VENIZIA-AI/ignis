---
title: Repository Mixins
description: Composable mixins for repository functionality
difficulty: intermediate
lastUpdated: 2026-01-02
---

# Repository Mixins <Badge type="tip" text="v0.0.5+" />

Composable mixins that provide reusable functionality for repository classes.

> [!NOTE] Refactored in v0.0.5
> Repository mixins were extracted and refactored in v0.0.5 to provide better composition and reusability.

**Files:** `packages/core/src/base/repositories/mixins/`


## Overview

Ignis uses the mixin pattern to compose repository features. This enables:

- **Separation of concerns** - Each mixin handles one responsibility
- **Reusability** - Mixins can be applied to different base classes
- **Testability** - Individual features can be tested in isolation
- **Flexibility** - Create custom repositories with only needed features


## Available Mixins

| Mixin | Responsibility |
|-------|----------------|
| `FieldsVisibilityMixin` | Hidden properties exclusion at SQL level |
| `DefaultFilterMixin` | Automatic filter application from model settings |


## FieldsVisibilityMixin

Provides hidden properties management for SQL-level field exclusion. Reads `hiddenProperties` from `@model` metadata settings and builds a visible columns map for Drizzle's `select()` and `returning()` calls.

**File:** `packages/core/src/base/repositories/mixins/fields-visibility.ts`

### Abstract Requirements

Classes using this mixin must implement:

```typescript
abstract getEntity(): BaseEntity<TTableSchemaWithId>;
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `_hiddenProperties` | `Set<string> \| null` | Cached hidden property names (`null` = not yet computed) |
| `_visibleProperties` | `Record<string, any> \| null \| undefined` | Cached visible columns (`null` = not yet computed, `undefined` = computed with no hidden props) |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `get hiddenProperties` | `Set<string>` | Getter that delegates to `getHiddenProperties()` |
| `set hiddenProperties` | `void` | Override hidden properties set |
| `getHiddenProperties()` | `Set<string>` | Get hidden properties from model metadata (cached) |
| `hasHiddenProperties()` | `boolean` | Check if model has any hidden properties |
| `get visibleProperties` | `Record<string, any> \| undefined` | Getter that delegates to `getVisibleProperties()` |
| `set visibleProperties` | `void` | Override visible properties |
| `getVisibleProperties()` | `Record<string, any> \| undefined` | Build visible columns object for Drizzle (cached). Returns `undefined` if no hidden props. |

### Usage

```typescript
import { FieldsVisibilityMixin } from '@venizia/ignis';
import { BaseHelper } from '@venizia/ignis-helpers';

class MyRepository extends FieldsVisibilityMixin(BaseHelper) {
  // Required abstract implementation
  abstract getEntity(): BaseEntity;

  // Now has access to:
  // - hiddenProperties (getter/setter)
  // - visibleProperties (getter/setter)
  // - getHiddenProperties()
  // - hasHiddenProperties()
  // - getVisibleProperties()
}
```

### Visible Properties for Drizzle

The `getVisibleProperties()` method returns a columns object for Drizzle's `select()` or `returning()`:

```typescript
// Model with hiddenProperties: ['password', 'apiKey']
// Schema columns: { id, email, password, apiKey, createdAt }

const visibleProps = this.getVisibleProperties();
// Result: { id: column, email: column, createdAt: column }
// (password and apiKey excluded)

// Used in Drizzle queries
await connector.select(visibleProps).from(schema);
// SELECT id, email, created_at FROM users
```

### How It Resolves Hidden Properties

1. Checks the cache (`_hiddenProperties`). If not `null`, returns cached value.
2. Looks up the entity name in `MetadataRegistry.getModelEntry()`.
3. Reads `metadata.settings.hiddenProperties` (array of field names).
4. Converts to a `Set<string>` and caches.


## DefaultFilterMixin

Provides automatic default filter application for all repository queries. Reads `defaultFilter` from `@model` metadata settings and merges it with user-provided filters.

**File:** `packages/core/src/base/repositories/mixins/default-filter.ts`

### Abstract Requirements

Classes using this mixin must implement:

```typescript
abstract getEntity(): BaseEntity<TTableSchemaWithId>;
abstract get filterBuilder(): FilterBuilder;
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `_defaultFilter` | `TFilter \| null \| undefined` | Cached default filter (`null` = not yet computed, `undefined` = computed with no default filter) |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getDefaultFilter()` | `TFilter \| undefined` | Get default filter from model metadata (cached) |
| `hasDefaultFilter()` | `boolean` | Check if model has a default filter configured |
| `applyDefaultFilter(opts)` | `TFilter` | Merge default filter with user filter |

### Usage

```typescript
import { DefaultFilterMixin } from '@venizia/ignis';
import { BaseHelper } from '@venizia/ignis-helpers';

class MyRepository extends DefaultFilterMixin(BaseHelper) {
  // Required abstract implementations
  abstract getEntity(): BaseEntity;
  abstract get filterBuilder(): FilterBuilder;

  // Now has access to:
  // - getDefaultFilter()
  // - hasDefaultFilter()
  // - applyDefaultFilter()
}
```

### applyDefaultFilter Options

```typescript
applyDefaultFilter<DataObject = any>(opts: {
  userFilter?: TFilter<DataObject>;        // User-provided filter
  shouldSkipDefaultFilter?: boolean;       // If true, bypass default filter
}): TFilter<DataObject>
```

**Behavior:**

1. If `shouldSkipDefaultFilter` is `true`, returns the user filter as-is (or `{}` if none).
2. If no default filter is configured, returns the user filter as-is (or `{}` if none).
3. Otherwise, delegates to `filterBuilder.mergeFilter({ defaultFilter, userFilter })` which deep-merges `where` conditions and uses user values for other filter properties (`order`, `limit`, `offset`, `skip`, `fields`, `include`).


## Mixin Composition

The `AbstractRepository` composes both mixins:

```typescript
export abstract class AbstractRepository<...>
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  implements IPersistableRepository<...>
{
  // Inherits from both mixins:
  // From FieldsVisibilityMixin:
  //   - hiddenProperties (getter/setter)
  //   - visibleProperties (getter/setter)
  //   - getHiddenProperties()
  //   - hasHiddenProperties()
  //   - getVisibleProperties()
  //
  // From DefaultFilterMixin:
  //   - getDefaultFilter()
  //   - hasDefaultFilter()
  //   - applyDefaultFilter()
}
```

### Composition Order

Mixins are applied right-to-left:

```typescript
// FieldsVisibilityMixin applied first (to BaseHelper)
// DefaultFilterMixin applied second (to the result)
DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
```


## Creating Custom Mixins

Follow the TypeScript mixin pattern using `TMixinTarget`:

```typescript
import { TMixinTarget } from '@venizia/ignis-helpers';

export const AuditLogMixin = <T extends TMixinTarget<object>>(baseClass: T) => {
  abstract class Mixed extends baseClass {
    // Properties
    private _auditEnabled: boolean = true;

    // Abstract dependencies (if needed)
    abstract getEntity(): BaseEntity;

    // Public methods
    enableAudit(): void {
      this._auditEnabled = true;
    }

    disableAudit(): void {
      this._auditEnabled = false;
    }

    isAuditEnabled(): boolean {
      return this._auditEnabled;
    }

    logOperation(operation: string, data: any): void {
      if (this._auditEnabled) {
        console.log(`[${this.getEntity().name}] ${operation}:`, data);
      }
    }
  }

  return Mixed;
};
```

### Using Custom Mixins

```typescript
// Compose with existing mixins
class MyRepository extends AuditLogMixin(DefaultFilterMixin(BaseHelper)) {
  getEntity() {
    return this._entity;
  }

  get filterBuilder() {
    return this._filterBuilder;
  }
}

// Or create a composed base
const AuditableRepository = AuditLogMixin(DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper)));

class ProductRepository extends AuditableRepository {
  // Has all mixin functionality
}
```


## Caching Behavior

Both mixins use a three-state caching pattern for performance:

```typescript
// DefaultFilterMixin caching
// null = not computed yet
// undefined = computed, no default filter exists
// TFilter = computed, has default filter
_defaultFilter: TFilter | null | undefined = null;

getDefaultFilter() {
  if (this._defaultFilter !== null) {
    return this._defaultFilter;  // Return cached value (either TFilter or undefined)
  }
  // Compute from MetadataRegistry and cache...
}

// FieldsVisibilityMixin caching
// null = not computed yet
// Set<string> = computed (may be empty)
_hiddenProperties: Set<string> | null = null;

// null = not computed yet
// undefined = computed, no hidden properties exist
// Record<string, any> = computed, has visible column map
_visibleProperties: Record<string, any> | null | undefined = null;
```

This ensures metadata lookups happen only once per repository instance, with subsequent calls returning the cached value.


## Quick Reference

| Mixin | Method | Purpose |
|-------|--------|---------|
| `FieldsVisibilityMixin` | `hasHiddenProperties()` | Check if hidden props exist |
| `FieldsVisibilityMixin` | `getHiddenProperties()` | Get hidden property names as `Set<string>` |
| `FieldsVisibilityMixin` | `getVisibleProperties()` | Get Drizzle columns object (excludes hidden) |
| `DefaultFilterMixin` | `hasDefaultFilter()` | Check if default filter exists |
| `DefaultFilterMixin` | `getDefaultFilter()` | Get raw default filter from model metadata |
| `DefaultFilterMixin` | `applyDefaultFilter()` | Merge default filter with user filter |


## Next Steps

- [Default Filter](../filter-system/default-filter.md) - Full default filter documentation
- [Advanced Features](./advanced.md) - Hidden properties usage
- [Repository Overview](./index.md) - Repository basics

## See Also

- **Related Concepts:**
  - [Repositories Overview](./index) - Core repository operations
  - [Models](/guides/core-concepts/persistent/models) - Entity definitions

- **Related Topics:**
  - [Default Filter](../filter-system/default-filter) - Automatic filtering
  - [Advanced Features](./advanced) - Hidden properties and transactions
  - [Relations & Includes](./relations) - Loading related data

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - Soft delete patterns
