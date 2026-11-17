---
title: The static-asset exports share one StaticAsset prefix, and two factories are renamed to build
description: "Every exported name of the static-asset component now starts with StaticAsset, its helper classes and constants moved, the binding keys changed, and AssetControllerFactory.defineAssetController and AuthControllerFactory.define became build. No aliases are kept."
packages: ['@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-11

## The static-asset exports share one StaticAsset prefix, and two factories are renamed to build

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="Enhancement" />

**In one line.** The static-asset names mixed `Asset*`, `TStaticAsset*` and bare `TListQuery`-style names. They now all start with `StaticAsset`, and the old names are removed, with no deprecated aliases.

## What changed

- **One prefix.** Every exported class, type and interface of the component carries `StaticAsset` after the `T` or `I` letter. The `MetaLink` family (`BaseMetaLinkModel`, `BaseMetaLinkRepository`, `TMetaLink*`, `MetaLinkRecreateActions`) keeps its names.
- **Static helpers are utilities.** Their names end in `Utility` (`StaticAssetKeyScopeUtility` and so on).
- **Constants are classes.** `DEFAULT_PENDING_PREFIX`, `DEFAULT_MAX_UPLOAD_FILES`, `META_LINK_CREATE_FAILED`, `WHITELIST_HEADERS` and `RENDERABLE_CONTENT_TYPES` are now static members of const classes. Their values are unchanged, so `{ error: 'META_LINK_CREATE_FAILED' }` still reaches clients as before.
- **Binding keys.** `StaticAssetComponentBindingKeys` is `StaticAssetBindingKeys`, and the key strings start with `@app/static-asset/`.
- **Factories build.** A factory that makes one kind of thing exposes `build`: `StaticAssetControllerFactory.build` and `AuthControllerFactory.build`.
- **The codemod follows.** The `namespace-functions` mappings of `@venizia/dev-configs` now point at the new class and method names.

## Who is affected

- **Apps that import any old name below from `@venizia/ignis/static-asset`.** Compilation fails until you rename it.
- **Apps that read a static-asset option through the old key string.** An application registering options through `configs.artifacts` binds `'@app/static-asset-component/options'`; use `'@app/static-asset/options'`. This is a runtime failure, not a compile error.
- **Apps that call `AuthControllerFactory.define` or `AssetControllerFactory.defineAssetController`.** Use `build`.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Nothing is aliased. Replace each old name with its new one; one search-and-replace per row does it, matching whole words.

**Classes and constants**

| Old | New |
|---|---|
| `StaticAssetComponentBindingKeys` | `StaticAssetBindingKeys` |
| `STATIC_ASSET_COMPONENT_OPTIONS` | `STATIC_ASSET_OPTIONS` |
| `AssetControllerFactory` | `StaticAssetControllerFactory` |
| `AssetControllerFactory.defineAssetController(` | `StaticAssetControllerFactory.build(` |
| `AuthControllerFactory.define(` | `AuthControllerFactory.build(` |
| `AssetDefinitionBuilder` | `StaticAssetDefinitionBuilder` |
| `AssetKeyScope` | `StaticAssetKeyScopeUtility` |
| `AssetMetaLink` | `StaticAssetMetaLinkUtility` |
| `AssetRouteOptions` | `StaticAssetRouteOptionsUtility` |
| `AssetIngest` | `StaticAssetIngestUtility` |
| `AssetCommitToken` | `StaticAssetCommitTokenUtility` |
| `DEFAULT_PENDING_PREFIX` | `StaticAssetDefaults.PENDING_PREFIX` |
| `DEFAULT_MAX_UPLOAD_FILES` | `StaticAssetDefaults.MAX_UPLOAD_FILES` |
| `META_LINK_CREATE_FAILED` | `StaticAssetMetaLinkCodes.CREATE_FAILED` |
| `WHITELIST_HEADERS` | `StaticAssetHeaders.ALLOWED` |
| `RENDERABLE_CONTENT_TYPES` | `StaticAssetContentTypes.RENDERABLE` |

**Types and interfaces**

| Old | New |
|---|---|
| `TStaticAssetsComponentOptions` | `TStaticAssetComponentOptions` |
| `IAssetControllerOptions` | `IStaticAssetControllerOptions` |
| `IAssetDefinitions` | `IStaticAssetDefinitions` |
| `TListQuery` | `TStaticAssetListQuery` |
| `TBucketParams` | `TStaticAssetBucketParams` |
| `TObjectParams` | `TStaticAssetObjectParams` |
| `TUploadQuery` | `TStaticAssetUploadQuery` |
| `TUploadPolicyRequest` | `TStaticAssetUploadPolicyRequest` |
| `TDefineExtraRoutes` | `TStaticAssetDefineExtraRoutes` |
| `TObjectNameResolver` | `TStaticAssetObjectNameResolver` |
| `TDirectUploadOptions` | `TStaticAssetDirectUploadOptions` |
| `ICommitTokenPayload` | `IStaticAssetCommitTokenPayload` |
| `IIngestFromUrlOptions` | `IStaticAssetIngestFromUrlOptions` |
| `IIngestFromUrlResult` | `IStaticAssetIngestFromUrlResult` |

**Key string**

| Old | New |
|---|---|
| `'@app/static-asset-component/options'` | `'@app/static-asset/options'` |

**Before:**

```typescript
import {
  AssetControllerFactory,
  StaticAssetComponentBindingKeys,
  WHITELIST_HEADERS,
} from '@venizia/ignis/static-asset';

const Controller = AssetControllerFactory.defineAssetController({ controller, storage, helper });
bind({ key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS });
```

**After:**

```typescript
import {
  StaticAssetBindingKeys,
  StaticAssetControllerFactory,
  StaticAssetHeaders,
} from '@venizia/ignis/static-asset';

const Controller = StaticAssetControllerFactory.build({ controller, storage, helper });
bind({ key: StaticAssetBindingKeys.STATIC_ASSET_OPTIONS });
```

## Details

The import path `@venizia/ignis/static-asset` does not change, so moving a helper class to a new folder needs no edit in your code. When you call `StaticAssetControllerFactory.build` yourself with `controller.directUpload` set, pass the `policyService` and `commitService` too; see [Direct upload](/extensions/components/static-asset/direct-upload#use-from-a-service).
