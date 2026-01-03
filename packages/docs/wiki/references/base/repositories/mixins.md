---
title: Repository Mixins
description: Composable mixins for repository functionality
difficulty: intermediate
lastUpdated: 2026-01-02
---

# Repository Mixins <Badge type="tip" text="v0.0.5+" />

Composable mixins that provide reusable functionality for repository classes.

::: info Refactored in v0.0.5
Repository mixins were extracted and refactored in v0.0.5 to provide better composition and reusability.
:::

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
| `DefaultFilterMixin` | Automatic filter application from model settings |
| `FieldsVisibilityMixin` | Hidden properties exclusion |


## DefaultFilterMixin

Provides automatic default filter application for all repository queries.

**File:** `packages/core/src/base/repositories/mixins/default-filter.ts`

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `_defaultFilter` | `TFilter \| null \| undefined` | Cached default filter |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getDefaultFilter()` | `TFilter \| undefined` | Get default filter from model metadata |
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
interface ApplyDefaultFilterOptions {
  userFilter?: TFilter;        // User-provided filter
  shouldSkipDefaultFilter?: boolean; // If true, bypass default filter
}
```

### Implementation

```typescript
applyDefaultFilter<DataObject = any>(opts: {
  userFilter?: TFilter<DataObject>;
  shouldSkipDefaultFilter?: boolean;
}): TFilter<DataObject> {
  const { userFilter, shouldSkipDefaultFilter } = opts;

  // Skip default filter if explicitly requested
  if (shouldSkipDefaultFilter) {
    return userFilter ?? {};
  }

  // Get default filter from model metadata
  const defaultFilter = this.getDefaultFilter();

  // No default filter configured - return user filter
  if (!defaultFilter) {
    return userFilter ?? {};
  }

  // Merge default filter with user filter
  return this.filterBuilder.mergeFilter({ defaultFilter, userFilter });
}
```


## FieldsVisibilityMixin

Provides hidden properties management for SQL-level field exclusion.

**File:** `packages/core/src/base/repositories/mixins/fields-visibility.ts`

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `_hiddenProperties` | `Set<string> \| null` | Cached hidden property names |
| `_visibleProperties` | `Record<string, any> \| null \| undefined` | Cached visible columns |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `get hiddenProperties` | `Set<string>` | Get hidden property names |
| `set hiddenProperties` | `void` | Override hidden properties |
| `getHiddenProperties()` | `Set<string>` | Get hidden properties from model metadata |
| `hasHiddenProperties()` | `boolean` | Check if model has hidden properties |
| `get visibleProperties` | `Record<string, any> \| undefined` | Get visible columns for Drizzle |
| `set visibleProperties` | `void` | Override visible properties |
| `getVisibleProperties()` | `Record<string, any> \| undefined` | Build visible columns object |

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


## Mixin Composition

The `AbstractRepository` composes multiple mixins:

```typescript
export abstract class AbstractRepository<...>
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  implements IPersistableRepository<...>
{
  // Inherits from both mixins:
  // From DefaultFilterMixin:
  //   - getDefaultFilter()
  //   - hasDefaultFilter()
  //   - applyDefaultFilter()
  //
  // From FieldsVisibilityMixin:
  //   - hiddenProperties
  //   - visibleProperties
  //   - getHiddenProperties()
  //   - hasHiddenProperties()
  //   - getVisibleProperties()
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

Follow the TypeScript mixin pattern:

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

Both mixins use caching for performance:

```typescript
// DefaultFilterMixin caching
// null = not computed yet
// undefined = computed, no default filter
// TFilter = computed, has default filter
private _defaultFilter: TFilter | null | undefined = null;

getDefaultFilter() {
  if (this._defaultFilter !== null) {
    return this._defaultFilter;  // Return cached value
  }
  // Compute and cache...
}

// FieldsVisibilityMixin caching
// null = not computed yet
// Set<string> = computed
private _hiddenProperties: Set<string> | null = null;

// null = not computed yet
// undefined = computed, no hidden properties
// Record<string, any> = computed, has hidden properties
private _visibleProperties: Record<string, any> | null | undefined = null;
```


## Quick Reference

| Mixin | Method | Purpose |
|-------|--------|---------|
| `DefaultFilterMixin` | `hasDefaultFilter()` | Check if default filter exists |
| `DefaultFilterMixin` | `getDefaultFilter()` | Get raw default filter |
| `DefaultFilterMixin` | `applyDefaultFilter()` | Merge filters |
| `FieldsVisibilityMixin` | `hasHiddenProperties()` | Check if hidden props exist |
| `FieldsVisibilityMixin` | `getHiddenProperties()` | Get hidden property names |
| `FieldsVisibilityMixin` | `getVisibleProperties()` | Get Drizzle columns object |


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
