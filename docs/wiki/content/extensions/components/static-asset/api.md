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
- [`packages/core-server/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/models/base.model.ts)
- [`packages/core-server/src/components/static-asset/repositories/base.repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/repositories/base.repository.ts)
- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts)
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts)
- [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts)
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts)
- [`packages/helpers/src/utilities/request.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/request.utility.ts)

## Quick reference

| Item | Value |
|------|-------|
| Package | `@venizia/ignis` (core component) + `@venizia/ignis-helpers` (storage helpers) |
| Component class | `StaticAssetComponent` |
| Import subpath | `@venizia/ignis/static-asset` - not on the root barrel |
| Storage helpers | `DiskHelper`, `MinioHelper` (`@venizia/ignis-helpers/minio`), `BunS3Helper` (`@venizia/ignis-helpers/bun-s3`) |
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
  BaseMetaLinkModel,
  BaseMetaLinkRepository,
} from '@venizia/ignis/static-asset';

import type {
  TStaticAssetsComponentOptions,
  TStaticAssetExtraOptions,
  TMetaLinkConfig,
  TStaticAssetStorageType,
  IAssetControllerOptions,
} from '@venizia/ignis/static-asset';

// Helpers - main entry + storage-backend subpaths
import { DiskHelper } from '@venizia/ignis-helpers';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
```

## Binding keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/static-asset-component/options` | `StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` | `TStaticAssetsComponentOptions` | Yes | `{}` |

> [!NOTE]
> `StaticAssetComponent`'s constructor binds an empty `{}` default for this key. `binding()` iterates `Object.entries(componentOptions)` - an empty object produces zero controllers, no error. Bind your configuration in `preConfigure()` before `this.component(StaticAssetComponent)`.

## `TStaticAssetsComponentOptions`

```typescript
type TStaticAssetsComponentOptions = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;
      routes?: {
        getBuckets?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        getBucketByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        createBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        deleteBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        upload?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        listObjects?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        deleteObject?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        getObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        downloadObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        recreateMetaLink?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
      };
    };
    extra?: TStaticAssetExtraOptions;
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
    | { storage: typeof StaticAssetStorageTypes.MINIO; helper: MinioHelper }
  ) &
    ({ useMetaLink?: false | undefined } | { useMetaLink: true; metaLink: TMetaLinkConfig });
};
```

| Field | Type | Default | Description |
|-------|------|---------|--------------|
| `controller.name` | `string` | - | Class name given to the generated controller (via `Object.defineProperty`) |
| `controller.basePath` | `string` | - | Mount path, for example `'/assets'` |
| `controller.isStrict` | `boolean` | `true` | Passed through to `BaseRestController`'s strict routing mode |
| `controller.routes` | object | `undefined` | Per-route overrides - see [Per-route overrides](#per-route-overrides) |
| `storage` | `'disk' \| 'minio' \| 'bun-s3'` | - | Selects which `helper` type is required (discriminated union) |
| `helper` | `DiskHelper \| MinioHelper \| BunS3Helper` | - | Storage backend instance matching `storage` |
| `extra` | `TStaticAssetExtraOptions` | `undefined` | Multipart parsing mode, name/link normalization, max folder depth |
| `useMetaLink` | `boolean` | `false` | Enables the `PUT .../meta-links/:objectName` route and DB tracking on upload/delete |
| `metaLink` | `TMetaLinkConfig` | - | Required when `useMetaLink: true`; ignored otherwise |

### Per-route overrides

Each key accepts a `Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>` - typically `authenticate`, `authorize`, `path`, and `middleware`. It is shallow-merged onto the base definition: `{ ...StaticAssetDefinitions.UPLOAD, ...routes?.upload }`.

| Route key | HTTP Method | Base Path |
|-----------|-------------|-----------|
| `getBuckets` | `GET` | `/buckets` |
| `getBucketByName` | `GET` | <code v-pre>/buckets/{bucketName}</code> |
| `createBucket` | `POST` | <code v-pre>/buckets/{bucketName}</code> |
| `deleteBucket` | `DELETE` | <code v-pre>/buckets/{bucketName}</code> |
| `upload` | `POST` | <code v-pre>/buckets/{bucketName}/upload</code> |
| `listObjects` | `GET` | <code v-pre>/buckets/{bucketName}/objects</code> |
| `getObjectByName` | `GET` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> |
| `downloadObjectByName` | `GET` | <code v-pre>/buckets/{bucketName}/download/{objectName}</code> |
| `deleteObject` | `DELETE` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> |
| `recreateMetaLink` | `PUT` | <code v-pre>/buckets/{bucketName}/meta-links/{objectName}</code> - only registered when `useMetaLink: true` |

## `TStaticAssetExtraOptions`

```typescript
type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  /** Maximum folder nesting depth allowed in object paths. Default: 2 */
  maxFolderDepth?: number;
  [key: string]: any;
};
```

> [!NOTE]
> `normalizeNameFn` receives **both** `originalName` and `folderPath`. The second argument lets a custom implementation decide how to fold the target folder into the stored name. Omit `folderPath` handling and nested uploads flatten into the bucket root.

| Field | Default | Notes |
|-------|---------|-------|
| `parseMultipartBody.storage` | `'memory'` | `'disk'` spools to `uploadDir`, then the controller reads the file back with `readFileSync` before handing it to the storage helper |
| `parseMultipartBody.uploadDir` | `'./uploads'` | Created with <code v-pre>fs.mkdirSync({ recursive: true })</code> if missing |
| `normalizeNameFn` | `BaseStorageHelper`'s internal lowercase + `_`-for-space normalizer | Runs before the file is written; its output is re-validated with `isValidPath()` |
| `normalizeLinkFn` | Component-generated - see below | Runs after the write to build the returned `link` |
| `maxFolderDepth` | `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH` (`2`) | Folder segments only - the filename itself does not count against this limit |

### Default `normalizeLinkFn`

`StaticAssetComponent.binding()` always supplies a `normalizeLinkFn` to the factory - your own `extra.normalizeLinkFn` if set, otherwise this default:

```typescript
(opts: { bucketName: string; normalizeName: string }) => {
  const encodedPath = encodeURIComponent(opts.normalizeName);
  return `${controller.basePath}/buckets/${opts.bucketName}/objects/${encodedPath}`;
};
```

This is why every generated link points back at the `objects/{objectName}` stream route by default, regardless of storage backend.

`BaseStorageHelper` has its own backend-specific `normalizeObjectLink()`. It only runs when you call a helper's `upload()` directly, outside the component. Through `StaticAssetComponent`, the component's default `normalizeLinkFn` always takes priority instead.

## Storage types

```typescript
class StaticAssetStorageTypes {
  static readonly DISK = 'disk';
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
| `'minio'` | `StaticAssetStorageTypes.MINIO` | `MinioHelper` | A MinIO or S3-compatible endpoint |
| `'bun-s3'` | `StaticAssetStorageTypes.BUN_S3` | `BunS3Helper` | Bun runtime (imports Bun's native `S3Client`) |

## Storage helpers

### `IStorageHelper` interface

Every backend implements this contract; `BaseStorageHelper` (abstract) implements the shared parts (`isValidName`, `isValidPath`, `upload`, `getMimeType`, `getFileType`) and leaves the rest abstract.

```typescript
interface IStorageHelper {
  isValidName(name: string): boolean;
  isValidPath(pathStr: string, opts?: { maxDepth?: number }): boolean;

  isBucketExists(opts: { name: string }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  removeBucket(opts: { name: string }): Promise<boolean>;

  upload(opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
    maxFolderDepth?: number;
  }): Promise<IUploadResult[]>;

  getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;
  getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
  removeObject(opts: { bucket: string; name: string }): Promise<void>;
  removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;
  listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;

  getFileType(opts: { mimeType: string }): string;
}
```

```
IStorageHelper (interface)
    |
BaseStorageHelper (abstract - implements isValidName/isValidPath/upload/getMimeType/getFileType)
    |
    +-- DiskHelper    (local filesystem)
    +-- MinioHelper   (S3-compatible)
    +-- BunS3Helper   (Bun-native S3, Bun only)
```

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

interface IUploadResult {
  bucketName: string;
  objectName: string;
  link: string;
  metaLink?: any;
  metaLinkError?: any;
}

interface IFileStat {
  size: number;
  metadata: Record<string, any>;
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
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}
```

### Name and path validation (`BaseStorageHelper`)

`isValidName(name)` rejects any of the following, in order:

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

`isValidPath(pathStr, { maxDepth })` runs these checks, in order:

| Step | Behavior |
|------|----------|
| Normalize | Trims leading/trailing slashes |
| Empty check | Rejects if the result is empty |
| Double slashes | Rejects empty segments, for example `a//b` |
| Folder depth | `folderDepth = segments.length - 1`; rejects if it exceeds `maxDepth` (default `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH = 2`) |
| Segment names | Every segment must pass `isValidName()` |
| Path length | Rejects a normalized length over 1024 characters |

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

### `MinioHelper`

```typescript
interface IMinioHelperOptions extends ClientOptions { // minio's own SDK options, plus:
  scope?: string;
  identifier?: string;
}
```

`ClientOptions` comes straight from the `minio` package - `endPoint`, `port`, `useSSL`, `accessKey`, `secretKey`, and the rest of the MinIO client's own configuration surface.

```typescript
const minioHelper = new MinioHelper({
  endPoint: 'minio.example.com',
  port: 9000,
  useSSL: true,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
```

### `BunS3Helper`

```typescript
interface IBunS3HelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;       // Default: 'us-east-1'
  sessionToken?: string;
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
  endpoint: 'https://s3.us-east-1.amazonaws.com',
});
```

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
}
```

1. Creates a class extending `BaseRestController`, decorated `@controller({ path: basePath })`.
2. Renames it via `Object.defineProperty(GeneratedStaticAssetController, 'name', { value: name, configurable: true })` so logs and DI bindings show your configured `controller.name`, not a generic factory name.
3. Binds every route in `binding()` with `this.bindRoute({ configs }).to({ handler })`, spread-merging each base definition with its `routes?.<key>` override.
4. Registers `recreateMetaLink` only when `useMetaLink && metaLink` are both set.
5. `StaticAssetComponent.binding()` registers the resulting class with `this.application.controller(...)`.

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

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/buckets` | No params. Returns `IBucketInfo[]` |
| `GET` | <code v-pre>/buckets/{bucketName}</code> | Returns `IBucketInfo \| null` |
| `POST` | <code v-pre>/buckets/{bucketName}</code> | Returns the created `IBucketInfo`. Throws if the bucket already exists or the name is invalid - see [Error Reference](./errors) |
| `DELETE` | <code v-pre>/buckets/{bucketName}</code> | Returns <code v-pre>{ isDeleted: boolean }</code> |
| `POST` | <code v-pre>/buckets/{bucketName}/upload</code> | `multipart/form-data` body; query: `principalType?`, `principalId?`, `variant?`, `folderPath?`. Returns `IUploadResult[]` |
| `GET` | <code v-pre>/buckets/{bucketName}/objects</code> | Query: `prefix?`, `recursive?` (`'true'` string only), `maxKeys?` (positive integer string). Returns `IObjectInfo[]` |
| `GET` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> | Streams the file inline. `objectName` is a single percent-encoded segment |
| `GET` | <code v-pre>/buckets/{bucketName}/download/{objectName}</code> | Streams the file with `Content-Disposition: attachment` |
| `DELETE` | <code v-pre>/buckets/{bucketName}/objects/{objectName}</code> | Returns <code v-pre>{ success: boolean }</code> |
| `PUT` | <code v-pre>/buckets/{bucketName}/meta-links/{objectName}</code> | Only registered when `useMetaLink: true`. Returns <code v-pre>{ success: boolean, metaLink }</code> |

### Upload validation order

1. `bucketName` validated with `isValidName()` - `400 "Invalid bucket name"` on failure.
2. If `folderPath` is present, three checks run in order:

   | Check | Failure |
   |-------|---------|
   | Trim leading/trailing slashes | `400 "Invalid folder path"` if empty after trimming |
   | Segment count vs. `maxFolderDepth` | `400 "Folder path exceeds max depth of {n}"` if over |
   | Each segment via `isValidName()` | `400 "Invalid folder path segment: {segment}"` if any fails |

3. `multipart/form-data` parsed via `parseMultipartBody()`.
4. Each file's effective buffer is checked non-empty - direct `buffer`, or `readFileSync(file.path)` when `storage: 'disk'` was used. Empty content returns `400 "Empty file content | name: {originalName}"`.
5. `helper.upload()` runs the storage-helper-level checks below.
6. Spool files written by `storage: 'disk'` parsing are removed in a `finally` block via `rmSync({ force: true })` - regardless of success or failure. Removal errors are logged, never thrown.

### Storage-helper-level upload checks (`BaseStorageHelper.upload`)

These run inside `helper.upload()`, separate from the controller checks above. They are reachable even when a caller uses the storage helper directly:

| Check | Error message | Default status |
|-------|----------------|-----------------|
| Bucket does not exist (`isBucketExists()` false) | <code v-pre>[upload] Bucket does not exist \| name: {bucket}</code> | `400` |
| `originalName` fails `isValidName()` | `[upload] Invalid original file name` | `400` |
| `folderPath` segment count exceeds `maxFolderDepth` | <code v-pre>[upload] Invalid folder path \| depth: {n} \| max: {m}</code> | `400` |
| `folderPath` fails `isValidPath()` for any other reason | `[upload] Invalid folder path` | `400` |
| `size` is `undefined`, `null`, or negative | <code v-pre>[upload] Invalid file size \| size: {size}</code> | `400` |
| Normalized name (post `normalizeNameFn`) fails `isValidPath()` | <code v-pre>[upload] Invalid normalized object name \| name: {name}</code> | `400` |

`getError()` defaults `statusCode` to `400` when the caller does not pass one explicitly. Every message above is thrown without an explicit status, so all resolve to `400`.

## Header sanitization

```typescript
const WHITELIST_HEADERS = [
  'content-type',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
] as const;
```

These correspond to `HTTP.Headers.CONTENT_TYPE`, `CONTENT_ENCODING`, `CACHE_CONTROL`, `ETAG`, and `LAST_MODIFIED` from `@venizia/ignis-helpers`.

When streaming a file - both `objects/{objectName}` and `download/{objectName}` - the controller copies only these keys from the storage metadata onto the response. Every other metadata header is dropped. Each forwarded value is sanitized with `String(value).replace(/[\r\n]/g, '')` before being set, to prevent HTTP header injection.

All streaming responses also set:

```http
X-Content-Type-Options: nosniff
Content-Type: <from metadata, or application/octet-stream as fallback>
Content-Length: <file size in bytes>
Content-Disposition: attachment; filename="..."   (download endpoint only, via createContentDispositionHeader())
```

## Object name decoding

Hono percent-decodes a path param before the handler reads it. The controller's `readObjectName()` is therefore a deliberate no-op - it does not run a second `decodeURIComponent()`:

- `report_100%.pdf` is a legal object name. Its link is `.../objects/report_100%25.pdf`. Hono hands the handler back `report_100%.pdf`. A second decode would hit the invalid escape `%.p` and throw - the object would become permanently unfetchable and undeletable.
- An object named `a%2Fb.png` would decode twice into `a/b.png` - a different object than the one requested.

`isValidName()`/`isValidPath()` still run on the singly-decoded value, so a traversal payload is rejected exactly as before.

## `TMetaLinkConfig`

```typescript
type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseRelationalEntity<Schema>;
  repository: DefaultRelationalRepository<Schema>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    query: TUploadQuery;
  }) => ValueOrPromise<{ count: number; data: Schema }>;
};
```

| Canonical name | Alias |
|----------------|-------|
| `BaseRelationalEntity` | `BasePostgresEntity` |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` |

Both canonical classes live in `packages/core-server/src/connectors/postgres/`. Each alias re-exports the same class under a different name.

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
| `storage_type` | TEXT | No | - | `'disk'`, `'minio'`, or `'bun-s3'` |
| `is_synced` | BOOLEAN | No | `false` | Set `true` on every upload and every meta-links sync |
| `variant` | TEXT | Yes | - | Upload variant tag (for example `'thumbnail'`, `'original'`) |
| `principal_type` | TEXT | Yes | - | Associated principal type |
| `principal_id` | TEXT | Yes | - | Associated principal ID, always stored as a string |

**Indexes:** `bucket_name`, `object_name`, `storage_type`, `is_synced`.

`@model({ type: 'entity', skipMigrate: true })` on `BaseMetaLinkModel` means IGNIS's schema migration skips this table. Create it manually, once, per database.

### MetaLink lifecycle

- **On upload:**
  - Creates one MetaLink row per uploaded file, after fetching fresh stats via `helper.getStat()`.
  - Uses `metaLink.createMetaLink()` when provided, otherwise a default insert that covers every standard field.
  - `principalType`, `principalId`, and `variant` come from the upload's query parameters.
  - If the insert throws, the upload still succeeds. The file's response entry gets `metaLink: null` plus a `metaLinkError` string, and the error is logged.
- **On delete:**
  - The storage delete happens first and is awaited.
  - The MetaLink row delete (`deleteAll({ where: { bucketName, objectName } })`) fires without being awaited.
  - The HTTP response returns as soon as the storage delete resolves - the database delete may still be in flight.
  - Errors there are logged, never surfaced to the client.
- **On sync (`PUT meta-links/:objectName`):** looks up an existing row by `bucketName` + `objectName`.

  | Row found? | Action |
  |------------|--------|
  | Yes | `updateById()`, then re-fetches with `findById()` |
  | No | `create()` |

  Either path sets `isSynced: true` and returns `{ success: true, metaLink }`.

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
