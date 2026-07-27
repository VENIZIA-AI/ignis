---
title: Storage - Full Reference
description: Complete reference for the storage class hierarchy, every backend's method behavior, name validation rules, and error messages
difficulty: intermediate
---

# Storage - Full Reference

Exhaustive reference for `BaseStorageHelper`, the three `IStorageHelper` backends, `MemoryStorageHelper`, and every type. For a readable introduction and the common tasks, start with the [Storage overview](/extensions/helpers/storage/).

**Files:**

- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts) - `BaseStorageHelper`
- [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts) - `MinioHelper`
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `BunS3Helper`
- [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts) - `buildSignedRequest` (AWS SigV4 for bucket management)
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts) - `DiskHelper`
- [`packages/helpers/src/modules/storage/in-memory/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/in-memory/helper.ts) - `MemoryStorageHelper`
- [`packages/helpers/src/modules/storage/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/types.ts) - `IStorageHelper` and every option/result type
- [`packages/helpers/src/common/constants/mime.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/mime.ts) - `MimeTypes` const-class

## Find what you need

| You want to | Go to |
|---|---|
| See which class implements which backend | [Class and Interface Model](#class-and-interface-model) |
| Construct a backend and see its options | [MinioHelper](#miniohelper) / [BunS3Helper](#buns3helper) / [DiskHelper](#diskhelper) |
| Understand what `upload()` validates and how it writes files | [upload (template method)](#upload-template-method-shared-by-every-backend) |
| Validate a name or path before writing | [isValidName](#isvalidname) / [isValidPath](#isvalidpath) |
| Look up every error message `upload()` can throw | [validateUploadFiles](#upload-template-method-shared-by-every-backend) |
| Read a file back as a stream | [MinioHelper#getFile](#getfile) / [BunS3Helper#getFile](#getfile-1) / [DiskHelper#getFile](#getfile-2) |
| List or delete objects in a bucket | per-backend Methods tables ([MinioHelper](#methods), [BunS3Helper](#methods-1), [DiskHelper](#methods-2)) |
| Cache values in-process (not bucket storage) | [MemoryStorageHelper](#memorystoragehelper) |
| Look up a type or option shape | [Types Reference](#types-reference) |
| Compare backend differences at a glance | [Backend Behavior Matrix](#backend-behavior-matrix) |
| Fix a thrown error message | [Troubleshooting](#troubleshooting) |

## Class and Interface Model

```
BaseHelper
├── BaseStorageHelper (abstract, implements IStorageHelper)
│   ├── MinioHelper       -- S3-compatible object storage (minio SDK)
│   ├── BunS3Helper       -- S3-compatible object storage (Bun-native S3Client)
│   └── DiskHelper        -- Local filesystem storage
└── MemoryStorageHelper   -- In-memory key-value store (standalone, not IStorageHelper)
```

- **`upload()` is a template method.** It validates the bucket and every file. Then it calls two protected hooks each backend supplies: `defaultLinkPrefix` (a getter) and `writeObject()` (the write itself).
- **Every other method is backend-specific.** `isBucketExists`, `getBuckets`, `getBucket`, `createBucket`, `removeBucket`, `getFile`, `getStat`, `removeObject`, `removeObjects`, and `listObjects` are declared `abstract` on `BaseStorageHelper`.
  - Each one is fully reimplemented per backend - no logic is shared between a filesystem read and a MinIO `statObject()` call.

> [!TIP] Typing rule
> Declare parameters and bindings as `IStorageHelper` for `MinioHelper` / `BunS3Helper` / `DiskHelper`. `MemoryStorageHelper` does not implement it and has its own standalone API - see [MemoryStorageHelper](#memorystoragehelper).

### Import paths

```typescript
// Disk and in-memory storage (root package export)
import { DiskHelper, MemoryStorageHelper } from '@venizia/ignis-helpers';

// MinIO storage (separate sub-path export - keeps `minio` an optional dependency)
import { MinioHelper } from '@venizia/ignis-helpers/minio';

// Bun S3 storage (separate sub-path export, Bun runtime only)
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

// Types
import type {
  IStorageHelper,
  IStorageHelperOptions,
  IDiskHelperOptions,
  IUploadFile,
  IUploadResult,
  IFileStat,
  IBucketInfo,
  IObjectInfo,
  IListObjectsOptions,
} from '@venizia/ignis-helpers';
import type { IMinioHelperOptions } from '@venizia/ignis-helpers/minio';
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

#### MIME_MAP

```typescript
protected static MIME_MAP: Record<string, string>
```

Extension-to-MIME-type mapping used by `getMimeType()`:

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

Default folder nesting allowed by `isValidPath()` and `upload()` when the caller does not pass `maxFolderDepth` / `opts.maxDepth`.

### Methods

#### getMimeType

```typescript
getMimeType(filename: string): string
```

Extracts the extension with `path.extname()`, lowercases it, and looks it up in `MIME_MAP`.

```typescript
storage.getMimeType('photo.jpg');    // 'image/jpeg'
storage.getMimeType('data.csv');     // 'text/csv'
storage.getMimeType('unknown.xyz');  // 'application/octet-stream'
```

**Returns:** MIME type string, or `'application/octet-stream'` if unrecognized.

#### isValidName

```typescript
isValidName(name: string): boolean
```

Validates a **single path segment**: a bucket name or a bare file name, which must not contain `/`. Used internally by `isValidPath` to validate each segment. Logs a specific error for whichever rule fails.

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
storage.isValidName('my-file.pdf');    // true
storage.isValidName('../etc/passwd');  // false -- contains path separators
storage.isValidName('.hidden');        // false -- starts with dot
```

**Returns:** `true` if the name passes every check, `false` otherwise.

#### isValidPath

```typescript
isValidPath(pathStr: string, opts?: { maxDepth?: number }): boolean
```

Validates a **full object path** that may include folder segments, for example `2025/uploads/report.pdf`. It trims leading and trailing slashes, splits on `/`, validates each segment with `isValidName`, and enforces a maximum folder depth. See the exact rules below.

| Rule (checked in order) | Description |
|---|---|
| 1 | Must be a non-empty string |
| 2 | After stripping leading/trailing slashes, must not be empty |
| 3 | Must not contain empty segments (double slashes, e.g. `a//b`) |
| 4 | Folder depth (`segments.length - 1`) must not exceed `opts.maxDepth` (default `DEFAULT_MAX_FOLDER_DEPTH`, `2`) |
| 5 | Every segment must pass `isValidName()` |
| 6 | Total normalized path length must not exceed 1024 characters |

```typescript
storage.isValidPath('folder/file.pdf');      // true
storage.isValidPath('../etc/passwd');        // false -- path traversal
storage.isValidPath('a/b/c/d/file.pdf');     // false -- exceeds default max depth (2)
```

**Returns:** `true` if the path and all its segments are valid, `false` otherwise.

#### getFileType

```typescript
getFileType(opts: { mimeType: string }): string
```

Categorizes a MIME type using the `MimeTypes` const-class: `UNKNOWN`, `IMAGE`, `VIDEO`, `TEXT`. It lowercases `mimeType` first, then checks whether it starts with `image`, `video`, or `text`.

```typescript
storage.getFileType({ mimeType: 'image/png' });        // 'image'
storage.getFileType({ mimeType: 'video/mp4' });         // 'video'
storage.getFileType({ mimeType: 'text/plain' });        // 'text'
storage.getFileType({ mimeType: 'application/pdf' });   // 'unknown'
```

**Returns:** one of `'image'`, `'video'`, `'text'`, or `'unknown'`.

#### upload (template method - shared by every backend)

```typescript
async upload(opts: {
  bucket: string;
  files: IUploadFile[];
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  maxFolderDepth?: number;
}): Promise<IUploadResult[]>
```

Implemented once on `BaseStorageHelper`; `MinioHelper`, `BunS3Helper`, and `DiskHelper` do **not** override it. Steps, in order:

1. Returns `[]` immediately if `files` is empty.
2. Calls `isBucketExists({ name: bucket })`; throws if the bucket does not exist.
3. Validates every file (`validateUploadFiles`, below).
4. For each file, in parallel via `Promise.all()`:
   - Computes `normalizeName` via `normalizeNameFn` if provided. Otherwise the default normalizer lowercases the name, replaces spaces with `_`, and prefixes `{folderPath}/` if set.
   - Re-validates `normalizeName` with `isValidPath({ maxDepth: maxFolderDepth })`. This catches a traversal payload returned by a **custom** `normalizeNameFn`, even though `originalName` already passed validation.
   - Computes `normalizeLink` via `normalizeLinkFn` if provided. Otherwise it builds the default: `{defaultLinkPrefix}{bucket}/{normalizeName}`, with each `/`-segment run through `encodeURIComponent`.
   - Calls the backend's `writeObject({ bucket, normalizeName, file })`.
   - Logs an info line with `normalizeName`, `normalizeLink`, `mimeType`, `encoding`, `size`, and elapsed time.
5. Returns `{ bucketName, objectName, link }` per file.

**`validateUploadFiles` (per file, in order):**

| Check | Throws |
|---|---|
| `isValidName(originalName)` | `'[upload] Invalid original file name'` |
| If `folderPath` set: segment count vs. `maxFolderDepth ?? DEFAULT_MAX_FOLDER_DEPTH` | `` `[upload] Invalid folder path | depth: {depth} | max: {max}` `` |
| If `folderPath` set: `isValidPath(folderPath, { maxDepth })` | `'[upload] Invalid folder path'` |
| `size` must be a number `>= 0`. `undefined`, `null`, and negative values are rejected; `0` is a legal empty file. | `` `[upload] Invalid file size | size: {size}` `` |

**Also throws:**

| When | Message |
|---|---|
| Bucket does not exist | `` `[upload] Bucket does not exist | name: {bucket}` `` |
| A custom `normalizeNameFn` returns a path that fails `isValidPath` | `` `[upload] Invalid normalized object name | name: {name}` `` |

### Protected extension points (implemented per backend)

```typescript
protected abstract get defaultLinkPrefix(): string;

protected abstract writeObject(opts: {
  bucket: string;
  normalizeName: string;
  file: IUploadFile;
}): Promise<void>;

protected normalizeObjectName(opts: { originalName: string; folderPath?: string }): string;
protected normalizeObjectLink(opts: { bucketName: string; normalizeName: string }): string;
protected validateUploadFiles(opts: { files: IUploadFile[]; maxFolderDepth?: number }): void;
```

- **`defaultLinkPrefix` and `writeObject` are `protected abstract`.** Not part of `IStorageHelper` - they exist purely so `upload()` can be written once.
- **`normalizeObjectName`, `normalizeObjectLink`, and `validateUploadFiles` are concrete.** Used internally by `upload()`; no backend overrides them.

### Public abstract methods (reimplemented per backend, no shared logic)

```typescript
abstract isBucketExists(opts: { name: string }): Promise<boolean>;
abstract getBuckets(): Promise<IBucketInfo[]>;
abstract getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
abstract createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
abstract removeBucket(opts: { name: string }): Promise<boolean>;

abstract getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>;
abstract getStat(opts: { bucket: string; name: string }): Promise<IFileStat>;
abstract removeObject(opts: { bucket: string; name: string }): Promise<void>;
abstract removeObjects(opts: { bucket: string; names: string[] }): Promise<void>;
abstract listObjects(opts: {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}): Promise<IObjectInfo[]>;
```

See each backend's section below for behavior.

## MinioHelper

`Source ->` [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts)

S3-compatible object storage built on the `minio` package. Extends `BaseStorageHelper`.

### Constructor

```typescript
constructor(options: IMinioHelperOptions)

interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

Creates a `minio.Client` internally and stores it as a private `client` field - not exposed. Extend `MinioHelper` in a subclass if you need direct SDK access.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.endPoint` | `string` | - | MinIO server hostname. |
| `options.port` | `number` | - | Server port. |
| `options.useSSL` | `boolean` | - | Enable HTTPS. |
| `options.accessKey` | `string` | - | Access key credential. |
| `options.secretKey` | `string` | - | Secret key credential. |
| `options.scope` | `string` | `'MinioHelper'` | Logger scope name. |
| `options.identifier` | `string` | `'MinioHelper'` | Helper identifier. |

All other `minio.ClientOptions` fields are also accepted and passed to the client: `region`, `transport`, `sessionToken`, `partSize`, `pathStyle`, and more. See the [minio JavaScript SDK docs](https://min.io/docs/minio/linux/developers/javascript/API.html) for the complete list.

### defaultLinkPrefix and writeObject

- `defaultLinkPrefix`: `'/static-assets/'`
- `writeObject`: calls `client.putObject(bucket, normalizeName, buffer, size, metadata)`, where `metadata` is `{ originalName, normalizeName, size, encoding, mimeType }`. The full upload metadata is persisted server-side and returned later by `getStat()`.

### Methods

| Method | Behavior |
|---|---|
| `isBucketExists` | Returns `false` if the name fails `isValidName()`. Otherwise `client.bucketExists()`. |
| `getBuckets` | `client.listBuckets()`. |
| `getBucket` | `isBucketExists()` first; if true, finds the entry in `getBuckets()`; `null` if not found. |
| `createBucket` | `client.makeBucket()`, then returns `getBucket()`. Throws `'[createBucket] Invalid name to create bucket!'` if the name fails validation. |
| `removeBucket` | `client.removeBucket()`. Throws `'[removeBucket] Invalid name to remove bucket!'` if the name fails validation. |
| `removeObject` | `client.removeObject()`. |
| `removeObjects` | `client.removeObjects()` - a single batch SDK call. |

#### getFile

```typescript
getFile(opts: {
  bucket: string;
  name: string;
  options?: {
    versionId?: string;
    SSECustomerAlgorithm?: string;
    SSECustomerKey?: string;
    SSECustomerKeyMD5?: string;
  };
}): Promise<Readable>
```

Returns a readable stream via `client.getObject()`. Supports versioning and SSE-C server-side encryption.

```typescript
const fileStream = await minioStorage.getFile({
  bucket: 'my-bucket',
  name: 'report.pdf',
  options: {
    versionId: 'specific-version-id',
    SSECustomerAlgorithm: 'AES256',
    SSECustomerKey: 'encryption-key',
    SSECustomerKeyMD5: 'key-md5-hash',
  },
});
```

#### getStat

```typescript
async getStat(opts: { bucket: string; name: string }): Promise<IFileStat>
```

`client.statObject()`. Returns `size`, `metadata`, `lastModified`, `etag`, and `versionId`. `metadata` is MinIO's `metaData` field: the full dict written by `writeObject`. `versionId` is set only if versioning is enabled.

#### listObjects

```typescript
async listObjects(opts: {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}): Promise<IObjectInfo[]>
```

Streams via `client.listObjects(bucket, prefix, useRecursive)`; the stream is destroyed early once `maxKeys` is reached.

| Parameter | Default | Description |
|---|---|---|
| `prefix` | `''` | Filter by prefix. |
| `useRecursive` | `false` | List recursively through subdirectories. |
| `maxKeys` | `undefined` | Maximum objects to return. |

## BunS3Helper

`Source ->` [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts)

S3-compatible object storage using Bun's native `S3Client`. Extends `BaseStorageHelper`.

> [!IMPORTANT]
> Requires the **Bun runtime** - `bun:S3Client` is not available under Node.js.

- **Bucket management is hand-built.** `getBuckets`, `createBucket`, and `removeBucket` use AWS Signature V4 signed `fetch()` requests via `buildSignedRequest()`, because Bun's `S3Client` has no bucket-management API.
- **Object operations use the native SDK.** `upload`'s `writeObject`, `getFile`, `getStat`, `removeObject`, `removeObjects`, and `listObjects` all call Bun's native `S3Client` methods.

### Constructor

```typescript
constructor(options: IBunS3HelperOptions)

interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;
  sessionToken?: string;
}
```

Creates a Bun `S3Client` for object operations and stores `{ accessKey, secretKey, endpoint, region, sessionToken }` separately for the signed bucket-management requests.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.accessKey` | `string` | - | S3 access key credential. |
| `options.secretKey` | `string` | - | S3 secret key credential. |
| `options.endpoint` | `string` | - | S3-compatible endpoint URL (e.g. `'http://localhost:9000'`). |
| `options.region` | `string` | `'us-east-1'` | Region used for SigV4 signing of bucket-management requests. |
| `options.sessionToken` | `string` | - | Optional session token for temporary credentials. |
| `options.scope` | `string` | `'BunS3Helper'` | Logger scope name. |
| `options.identifier` | `string` | `'BunS3Helper'` | Helper identifier. |

### defaultLinkPrefix and writeObject

- `defaultLinkPrefix`: `'/static-assets/'`
- `writeObject`: `client.write(normalizeName, buffer, { bucket, type: mimeType })`. Only the content type is persisted. Unlike `MinioHelper`, no `originalName`/`encoding`/`size` metadata dictionary is stored.

### Methods

| Method | Behavior |
|---|---|
| `isBucketExists` | Returns `false` if the name fails `isValidName()`. Otherwise attempts `client.list({ maxKeys: 1 }, { bucket: name })`, and returns `false` on any error - for example a network failure or a missing bucket. |
| `getBuckets` | Signed `GET /`; parses `<Bucket><Name>...<CreationDate>...` from the XML response. |
| `getBucket` | Finds the entry in `getBuckets()`; `null` if not found. |
| `createBucket` | Signed `PUT /{name}`. Throws `'[createBucket] Invalid name to create bucket!'` on invalid name, or `` `[createBucket] S3 error: {xml}` `` on a non-OK response. |
| `removeBucket` | Signed `DELETE /{name}`. Throws `'[removeBucket] Invalid name to remove bucket!'` on invalid name, or `` `[removeBucket] S3 error: {xml}` `` on a non-OK response. |
| `removeObject` | `client.delete(name, { bucket })`. |
| `removeObjects` | Deletes in **parallel** via `Promise.all(names.map(...))`. |

#### getFile

```typescript
async getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>
```

Converts the Bun S3 file's web `ReadableStream` via `Readable.fromWeb()`. The `options` parameter is accepted for interface compatibility but not used.

#### getStat

```typescript
async getStat(opts: { bucket: string; name: string }): Promise<IFileStat>
```

`client.stat(name, { bucket })`. Returns:

```typescript
{
  size: number;
  lastModified: Date;
  metadata: {
    contentType: string;   // from stat.type
    mimetype: string;      // also from stat.type
  };
  etag: string;
}
```

#### listObjects

```typescript
async listObjects(opts: {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}): Promise<IObjectInfo[]>
```

`client.list({ prefix, maxKeys }, { bucket })`; maps `contents` entries to `{ name: key, size, lastModified, etag: eTag }`.

> [!NOTE]
> `useRecursive` is accepted for interface compatibility but is not used - Bun's S3 `list()` has no recursive mode.

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
}): Promise<{ url: string; headers: Record<string, string> }>
```

- **Internal only.** Not exported from the package barrel.
- **Builds the `Authorization` header from scratch.** Uses `crypto.subtle` for HMAC-SHA256 and SHA-256 digests, following the standard SigV4 derivation: `kDate -> kRegion -> kService -> kSigning`.
- **Signs four headers.** `host`, `x-amz-content-sha256`, `x-amz-date`, and (if present) `x-amz-security-token`.
- **Used exclusively for bucket management.** `getBuckets`, `createBucket`, and `removeBucket` on `BunS3Helper`.

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
| `isBucketExists` | Returns `false` if the name fails validation. Otherwise checks the bucket path exists and `stat.isDirectory()`. |
| `getBuckets` | Lists directories under `basePath` via `fsp.readdir(..., { withFileTypes: true })`. Each directory's `birthtime` becomes `creationDate`. Returns `[]` if `basePath` does not exist. |
| `getBucket` | `isBucketExists()` first; if true, returns `{ name, creationDate: stat.birthtime }`; else `null`. |
| `createBucket` | `fsp.mkdir(bucketPath, { recursive: true })`, then returns `getBucket()`. |
| `removeBucket` | `fsp.rmdir(bucketPath)`. |
| `removeObject` | Checks the object exists first (`fsp.access`); throws if missing. Otherwise `fsp.unlink(objectPath)`. |
| `removeObjects` | Deletes **sequentially** by calling `removeObject()` per name in a `for` loop. If any file is missing, the error propagates immediately and remaining names are not attempted. |

**`createBucket` throws:**

| When | Message |
|---|---|
| Name fails `isValidName()` | `'[createBucket] Invalid name to create bucket!'` |
| Bucket directory already exists | `` `[createBucket] Bucket already exists | name: {name}` `` |

**`removeBucket` throws:**

| When | Message |
|---|---|
| Name fails `isValidName()` | `'[removeBucket] Invalid name to remove bucket!'` |
| Bucket directory does not exist | `` `[removeBucket] Bucket does not exist | name: {name}` `` |
| Bucket directory is not empty (`fsp.readdir` returns entries) | `` `[removeBucket] Bucket is not empty | name: {name}` `` |

**`removeObject` throws:**

| When | Message |
|---|---|
| Object does not exist | `` `[removeObject] File not found | bucket: {bucket} | name: {name}` `` |

#### getFile

```typescript
async getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>
```

`fs.createReadStream(objectPath)`. The `options` parameter is accepted for interface compatibility but not used.

**Throws:** `` `[getFile] File not found | bucket: {bucket} | name: {name}` `` if the file does not exist.

#### getStat

```typescript
async getStat(opts: { bucket: string; name: string }): Promise<IFileStat>
```

`fsp.stat(objectPath)`. Returns:

```typescript
{
  size: number;          // fs stat size
  lastModified: Date;    // fs stat mtime
  metadata: {
    mimetype: string;    // detected via getMimeType() from the name's extension
  };
}
```

Does not return `etag` or `versionId` - those fields are `undefined` on `DiskHelper`.

**Throws:** `` `[getStat] File not found | bucket: {bucket} | name: {name}` `` if the file does not exist.

#### listObjects

```typescript
async listObjects(opts: {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}): Promise<IObjectInfo[]>
```

Scans the bucket directory recursively via a local `scanDirectory()` closure. Returns `[]` if the bucket path does not exist.

| Parameter | Default | Description |
|---|---|---|
| `prefix` | `''` | Only files whose scanned name starts with `prefix` are included. |
| `useRecursive` | `false` | Subdirectories are only descended into when `true`; otherwise only top-level files are scanned. |
| `maxKeys` | `undefined` | Scanning stops once this many objects have been collected. |

**Returns:** Array of `IObjectInfo` with `name`, `size`, `lastModified`. `etag` is always `undefined` for disk storage.

## MemoryStorageHelper

`Source ->` [`packages/helpers/src/modules/storage/in-memory/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/in-memory/helper.ts)

Generic in-memory key-value store. Extends `BaseHelper` directly - does **not** implement `IStorageHelper` and has no bucket or file operations.

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
| `isBound` | `(key: string): boolean` | `key in this.container`. |
| `get<R>` | `(key: keyof T): R` | Returns `this.container[key]` cast to `R`. |
| `set<R>` | `(key: string, value: R): void` | `Object.assign(this.container, { [key]: value })`. |
| `keys` | `(): string[]` | `Object.keys(this.container)`. |
| `clear` | `(): void` | Replaces the container with a new empty object. |
| `getContainer` | `(): T` | Returns the underlying container object directly (not a copy). |

```typescript
const cache = new MemoryStorageHelper();

cache.set('user:123', { name: 'Alice', role: 'admin' });
const user = cache.get<{ name: string; role: string }>('user:123');
cache.isBound('user:123');   // true
cache.keys();                // ['user:123']
cache.getContainer();        // { 'user:123': { name: 'Alice', role: 'admin' } }
cache.clear();
```

## Types Reference

### IStorageHelper

The interface implemented by `MinioHelper`, `BunS3Helper`, and `DiskHelper`:

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

### IStorageHelperOptions

```typescript
interface IStorageHelperOptions {
  scope?: string;
  identifier?: string;
}
```

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
  bucketName: string;    // Bucket where the file was stored
  objectName: string;    // Stored object name (normalized)
  link: string;           // Access URL
  metaLink?: any;          // Optional metadata link
  metaLinkError?: any;      // Error if metadata link creation failed
}
```

### IFileStat

```typescript
interface IFileStat {
  size: number;                     // File size in bytes
  metadata: Record<string, any>;    // Backend-specific metadata
  lastModified?: Date;               // Last modification date
  etag?: string;                      // Entity tag (MinioHelper and BunS3Helper only)
  versionId?: string;                  // Version ID (MinioHelper only, if versioning enabled)
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
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}
```

### IDiskHelperOptions

```typescript
interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;
}
```

### IMinioHelperOptions

```typescript
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

Inherits every `minio.ClientOptions` field: `endPoint`, `port`, `useSSL`, `accessKey`, `secretKey`, `region`, `transport`, `sessionToken`, `partSize`, `pathStyle`, and others.

### IBunS3HelperOptions

```typescript
interface IBunS3HelperOptions extends IStorageHelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region?: string;         // Default: 'us-east-1'
  sessionToken?: string;
}
```

## Backend Behavior Matrix

| Behavior | MinioHelper | BunS3Helper | DiskHelper |
|---|---|---|---|
| Default link prefix | `/static-assets/` | `/static-assets/` | `/static-resources/` |
| `getStat().etag` | Yes | Yes | Never (`undefined`) |
| `getStat().versionId` | Yes, if versioning enabled | No | No |
| Upload metadata persisted | `originalName`, `normalizeName`, `size`, `encoding`, `mimeType` | Content type only | None (mimetype detected at read time) |
| `removeObjects` concurrency | Single batch SDK call | Parallel (`Promise.all`) | Sequential (`for` loop; stops at first missing file) |
| `listObjects.useRecursive` | Honored | Accepted but not used | Honored |
| `getFile` throws on missing file | No (SDK-level error) | No (SDK-level error) | Yes - explicit `'[getFile] File not found ...'` |
| Bucket-management transport | `minio.Client` methods | Hand-built AWS SigV4 signed requests | Node `fs`/`fs/promises` |

## Troubleshooting

### "[createBucket] Invalid name to create bucket!"

**Cause:** The bucket name failed `isValidName()`. See the [validation rules](#isvalidname) for exactly what's rejected.

**Fix:**

```typescript
// Wrong
await storage.createBucket({ name: '../my-bucket' });
await storage.createBucket({ name: '.hidden-bucket' });

// Correct
await storage.createBucket({ name: 'my-bucket' });
```

### "[removeBucket] Invalid name to remove bucket!"

**Cause:** Same as above - the bucket name failed `isValidName()`.

### "[createBucket] Bucket already exists | name: {name}"

**Cause:** `DiskHelper` throws this exact message when `createBucket()` targets a directory that already exists. `MinioHelper` and `BunS3Helper` skip this check. An existing bucket instead surfaces whatever the `minio` SDK or the raw S3 `PUT` request returns, which depends on the server.

**Fix:** Check existence first.

```typescript
const exists = await storage.isBucketExists({ name: 'my-bucket' });
if (!exists) {
  await storage.createBucket({ name: 'my-bucket' });
}
```

### "[removeBucket] Bucket does not exist | name: {name}"

**Cause:** `DiskHelper` throws when removing a directory that does not exist.

**Fix:** Check existence before removal, same pattern as above with `isBucketExists`.

### "[removeBucket] Bucket is not empty | name: {name}"

**Cause:** `DiskHelper`'s `removeBucket()` requires the bucket directory to be empty.

**Fix:** Remove all objects first.

```typescript
const objects = await storage.listObjects({ bucket: 'my-bucket', useRecursive: true });
if (objects.length > 0) {
  await storage.removeObjects({
    bucket: 'my-bucket',
    names: objects.map(o => o.name!),
  });
}
await storage.removeBucket({ name: 'my-bucket' });
```

### "[upload] Bucket does not exist | name: {bucket}"

**Cause:** `upload()` calls `isBucketExists()` before writing anything, on every backend.

**Fix:** Create the bucket first.

```typescript
const exists = await storage.isBucketExists({ name: 'uploads' });
if (!exists) {
  await storage.createBucket({ name: 'uploads' });
}
await storage.upload({ bucket: 'uploads', files: [/* ... */] });
```

### "[upload] Invalid original file name"

**Cause:** A file's `originalName` failed `isValidName()`.

**Fix:** Sanitize before uploading, or override the name entirely with `normalizeNameFn`.

```typescript
await storage.upload({
  bucket: 'my-bucket',
  files,
  normalizeNameFn: ({ originalName }) => originalName.replace(/[^a-zA-Z0-9._-]/g, '_'),
});
```

### "[upload] Invalid folder path" / "[upload] Invalid folder path | depth: {depth} | max: {max}"

**Cause:** A file's `folderPath` triggers one of two messages. The depth-specific message means it exceeds `maxFolderDepth`. The generic message means it fails `isValidPath()` for another reason, such as a traversal segment.

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

**Cause:** A custom `normalizeNameFn` returned a value that fails `isValidPath()`. That's typically a traversal payload like `../../../etc/cron.d/pwn`, or a name exceeding `maxFolderDepth`. This check exists because `originalName` passing validation does not guarantee the function's *output* is safe.

**Fix:** Ensure `normalizeNameFn` returns a plain relative name/path - no `..` segments, no leading `/`, no more folder segments than `maxFolderDepth` allows.

### "[getFile] File not found | bucket: {bucket} | name: {name}"

**Cause:** `DiskHelper`-specific - it checks existence before opening a read stream. `MinioHelper` and `BunS3Helper` instead surface whatever error their SDK returns for a missing object.

**Fix:** Handle the rejection, or check first.

```typescript
try {
  const stream = await storage.getFile({ bucket: 'my-bucket', name: 'file.pdf' });
} catch (error) {
  // File not found -- handle gracefully
}
```

### "[removeObject] File not found | bucket: {bucket} | name: {name}"

**Cause:** `DiskHelper`-specific - it checks existence before unlinking. `MinioHelper` and `BunS3Helper` instead surface whatever error their SDK returns for a missing object.

**Fix:** Handle the rejection, or check first.

```typescript
try {
  await storage.removeObject({ bucket: 'my-bucket', name: 'file.pdf' });
} catch (error) {
  // File not found -- handle gracefully
}
```

### MinioHelper / BunS3Helper connection errors

**Cause:** Network or configuration mismatch between the application and the S3-compatible server.

**Checklist:**
- The server is running and reachable at the configured `endPoint`/`endpoint` and `port`.
- `useSSL` (MinioHelper) matches the server's TLS configuration.
- `accessKey`/`secretKey` are correct.
- For `BunS3Helper`, `region` matches what the server expects for SigV4 signing.
- Network and firewall rules allow the connection.

## See also

- [Storage overview](/extensions/helpers/storage/) - introduction, the smallest example, and the most common tasks
- [Helpers Index](../index) - all available helpers
- [Static Asset Component](/extensions/components/static-asset/) - serving stored files over HTTP
- [Request Utilities](/references/utilities/request) - `parseMultipartBody` for file uploads
- [MinIO Documentation](https://min.io/docs/minio/linux/index.html) - MinIO object storage
- [MinIO JavaScript SDK](https://min.io/docs/minio/linux/developers/javascript/API.html) - full minio client API
