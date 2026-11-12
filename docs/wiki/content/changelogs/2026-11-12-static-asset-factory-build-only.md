---
title: StaticAssetControllerFactory has one build method
description: "StaticAssetControllerFactory.buildResolved is removed; build takes the entry key and the entry."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-12

## StaticAssetControllerFactory has one build method

<Badge type="warning" text="Breaking" />

**In one line.** `StaticAssetControllerFactory.buildResolved` is gone; `build({ key, entry })` does the same work.

## What changed

- **One method.** `build` resolves the entry and builds the controller. `buildResolved` took an entry you had already resolved; it was only used by the component itself.

## Who is affected

- **Apps that call `buildResolved`.** Call `StaticAssetControllerFactory.build({ key, entry, policyService, commitService })` instead. Everyone else: no action needed.

## Breaking changes

> [!WARNING]
> `StaticAssetControllerFactory.buildResolved` is removed.

**Before:**

```typescript
StaticAssetControllerFactory.buildResolved({ resolved, policyService, commitService });
```

**After:**

```typescript
StaticAssetControllerFactory.build({ key, entry, policyService, commitService });
```
