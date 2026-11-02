---
title: The old @model settings keys and devz codemod model-settings are removed
description: "@model no longer throws for defaultFilter, defaultLimit, maxLimit, scopeFilter or skipMigrate and ignores them; the types refuse them as excess properties, so a typed model fails the typecheck. devz codemod model-settings is removed."
packages: ['@venizia/ignis-kernel', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-03

## The old @model settings keys and devz codemod model-settings are removed

<Badge type="warning" text="Breaking Change" />

**In one line.** A typed `@model` that still writes `defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter` or `skipMigrate` now fails the typecheck, and an untyped one has the key ignored without an error.

## What changed

- **The decorator no longer throws for the old keys.** `@model` used to throw at decoration, naming the key to use, for `settings.defaultFilter`, `settings.defaultLimit`, `settings.maxLimit`, `settings.scopeFilter` and `skipMigrate`. That check is removed.
- **The types do that job now.** None of the five is a key of `IModelSettings` or `IModelMetadata`, so `@model({ settings: { scopeFilter: ... } })` is an excess property and fails `tsc`.
- **`devz codemod model-settings` is removed.** The command, its table and its usage line are gone; `devz codemod model-settings` now reports an unknown codemod and exits 2.

## Who is affected

- **Typed models that still use an old key.** They fail the typecheck. Move to the new key (table below).
- **Plain-JavaScript or `any`-typed models.** They lose the runtime error: an old key is ignored, so a `scopeFilter` that is not moved to `access` means the model has **no row scope** and nothing says so. Search your code for the five names before you update.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A model that still writes an old key fails the typecheck; one that bypasses the types silently loses the setting.

| Old | New |
|---|---|
| `settings.defaultFilter` | `settings.query.filter` |
| `settings.defaultLimit` | `settings.query.limit.default` |
| `settings.maxLimit` | `settings.query.limit.max` |
| `settings.scopeFilter` | `settings.access` |
| `settings.scopeFilter.writeGuard` | `settings.access.write.mode` |
| `settings.scopeFilter.sharedRows` | `settings.access.write.sharedRows` |
| `skipMigrate: true` | `migration: { use: false }` |
| `skipMigrate: false` | remove the key (`migration.use` is `true` by default) |

**Before:**

```typescript
@model({
  settings: {
    defaultLimit: 20,
    scopeFilter: { resolve: () => ({ merchantId: currentMerchantId() }) },
  },
  skipMigrate: true,
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

**After:**

```typescript
@model({
  settings: {
    query: { limit: { default: 20 } },
    access: { resolve: () => ({ merchantId: currentMerchantId() }) },
  },
  migration: { use: false },
})
export class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

To upgrade:

1. Run your typecheck: every typed model that still writes an old key is reported as an unknown property.
2. Search `.js` files and `any`-typed code for `defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter` and `skipMigrate` next to `@model` or `model(`, and move each key by the table.
3. Write the models by hand: the codemod that moved the keys is removed, so there is no tool for this step.
