---
title: Static Asset Component - Full Reference
description: Controller factory, IStorageHelper interface, storage helper options, MetaLink schema, and per-endpoint request/response reference
difficulty: intermediate
---

# Static Asset Component Reference

Every binding, endpoint, type, and internal mechanism of `StaticAssetComponent`. For task-oriented walkthroughs, see [Usage & Examples](./usage).

**Files:**

- [`packages/core-server/src/components/static-asset/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/component.ts)
- [`packages/core-server/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/types.ts)
- [`packages/core-server/src/components/static-asset/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/constants.ts)
- [`packages/core-server/src/components/static-asset/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/keys.ts)
- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts)
- [`packages/core-server/src/components/static-asset/controller/base.definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/base.definition.ts)
- [`packages/core-server/src/components/static-asset/controller/key-scope.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/key-scope.ts) - `controller.keyPrefix`
- [`packages/core-server/src/components/static-asset/controller/meta-link.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/meta-link.ts) - `createMetaLinkRow`, `refreshMetaLinkRows`
- [`packages/core-server/src/components/static-asset/controller/route-options.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/route-options.ts) - `enabled`, the `maxBytes` route guard
- [`packages/core-server/src/components/static-asset/ingest.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/ingest.ts)
- [`packages/core-server/src/components/static-asset/common/errors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/errors.ts)
- [`packages/core-server/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/models/base.model.ts)
- [`packages/core-server/src/components/static-asset/repositories/base.repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/repositories/base.repository.ts)
- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts)
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts)
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts)
- [`packages/helpers/src/utilities/request.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/request.utility.ts)

## Quick reference

| Item | Value |
|------|-------|
| Package | `@venizia/ignis` (core component) + `@venizia/ignis-helpers` (storage helpers) |
| Component class | `StaticAssetComponent` |
| Import subpath | `@venizia/ignis/static-asset` - not on the root barrel |
| Storage helpers | `DiskHelper`, `BunS3Helper` (`@venizia/ignis-helpers/bun-s3`), `MinioHelper` (`@venizia/ignis-helpers/minio`, deprecated) |
| Runtimes | Both - `BunS3Helper` specifically requires Bun (imports Bun's native `S3Client`) |
| Optional feature | MetaLink - Postgres-backed upload tracking via `BaseMetaLinkModel`/`BaseMetaLinkRepository` |

## Import paths

```typescript
// Core - subpath import only
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  AssetControllerFactory,
  AssetIngest,
  BaseMetaLinkModel,
  BaseMetaLinkRepository,
  buildObjectLink,
  resolveServedContentType,
  RENDERABLE_CONTENT_TYPES,
  StaticAssetErrors,
  WHITELIST_HEADERS,
} from '@venizia/ignis/static-asset';

import type {
  TStaticAssetsComponentOptions,
  TStaticAssetExtraOptions,
  TMetaLinkConfig,
  TObjectNameResolver,
  TDefineExtraRoutes,
  TStaticAssetStorageType,
  IAssetControllerOptions,
  IIngestFromUrlOptions,
  IIngestFromUrlResult,
} from '@venizia/ignis/static-asset';

// Helpers - main entry + storage-backend subpaths
import { DiskHelper } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
```

## Binding keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/static-asset-component/options` | `StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` | `TStaticAssetsComponentOptions` | Yes | `{}` |

> [!NOTE]
> `StaticAssetComponent`'s constructor binds an empty `{}` default for this key. `binding()` iterates `Object.entries(componentOptions)` - an empty object produces zero controllers, no error. Bind your configuration in `preConfigure()` before `this.component(StaticAssetComponent)`.

## `TStaticAssetsComponentOptions`

```typescript
/** The part of a built-in route an application may change. */
type TStaticAssetRouteConfig = Partial<
  Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>
> & {
  /** Whether this route is registered. Defaults to true. */
  enabled?: boolean;
};

type TStaticAssetsComponentOptions<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;
      bucket?: TValueOrAsyncResolver<string>;
      rawObjectPath?: boolean;
      keyPrefix?: string;
      routes?: {
        getBuckets?: TStaticAssetRouteConfig;
        getBucketByName?: TStaticAssetRouteConfig;
        createBucket?: TStaticAssetRouteConfig;
        deleteBucket?: TStaticAssetRouteConfig;
        upload?: TStaticAssetRouteConfig;
        listObjects?: TStaticAssetRouteConfig;
        deleteObject?: TStaticAssetRouteConfig;
        getObjectByName?: TStaticAssetRouteConfig;
        downloadObjectByName?: TStaticAssetRouteConfig;
        uploadPolicy?: TStaticAssetRouteConfig;
        uploadCommit?: TStaticAssetRouteConfig;
        recreateMetaLink?: TStaticAssetRouteConfig;
      };
    };
    extra?: TStaticAssetExtraOptions;
    resolveObjectName?: TObjectNameResolver;
    defineRoutesBefore?: TDefineExtraRoutes;
    defineExtraRoutes?: TDefineExtraRoutes;
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
    | { storage: typeof StaticAssetStorageTypes.MINIO; helper: MinioHelper }
  ) &
    ({ useMetaLink?: false | undefined } | { useMetaLink: true; metaLink: TMetaLinkConfig<Schema> });
};
```

`Schema` defaults to the table IGNIS ships. Pass your own to put the MetaLink table under a Postgres schema of your own, or to give it another name:

```typescript
this.bind<TStaticAssetsComponentOptions<typeof MetaLinkModel.schema>>({ key: ... });
```

The constraint is the ROW, not the table: any table whose row carries the MetaLink fields is accepted, and a table missing one of them is still refused at compile time.

| Field | Type | Default | Description |
|-------|------|---------|--------------|
| `controller.name` | `string` | - | Class name given to the generated controller (via `Object.defineProperty`) |
| `controller.basePath` | `string` | - | Mount path, for example `'/assets'` |
| `controller.isStrict` | `boolean` | `true` | Passed through to `BaseRestController`'s strict routing mode |
| `controller.bucket` | `string \| (() => string)` | `undefined` | The one bucket every object route uses. It leaves the URL, and the four bucket-management routes are not registered. The function form runs on every request, so it can read an environment variable |
| `controller.rawObjectPath` | `boolean` | `false` | `true` serves a raw nested path, <code v-pre>/objects/photos/2024/f.jpg</code>. A percent-encoded path keeps working either way |
| `controller.keyPrefix` | `string` | `undefined` | The key scope this controller owns inside a shared bucket, for example `'tenant-a'`. Absent means every key in the bucket. See [`controller.keyPrefix`](#controller-keyprefix) |
| `controller.routes` | object | `undefined` | Per-route overrides, including the `enabled` switch - see [Per-route overrides](#per-route-overrides) |
| `storage` | `'disk' \| 'bun-s3' \| 'minio'` | - | Selects which `helper` type is required (discriminated union) |
| `helper` | `DiskHelper \| BunS3Helper \| MinioHelper` | - | Storage backend instance matching `storage` |
| `extra` | `TStaticAssetExtraOptions` | `undefined` | Multipart parsing mode, name/link normalization, max folder depth, upload size ceiling |
| `useMetaLink` | `boolean` | `false` | Enables the `PUT .../meta-links/:objectName` route and DB tracking on upload/delete |
| `metaLink` | `TMetaLinkConfig<Schema>` | - | Required when `useMetaLink: true`; ignored otherwise |
| `resolveObjectName` | `TObjectNameResolver` | `undefined` | Decides the stored object name - see [`resolveObjectName`](#resolveobjectname) |
| `defineRoutesBefore` | `TDefineExtraRoutes` | `undefined` | Adds your own routes BEFORE every built-in one. A literal path then wins over the catch-all `rawObjectPath` registers |
| `defineExtraRoutes` | `TDefineExtraRoutes` | `undefined` | Adds your own routes after every built-in one - see [`defineExtraRoutes`](#defineextraroutes) |

### Per-route overrides

Each key accepts a `TStaticAssetRouteConfig` - `Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>` (typically `authenticate`, `authorize`, `path`, and `middleware`) plus `enabled`. `readRouteOverride` splits `enabled` off before the rest is shallow-merged onto the base definition the factory built for this controller: `{ ...definitions.UPLOAD, ...routes?.upload }`.

| Route key | HTTP Method | Base Path | Registered when |
|-----------|-------------|-----------|------------------|
| `getBuckets` | `GET` | `/buckets` | no `controller.bucket`, `enabled !== false` |
| `getBucketByName` | `GET` | <code v-pre>/buckets/{bucketName}</code> | no `controller.bucket`, `enabled !== false` |
| `createBucket` | `POST` | <code v-pre>/buckets/{bucketName}</code> | no `controller.bucket`, `enabled !== false` |
| `deleteBucket` | `DELETE` | <code v-pre>/buckets/{bucketName}</code> | no `controller.bucket`, `enabled !== false` |
| `upload` | `POST` | <code v-pre>/buckets/{bucketName}/objects</code> | `enabled !== false` |
| `listObjects` | `GET` | <code v-pre>/buckets/{bucketName}/objects</code> | `enabled !== false` |
| `getObjectByName` | `GET` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> | `enabled !== false` |
| `downloadObjectByName` | `GET` | <code v-pre>/buckets/{bucketName}/download/{objectName}</code> | `enabled !== false` |
| `deleteObject` | `DELETE` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> | `enabled !== false` |
| `uploadPolicy` | `POST` | <code v-pre>/buckets/{bucketName}/upload-policy</code> | `controller.directUpload` set, `enabled !== false` |
| `uploadCommit` | `POST` | <code v-pre>/buckets/{bucketName}/upload-commit</code> | `controller.directUpload` set, `enabled !== false` |
| `recreateMetaLink` | `PUT` | <code v-pre>/buckets/{bucketName}/meta-links/{objectName}</code> | `useMetaLink: true`, `enabled !== false` |

`upload` and `listObjects` share one path and differ by method: `POST` writes, `GET` lists. Every route defaults to registered - set `enabled: false` to drop a built-in route entirely, the same switch name the CRUD controller factory uses.

```typescript
routes: {
  deleteBucket: { enabled: false },
  deleteObject: { enabled: false },
}
```

`uploadPolicy` and `uploadCommit` exist only when `controller.directUpload` is set - see [Direct upload](./direct-upload). `directUpload` without `controller.bucket` throws at registration: a policy names one bucket, and a bucket in the URL is a bucket the caller chooses.

### URL shapes

`bucket` and `rawObjectPath` are independent. Both default to off, which is the shape in the table above.

| `bucket` | `rawObjectPath` | The object route |
|---|---|---|
| unset | `false` | <code v-pre>/assets/buckets/images/objects/photos%2F2024%2Ff.jpg</code> |
| unset | `true` | <code v-pre>/assets/buckets/images/objects/photos/2024/f.jpg</code> |
| `'images'` | `false` | <code v-pre>/assets/objects/photos%2F2024%2Ff.jpg</code> |
| `'images'` | `true` | <code v-pre>/assets/objects/photos/2024/f.jpg</code> |

A configured `bucket` shortens `upload`, `listObjects`, `getObjectByName`, `downloadObjectByName`, `deleteObject` and `recreateMetaLink` the same way. Those routes also lose the `bucketName` path param. `getBuckets`, `getBucketByName`, `createBucket` and `deleteBucket` are not registered at all - a single-bucket application exposes no bucket management.

`rawObjectPath` turns the object segment into the <code v-pre>{objectName}{.+}</code> catch-all. Every validation still runs on the joined path, `maxFolderDepth` included.

### `controller.keyPrefix`

Splits one shared bucket between controllers. `normalizeKeyPrefix` normalizes the value to exactly
one trailing slash (`'tenant-a'`, `'/tenant-a'` and `'tenant-a/'` all become `'tenant-a/'`, so
`tenant-a` never also owns `tenant-ab/`), and every segment must pass `isValidSegment()` or the
controller throws at registration.

> [!IMPORTANT]
> `controller.keyPrefix` requires `controller.bucket`, the same requirement `directUpload` already
> has, and for the same reason: without a configured bucket, the four bucket-management routes stay
> unscoped (a caller can still `createBucket`/`deleteBucket` any name), so `keyPrefix` would isolate
> only part of the surface. The controller throws at registration when `keyPrefix` is set without
> `bucket`.

| Route | A key outside the prefix |
|---|---|
| `getObjectByName`, `downloadObjectByName`, `deleteObject`, `recreateMetaLink` | `404 core.storage.object_not_found`, after the 400 name check, before any storage call - the code a real miss answers, so a caller learns nothing about a key it does not own |
| `listObjects` | A caller `prefix` wider than the scope is narrowed to it; one disjoint from it returns `[]` without calling storage |
| `upload` | The component's own default name is placed inside the prefix. A `resolveObjectName` or `extra.normalizeNameFn` key outside it is refused with `400 core.static_asset.object_key_out_of_scope` - never rewritten, because the application may have recorded that key elsewhere. With **neither** hook set (the component's own default naming), the original file name must still be one segment - a `/` in it is `400 [upload] Invalid original file name`, exactly as without a scope; set `resolveObjectName` or `extra.normalizeNameFn` to relax that |
| `uploadPolicy` / `uploadCommit` | The pending key and the policy's `starts-with` condition become `pendingPrefix + keyPrefix`, so the committed key lands inside the scope. The commit also re-checks the scope, for a token another controller signed with the same secret |

`maxFolderDepth` counts folders below the prefix: validation uses `maxFolderDepth + prefix depth`. Without that addition, a two-segment prefix plus a direct-upload key `<uuid>/<name>` would exceed the default depth of `2` and every read would answer `400`.

Not scoped: `defineRoutesBefore` and `defineExtraRoutes`. The four bucket-management routes are not
registered at all once `controller.bucket` is set, which `keyPrefix` now requires - see the note
above.

```typescript
{
  controller: { name: 'TenantAssets', basePath: '/assets', bucket: 'shared', keyPrefix: 'tenant-a' },
  storage: StaticAssetStorageTypes.BUN_S3,
  helper: bunS3Helper,
}
```

## `TStaticAssetExtraOptions`

```typescript
type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
  normalizeLinkFn?: (opts: IObjectLocation) => string;
  /** Maximum folder nesting depth allowed in object paths. Default: 2 */
  maxFolderDepth?: number;
  /** Largest file the upload route accepts, in bytes. Absent means no ceiling. */
  maxBytes?: number;
  [key: string]: AnyType;
};
```

> [!NOTE]
> `normalizeNameFn` receives one `file` object carrying **both** `originalName` and `folderPath` - that is `TUploadNaming`, which is `Pick<IUploadFile, 'originalName' | 'folderPath'>`. The folder field lets a custom implementation decide how to fold the target folder into the stored key. Drop `folderPath` handling and nested uploads flatten into the bucket root.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `parseMultipartBody.storage` | `'memory' \| 'disk'` | `'memory'` | `'disk'` spools to `uploadDir`, then the controller reads the file back with `readFileSync` before handing it to the storage helper |
| `parseMultipartBody.uploadDir` | `string` | `'./uploads'` | Created with <code v-pre>fs.mkdirSync({ recursive: true })</code> if missing |
| `normalizeNameFn` | `(opts: { file: TUploadNaming }) => string` | `BaseStorageHelper`'s lowercase + `_`-for-space normalizer | Runs before the file is written; its output is re-validated with `isValidObjectKey()` |
| `normalizeLinkFn` | `(opts: IObjectLocation) => string` | Component-generated - see below | Runs after the write to build the returned `link` |
| `maxFolderDepth` | `number` | `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH` (`2`) | Folder segments only - the filename itself does not count against this limit |
| `maxBytes` | `number` | none | Refuses a request over the ceiling with `413 core.static_asset.upload_too_large`. Checked twice: `content-length` in route middleware, before the body is spooled; then each parsed file's actual byte length, in the handler - see [Where `maxBytes` runs](#where-maxbytes-runs) |

### Default `normalizeLinkFn`

`StaticAssetComponent.binding()` always supplies a `normalizeLinkFn` to the factory - your own `extra.normalizeLinkFn` if set, otherwise this default:

```typescript
(linkOptions: IObjectLocation) =>
  buildObjectLink({
    basePath: controller.basePath,
    bucket: linkOptions.bucket,
    object: linkOptions.object,
    hasConfiguredBucket: controller.bucket !== undefined,
    rawObjectPath: controller.rawObjectPath,
  });
```

`buildObjectLink` is exported, so a hand-written route can build the same link:

```typescript
const buildObjectLink = (
  opts: IObjectLocation & {
    basePath: string;
    hasConfiguredBucket?: boolean;
    rawObjectPath?: boolean;
  },
) => string;
```

This is why every generated link points back at the `objects/{objectName}` stream route by default, regardless of storage backend. `buildObjectLink` follows the [URL shapes](#url-shapes) above, so a link always resolves against the routes that controller registered. The `PUT .../meta-links/{objectName}` route builds its fallback link with the same function.

`BaseStorageHelper` has its own backend-specific `normalizeObjectLink()`. It only runs when you call a helper's `upload()` directly, outside the component. Through `StaticAssetComponent`, the component's default `normalizeLinkFn` always takes priority instead.

## Storage types

```typescript
class StaticAssetStorageTypes {
  static readonly DISK = 'disk';
  /** @deprecated Use {@link StaticAssetStorageTypes.BUN_S3}, which reaches MinIO over the same S3 API. */
  static readonly MINIO = 'minio';
  static readonly BUN_S3 = 'bun-s3';

  static readonly SCHEME_SET = new Set([this.DISK, this.MINIO, this.BUN_S3]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;
// 'disk' | 'minio' | 'bun-s3'
```

| Type | Constant | Helper | Requires |
|------|----------|--------|----------|
| `'disk'` | `StaticAssetStorageTypes.DISK` | `DiskHelper` | Local filesystem write access |
| `'bun-s3'` | `StaticAssetStorageTypes.BUN_S3` | `BunS3Helper` | Bun runtime (imports Bun's native `S3Client`) |
| `'minio'` | `StaticAssetStorageTypes.MINIO` | `MinioHelper` from `@venizia/ignis-helpers/minio` | The `minio` driver |

> [!WARNING]
> `StaticAssetStorageTypes.MINIO` and `MinioHelper` are `@deprecated`, though still a live arm of the options union. Use `BunS3Helper` with `StaticAssetStorageTypes.BUN_S3`: it reaches MinIO over the same S3 API, and adds presigned URLs, object tagging and byte ranges.

## Storage helpers

### `IStorageHelper` interface

Every backend implements this contract; `BaseStorageHelper` (abstract) implements the shared parts (`isValidSegment`, `isValidBucketName`, `isValidObjectKey`, `upload`, `getObjectStream`, `writeStream`, `getMimeType`, `getMediaType`) and leaves the rest abstract.

Every method takes one options object with nested refs: `IBucketRef` is `{ name }`, `IObjectRef` is `{ key }`, and `IObjectLocation` is `{ bucket, object }`.

```typescript
interface IStorageHelper {
  isValidSegment(opts: { segment: string }): boolean;
  isValidBucketName(opts: { bucket: IBucketRef }): boolean;
  isValidObjectKey(opts: { object: IObjectRef; maxDepth?: number }): boolean;

  hasBucket(opts: { bucket: IBucketRef }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  removeBucket(opts: { bucket: IBucketRef }): Promise<boolean>;

  getObject(opts: IObjectLocation & { options?: any }): Promise<Readable>;
  getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } },
  ): Promise<ReadableStream<Uint8Array>>;
  getStat(opts: IObjectLocation): Promise<IFileStat>;
  listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;

  upload(opts: {
    bucket: IBucketRef;
    files: IUploadFile[];
    maxFolderDepth?: number;
    normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
    normalizeLinkFn?: (opts: IObjectLocation) => string;
  }): Promise<IUploadResult[]>;

  writeStream(
    opts: IObjectLocation & {
      source: ReadableStream<Uint8Array> | Blob | Response | Request;
      contentType?: string;
      maxFolderDepth?: number;
    },
  ): Promise<void>;

  removeObject(opts: IObjectLocation): Promise<void>;
  removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void>;

  presignPut(
    opts: IObjectLocation & {
      expiresIn?: IDuration;
      tagging?: Record<string, string>;
      contentLength?: number;
      contentType?: string;
    },
  ): Promise<string>;
  presignGet(
    opts: IObjectLocation & {
      expiresIn?: IDuration;
      responseContentType?: string;
      responseContentDisposition?: string;
    },
  ): Promise<string>;

  getObjectTags(opts: IObjectLocation): Promise<Record<string, string>>;
  replaceObjectTags(opts: IObjectLocation & { tags: Record<string, string> }): Promise<void>;

  getMediaType(opts: { mimeType: string }): string;
  getMimeType(opts: { filename: string }): string;
}
```

```
IStorageHelper (interface)
    |
BaseStorageHelper (abstract - implements the validators, upload, the stream methods and the type lookups)
    |
    +-- DiskHelper    (local filesystem)
    +-- BunS3Helper   (Bun-native S3, Bun only)
    +-- MinioHelper   (minio driver, deprecated)
```

`expiresIn` is an `IDuration` (`{ unit, value }`), not seconds. `presignPut`, `presignGet`, `getObjectTags` and `replaceObjectTags` throw on `DiskHelper` and `MinioHelper`; only `BunS3Helper` implements them. See the [Storage full reference](/extensions/helpers/storage/api#presign-and-object-tagging).

### Supporting types

```typescript
interface IUploadFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;
  folderPath?: string;
  [key: string | symbol]: any;
}

interface IBucketRef {
  name: string;
}

interface IObjectRef {
  key: string;
}

interface IObjectLocation {
  bucket: IBucketRef;
  object: IObjectRef;
}

type TUploadNaming = Pick<IUploadFile, 'originalName' | 'folderPath'>;

interface IUploadResult {
  bucket: IBucketRef;
  object: IObjectRef & { size: number; contentType: string };
  link: string;
  metaLink?: { data: any } | { error: string };
}

interface IFileStat {
  size: number;
  metadata: IObjectMetadata;
  lastModified?: Date;
  etag?: string;
  versionId?: string;
}

interface IBucketInfo {
  name: string;
  creationDate: Date;
}

interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}

interface IListObjectsOptions {
  bucket: IBucketRef;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}
```

`metaLink` is a union, so an upload result carries either the created record or a failure code - never both, and never `null`.

### Name and key validation (`BaseStorageHelper`)

`isValidSegment({ segment })` rejects any of the following, in order. `isValidBucketName({ bucket })` is this check applied to `bucket.name`.

| Check | Rejects |
|-------|---------|
| Type | Non-string input |
| Empty | Empty string |
| Path traversal | `..`, `/`, or `\` |
| Hidden file | A leading `.` |
| Shell metacharacters | `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` |
| Control characters | `\n`, `\r`, `\0` |
| Length | Over 255 characters |
| Whitespace-only | Empty after trimming |

`isValidObjectKey({ object, maxDepth })` runs these checks, in order:

| Step | Behavior |
|------|----------|
| Normalize | Trims leading/trailing slashes |
| Empty check | Rejects if the result is empty |
| Double slashes | Rejects empty segments, for example `a//b` |
| Folder depth | `folderDepth = segments.length - 1`; rejects if it exceeds `maxDepth` (default `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH = 2`) |
| Segment names | Every segment must pass `isValidSegment()` |
| Key length | Rejects a normalized length over 1024 characters |

> [!NOTE]
> Those six steps live on `protected isValidKeyPath({ path, maxDepth })`, which `isValidObjectKey` and `upload`'s `folderPath` check both call. It is protected, so `isValidObjectKey` is the only way in from outside the class.

### `DiskHelper`

```typescript
interface IDiskHelperOptions {
  basePath: string;    // Base directory for storage
  scope?: string;      // Logger scope, default: 'DiskHelper'
  identifier?: string; // Helper identifier, default: 'DiskHelper'
}
```

Creates `basePath` with `fs.mkdirSync({ recursive: true })` in the constructor if it does not already exist. Buckets map to subdirectories; objects map to files inside them.

```typescript
const diskHelper = new DiskHelper({ basePath: './app_data/storage' });
```

### `BunS3Helper`

```typescript
interface IBunS3HelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: { default: string; public?: string };
  region?: string;               // Default: 'us-east-1'
  sessionToken?: string;
  virtualHostedStyle?: boolean;  // Default: false
  partSize?: number;             // Multipart part size in bytes; Bun's default when omitted
  queueSize?: number;            // Parts in flight; Bun's default when omitted
  retry?: number;                // Retries per failed part; Bun's default when omitted
  scope?: string;
  identifier?: string;
}
```

Wraps Bun's native `S3Client`, imported from the `bun` builtin module. That module only resolves under the Bun runtime. This is why `BunS3Helper` is exported from the separate `@venizia/ignis-helpers/bun-s3` subpath, not the main entry point.

```typescript
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

const bunS3Helper = new BunS3Helper({
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  endpoint: { default: 'https://s3.us-east-1.amazonaws.com' },
});
```

> [!IMPORTANT]
> Set `endpoint.public` when the application reaches S3 over an internal address. `host` is inside every SigV4 signature, so a URL signed against the internal endpoint cannot be rewritten to a public one afterwards - the signature breaks. `endpoint.default` stays the host this process talks to.

### `MinioHelper`

```typescript
import { MinioHelper } from '@venizia/ignis-helpers/minio';

/** @deprecated Use `IBunS3HelperOptions` from `@venizia/ignis-helpers/bun-s3`. */
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

`ClientOptions` is the `minio` driver's own option type, so `endPoint`, `port`, `useSSL`, `accessKey` and `secretKey` pass straight through. Sub-path import only, like `BunS3Helper`.

`MinioHelper` is the one backend that persists an upload metadata dictionary (`originalName`, `normalizeName`, `size`, `encoding`, `mimeType`). It does not implement presigning or object tagging, so those four methods throw.

## Controller factory

`AssetControllerFactory.defineAssetController(opts: IAssetControllerOptions)` builds one controller class per call:

```typescript
interface IAssetControllerOptions {
  controller: TStaticAssetsComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  metaLink?: TMetaLinkConfig;
  options?: TStaticAssetExtraOptions;
  resolveObjectName?: TObjectNameResolver;
  defineRoutesBefore?: TDefineExtraRoutes;
  defineExtraRoutes?: TDefineExtraRoutes;
}
```

1. Creates a class extending `BaseRestController`, decorated `@controller({ path: basePath })`.
2. Renames it via `Object.defineProperty(GeneratedStaticAssetController, 'name', { value: name, configurable: true })` so logs and DI bindings show your configured `controller.name`, not a generic factory name.
3. Calls `defineRoutesBefore` first, so a literal path of yours can win over the catch-all `rawObjectPath` registers.
4. Binds every route in `binding()` with `this.bindRoute({ configs }).to({ handler })`, spread-merging each base definition with its `routes?.<key>` override.
5. Registers `recreateMetaLink` only when `useMetaLink && metaLink` are both set, `uploadPolicy`/`uploadCommit` only when `controller.directUpload` is set, and the four bucket-management routes only when `controller.bucket` is unset - each one gated a second time by its own `routes?.<key>.enabled !== false`.
6. Calls `defineExtraRoutes` last, after every built-in route.
7. `StaticAssetComponent.binding()` registers the resulting class with `this.application.controller(...)`.

`defineRoutesBefore` and `defineExtraRoutes` share the `TDefineExtraRoutes` shape. Registration order is the only difference, and Hono matches in registration order, so it decides every path collision.

```
StaticAssetComponent.binding()
    | iterates componentOptions
AssetControllerFactory.defineAssetController({ controller, storage, helper, ... })
    | creates
@controller({ path: basePath })
class GeneratedStaticAssetController extends BaseRestController { ... }
    | registered via
this.application.controller(GeneratedStaticAssetController)
```

### `resolveObjectName`

Decides the key one uploaded file is stored under. Set it instead of copying the factory to rename a single upload.

```typescript
type TObjectNameResolver = (opts: {
  bucket: IBucketRef;
  file: TUploadNaming;
  defaultKey: string;
}) => string;
```

`defaultKey` is the key IGNIS would have written without the hook. That is your `extra.normalizeNameFn` output when you configured one. Otherwise it is the storage helper's lowercase, `_`-for-space key. Return `defaultKey` and nothing changes.

```typescript
resolveObjectName: ({ file, defaultKey }) => {
  return file.originalName.startsWith('invoice-') ? file.originalName : defaultKey;
};
```

The hook is rebuilt per request, because `bucket` is something only the route knows. The returned key is still validated with `isValidObjectKey()` before the write, so a traversal cannot leave the bucket.

### `defineExtraRoutes`

Adds routes of your own to the generated controller.

```typescript
type TDefineExtraRoutes = (opts: {
  controller: BaseRestController;
  helper: IStorageHelper;
  basePath: string;
}) => void;
```

```typescript
defineExtraRoutes: ({ controller, helper }) => {
  controller.defineRoute({
    configs: {
      method: 'get',
      path: '/health',
      responses: jsonResponse({ schema: z.object({ buckets: z.number() }) }),
    },
    handler: async context => {
      const buckets = await helper.getBuckets();
      return context.json({ buckets: buckets.length }, HTTP.ResultCodes.RS_2.Ok);
    },
  });
};
```

The hook runs after every built-in route, so a built-in route wins a path collision with yours. `basePath` is the mount path with exactly one leading slash, the same value the default `normalizeLinkFn` builds links from.

### `MultipartBodySchema`

The Zod schema validating the `upload` request body:

```typescript
const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: { type: 'string', format: 'binary' },
  }),
});
```

### Endpoint reference

The default shape. A configured `controller.bucket` drops the first four rows and the <code v-pre>/buckets/{bucketName}</code> prefix - see [URL shapes](#url-shapes).

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/buckets` | No params. Returns `IBucketInfo[]` |
| `GET` | <code v-pre>/buckets/{bucketName}</code> | Returns `IBucketInfo \| null` |
| `POST` | <code v-pre>/buckets/{bucketName}</code> | Returns the created `IBucketInfo`. Throws if the bucket already exists or the name is invalid - see [Error Reference](./errors) |
| `DELETE` | <code v-pre>/buckets/{bucketName}</code> | Returns <code v-pre>{ isDeleted: boolean }</code> |
| `POST` | <code v-pre>/buckets/{bucketName}/objects</code> | `multipart/form-data` body. Optional **form fields** beside the file: `principalType`, `principalId`, `variant`, `sequence`, `folderPath`. The same names in the query string are refused with `400 core.static_asset.labels_in_query`. Returns `IUploadResult[]` |
| `GET` | <code v-pre>/buckets/{bucketName}/objects</code> | Query: `prefix?`, `recursive?` (`'true'` string only), `maxKeys?` (positive integer string). Returns `IObjectInfo[]` |
| `GET` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> | Streams the file inline when the type is renderable, otherwise as an attachment. `objectName` is a single percent-encoded segment. Honours one `Range` header |
| `GET` | <code v-pre>/buckets/{bucketName}/download/{objectName}</code> | Streams the file with `Content-Disposition: attachment`, always |
| `DELETE` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> | Returns <code v-pre>{ success: boolean }</code>. Idempotent: a key that was never there still answers `200` |
| `POST` | <code v-pre>/buckets/{bucketName}/upload-policy</code> | Only registered when `controller.directUpload` is set. Returns one signed POST policy per requested file - see [Direct upload](./direct-upload) |
| `POST` | <code v-pre>/buckets/{bucketName}/upload-commit</code> | Only registered when `controller.directUpload` is set. Returns the object at its final key, and its MetaLink row when `useMetaLink: true` |
| `PUT` | <code v-pre>/buckets/{bucketName}/meta-links/{objectName}</code> | Only registered when `useMetaLink: true`. Returns <code v-pre>{ success, action: 'refreshed' \| 'created', count, metaLink, metaLinks }</code> - see [MetaLink lifecycle](#metalink-lifecycle) |

Upload and list share <code v-pre>/buckets/{bucketName}/objects</code> and differ by method. Every row registers only when its route's `enabled` is not `false` - see [Per-route overrides](#per-route-overrides).

### Where `maxBytes` runs

`extra.maxBytes`'s `content-length` check is route middleware, built by `appendDeclaredLengthGuard`
and appended AFTER your own `routes.upload.middleware` - so an application check of its own (for
example BANA inventory's `REQUEST_TOO_LARGE`) still answers first. It runs before the route's body
validator and before the handler.

It moved out of the handler because `@hono/zod-openapi`'s form validator reads the whole multipart
body before any handler runs - a `content-length` check inside the handler saw a body already fully
read, so it saved no memory. The per-file `buffer.length` check (step 4 below) stays in the handler:
a multipart envelope is larger than the files inside it, and only the parsed file's actual length is
authoritative.

> [!WARNING]
> `extra.maxBytes` bounds only a **declared** `content-length`. A chunked request that omits the
> header skips this check entirely, and is bounded only by `configs.middlewares.bodyLimit` (see
> [Body limit](/references/base/middlewares#body-limit-configs-middlewares-bodylimit)) or Bun's own
> request-size limit. Pair `extra.maxBytes` with `configs.middlewares.bodyLimit` for a ceiling a
> chunked upload cannot skip.

### Upload validation order

1. `bucketName` validated with `isValidBucketName()` - `400 "Invalid bucket name"` on failure.
2. If `folderPath` is present, three checks run in order:

   | Check | Failure |
   |-------|---------|
   | Trim leading/trailing slashes | `400 "Invalid folder path"` if empty after trimming |
   | Segment count vs. `maxFolderDepth` | `400 "Folder path exceeds max depth of {n}"` if over |
   | Each segment via `isValidSegment()` | `400 "Invalid folder path segment: {segment}"` if any fails |

3. `multipart/form-data` parsed via `parseMultipartBody()`.
4. Each file's effective buffer is checked non-empty - direct `buffer`, or `readFileSync(file.path)` when `storage: 'disk'` was used. Empty content returns `400 "Empty file content | name: {originalName}"`. The same pass checks `buffer.length` against `maxBytes`, the authoritative size check - see [Where `maxBytes` runs](#where-maxbytes-runs).
5. `helper.upload()` runs the storage-helper-level checks below. Under `controller.keyPrefix`, a key outside the scope is refused there too, with `400 core.static_asset.object_key_out_of_scope` - see [`controller.keyPrefix`](#controller-keyprefix).
6. Spool files written by `storage: 'disk'` parsing are removed in a `finally` block via `rmSync({ force: true })` - regardless of success or failure. Removal errors are logged, never thrown.

### Storage-helper-level upload checks (`BaseStorageHelper.upload`)

These run inside `helper.upload()`, separate from the controller checks above. They are reachable even when a caller uses the storage helper directly. Every key is resolved and validated before the first file is written, so one bad file in a batch stores nothing:

| Check | Error message | Default status |
|-------|----------------|-----------------|
| Bucket does not exist (`hasBucket()` false) | <code v-pre>[upload] Bucket does not exist \| name: {bucket}</code> | `400` |
| No naming hook (`normalizeNameFn` unset): `originalName` fails `isValidSegment()`, because it becomes the key | `[upload] Invalid original file name` | `400` |
| A naming hook is set: `originalName` is metadata only, and fails `isValidOriginalName()` - not blank, at most 255 characters, no control character or lone surrogate | `[upload] Invalid original file name` | `400` |
| `folderPath` segment count exceeds `maxFolderDepth` | <code v-pre>[upload] Invalid folder path \| depth: {n} \| max: {m}</code> | `400` |
| `folderPath` fails the path rule for any other reason | `[upload] Invalid folder path` | `400` |
| `size` is `undefined`, `null`, or negative | <code v-pre>[upload] Invalid file size \| size: {size}</code> | `400` |
| Normalized key (post `normalizeNameFn`) fails `isValidObjectKey()` | <code v-pre>[upload] Invalid normalized object name \| name: {name}</code> | `400` |

> [!NOTE]
> The static-asset controller passes a naming hook to `helper.upload()` whenever `resolveObjectName` or `controller.keyPrefix` is configured, or `extra.normalizeNameFn` is set - then `originalName` is metadata at the storage-helper layer, not the key, and `Báo cáo [Q3] & tổng hợp #1!.xlsx` uploads. With none of the three, the controller passes no hook, the storage helper's own lowercase-and-underscore normalizer decides the key, and `originalName` must still pass `isValidSegment()`.
>
> **One exception, at the controller layer:** `controller.keyPrefix` set with *neither* `resolveObjectName` nor `extra.normalizeNameFn` - the component's own default naming under a scope - still refuses a `/` in the original name with `400 [upload] Invalid original file name`, before the storage-helper layer is even reached. Add either hook to relax it.

`getError()` defaults `statusCode` to `400` when the caller does not pass one explicitly. Every message above is thrown without an explicit status, so all resolve to `400`.

## Header sanitization

```typescript
const WHITELIST_HEADERS = [
  HTTP.Headers.CONTENT_ENCODING,
  HTTP.Headers.CACHE_CONTROL,
  HTTP.Headers.ETAG,
  HTTP.Headers.LAST_MODIFIED,
] as const;
```

These correspond to `'content-encoding'`, `'cache-control'`, `'etag'` and `'last-modified'`.

When streaming a file - both <code v-pre>objects/{objectName}</code> and <code v-pre>download/{objectName}</code> - the controller copies only these keys from the storage metadata onto the response. Every other metadata header is dropped. Each forwarded value is sanitized with `String(value).replace(/[\r\n]/g, '')` before being set, to prevent HTTP header injection.

> [!WARNING]
> `content-type` is **not** on the list, and the served type is never taken from storage metadata or from what the uploader declared. It is derived from the object KEY by `resolveServedContentType`, because a renderable type that a client chose is stored cross-site scripting on the API origin, and `nosniff` cannot stop a type the server itself declared.

### Served content type

```typescript
const resolveServedContentType = (opts: {
  helper: IStorageHelper;
  object: IObjectRef;
}): { contentType: string; isRenderable: boolean } => { /* ... */ };
```

`resolveServedContentType` runs `helper.getMimeType({ filename: object.key })` and checks the answer against `RENDERABLE_CONTENT_TYPES`:

| Outcome | `contentType` | `isRenderable` | Response |
|---|---|---|---|
| The key's type is in `RENDERABLE_CONTENT_TYPES` | That type | `true` | Streamed inline |
| Anything else, including an unknown extension | `'application/octet-stream'` | `false` | `Content-Disposition: attachment` |

`RENDERABLE_CONTENT_TYPES` holds `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, `image/bmp`, `image/x-icon`, `video/mp4`, `video/webm`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `application/pdf`, `text/plain` and `text/csv`. `image/svg+xml` is deliberately absent, because SVG carries script.

The function is exported, so a hand-written route makes the same decision rather than reinventing it.

All streaming responses also set:

```http
X-Content-Type-Options: nosniff
Content-Security-Policy: sandbox
Content-Type: <resolveServedContentType, from the object key>
Content-Length: <bytes in the response body>
Content-Disposition: attachment; filename="..."   (always on download; on objects when the type is not renderable)
Accept-Ranges: bytes                              (objects route, advertised unconditionally)
Content-Range: bytes {start}-{end}/{size}         (objects route, on a 206 Partial Content)
```

`Content-Security-Policy: sandbox` is set even for a renderable type, so an unforeseen renderable type still cannot reach this origin.

## Object name decoding

Hono percent-decodes a path param before the handler reads it. The controller's `readObjectName()` is therefore a deliberate no-op - it does not run a second `decodeURIComponent()`:

- `report_100%.pdf` is a legal object name. Its link is `.../objects/report_100%25.pdf`. Hono hands the handler back `report_100%.pdf`. A second decode would hit the invalid escape `%.p` and throw - the object would become permanently unfetchable and undeletable.
- An object named `a%2Fb.png` would decode twice into `a/b.png` - a different object than the one requested.

`isValidBucketName()`/`isValidObjectKey()` still run on the singly-decoded value, so a traversal payload is rejected exactly as before.

## `AssetIngest`

`AssetIngest.fromUrl()` fetches a remote URL and stores what comes back, without the body passing through this process. It is on the `@venizia/ignis/static-asset` barrel and works against any `IStorageHelper` - no controller involved.

```typescript
class AssetIngest {
  static fromUrl(opts: IIngestFromUrlOptions): Promise<IIngestFromUrlResult>;
}

interface IIngestFromUrlResult {
  upload: IUploadResult;
  stat: IFileStat;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `helper` | `IStorageHelper` | - | Where the object lands. |
| `url` | `string` | - | The remote URL to fetch. |
| `bucket` | `IBucketRef` | - | The target bucket. |
| `normalizeLinkFn` | `(opts: { bucket: IBucketRef; object: IObjectRef }) => string` | - | **Required.** Where the object is served from. An empty return throws. |
| `resolveKey` | `(opts: { url: URL; contentType: string }) => string` | The URL's last path segment | Decides the stored key. |
| `folderPath` | `string` | `undefined` | Prefixed onto the derived key. Ignored when `resolveKey` is set. |
| `policy` | `IUrlSafetyPolicy` | https only, no private address, 3 hops, 10s, 10 MB | Passed to `UrlIngest.fetchGuarded`. |
| `maxFolderDepth` | `number` | `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH` (`2`) | The same depth rule the upload route applies. |

```typescript
const { upload, stat } = await AssetIngest.fromUrl({
  helper,
  url: 'https://cdn.example.com/logo.png',
  bucket: { name: 'uploads' },
  normalizeLinkFn: ({ bucket, object }) =>
    buildObjectLink({ basePath: '/assets', bucket, object }),
});
```

- **The URL is guarded.** `UrlIngest.fetchGuarded` enforces the scheme allow-list, checks every resolved address, walks redirects by hand with a per-hop re-check, and applies a timeout.
- **The body is capped twice.** A declared `content-length` over `policy.maxBytes` is refused before the write starts, with `UrlSafetyErrors.URL_REFUSED`. A body that lies or omits the header is cut off mid-flight by `UrlIngest.capStream`.
- **The content type comes from the stored key**, never from what the remote host claimed - the same rule the asset routes apply, and for the same reason.
- **It writes no meta link.** The columns an application attaches to an object come from its own domain, so the row stays yours. `stat` is returned because `getStat` already ran, so writing that row costs nothing extra.

> [!WARNING]
> Without `resolveKey`, the key comes from the remote URL's last path segment - named by whoever supplied the URL. Pass `resolveKey` whenever the URL is not your own. Validation bounds what that name can do; it does not make the name yours.

## `TMetaLinkConfig`

```typescript
type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: TValueOrAsyncResolver<typeof BaseRelationalEntity<Schema>>;
  repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    query: TUploadQuery;
  }) => ValueOrPromise<{ count: number; data: Schema }>;
};
```

Both classes come from the separate `@venizia/ignis-connectors` package, imported here from its `@venizia/ignis-connectors/postgres` subpath.

| Name | Where it lives | What it is |
|---|---|---|
| `BaseRelationalEntity` | `packages/connectors/src/relational/core/models/base.ts` | The engine-neutral entity base. `BasePostgresEntity` is an alias re-export of it. |
| `DefaultCRUDRepository` | `packages/connectors/src/relational/postgres/repositories/core/default.ts` | The Postgres binding of `DefaultRelationalRepository`, not an alias of it. This is the type `repository` must satisfy. |
| `DefaultRelationalRepository` | `packages/connectors/src/relational/core/repositories/core/default.ts` | The engine-neutral base each engine subclasses. |

## MetaLink SQL schema

**Table:** `MetaLink`

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | Row creation time |
| `modified_at` | TIMESTAMPTZ | No | `NOW()` | Row last-update time |
| `bucket_name` | TEXT | No | - | Storage bucket name |
| `object_name` | TEXT | No | - | File object name (may include folder segments) |
| `link` | TEXT | No | - | Access URL to the file |
| `mimetype` | TEXT | No | - | File MIME type |
| `size` | INTEGER | No | - | File size in bytes |
| `etag` | TEXT | Yes | - | Entity tag for versioning |
| `metadata` | JSONB | Yes | - | Additional file metadata |
| `storage_type` | TEXT | No | - | `'disk'` or `'bun-s3'` |
| `is_synced` | BOOLEAN | No | `false` | Set `true` on every upload and every meta-links sync |
| `variant` | TEXT | Yes | - | Upload variant tag (for example `'thumbnail'`, `'original'`) |
| `sequence` | INTEGER | No | `0` | Display order within one principal. Defaults to `0` so legacy rows tie, and `ORDER BY sequence, createdAt` reproduces the order they already had |
| `principal_type` | TEXT | Yes | - | Associated principal type |
| `principal_id` | TEXT | Yes | - | Associated principal ID, always stored as a string |

**Indexes:** `bucket_name`, `object_name`, `storage_type`, `is_synced`, and a composite index on `(principal_type, principal_id, sequence)` for ordering within one principal.

`@model({ type: 'entity', skipMigrate: true })` on `BaseMetaLinkModel` means IGNIS's schema migration skips this table. Create it manually, once, per database.

### MetaLink lifecycle

- **On upload:**
  - Creates one MetaLink row per uploaded file, after fetching fresh stats via `helper.getStat()`.
  - Uses `metaLink.createMetaLink()` when provided, otherwise a default insert that covers every standard field.
  - `principalType`, `principalId`, `variant` and `sequence` come from the upload's **form fields** - an identifier in a URL lands in every access log on the way. A label in the query string is refused with `400 core.static_asset.labels_in_query`, before the body is read. `upload-commit` takes four of them in its JSON body, with the same refusal; `folderPath` is refused there with its own reason - the object key was fixed when the policy was issued. `PUT .../meta-links/{objectName}` takes no labels at all and refuses any.
  - If the insert throws, the upload still succeeds. The file's response entry gets <code v-pre>metaLink: { error: 'META_LINK_CREATE_FAILED' }</code> - a fixed code, never the driver's text - and the real error is logged in full. This handler returns `200`, so it bypasses the error middleware that strips `detail`/`table`/`constraint`; returning a code is what keeps raw constraint names off the wire.
- **On delete:**
  - The storage delete happens first and is awaited.
  - The MetaLink row delete (`deleteAll({ where: { bucketName, objectName } })`) fires without being awaited.
  - The HTTP response returns as soon as the storage delete resolves - the database delete may still be in flight.
  - Errors there are logged, never surfaced to the client.
- **On sync (`PUT meta-links/:objectName`, `recreateMetaLink`):** refreshes first, creates only if nothing was there to refresh. `MetaLinkRecreateActions` names the two outcomes: `'refreshed'` and `'created'`, and the OpenAPI document types `action` as that literal enum, not a bare `string`.

  | Step | What runs | Rows touched |
  |------|-----------|--------------|
  | Refresh, `metaLink.createMetaLink` configured | One `repository.updateAll({ data: { mimetype, size, etag, isSynced: true }, where: { bucketName, objectName } })` - `link` and `metadata` are left alone, because the hook owns them | Every row for that `(bucketName, objectName)` pair |
  | Refresh, no hook | The same `updateAll`, plus `link` in the same statement; then one `updateById` **per row**, `{ metadata: { ...row.metadata, ...fileStat.metadata } }` - the stat's keys win, the row's other keys survive. Skipped entirely when the stat carries no metadata | Every row for that `(bucketName, objectName)` pair |
  | Create | Only when the refresh updated `0` rows: `createMetaLinkRow` - the same builder `upload` and `upload-commit` use, so `metaLink.createMetaLink` runs when provided, with a fresh `getStat()` result | One row, with no principal and no labels |

  Rows per pair are deliberately not unique, and a refresh keeps each row's own `storageType` and labels (`variant`, `principalType`, `principalId`, `sequence`) either way.

  The response is <code v-pre>{ success: true, action: 'refreshed' \| 'created', count, metaLink, metaLinks }</code>. `count` is the number of rows touched; `metaLinks` holds all of them; `metaLink` is kept for existing callers and is `metaLinks[0]`.

  Refresh-then-create is not atomic: two concurrent calls on an object with no existing row can both create one. Rows per pair are deliberately not unique, so the table allows it.

  > [!WARNING]
  > Without a hook, the `metadata` merge is a read-then-write per row: the `updateAll`'s own `RETURNING` supplies the "read", and each row's `updateById` is a separate statement after it. An application write to that row's `metadata` landing between the two is overwritten by the merge.

## Component lifecycle

1. `binding()` reads `STATIC_ASSET_COMPONENT_OPTIONS` from the DI container.
2. Iterates each key in the options object.
3. For each entry, builds a `normalizeLinkFn` default if the caller did not supply one (see [Default normalizeLinkFn](#default-normalizelinkfn)).
4. Calls `AssetControllerFactory.defineAssetController()` and registers the result with `this.application.controller()`.
5. Logs the storage key, storage type, and whether MetaLink is enabled for each registered backend.

`StaticAssetComponent` itself performs no eager configuration validation beyond the options type. A missing `metaLink` when `useMetaLink: true` is caught at compile time by the discriminated union, not at `binding()` runtime.

## See also

- [Overview](./) - quick start, imports, and common configuration tasks
- [Usage & Examples](./usage) - task-oriented walkthroughs for every endpoint and MetaLink setup
- [Error Reference](./errors) - name validation rules and troubleshooting
