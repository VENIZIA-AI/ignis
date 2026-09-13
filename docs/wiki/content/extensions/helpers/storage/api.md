---
title: Storage - Full Reference
description: Complete reference for the storage class hierarchy, every backend's method behavior, name validation rules, and error messages
difficulty: intermediate
---

# Storage - Full Reference

Exhaustive reference for `BaseStorageHelper`, the three `IStorageHelper` backends, `MemoryStorageHelper`, and every type. For a readable introduction and the common tasks, start with the [Storage overview](/extensions/helpers/storage/).

Every public method takes one options object with nested refs: `{ bucket: { name }, object: { key } }`. A flat `{ bucket: string, name: string }` call does not compile.

**Files:**

- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts) - `BaseStorageHelper`
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `BunS3Helper`
- [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts) - `buildSignedRequest` (AWS SigV4 for bucket management)
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts) - `DiskHelper`
- [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts) - `MinioHelper` (deprecated)
- [`packages/helpers/src/modules/storage/in-memory/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/in-memory/helper.ts) - `MemoryStorageHelper`
- [`packages/helpers/src/modules/storage/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/common/types.ts) - `IStorageHelper` and every option/result type
- [`packages/helpers/src/modules/storage/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/common/constants.ts) - `StoragePresignDefaults`, `StoragePresignLimits`, `StorageConcurrency`
- [`packages/helpers/src/modules/storage/common/errors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/common/errors.ts) - `StorageErrors`, `isNotFoundError`
- [`packages/helpers/src/modules/storage/common/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/common/utility.ts) - `toExpirySeconds`
- [`packages/helpers/src/common/constants/mime.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/mime.ts) - `ContentTypeTable`, `MimeTypes`

## Find what you need

| You want to | Go to |
|---|---|
| See which class implements which backend | [Class and Interface Model](#class-and-interface-model) |
| Construct a backend and see its options | [BunS3Helper](#buns3helper) / [DiskHelper](#diskhelper) |
| Understand what `upload()` validates and how it writes files | [upload (template method)](#upload-template-method-shared-by-every-backend) |
| Validate a name or key before writing | [isValidSegment](#isvalidsegment) / [isValidObjectKey](#isvalidobjectkey) |
| Look up every error message `upload()` can throw | [validateUploadFiles](#upload-template-method-shared-by-every-backend) |
| Read a file back as a stream | [BunS3Helper#getObject](#getobject) / [DiskHelper#getObject](#getobject-1) |
| List or delete objects in a bucket | per-backend Methods tables ([BunS3Helper](#methods-1), [DiskHelper](#methods-2)) |
| Get a presigned URL, or read/write object tags | [Presign and object tagging](#presign-and-object-tagging) |
| Cache values in-process (not bucket storage) | [MemoryStorageHelper](#memorystoragehelper) |
| Look up a type or option shape | [Types Reference](#types-reference) |
| Compare backend differences at a glance | [Backend Behavior Matrix](#backend-behavior-matrix) |
| Fix a thrown error message | [Troubleshooting](#troubleshooting) |

## Class and Interface Model

```
BaseHelper
├── BaseStorageHelper (abstract, implements IStorageHelper)
│   ├── BunS3Helper       -- S3-compatible object storage (Bun-native S3Client)
│   ├── DiskHelper        -- Local filesystem storage
│   └── MinioHelper       -- MinIO via the minio driver (deprecated)
└── MemoryStorageHelper   -- In-memory key-value store (standalone, not IStorageHelper)
```

Every public method takes one options object with nested refs. A bucket is `IBucketRef` (`{ name }`), an object is `IObjectRef` (`{ key }`), and a method naming both takes `IObjectLocation` (`{ bucket, object }`).

- **`upload()` is a template method.** It validates the bucket and every file. Then it calls two protected hooks each backend supplies: `defaultLinkPrefix` (a getter) and `writeObject()` (the write itself).
- **Every other method is backend-specific.** `hasBucket`, `getBuckets`, `getBucket`, `createBucket`, `removeBucket`, `getObject`, `getStat`, `removeObject`, `removeObjects`, and `listObjects` are declared `abstract` on `BaseStorageHelper`.
  - Each one is fully reimplemented per backend - no logic is shared between a filesystem read and an S3 `stat()` call.

> [!TIP] Typing rule
> Declare parameters and bindings as `IStorageHelper` for `BunS3Helper` / `DiskHelper` / `MinioHelper`. `MemoryStorageHelper` does not implement it and has its own standalone API - see [MemoryStorageHelper](#memorystoragehelper).

> [!WARNING]
> `MinioHelper` and `IMinioHelperOptions` are `@deprecated`. Use `BunS3Helper` instead: it reaches MinIO over the same S3 API, and adds presigned URLs, object tagging and byte ranges.

### Import paths

```typescript
// Disk and in-memory storage (root package export)
import { DiskHelper, MemoryStorageHelper } from '@venizia/ignis-helpers';

// Bun S3 storage (separate sub-path export, Bun runtime only)
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

// MinIO (separate sub-path export, deprecated)
import { MinioHelper } from '@venizia/ignis-helpers/minio';

// Types
import type {
  IStorageHelper,
  IStorageHelperOptions,
  IDiskHelperOptions,
  IBucketRef,
  IObjectRef,
  IObjectLocation,
  IUploadFile,
  IUploadResult,
  IFileStat,
  IBucketInfo,
  IObjectInfo,
  IListObjectsOptions,
} from '@venizia/ignis-helpers';
import type { IBunS3HelperOptions } from '@venizia/ignis-helpers/bun-s3';
```

## BaseStorageHelper

`Source ->` [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts)

Abstract class extending `BaseHelper`, implementing `IStorageHelper`. Provides name/path validation, MIME type detection, and the `upload()` template method.

### Constructor

```typescript
constructor(opts: { scope: string; identifier: string })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `scope` | `string` | Logger scope name. |
| `identifier` | `string` | Helper identifier. |

Every concrete backend's constructor calls `super()` with its own defaults: `scope: options.scope ?? <ClassName>`, `identifier: options.identifier ?? <ClassName>`. That's why `scope` and `identifier` are required here, but optional on every subclass's public options type.

### Static properties

#### ContentTypeTable.BY_EXTENSION

```typescript
class ContentTypeTable {
  static readonly BY_EXTENSION: Readonly<Partial<Record<string, TContentType>>>;
  static resolve(opts: { filename: string }): TContentType;
}
```

The extension-to-content-type table lives on `ContentTypeTable` in `@venizia/ignis-helpers/common`, not on `BaseStorageHelper`. `getMimeType()` is a one-line delegate to `ContentTypeTable.resolve`.

| Extension | MIME Type | Extension | MIME Type |
|-----------|-----------|-----------|-----------|
| `.png` | `image/png` | `.mp4` | `video/mp4` |
| `.jpg`, `.jpeg` | `image/jpeg` | `.webm` | `video/webm` |
| `.gif` | `image/gif` | `.mp3` | `audio/mpeg` |
| `.webp` | `image/webp` | `.wav` | `audio/wav` |
| `.svg` | `image/svg+xml` | `.zip` | `application/zip` |
| `.pdf` | `application/pdf` | `.csv` | `text/csv` |
| `.json` | `application/json` | `.xml` | `application/xml` |
| `.txt` | `text/plain` | `.html` | `text/html` |
| `.css` | `text/css` | `.js` | `text/javascript` |

Falls back to `application/octet-stream` for unrecognized extensions.

#### DEFAULT_MAX_FOLDER_DEPTH

```typescript
static readonly DEFAULT_MAX_FOLDER_DEPTH = 2
```

Default folder nesting allowed by `isValidObjectKey()` and `upload()` when the caller does not pass `maxFolderDepth` / `opts.maxDepth`.

### Methods

#### getMimeType

```typescript
getMimeType(opts: { filename: string }): string
```

Takes the tail after the last dot, lowercases it, and looks it up in `ContentTypeTable.BY_EXTENSION`. `node:path` is deliberately not used, so the table stays reachable from the browser-pure `./common` subpath.

```typescript
storage.getMimeType({ filename: 'photo.jpg' });    // 'image/jpeg'
storage.getMimeType({ filename: 'data.csv' });     // 'text/csv'
storage.getMimeType({ filename: 'unknown.xyz' });  // 'application/octet-stream'
```

**Returns:** content type string, or `'application/octet-stream'` if unrecognized.

#### isValidSegment

```typescript
isValidSegment(opts: { segment: string }): boolean
```

Validates a **single path segment**: a bucket name or a bare file name, which must not contain `/`. Used internally to validate each segment of a key. Logs a specific error for whichever rule fails.

| Rule (checked in order) | Example rejected | Reason |
|---|---|---|
| Must be a string | (non-string) | Type safety |
| Must not be empty | `''` | Invalid input |
| Must not contain `..`, `/`, or `\` | `../etc/passwd` | Path traversal |
| Must not start with `.` | `.hidden` | Hidden file |
| Must not contain `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` | `file;rm -rf` | Shell injection |
| Must not contain `\n`, `\r`, or `\0` | `file\nname` | Header injection |
| Must not exceed 255 characters | (very long string) | DoS prevention |
| Must not be whitespace-only | `'   '` | Invalid input |

```typescript
storage.isValidSegment({ segment: 'my-file.pdf' });    // true
storage.isValidSegment({ segment: '../etc/passwd' });  // false -- contains path separators
storage.isValidSegment({ segment: '.hidden' });        // false -- starts with dot
```

**Returns:** `true` if the segment passes every check, `false` otherwise.

#### isValidBucketName

```typescript
isValidBucketName(opts: { bucket: IBucketRef }): boolean
```

A bucket name is one segment, so this delegates straight to `isValidSegment({ segment: bucket.name })`. A separator inside it would silently address a different bucket.

```typescript
storage.isValidBucketName({ bucket: { name: 'user-uploads' } });  // true
storage.isValidBucketName({ bucket: { name: 'a/b' } });           // false
```

#### isValidObjectKey

```typescript
isValidObjectKey(opts: { object: IObjectRef; maxDepth?: number }): boolean
```

Validates a **full object key** that may include folder segments, for example `2025/uploads/report.pdf`. It trims leading and trailing slashes, splits on `/`, validates each segment with `isValidSegment`, and enforces a maximum folder depth. See the exact rules below.

| Rule (checked in order) | Description |
|---|---|
| 1 | Must be a non-empty string |
| 2 | After stripping leading/trailing slashes, must not be empty |
| 3 | Must not contain empty segments (double slashes, e.g. `a//b`) |
| 4 | Folder depth (`segments.length - 1`) must not exceed `opts.maxDepth` (default `DEFAULT_MAX_FOLDER_DEPTH`, `2`) |
| 5 | Every segment must pass `isValidSegment()` |
| 6 | Total normalized key length must not exceed 1024 characters |

```typescript
storage.isValidObjectKey({ object: { key: 'folder/file.pdf' } });   // true
storage.isValidObjectKey({ object: { key: '../etc/passwd' } });     // false -- path traversal
storage.isValidObjectKey({ object: { key: 'a/b/c/d/file.pdf' } });  // false -- over the default depth of 2
```

**Returns:** `true` if the key and all its segments are valid, `false` otherwise.

> [!NOTE]
> The six rules above live on `protected isValidKeyPath({ path, maxDepth })`, which `isValidObjectKey` and `upload`'s own `folderPath` check both call. It is protected, so `isValidObjectKey` is the way in from outside the class.

#### getMediaType

```typescript
getMediaType(opts: { mimeType: string }): string
```

Categorizes a MIME type using the `MimeTypes` const-class: `UNKNOWN`, `IMAGE`, `VIDEO`, `TEXT`. It lowercases `mimeType` first, then checks whether it starts with `image`, `video`, or `text`.

```typescript
storage.getMediaType({ mimeType: 'image/png' });        // 'image'
storage.getMediaType({ mimeType: 'video/mp4' });         // 'video'
storage.getMediaType({ mimeType: 'text/plain' });        // 'text'
storage.getMediaType({ mimeType: 'application/pdf' });   // 'unknown'
```

**Returns:** one of `'image'`, `'video'`, `'text'`, or `'unknown'`.

#### upload (template method - shared by every backend)

```typescript
async upload(opts: {
  bucket: IBucketRef;
  files: IUploadFile[];
  normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
  normalizeLinkFn?: (opts: IObjectLocation) => string;
  maxFolderDepth?: number;
}): Promise<IUploadResult[]>
```

`TUploadNaming` is `Pick<IUploadFile, 'originalName' | 'folderPath'>` - the two fields a naming hook needs.

Implemented once on `BaseStorageHelper`; no backend overrides it. Steps, in order:

1. Returns `[]` immediately if `files` is empty.
2. Calls `hasBucket({ bucket })`; throws if the bucket does not exist.
3. Validates every file (`validateUploadFiles`, below).
4. For each file, with bounded concurrency of `StorageConcurrency.DEFAULT_LIMIT` (`16`):
   - Computes the object `key` via `normalizeNameFn` if provided. Otherwise the default normalizer lowercases the name, replaces spaces with `_`, and prefixes `{folderPath}/` if set.
   - Re-validates the key with `isValidObjectKey({ object: { key }, maxDepth: maxFolderDepth })`. This catches a traversal payload returned by a **custom** `normalizeNameFn`, even though `originalName` already passed validation.
   - Computes `link` via `normalizeLinkFn` if provided. Otherwise it builds the default: `{defaultLinkPrefix}{bucket.name}/{key}`, with each `/`-segment run through `encodeURIComponent`.
   - Calls the backend's `writeObject({ bucket, object, file })`.
   - Logs an info line with `key`, `link`, `mimeType`, `encoding`, `size`, and elapsed time.
5. Returns `{ bucket: { name }, object: { key, size, contentType }, link }` per file.

**`validateUploadFiles` (per file, in order):**

| Check | Throws |
|---|---|
| `isValidSegment({ segment: originalName })` | `'[upload] Invalid original file name'` |
| If `folderPath` set: segment count vs. `maxFolderDepth ?? DEFAULT_MAX_FOLDER_DEPTH` | `` `[upload] Invalid folder path | depth: {depth} | max: {max}` `` |
| If `folderPath` set: the same path rule `isValidObjectKey` enforces | `'[upload] Invalid folder path'` |
| `size` must be a number `>= 0`. `undefined`, `null`, and negative values are rejected; `0` is a legal empty file. | `` `[upload] Invalid file size | size: {size}` `` |

**Also throws:**

| When | Message |
|---|---|
| Bucket does not exist | `` `[upload] Bucket does not exist | name: {bucket}` `` |
| A custom `normalizeNameFn` returns a key that fails `isValidObjectKey` | `` `[upload] Invalid normalized object name | name: {name}` `` |

### Streaming reads and writes

```typescript
getObjectStream(
  opts: IObjectLocation & { range?: { start: number; end?: number } },
): Promise<ReadableStream<Uint8Array>>;

writeStream(
  opts: IObjectLocation & {
    source: ReadableStream<Uint8Array> | Blob | Response | Request;
    contentType?: string;
    maxFolderDepth?: number;
  },
): Promise<void>;
```

- **`getObjectStream` returns a web stream**, which is what a `Response` body wants. `range` includes `end`, exactly like the HTTP header. The base implementation takes the window off the front of the full stream one chunk at a time; `BunS3Helper`, `DiskHelper` and `MinioHelper` each override it with a native ranged read.
- **`writeStream` writes an object without its body landing in this process.** The base implementation buffers, which is the thing to avoid, so `BunS3Helper` overrides it and hands Bun the stream directly. `contentType` falls back to `getMimeType({ filename: object.key })`.

### Protected extension points (implemented per backend)

```typescript
protected abstract get defaultLinkPrefix(): string;

protected abstract writeObject(opts: IObjectLocation & { file: IUploadFile }): Promise<void>;

protected normalizeObjectName(opts: { file: TUploadNaming }): string;
protected normalizeObjectLink(opts: IObjectLocation): string;
protected validateUploadFiles(opts: { files: IUploadFile[]; maxFolderDepth?: number }): void;
protected isValidKeyPath(opts: { path: string; maxDepth?: number }): boolean;
protected mapWithConcurrency<Item, Result>(opts: {
  items: Item[];
  limit?: number;
  task: (taskOptions: { item: Item; index: number }) => Promise<Result>;
}): Promise<Result[]>;
protected asStorageError(opts: IObjectLocation & { error: unknown; operation: string }): unknown;
```

- **`defaultLinkPrefix` and `writeObject` are `protected abstract`.** Not part of `IStorageHelper` - they exist purely so `upload()` can be written once.
- **The rest are concrete.** `mapWithConcurrency` is the shared limiter every fan-out runs through. `asStorageError` turns a backend's "not there" failure into the catalogued 404 and passes every other failure through unchanged.

### Public abstract methods (reimplemented per backend, no shared logic)

```typescript
abstract hasBucket(opts: { bucket: IBucketRef }): Promise<boolean>;
abstract getBuckets(): Promise<IBucketInfo[]>;
abstract getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
abstract createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
abstract removeBucket(opts: { bucket: IBucketRef }): Promise<boolean>;

abstract getObject(opts: IObjectLocation & { options?: any }): Promise<Readable>;
abstract getStat(opts: IObjectLocation): Promise<IFileStat>;
abstract removeObject(opts: IObjectLocation): Promise<void>;
abstract removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void>;
abstract listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
```

See each backend's section below for behavior.

### Presign and object tagging

```typescript
presignPut(opts: IObjectLocation & { expiresIn?: IDuration }): Promise<string>;
presignGet(
  opts: IObjectLocation & {
    expiresIn?: IDuration;
    responseContentType?: string;
    responseContentDisposition?: string;
  },
): Promise<string>;
getObjectTags(opts: IObjectLocation): Promise<Record<string, string>>;
replaceObjectTags(opts: IObjectLocation & { tags: Record<string, string> }): Promise<void>;
```

Concrete on `BaseStorageHelper`, not abstract - every backend inherits a working default that throws:

```typescript
class StorageHelperClassName {
  // "[StorageHelperClassName.presignPut] Presigned PUT URLs are not supported by this helper"
}
```

The thrown message names the calling class and the method, so the error tells you which backend to swap rather than returning `undefined` or a broken link. `BunS3Helper` overrides all four. `DiskHelper` has no object storage to presign against, and `MinioHelper` never gained them, so both inherit the throw.

`expiresIn` is an `IDuration` (`{ unit, value }`), not a number of seconds. The helper converts it with `toExpirySeconds`, which rounds up to whole seconds.

| Method | `expiresIn` default | Notes |
|---|---|---|
| `presignPut` | `StoragePresignDefaults.PUT_EXPIRES_IN` (`{ unit: 'minute', value: 10 }`) | No content type option - a presigned PUT signs only the `host` header, so S3 ignores one anyway. |
| `presignGet` | `StoragePresignDefaults.GET_EXPIRES_IN` (`{ unit: 'minute', value: 1 }`) | `responseContentType` and `responseContentDisposition` override the `Content-Type` and `Content-Disposition` the download responds with. |

```typescript
import { StoragePresignDefaults, StoragePresignLimits } from '@venizia/ignis-helpers';

await storage.presignGet({
  bucket: { name: 'uploads' },
  object: { key: 'report.pdf' },
  expiresIn: { unit: 'hour', value: 2 },
  responseContentDisposition: 'attachment; filename="report.pdf"',
});
```

> [!WARNING]
> SigV4 refuses a presigned URL valid for longer than 7 days. Anything over `StoragePresignLimits.MAX_EXPIRES_IN_SECONDS` (`604800`) throws before a URL is built, so a `month` or `year` unit fails here rather than at the provider. A zero or negative duration throws the same way.

`getObjectTags` returns a plain `Record<string, string>` - parsing S3's tagging XML is the helper's job, not the caller's. A missing object answers `{}`, not a throw; any other failure throws with the response status and body attached. `replaceObjectTags` replaces the full tag set.

## BunS3Helper

`Source ->` [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts)

S3-compatible object storage using Bun's native `S3Client`. Extends `BaseStorageHelper`.

> [!IMPORTANT]
> Requires the **Bun runtime** - `bun:S3Client` is not available under Node.js.

- **Bucket management is hand-built.** `getBuckets`, `createBucket`, and `removeBucket` use AWS Signature V4 signed `fetch()` requests via `buildSignedRequest()`, because Bun's `S3Client` has no bucket-management API.
- **Object operations use the native SDK.** `upload`'s `writeObject`, `getObject`, `getStat`, `removeObject`, `removeObjects`, and `listObjects` all call Bun's native `S3Client` methods.

### Constructor

```typescript
constructor(options: IBunS3HelperOptions)

interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;
  sessionToken?: string;
  publicEndpoint?: string;
  virtualHostedStyle?: boolean;
  partSize?: number;
  queueSize?: number;
  retry?: number;
}
```

Creates a Bun `S3Client` for object operations and keeps the credentials separately for the signed bucket-management requests.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.accessKey` | `string` | - | S3 access key credential. |
| `options.secretKey` | `string` | - | S3 secret key credential. |
| `options.endpoint` | `string` | - | S3-compatible endpoint URL (e.g. `'http://localhost:9000'`). |
| `options.region` | `string` | `'us-east-1'` | Region used for SigV4 signing of bucket-management requests. |
| `options.sessionToken` | `string` | - | Optional session token for temporary credentials. |
| `options.publicEndpoint` | `string` | `options.endpoint` | The endpoint a browser can reach. Set it and every signature uses it instead. |
| `options.virtualHostedStyle` | `boolean` | `false` | Addresses objects as `https://{bucket}.{endpoint}/{key}` rather than `{endpoint}/{bucket}/{key}`. AWS requires it; MinIO and R2 do not. |
| `options.partSize` | `number` | Bun's own default | Multipart part size in bytes. |
| `options.queueSize` | `number` | Bun's own default | Parts uploaded at once. Costs roughly `partSize * queueSize` of memory per transfer. |
| `options.retry` | `number` | Bun's own default | Retries Bun performs on a failed part before the write fails. |
| `options.scope` | `string` | `'BunS3Helper'` | Logger scope name. |
| `options.identifier` | `string` | `'BunS3Helper'` | Helper identifier. |

> [!IMPORTANT]
> Set `publicEndpoint` whenever the application reaches S3 over an internal address. `host` is inside every SigV4 signature, so a URL signed against the internal endpoint cannot be rewritten to a public one afterwards - the signature breaks. Signing against `publicEndpoint` from the start is the only way a presigned URL reaches a browser.

### defaultLinkPrefix and writeObject

- `defaultLinkPrefix`: `'/static-assets/'`
- `writeObject`: `client.write(object.key, buffer, { bucket, type: mimeType, partSize, queueSize, retry })`. Only the content type is persisted. No `originalName`/`encoding`/`size` metadata dictionary is stored.

### Methods

| Method | Behavior |
|---|---|
| `hasBucket` | Returns `false` if the name fails `isValidBucketName()`. Otherwise attempts `client.list({ maxKeys: 1 }, { bucket: name })`, and returns `false` on any error. A failure that is not a missing bucket, such as a network or credentials problem, is logged at warn level first. |
| `getBuckets` | Signed `GET /`; parses `<Bucket><Name>...<CreationDate>...` from the XML response. |
| `getBucket` | Finds the entry in `getBuckets()`; `null` if not found. |
| `createBucket` | Signed `PUT /{name}`. Throws `'[createBucket] Invalid name to create bucket!'` on invalid name, or `` `[createBucket] S3 error: {xml}` `` on a non-OK response. |
| `removeBucket` | Signed `DELETE /{name}`. Throws `'[removeBucket] Invalid name to remove bucket!'` on invalid name, or `` `[removeBucket] S3 error: {xml}` `` on a non-OK response. |
| `removeObject` | `client.delete(object.key, { bucket })`. A "not there" failure becomes the catalogued 404 via `asStorageError`. |
| `removeObjects` | Fans out over `removeObject` through `mapWithConcurrency`, bounded at `StorageConcurrency.DEFAULT_LIMIT` (`16`). |
| `writeStream` | `client.write(object.key, body, { bucket, type, partSize, queueSize, retry })`, wrapping a bare `ReadableStream` in a `Response`. The key is re-validated with `isValidObjectKey` first. |
| `presignPut` | `client.presign(object.key, { bucket, method: 'PUT', expiresIn })`. Signs locally - no network call. |
| `presignGet` | `client.presign(object.key, { bucket, method: 'GET', expiresIn, type, contentDisposition })`; `type` and `contentDisposition` are set only when the caller passes them. |
| `getObjectTags` | Signed `GET /{bucket}/{key}?tagging=`; `404` returns `{}`, any other non-2xx throws with the status and body. |
| `replaceObjectTags` | Signed `PUT /{bucket}/{key}?tagging=` with a hand-built `<Tagging>` XML body. |

#### getObject

```typescript
async getObject(opts: IObjectLocation & { options?: any }): Promise<Readable>
```

Converts the Bun S3 file's web `ReadableStream` via `Readable.fromWeb()`. The `options` parameter is accepted for interface compatibility but not used.

> [!NOTE]
> `S3File.stream()` is lazy - it reaches the network on first read. A `try` around this call never sees a 404; the failure arrives on the stream instead.

#### getObjectStream

```typescript
override async getObjectStream(
  opts: IObjectLocation & { range?: { start: number; end?: number } },
): Promise<ReadableStream<Uint8Array>>
```

Returns `file.stream()` directly, so no Node `Readable` sits in between. A `range` becomes `file.slice(start, end + 1)`, a genuine ranged GET - only the requested bytes leave S3. HTTP ranges include `end`; `slice` excludes it, which is why the helper adds one.

#### getStat

```typescript
async getStat(opts: IObjectLocation): Promise<IFileStat>
```

`client.stat(object.key, { bucket })`. Returns:

```typescript
{
  size: number;
  lastModified: Date;
  metadata: {
    mimetype: string;    // from stat.type, diagnostic only
  };
  etag: string;
}
```

A missing object throws the catalogued `core.storage.object_not_found` via `asStorageError`.

> [!NOTE]
> `metadata.mimetype` is one key, not two spellings, and it is diagnostic. The type a route actually serves is derived from the object key - see [Header sanitization](/extensions/components/static-asset/api#header-sanitization).

#### listObjects

```typescript
async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>
```

S3 caps one call at 1000 keys, so the helper loops on `nextContinuationToken` until the caller's `maxKeys` is met or the listing is exhausted. Each page maps `contents` entries to `{ name: key, size, lastModified, etag: eTag }`.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `bucket` | `IBucketRef` | - | The bucket to list. |
| `prefix` | `string` | `undefined` | Passed straight to S3. |
| `useRecursive` | `boolean` | `true` | `false` sends `delimiter: '/'`, so only the top level comes back. |
| `maxKeys` | `number` | `undefined` | Total cap across pages. `0` means zero, not unlimited. |

### AWS Signature V4 (buildSignedRequest)

`Source ->` [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts)

```typescript
async function buildSignedRequest(opts: {
  method: string;
  endpoint: string;
  path: string;
  accessKey: string;
  secretKey: string;
  region: string;
  sessionToken?: string;
  body?: string;
  query?: Record<string, string>;
}): Promise<{ url: string; headers: Record<string, string> }>
```

- **Internal only.** Not exported from the package barrel.
- **Builds the `Authorization` header from scratch.** Uses `crypto.subtle` for HMAC-SHA256 and SHA-256 digests, following the standard SigV4 derivation: `kDate -> kRegion -> kService -> kSigning`.
- **Signs four headers.** `host`, `x-amz-content-sha256`, `x-amz-date`, and (if present) `x-amz-security-token`.
- **`query` signs a canonical query string** - each key and value URI-encoded, sorted by key, joined with `&`, and appended to the returned `url`. Omitted or empty, the signature is byte-identical to before `query` existed.
- **Used for bucket management and object tagging.** `getBuckets`, `createBucket`, `removeBucket`, `getObjectTags`, and `replaceObjectTags` on `BunS3Helper`. Tagging passes `query: { tagging: '' }` - the query string S3 expects on both a `GET`/`PUT` against an object's tag set.

#### Tagging XML (buildTaggingXml / parseTaggingXml)

`Source ->` [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts)

Bun's `S3Client` has no tagging method, so `BunS3Helper` reads and writes S3's tagging XML by hand rather than adding an XML dependency.

- **`buildTaggingXml(tags: Record<string, string>): string`** - builds `<Tagging><TagSet><Tag><Key>..</Key><Value>..</Value></Tag>...</TagSet></Tagging>`, escaping `&`, `<`, `>`, `"`, and `'` in every key and value.
- **`parseTaggingXml(xml: string): Record<string, string>`** - reads the same shape back, unescaping in the reverse order so a literal `&amp;` in the source never decodes twice. An empty `<TagSet/>` (or `<TagSet></TagSet>`) returns `{}`. A body missing a `<TagSet>`, or a `<Tag>` missing its `<Key>` or `<Value>`, throws via `getError` rather than returning a half-parsed object.
- **Internal only.** Not exported from the package barrel.

## DiskHelper

`Source ->` [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts)

Local filesystem storage using a bucket-based directory structure. Extends `BaseStorageHelper`.

### Constructor

```typescript
constructor(options: IDiskHelperOptions)

interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;
}
```

Resolves `basePath` to an absolute path with `path.resolve()`. Creates it via `fs.mkdirSync(..., { recursive: true })` if it does not exist.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.basePath` | `string` | - | Base directory for storage. Resolved to an absolute path. Created automatically. |
| `options.scope` | `string` | `'DiskHelper'` | Logger scope name. |
| `options.identifier` | `string` | `'DiskHelper'` | Helper identifier. |

The resulting directory structure maps buckets to subdirectories:

```
app_data/storage/           <-- basePath
├── bucket-1/               <-- bucket (directory)
│   ├── file1.pdf           <-- object (file)
│   └── file2.jpg
└── user-uploads/
    ├── avatar.png
    └── resume.pdf
```

### defaultLinkPrefix and writeObject

- `defaultLinkPrefix`: `'/static-resources/'` - the one backend that differs from `/static-assets/`.
- `writeObject`: creates the object's parent directory if missing, via `fsp.mkdir(dir, { recursive: true })`. Then it calls `fsp.writeFile(objectPath, file.buffer)`.
- No metadata dictionary is persisted alongside the file. `getStat()` derives `mimetype` from the filename at read time instead.

### Methods

| Method | Behavior |
|---|---|
| `hasBucket` | Returns `false` if the name fails `isValidBucketName()`. Otherwise one `stat` answers both existence and `isDirectory()`. |
| `getBuckets` | Lists directories under `basePath` via `fsp.readdir(..., { withFileTypes: true })`. Each directory's `birthtime` becomes `creationDate`. Returns `[]` if `basePath` does not exist. |
| `getBucket` | One `stat` on the bucket path; returns `{ name, creationDate: stat.birthtime }`, or `null` if it is missing or not a directory. |
| `createBucket` | `fsp.mkdir(bucketPath, { recursive: true })`, then returns `getBucket()`. |
| `removeBucket` | `fsp.rmdir(bucketPath)`. |
| `removeObject` | Checks the object exists first; throws the catalogued 404 if missing. Otherwise `fsp.unlink(objectPath)`. |
| `removeObjects` | Fans out over `removeObject` through `mapWithConcurrency`, bounded at `StorageConcurrency.DEFAULT_LIMIT` (`16`). One failure stops the batch. |

`presignPut`, `presignGet`, `getObjectTags`, and `replaceObjectTags` are not overridden - the local filesystem has nothing to presign or tag against, so all four inherit `BaseStorageHelper`'s throw. See [Presign and object tagging](#presign-and-object-tagging).

Every object path is resolved through a containment check: the name is validated, then the resolved absolute path must still sit under the bucket directory. Containment survives a naming rule that turns out to be wrong.

**`createBucket` throws:**

| When | Message |
|---|---|
| Name fails `isValidBucketName()` | `'[createBucket] Invalid name to create bucket!'` |
| Bucket directory already exists | `` `[createBucket] Bucket already exists | name: {name}` `` |

**`removeBucket` throws:**

| When | Message |
|---|---|
| Name fails `isValidBucketName()` | `'[removeBucket] Invalid name to remove bucket!'` |
| Bucket directory does not exist | `` `[removeBucket] Bucket does not exist | name: {name}` `` |
| Bucket directory is not empty (`fsp.readdir` returns entries) | `` `[removeBucket] Bucket is not empty | name: {name}` `` |

**`removeObject` throws:**

| When | Message | Code |
|---|---|---|
| Object does not exist | `` `[removeObject] Object not found | bucket: {bucket} | key: {key}` `` | `core.storage.object_not_found`, `404` |

#### getObject

```typescript
async getObject(opts: IObjectLocation & { options?: any }): Promise<Readable>
```

`fs.createReadStream(objectPath)`. The `options` parameter is accepted for interface compatibility but not used.

**Throws:** `` `[getObject] Object not found | bucket: {bucket} | key: {key}` `` with `StorageErrors.OBJECT_NOT_FOUND` if the file does not exist.

#### getObjectStream

```typescript
override async getObjectStream(
  opts: IObjectLocation & { range?: { start: number; end?: number } },
): Promise<ReadableStream<Uint8Array>>
```

`fs.createReadStream(objectPath, { start, end })` seeks natively, so a range never reads the bytes before it. Throws `` `[getObjectStream] Object not found | bucket: {bucket} | key: {key}` `` if the file is missing.

#### getStat

```typescript
async getStat(opts: IObjectLocation): Promise<IFileStat>
```

`fsp.stat(objectPath)`. Returns:

```typescript
{
  size: number;          // fs stat size
  lastModified: Date;    // fs stat mtime
  metadata: {
    mimetype: string;    // detected via getMimeType() from the key's extension
  };
}
```

Does not return `etag` or `versionId` - those fields are `undefined` on `DiskHelper`.

**Throws:** `` `[getStat] Object not found | bucket: {bucket} | key: {key}` `` if the file does not exist.

#### listObjects

```typescript
async listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>
```

Scans the bucket directory via a local `scanDirectory()` closure. Returns `[]` if the bucket path does not exist.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `bucket` | `IBucketRef` | - | The bucket to list. Throws if the name fails `isValidBucketName()`. |
| `prefix` | `string` | `''` | Only files whose scanned key starts with `prefix` are included. |
| `useRecursive` | `boolean` | `false` | Subdirectories are only descended into when `true`; otherwise only top-level files are scanned. |
| `maxKeys` | `number` | `undefined` | Scanning stops once this many objects have been collected. `0` means zero, not unlimited. |

**Returns:** Array of `IObjectInfo` with `name`, `size`, `lastModified`. `etag` is always `undefined` for disk storage.

## MinioHelper

`Source ->` [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts)

MinIO object storage through the `minio` driver. Extends `BaseStorageHelper`. Imported from the `@venizia/ignis-helpers/minio` sub-path, never the root barrel.

> [!WARNING]
> `MinioHelper` and `IMinioHelperOptions` are `@deprecated` and will be removed. Use `BunS3Helper`: it reaches MinIO over the same S3 API, and adds presigned URLs, object tagging and byte ranges.

```typescript
import { MinioHelper } from '@venizia/ignis-helpers/minio';

interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

`ClientOptions` comes from the `minio` package, so every driver option (`endPoint`, `port`, `useSSL`, `accessKey`, `secretKey`) passes straight through.

- `defaultLinkPrefix`: `'/static-assets/'`
- `writeObject`: `client.putObject(...)` with an `originalName`/`normalizeName`/`size`/`encoding`/`mimeType` metadata dictionary - the one backend that persists one.
- `removeObjects`: one bulk `client.removeObjects(bucket, keys)` call, not a fan-out.
- `getObjectStream`: `client.getPartialObject` for a range, a native ranged GET.
- `presignPut`, `presignGet`, `getObjectTags` and `replaceObjectTags` are not overridden, so all four inherit `BaseStorageHelper`'s throw.

## MemoryStorageHelper

`Source ->` [`packages/helpers/src/modules/storage/in-memory/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/in-memory/helper.ts)

Generic in-memory key-value store, backed by a `Map`. Extends `BaseHelper` directly - does **not** implement `IStorageHelper` and has no bucket or file operations.

```typescript
class MemoryStorageHelper<T extends object = AnyObject> extends BaseHelper
```

### Constructor

```typescript
constructor(opts?: { scope?: string })
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.scope` | `string` | `'MemoryStorageHelper'` | Logger scope name. |

### Static methods

#### newInstance

```typescript
static newInstance<T extends object = AnyObject>(): MemoryStorageHelper<T>
```

Factory method - equivalent to `new MemoryStorageHelper<T>()`.

### Methods

| Method | Signature | Behavior |
|---|---|---|
| `isBound` | `(key: keyof T): boolean` | `this.container.has(key)`. |
| `get` | `<K extends keyof T>(key: K): T[K] \| undefined` | The value type comes from the key, so you never pass a type argument. |
| `set` | `<K extends keyof T>(key: K, value: T[K]): void` | `this.container.set(key, value)`. |
| `unset` | `(key: keyof T): boolean` | `false` when the key was not bound, so a caller can tell a removal from a no-op. |
| `keys` | `(): Array<keyof T>` | `[...this.container.keys()]`. |
| `size` | `get size(): number` | The number of bound keys. A getter, not a method. |
| `clear` | `(): void` | Empties the map. |
| `getContainer` | `(): Record<string, unknown>` | A **copy**. Handing out the live map let a caller mutate this helper's state behind its back. |

```typescript
const cache = MemoryStorageHelper.newInstance<{ 'user:123': { name: string; role: string } }>();

cache.set('user:123', { name: 'Alice', role: 'admin' });
const user = cache.get('user:123');  // { name: string; role: string } | undefined
cache.isBound('user:123');           // true
cache.keys();                        // ['user:123']
cache.size;                          // 1
cache.getContainer();                // { 'user:123': { name: 'Alice', role: 'admin' } }
cache.unset('user:123');             // true
cache.clear();
```

> [!WARNING]
> `get` is keyed, not cast. `cache.get<number>('counter')` is a type error, because `K` is inferred from the key argument and there is no second parameter to supply. Declare the value shape on the class type argument instead.

## Types Reference

### IStorageHelper

The interface implemented by `BunS3Helper`, `DiskHelper` and `MinioHelper`:

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

  presignPut(opts: IObjectLocation & { expiresIn?: IDuration }): Promise<string>;
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

### IStorageHelperOptions

```typescript
interface IStorageHelperOptions {
  scope?: string;
  identifier?: string;
}
```

### IBucketRef, IObjectRef and IObjectLocation

```typescript
interface IBucketRef {
  name: string;
}

interface IObjectRef {
  key: string;    // the S3 term
}

interface IObjectLocation {
  bucket: IBucketRef;
  object: IObjectRef;
}
```

### TUploadNaming

```typescript
type TUploadNaming = Pick<IUploadFile, 'originalName' | 'folderPath'>;
```

The parts of an upload a naming hook needs, and nothing else.

### StoragePresignDefaults

```typescript
class StoragePresignDefaults {
  static readonly PUT_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 10 };
  static readonly GET_EXPIRES_IN: IDuration = { unit: DurationUnits.MINUTE, value: 1 };
}
```

Default `expiresIn` for `presignPut` and `presignGet` when the caller omits it. A PUT carries a file upload and gets the longer window; a GET is a redirect.

### StoragePresignLimits

```typescript
class StoragePresignLimits {
  static readonly MAX_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
}
```

SigV4 refuses a presigned URL valid for longer than 7 days. `toExpirySeconds` throws past this bound, where the unit is still readable, rather than letting the provider reject the finished URL.

### StorageConcurrency

```typescript
class StorageConcurrency {
  static readonly DEFAULT_LIMIT = 16;
}
```

The cap on concurrent object operations, used by `upload` and every backend's `removeObjects`. Unbounded fan-out exhausts sockets and gets rate limited.

### StorageErrors

```typescript
const StorageErrors = {
  OBJECT_NOT_FOUND: {
    message: { text: 'Object not found', code: 'core.storage.object_not_found' },
    statusCode: 404,
    category: ErrorScopes.BUSINESS,
  },
};
```

The one catalogued storage error. `isNotFoundError({ error })` is the matching predicate: it accepts a `404` status, or a `code`/`name` containing `nosuchkey`, `nosuchbucket` or `notfound`.

### IUploadFile

```typescript
interface IUploadFile {
  originalName: string;           // Original filename
  mimetype: string;                // MIME type (e.g. 'image/png')
  buffer: Buffer;                  // File content
  size: number;                    // File size in bytes
  encoding?: string;                // Optional encoding (e.g. '7bit', 'base64')
  folderPath?: string;              // Optional folder path for organization
  [key: string | symbol]: any;      // Additional properties allowed
}
```

### IUploadResult

```typescript
interface IUploadResult {
  bucket: IBucketRef;
  object: IObjectRef & { size: number; contentType: string };
  link: string;
  metaLink?: { data: any } | { error: string };
}
```

`metaLink` is a union, so a result carries either the created record or a failure code, never both and never `null`. The static-asset controller sets the failure arm to the fixed string `'META_LINK_CREATE_FAILED'` - never driver text.

### IFileStat

```typescript
interface IFileStat {
  size: number;                      // File size in bytes
  metadata: IObjectMetadata;         // Backend-specific metadata
  lastModified?: Date;               // Last modification date
  etag?: string;                     // Entity tag (not set by DiskHelper)
  versionId?: string;                // Only where the backend reports one
}

interface IObjectMetadata {
  mimetype?: string;
  [key: string]: any;
}
```

### IBucketInfo

```typescript
interface IBucketInfo {
  name: string;
  creationDate: Date;
}
```

### IObjectInfo

```typescript
interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}
```

### IListObjectsOptions

```typescript
interface IListObjectsOptions {
  bucket: IBucketRef;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}
```

`useRecursive` defaults to `true` on `BunS3Helper` and `false` on `DiskHelper` and `MinioHelper`. Pass it explicitly when the answer matters.

### IDiskHelperOptions

```typescript
interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;
}
```

### IBunS3HelperOptions

```typescript
interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;               // Default: 'us-east-1'
  sessionToken?: string;
  publicEndpoint?: string;       // The endpoint a browser can reach; signed instead of `endpoint`
  virtualHostedStyle?: boolean;  // Default: false
  partSize?: number;             // Multipart part size in bytes; Bun's default when omitted
  queueSize?: number;            // Parts in flight; Bun's default when omitted
  retry?: number;                // Retries per failed part; Bun's default when omitted
}
```

### IMinioHelperOptions

```typescript
/** @deprecated Use `IBunS3HelperOptions` from `@venizia/ignis-helpers/bun-s3`. */
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

`ClientOptions` is the `minio` driver's own option type.

## Backend Behavior Matrix

| Behavior | BunS3Helper | DiskHelper | MinioHelper (deprecated) |
|---|---|---|---|
| Default link prefix | `/static-assets/` | `/static-resources/` | `/static-assets/` |
| `getStat().etag` | Yes | Never (`undefined`) | Yes |
| `getStat().versionId` | No | No | Yes, if versioning enabled |
| Upload metadata persisted | Content type only | None (mimetype detected at read time) | `originalName`, `normalizeName`, `size`, `encoding`, `mimeType` |
| `removeObjects` concurrency | Bounded fan-out, limit `16` | Bounded fan-out, limit `16` | Single bulk `client.removeObjects` call |
| `listObjects.useRecursive` default | `true`; `false` sends `delimiter: '/'` | `false` | `false` |
| `listObjects` pagination | Loops on `nextContinuationToken` | Full directory scan | The driver paginates past 1000 keys |
| Missing object | Catalogued `core.storage.object_not_found` via `asStorageError` on `getStat` and `removeObject`. `getObject` is lazy, so its failure arrives on the stream | Catalogued `core.storage.object_not_found`, thrown directly by every read and by `removeObject` | Catalogued `core.storage.object_not_found` via `asStorageError` on `getObject`, `getObjectStream` and `getStat` |
| `writeStream` | Native streaming write to S3 | Inherits the buffering default | Inherits the buffering default |
| `getObjectStream` range | Native, via `file.slice` | Native, via `createReadStream({ start, end })` | Native, via `getPartialObject` |
| Bucket-management transport | Hand-built AWS SigV4 signed requests | Node `fs`/`fs/promises` | The `minio` driver |
| `presignPut` / `presignGet` / `getObjectTags` / `replaceObjectTags` | Implemented (`client.presign` natively; tagging via hand-built signed HTTP) | Inherits `BaseStorageHelper`'s throw | Inherits `BaseStorageHelper`'s throw |

## Troubleshooting

### "[createBucket] Invalid name to create bucket!"

**Cause:** The bucket name failed `isValidBucketName()`. See the [validation rules](#isvalidsegment) for exactly what's rejected.

**Fix:**

```typescript
// Wrong
await storage.createBucket({ bucket: { name: '../my-bucket' } });
await storage.createBucket({ bucket: { name: '.hidden-bucket' } });

// Correct
await storage.createBucket({ bucket: { name: 'my-bucket' } });
```

### "[removeBucket] Invalid name to remove bucket!"

**Cause:** Same as above - the bucket name failed `isValidBucketName()`.

### "[createBucket] Bucket already exists | name: {name}"

**Cause:** `DiskHelper` throws this exact message when `createBucket()` targets a directory that already exists. `BunS3Helper` skips this check. An existing bucket instead surfaces whatever the raw S3 `PUT` request returns, which depends on the server.

**Fix:** Check existence first.

```typescript
const exists = await storage.hasBucket({ bucket: { name: 'my-bucket' } });
if (!exists) {
  await storage.createBucket({ bucket: { name: 'my-bucket' } });
}
```

### "[removeBucket] Bucket does not exist | name: {name}"

**Cause:** `DiskHelper` throws when removing a directory that does not exist.

**Fix:** Check existence before removal, same pattern as above with `hasBucket`.

### "[removeBucket] Bucket is not empty | name: {name}"

**Cause:** `DiskHelper`'s `removeBucket()` requires the bucket directory to be empty.

**Fix:** Remove all objects first.

```typescript
const objects = await storage.listObjects({
  bucket: { name: 'my-bucket' },
  useRecursive: true,
});
if (objects.length > 0) {
  await storage.removeObjects({
    bucket: { name: 'my-bucket' },
    objects: objects.map(object => ({ key: object.name! })),
  });
}
await storage.removeBucket({ bucket: { name: 'my-bucket' } });
```

### "[upload] Bucket does not exist | name: {bucket}"

**Cause:** `upload()` calls `hasBucket()` before writing anything, on every backend.

**Fix:** Create the bucket first.

```typescript
const bucket = { name: 'uploads' };

const exists = await storage.hasBucket({ bucket });
if (!exists) {
  await storage.createBucket({ bucket });
}
await storage.upload({ bucket, files: [/* ... */] });
```

### "[upload] Invalid original file name"

**Cause:** A file's `originalName` failed `isValidSegment()`.

**Fix:** Sanitize before uploading, or override the name entirely with `normalizeNameFn`.

```typescript
await storage.upload({
  bucket: { name: 'my-bucket' },
  files,
  normalizeNameFn: ({ file }) => file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_'),
});
```

### "[upload] Invalid folder path" / "[upload] Invalid folder path | depth: {depth} | max: {max}"

**Cause:** A file's `folderPath` triggers one of two messages. The depth-specific message means it exceeds `maxFolderDepth`. The generic message means it fails the path rule for another reason, such as a traversal segment.

**Fix:** Keep `folderPath` within `maxFolderDepth` (default `2`) segments, and free of `..`/invalid characters.

### "[upload] Invalid file size | size: {size}"

**Cause:** A file's `size` is `undefined`, `null`, or negative. A zero-byte file (`size: 0`) is legal and does **not** trigger this.

**Fix:** Ensure every file carries a valid `size`.

```typescript
const file: IUploadFile = {
  originalName: 'doc.pdf',
  mimetype: 'application/pdf',
  buffer: fileBuffer,
  size: fileBuffer.length, // must be a number >= 0
};
```

### "[upload] Invalid normalized object name | name: {name}"

**Cause:** A custom `normalizeNameFn` returned a value that fails `isValidObjectKey()`. That's typically a traversal payload like `../../../etc/cron.d/pwn`, or a key exceeding `maxFolderDepth`. This check exists because `originalName` passing validation does not guarantee the function's *output* is safe.

**Fix:** Ensure `normalizeNameFn` returns a plain relative key - no `..` segments, no leading `/`, no more folder segments than `maxFolderDepth` allows.

### "[getObject] Object not found | bucket: {bucket} | key: {key}"

**Cause:** The object is not there. `DiskHelper` checks existence before opening a read stream and throws directly; `BunS3Helper` and `MinioHelper` map the backend's own "not there" failure onto the same error. Either way it is the catalogued `core.storage.object_not_found`: status `404`, category `BUSINESS`. The same message shape covers `[getObjectStream]`, `[getStat]` and `[removeObject]`.

**Fix:** Handle the rejection, or check first.

```typescript
try {
  const stream = await storage.getObject({
    bucket: { name: 'my-bucket' },
    object: { key: 'file.pdf' },
  });
} catch (error) {
  // core.storage.object_not_found -- handle gracefully
}
```

> [!NOTE]
> `BunS3Helper.getObject` is lazy: the S3 request only starts on first read, so a `try` around the call never sees the 404. The failure arrives on the returned stream instead. `getStat` is the eager check.

### "[removeObject] Object not found | bucket: {bucket} | key: {key}"

**Cause:** The same catalogued 404, raised while deleting.

**Fix:** Handle the rejection, or use `isNotFoundError({ error })` to treat a missing object as a successful delete.

```typescript
import { isNotFoundError } from '@venizia/ignis-helpers';

try {
  await storage.removeObject({ bucket: { name: 'my-bucket' }, object: { key: 'file.pdf' } });
} catch (error) {
  if (!isNotFoundError({ error })) {
    throw error;
  }
}
```

### "[presignGet] Expiry exceeds the SigV4 maximum of 7 days | unit: {unit} | value: {value}"

**Cause:** `expiresIn` converted to more than `StoragePresignLimits.MAX_EXPIRES_IN_SECONDS`. `IDuration` accepts `month` and `year`, which type-check and then produce a URL the provider rejects.

**Fix:** Keep the duration within 7 days. A zero or negative duration throws `[presignGet] Invalid expiry | unit: {unit} | value: {value}` instead.

### BunS3Helper connection errors

**Cause:** Network or configuration mismatch between the application and the S3-compatible server.

**Checklist:**
- The server is running and reachable at the configured `endpoint`.
- `accessKey`/`secretKey` are correct.
- `region` matches what the server expects for SigV4 signing.
- A signed URL that a browser cannot reach means `publicEndpoint` is unset - `host` is inside the signature, so it cannot be rewritten afterwards.
- Network and firewall rules allow the connection.

## See also

- [Storage overview](/extensions/helpers/storage/) - introduction, the smallest example, and the most common tasks
- [Helpers Index](../index) - all available helpers
- [Static Asset Component](/extensions/components/static-asset/) - serving stored files over HTTP
- [Request Utilities](/references/utilities/request) - `parseMultipartBody` for file uploads
