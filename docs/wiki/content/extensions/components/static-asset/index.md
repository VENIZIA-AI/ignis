---
title: Static Asset Component
description: Generates bucket/object CRUD REST endpoints for disk, MinIO, and Bun S3 storage backends, with optional database-backed file tracking via MetaLink
difficulty: intermediate
---

# Static Asset Component

`StaticAssetComponent` reads a map of storage backend configurations and generates a full bucket/object REST controller for each one - disk, MinIO, or Bun S3 - all through the same [`IStorageHelper`](./api#istoragehelper-interface) contract.

> [!IMPORTANT]
> `StaticAssetComponent` and its related exports are **not** on the `@venizia/ignis` root barrel. Import from the `@venizia/ignis/static-asset` subpath.

## In one example

```typescript
import { BaseApplication } from '@venizia/ignis';
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
} from '@venizia/ignis/static-asset';
import type { TStaticAssetsComponentOptions } from '@venizia/ignis/static-asset';
import { DiskHelper } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  preConfigure() {
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      staticAsset: {
        controller: { name: 'AssetController', basePath: '/assets', isStrict: true },
        storage: StaticAssetStorageTypes.DISK,
        helper: new DiskHelper({ basePath: './app_data/assets' }),
        extra: { parseMultipartBody: { storage: 'memory' } },
      },
    });

    this.component(StaticAssetComponent);
  }
}
```

This registers `GET`/`POST`/`DELETE` on `/assets/buckets/:bucketName`, `POST /assets/buckets/:bucketName/upload`, `GET /assets/buckets/:bucketName/objects`, plus stream/download/delete-object routes - no controller class to write by hand.

## How it works

- **One options key, one generated controller.** `TStaticAssetsComponentOptions` is a record - each key (`staticAsset` above) becomes an independently-configured storage backend with its own `basePath`, built by `AssetControllerFactory.defineAssetController()` inside `StaticAssetComponent.binding()`.
- **`storage` and `helper` are a discriminated pair.** The options type forces `storage: 'disk'` with a `DiskHelper`, `'minio'` with a `MinioHelper`, or `'bun-s3'` with a `BunS3Helper` - mismatching them fails at compile time, not at runtime.
- **Every backend implements the same `IStorageHelper` contract.** `DiskHelper`, `MinioHelper`, and `BunS3Helper` all extend `BaseStorageHelper`, so bucket/object operations, name validation (`isValidName`/`isValidPath`), and upload normalization behave identically regardless of backend.
- **Object names can embed folder paths, encoded as one segment.** `objects/{objectName}` takes the whole `folder/file.ext` string percent-encoded (`encodeURIComponent`, which also escapes `/`) - Hono decodes it once before the handler reads it, so client code must encode but never decode a second time.
- **MetaLink is opt-in.** Set `useMetaLink: true` and provide `metaLink.repository` to persist a database row (bucket, object, mimetype, size, etag, principal, variant) alongside every upload - useful for querying "which files does user X own" without listing a whole bucket.
- **The default binding is empty.** `StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` defaults to `{}` - bind it with at least one storage backend before `this.component(StaticAssetComponent)` produces any routes.

## Common tasks

### Add a second storage backend

Each key in the options object is independent - mix disk and MinIO under different base paths in one binding.

```typescript
import { MinioHelper } from '@venizia/ignis-helpers/minio';

this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  uploads: {
    controller: { name: 'UploadsController', basePath: '/uploads' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({
      endPoint: 'localhost', port: 9000, useSSL: false,
      accessKey: 'minioadmin', secretKey: 'minioadmin',
    }),
  },
  tempFiles: {
    controller: { name: 'TempController', basePath: '/temp' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './temp' }),
  },
});
```

### Lock down individual routes

Each key under `controller.routes` accepts a partial `authenticate`/`authorize`/`middleware`/`path` override; unset routes stay public.

```typescript
{
  controller: {
    name: 'AssetController',
    basePath: '/assets',
    routes: {
      upload: { authenticate: { strategies: ['jwt'], mode: 'required' } },
      deleteObject: { authenticate: { strategies: ['jwt'], mode: 'required' } },
      deleteBucket: { authenticate: { strategies: ['jwt'], mode: 'required' } },
    },
  },
}
```

### Switch multipart parsing to disk for large uploads

`parseMultipartBody: { storage: 'memory' }` (the default) buffers the whole file in RAM before writing it to the backend. Switch to `'disk'` to spool it to a temp file instead.

```typescript
extra: {
  parseMultipartBody: { storage: 'disk', uploadDir: './tmp/uploads' },
}
```

### Enable MetaLink database tracking

Bind a repository over `BaseMetaLinkModel` (used directly, no subclass needed) and pass it as `metaLink.repository`.

```typescript
useMetaLink: true,
metaLink: {
  model: BaseMetaLinkModel,
  repository: this.get<MetaLinkRepository>({ key: 'repositories.MetaLinkRepository' }),
},
```

See [Enable MetaLink tracking](./usage#enable-metalink-tracking) for the full repository/table/binding setup.

### Customize object names and links

`normalizeNameFn` runs before the file is written to storage; `normalizeLinkFn` builds the `link` value returned to the client. Both are optional - omit either to keep the component's defaults.

```typescript
extra: {
  normalizeNameFn: ({ originalName, folderPath }) =>
    `${Date.now()}_${originalName.toLowerCase().replace(/\s/g, '_')}`,
  normalizeLinkFn: ({ bucketName, normalizeName }) =>
    `/api/files/${bucketName}/${encodeURIComponent(normalizeName)}`,
},
```

## See also

- [Usage & Examples](./usage) - task-oriented walkthroughs for every endpoint and MetaLink setup
- [Full Reference](./api) - controller factory, `IStorageHelper` interface, MetaLink schema, internals
- [Error Reference](./errors) - name validation rules and troubleshooting
- [Storage Helpers](/extensions/helpers/storage/) - `DiskHelper`, `MinioHelper`, `BaseStorageHelper` reference
- [Components Overview](/guides/core-concepts/components) - component system basics

**Files:**

- [`packages/core/src/components/static-asset/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/static-asset/component.ts) - `StaticAssetComponent`
- [`packages/core/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/static-asset/common/types.ts) - `TStaticAssetsComponentOptions`, `TStaticAssetExtraOptions`, `TMetaLinkConfig`
- [`packages/core/src/components/static-asset/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/static-asset/common/constants.ts) - `StaticAssetStorageTypes`
- [`packages/core/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/static-asset/controller/factory.ts) - `AssetControllerFactory`
- [`packages/core/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/static-asset/models/base.model.ts) - `BaseMetaLinkModel`
- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts) - `BaseStorageHelper`, `IStorageHelper`
