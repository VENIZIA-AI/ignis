---
title: Model Authorize Settings
description: Declare authorization principals directly on models via @model settings, with auto-populated AUTHORIZATION_SUBJECT and MetadataRegistry query methods
---

# Changelog - 2026-03-02

## Model Authorize Settings

Models can now declare their authorization principal directly in the `@model` decorator, making the model the single source of truth for permission subjects.

## Overview

- **`IModelAuthorizeSettings`**: New interface for model-level authorization metadata (`principal` + extensible fields)
- **`authorize` field on `@model` settings**: Declare authorization principal alongside hidden properties and default filters
- **`AUTHORIZATION_SUBJECT` auto-population**: The `@model` decorator auto-sets `BaseEntity.AUTHORIZATION_SUBJECT` from `authorize.principal`
- **MetadataRegistry query methods**: `getModelAuthorizeSettings()`, `getAuthorizeModelPrincipals()`, `getAuthorizeModelSettings()` for retrieving authorization metadata

## New Features

### Model-Level Authorization Settings

**Files:**
- `packages/core/src/helpers/inversion/common/types.ts`
- `packages/core/src/base/metadata/persistents.ts`
- `packages/core/src/base/models/base.ts`

**Problem:** Authorization subjects (resources) were raw strings with no connection to the models they represent. Permission configs like `resource: 'Article'` had to be kept in sync manually.

**Solution:** Extend `IModelSettings` with an `authorize` field so models declare their authorization principal directly:

```typescript
import { BaseEntity, model, generateIdColumnDefs, AuthorizationActions } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    authorize: { principal: 'article' },
  },
})
export class Article extends BaseEntity<typeof Article.schema> {
  static override schema = pgTable('Article', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    title: text('title').notNull(),
  });
}

// AUTHORIZATION_SUBJECT is auto-populated from authorize.principal
Article.AUTHORIZATION_SUBJECT; // 'article'

// Use in route configs for type-safe references
authorize: {
  action: AuthorizationActions.READ,
  resource: Article.AUTHORIZATION_SUBJECT,
}
```

**Benefits:**
- Model is the single source of truth for its authorization principal
- `AUTHORIZATION_SUBJECT` is auto-populated — no manual duplication
- Explicit override still wins if set on the class directly
- Extensible via index signature for custom authorization metadata

### MetadataRegistry Query Methods

**File:** `packages/core/src/helpers/inversion/mixins/model.mixin.ts`

Three new methods on `MetadataRegistry` for querying authorization metadata:

#### `getModelAuthorizeSettings`

Get authorize settings for a single model by name:

```typescript
const registry = MetadataRegistry.getInstance();
const settings = registry.getModelAuthorizeSettings({ name: 'Article' });
// { principal: 'article' } | undefined
```

#### `getAuthorizeModelPrincipals`

Get all authorization principals — the clean end-client API:

```typescript
// Flat array of principal names
const principals = registry.getAuthorizeModelPrincipals({ format: 'array' });
// ['article', 'user', 'configuration']

// Record of model name → principal
const principalMap = registry.getAuthorizeModelPrincipals({ format: 'record' });
// { Article: 'article', User: 'user', Configuration: 'configuration' }
```

#### `getAuthorizeModelSettings`

Get full authorize settings with model registry entries — for framework-level code:

```typescript
// Array format
const settings = registry.getAuthorizeModelSettings({ format: 'array' });
// [{ name: 'Article', authorize: { principal: 'article' }, entry: IModelRegistryEntry }]

// Record format
const settingsMap = registry.getAuthorizeModelSettings({ format: 'record' });
// { Article: { authorize: { principal: 'article' }, entry: IModelRegistryEntry } }
```

### `IModelAuthorizeSettings` Interface

```typescript
export interface IModelAuthorizeSettings {
  /** The authorization principal name (resource/subject) for this model. */
  principal: string;
  /** Extensible — consumers can add any extra authorization metadata. */
  [extra: string | symbol]: any;
}
```

### Updated `IModelSettings`

```typescript
export interface IModelSettings {
  hiddenProperties?: string[];
  defaultFilter?: TFilter;
  authorize?: IModelAuthorizeSettings;  // NEW
}
```

### `AUTHORIZATION_SUBJECT` on `BaseEntity`

```typescript
class BaseEntity {
  static AUTHORIZATION_SUBJECT?: string;  // Auto-set by @model decorator
}
```

Auto-population logic in the `@model` decorator:
- If `settings.authorize.principal` is set and `AUTHORIZATION_SUBJECT` is not explicitly defined on the class → auto-populates
- If `AUTHORIZATION_SUBJECT` is explicitly set on the subclass → decorator respects it, no overwrite

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/helpers/inversion/common/types.ts` | Added `IModelAuthorizeSettings` interface, added `authorize?` to `IModelSettings` |
| `src/helpers/inversion/mixins/model.mixin.ts` | Added `getModelAuthorizeSettings()`, `getAuthorizeModelPrincipals()`, `getAuthorizeModelSettings()` methods |
| `src/base/models/base.ts` | Added `static AUTHORIZATION_SUBJECT?: string` to `BaseEntity` |
| `src/base/metadata/persistents.ts` | Auto-populate `AUTHORIZATION_SUBJECT` from `authorize.principal` in `@model` decorator |

## No Breaking Changes

All changes are additive. No API changes or migration required. Existing `@model` decorators without `authorize` settings continue to work unchanged.
