---
title: Model Settings Are Grouped Under query and access
description: "IModelSettings groups the default filter and limits under query and the row scope under access. The old flat keys keep working in 0.4.2 with a boot warning and are removed in 0.4.3."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors']
---

# Changelog - 2026-10-25

## Model settings are grouped under query and access

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** `@model({ settings })` had `defaultFilter`, `defaultLimit`, `maxLimit` and `scopeFilter` (with `writeGuard` and `sharedRows`) side by side with `hiddenProperties` and `authorize`. Related settings now sit together under `query` and `access`. The old keys keep working in 0.4.2 and are removed in **0.4.3** ([#467](https://github.com/VENIZIA-AI/ignis/issues/467)).

## The new shape

```typescript
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['costPrice'],
    authorize: { principal: 'Product' },
    query: {
      filter: { where: { isDeleted: false } },
      limit: { default: 20, max: 200 },
    },
    access: {
      resolve: () => ({ merchantId: currentMerchantId() }),
      onMissing: 'deny',
      columns: ['merchantId'],
      write: { mode: 'reject', sharedRows: false },
    },
  },
})
class Product extends BaseRelationalEntity<typeof products> {}
```

## Old to new

| Old key | New key |
|---|---|
| `defaultFilter` | `query.filter` |
| `defaultLimit` | `query.limit.default` |
| `maxLimit` | `query.limit.max` |
| `scopeFilter` | `access` |
| `scopeFilter.writeGuard` | `access.write.mode` |
| `scopeFilter.sharedRows` | `access.write.sharedRows` |
| `scopeFilter.resolve`, `onMissing`, `columns` | `access.resolve`, `access.onMissing`, `access.columns` |

`hiddenProperties` and `authorize` are unchanged. The option `shouldSkipDefaultFilter` keeps its name and skips `query.filter`; it never skips `access`.

## What happens to the old keys

- **They are normalised once, when the `@model` decorator runs.** Everything that reads model settings reads the new shape, so a model behaves the same whichever shape it uses.
- **Each old key in use prints one warning at boot**, naming the model, the old key, the new key and "removed in 0.4.3".
- **An old key together with the key that replaces it is an error.** `defaultLimit` with `query.limit.default`, or `scopeFilter` with `access`, throws when the decorator runs, naming the model and the key to keep.
- **The old keys are marked `@deprecated` in the types**, and `IScopeFilterSettings` is the deprecated name of `IModelAccessSettings`. 
- **The old keys are removed in 0.4.3.** After that, a model that still uses one fails the type check and the key is no longer applied; migrate before you upgrade.

## Who is affected

- **Models that set `defaultFilter`, `defaultLimit`, `maxLimit` or `scopeFilter`.** Nothing breaks in 0.4.2. Move to the new keys before 0.4.3; the table above is the whole mapping.
- **Code that reads `metadata.settings` from the model registry.** It now holds the new shape only: read `settings.query.filter` and `settings.access`, not the old keys.
- **Error messages that named `settings.scopeFilter` or `writeGuard`** now name `settings.access` and `write.mode`.
