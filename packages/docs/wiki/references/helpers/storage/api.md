# Storage -- API Reference

## Architecture

The storage system uses a class hierarchy with an abstract base class providing shared logic and two concrete implementations for different backends. `MemoryStorageHelper` is a separate, standalone class that does not participate in the `IStorageHelper` hierarchy.

```
BaseHelper
├── BaseStorageHelper (abstract, implements IStorageHelper)
│   ├── MinioHelper       -- S3-compatible object storage
│   └── DiskHelper        -- Local filesystem storage
└── MemoryStorageHelper   -- In-memory key-value store
```

## BaseStorageHelper

Abstract base class that extends `BaseHelper` and implements `IStorageHelper`. Provides name validation, MIME type detection, and file type categorization. All bucket and file operation methods are abstract and must be implemented by subclasses.

### Constructor

```typescript
constructor(opts: { scope: string; identifier: string })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `scope` | `string` | Logger scope name. |
| `identifier` | `string` | Helper identifier. |

### Static Properties

#### MIME_MAP

```typescript
protected static MIME_MAP: Record<string, string>
```

Extension-to-MIME-type mapping used by `getMimeType()`:

| Extension | MIME Type |
|-----------|-----------|
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.pdf` | `application/pdf` |
| `.json` | `application/json` |
| `.txt` | `text/plain` |
| `.html` | `text/html` |
| `.css` | `text/css` |
| `.js` | `text/javascript` |
| `.mp4` | `video/mp4` |
| `.webm` | `video/webm` |
| `.mp3` | `audio/mpeg` |
| `.wav` | `audio/wav` |
| `.zip` | `application/zip` |
| `.csv` | `text/csv` |
| `.xml` | `application/xml` |

Falls back to `application/octet-stream` for unrecognized extensions.

### Methods

#### getMimeType

```typescript
getMimeType(filename: string): string
```

Returns the MIME type for a filename based on its extension. Extracts the extension using `path.extname()`, converts to lowercase, and looks it up in `MIME_MAP`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filename` | `string` | Filename with extension (e.g., `'photo.jpg'`). |

**Returns:** MIME type string, or `'application/octet-stream'` if unrecognized.

#### isValidName

```typescript
isValidName(name: string): boolean
```

Validates a bucket or file name against security rules. Logs specific error messages for each validation failure.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Name to validate. |

**Returns:** `true` if the name passes all checks, `false` otherwise.

**Validation rules (checked in order):**

1. Must be a string type
2. Must not be empty or null
3. Must not contain `..`, `/`, or `\` (path traversal)
4. Must not start with `.` (hidden files)
5. Must not contain `;`, `|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` (shell injection)
6. Must not contain `\n`, `\r`, or `\0` (header injection)
7. Must not exceed 255 characters (DoS prevention)
8. Must not be whitespace-only

#### getFileType

```typescript
getFileType(opts: { mimeType: string }): string
```

Categorizes a MIME type into a broad file type group using the `MimeTypes` constants.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.mimeType` | `string` | Full MIME type string (e.g., `'image/png'`). |

**Returns:** One of `'image'`, `'video'`, `'text'`, or `'unknown'`.

### Abstract Methods

The following methods are declared abstract in `BaseStorageHelper` and implemented by `MinioHelper` and `DiskHelper`:

```typescript
abstract isBucketExists(opts: { name: string }): Promise<boolean>;
abstract getBuckets(): Promise<IBucketInfo[]>;
abstract getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
abstract createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
abstract removeBucket(opts: { name: string }): Promise<boolean>;

abstract upload(opts: {
  bucket: string;
  files: IUploadFile[];
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
}): Promise<IUploadResult[]>;

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

## MinioHelper

S3-compatible object storage client built on the `minio` package. Extends `BaseStorageHelper`.

### Constructor

```typescript
constructor(options: IMinioHelperOptions)
```

Creates a new `minio.Client` internally and stores it as `this.client`.

```typescript
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.endPoint` | `string` | -- | MinIO server hostname. |
| `options.port` | `number` | -- | Server port. |
| `options.useSSL` | `boolean` | -- | Enable HTTPS. |
| `options.accessKey` | `string` | -- | Access key credential. |
| `options.secretKey` | `string` | -- | Secret key credential. |
| `options.scope` | `string` | `'MinioHelper'` | Logger scope name. |
| `options.identifier` | `string` | `'MinioHelper'` | Helper identifier. |

All additional `minio.ClientOptions` properties are also accepted and passed to the underlying client.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `client` | `minio.Client` | The underlying MinIO client instance. Accessible for direct SDK operations. |

### Methods

#### isBucketExists

```typescript
async isBucketExists(opts: { name: string }): Promise<boolean>
```

Returns `false` if the name fails `isValidName()`. Otherwise delegates to `client.bucketExists()`.

#### getBuckets

```typescript
async getBuckets(): Promise<IBucketInfo[]>
```

Lists all buckets via `client.listBuckets()`.

#### getBucket

```typescript
async getBucket(opts: { name: string }): Promise<IBucketInfo | null>
```

Returns the bucket info if it exists, or `null` if not found. Calls `isBucketExists()` first, then searches the full bucket list.

#### createBucket

```typescript
async createBucket(opts: { name: string }): Promise<IBucketInfo | null>
```

Creates a bucket via `client.makeBucket()`. Throws if the name fails validation.

**Throws:** `'[createBucket] Invalid name to create bucket!'`

#### removeBucket

```typescript
async removeBucket(opts: { name: string }): Promise<boolean>
```

Removes a bucket via `client.removeBucket()`. Throws if the name fails validation.

**Throws:** `'[removeBucket] Invalid name to remove bucket!'`

#### upload

```typescript
async upload(opts: {
  bucket: string;
  files: IUploadFile[];
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
}): Promise<IUploadResult[]>
```

Uploads files to a MinIO bucket. Returns `[]` if `files` is empty. Validates the bucket exists and all file names/sizes before uploading. Uploads run in parallel via `Promise.all()`.

**Default name normalization:** Lowercased with spaces replaced by `_`. If `folderPath` is set, prepends `{folderPath}/`.

**Default link format:** `/static-assets/{bucket}/{encodeURIComponent(normalizeName)}`

**Metadata stored:** `originalName`, `normalizeName`, `size`, `encoding`, `mimeType`.

**Throws:**
- `'[upload] Bucket does not exist | name: {bucket}'`
- `'[upload] Invalid original file name'`
- `'[upload] Invalid folder path'`
- `'[upload] Invalid file size'`

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

Returns a readable stream for the file via `client.getObject()`. Supports versioning and server-side encryption options.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.bucket` | `string` | Bucket name. |
| `opts.name` | `string` | Object name. |
| `opts.options.versionId` | `string` | Specific version to retrieve. |
| `opts.options.SSECustomerAlgorithm` | `string` | SSE-C algorithm (e.g., `'AES256'`). |
| `opts.options.SSECustomerKey` | `string` | SSE-C encryption key. |
| `opts.options.SSECustomerKeyMD5` | `string` | MD5 hash of the encryption key. |

#### getStat

```typescript
async getStat(opts: { bucket: string; name: string }): Promise<IFileStat>
```

Returns file metadata via `client.statObject()`.

**Returns:** `IFileStat` with `size`, `metadata` (from MinIO's `metaData`), `lastModified`, `etag`, and `versionId`.

#### removeObject

```typescript
async removeObject(opts: { bucket: string; name: string }): Promise<void>
```

Removes a single object via `client.removeObject()`.

#### removeObjects

```typescript
async removeObjects(opts: { bucket: string; names: string[] }): Promise<void>
```

Removes multiple objects in a single batch via `client.removeObjects()`.

#### listObjects

```typescript
async listObjects(opts: {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}): Promise<IObjectInfo[]>
```

Lists objects in a bucket using a streaming approach via `client.listObjects()`. The stream is destroyed early if `maxKeys` is reached.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.bucket` | `string` | -- | Bucket to list. |
| `opts.prefix` | `string` | `''` | Filter by prefix. |
| `opts.useRecursive` | `boolean` | `false` | List recursively through subdirectories. |
| `opts.maxKeys` | `number` | `undefined` | Maximum number of objects to return. |

## DiskHelper

Local filesystem storage using directory-based buckets. Extends `BaseStorageHelper`.

### Constructor

```typescript
constructor(options: IDiskHelperOptions)
```

Resolves `basePath` to an absolute path and creates it if it does not exist.

```typescript
interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.basePath` | `string` | -- | Base directory for storage. Resolved to an absolute path. Created automatically. |
| `options.scope` | `string` | `'DiskHelper'` | Logger scope name. |
| `options.identifier` | `string` | `'DiskHelper'` | Helper identifier. |

### Methods

#### isBucketExists

```typescript
async isBucketExists(opts: { name: string }): Promise<boolean>
```

Returns `false` if the name fails validation. Otherwise checks if the bucket path exists and is a directory.

#### getBuckets

```typescript
async getBuckets(): Promise<IBucketInfo[]>
```

Lists all directories under `basePath`. Returns each directory as a bucket with its `birthtime` as `creationDate`. Returns `[]` if the base path does not exist.

#### getBucket

```typescript
async getBucket(opts: { name: string }): Promise<IBucketInfo | null>
```

Returns bucket info with `birthtime` as `creationDate`, or `null` if the bucket does not exist.

#### createBucket

```typescript
async createBucket(opts: { name: string }): Promise<IBucketInfo | null>
```

Creates a directory under `basePath`. Throws if the name fails validation or the bucket already exists.

**Throws:**
- `'[createBucket] Invalid name to create bucket!'`
- `'[createBucket] Bucket already exists | name: {name}'`

#### removeBucket

```typescript
async removeBucket(opts: { name: string }): Promise<boolean>
```

Removes the bucket directory. Throws if the name fails validation, the bucket does not exist, or the bucket is not empty.

**Throws:**
- `'[removeBucket] Invalid name to remove bucket!'`
- `'[removeBucket] Bucket does not exist | name: {name}'`
- `'[removeBucket] Bucket is not empty | name: {name}'`

#### upload

```typescript
async upload(opts: {
  bucket: string;
  files: IUploadFile[];
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
}): Promise<IUploadResult[]>
```

Writes files to the bucket directory. Returns `[]` if `files` is empty. Validates the bucket exists and all file names/sizes before writing. Uploads run in parallel via `Promise.all()`. Subdirectories are created automatically if `normalizeName` contains path separators.

**Default name normalization:** Same as MinioHelper -- lowercased with spaces replaced by `_`.

**Default link format:** `/static-resources/{bucket}/{encodeURIComponent(normalizeName)}`

**Throws:**
- `'[upload] Bucket does not exist | name: {bucket}'`
- `'[upload] Invalid original file name'`
- `'[upload] Invalid folder path'`
- `'[upload] Invalid file size'`

#### getFile

```typescript
async getFile(opts: { bucket: string; name: string; options?: any }): Promise<Readable>
```

Returns a `fs.createReadStream()` for the file. Throws if the file does not exist. The `options` parameter is accepted for interface compatibility but is not used.

**Throws:** `'[getFile] File not found | bucket: {bucket} | name: {name}'`

#### getStat

```typescript
async getStat(opts: { bucket: string; name: string }): Promise<IFileStat>
```

Returns file metadata from the filesystem. The `metadata` field contains `mimetype` detected via `getMimeType()`. Does not return `etag` or `versionId`.

**Throws:** `'[getStat] File not found | bucket: {bucket} | name: {name}'`

**Returns:**

```typescript
{
  size: number;          // from fs stat
  lastModified: Date;    // from fs stat mtime
  metadata: {
    mimetype: string;    // detected via getMimeType()
  };
}
```

#### removeObject

```typescript
async removeObject(opts: { bucket: string; name: string }): Promise<void>
```

Deletes a file via `fsp.unlink()`. Throws if the file does not exist.

**Throws:** `'[removeObject] File not found | bucket: {bucket} | name: {name}'`

#### removeObjects

```typescript
async removeObjects(opts: { bucket: string; names: string[] }): Promise<void>
```

Deletes multiple files sequentially by calling `removeObject()` for each name. If any file does not exist, the error propagates immediately.

#### listObjects

```typescript
async listObjects(opts: {
  bucket: string;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}): Promise<IObjectInfo[]>
```

Scans the bucket directory. Returns `[]` if the bucket path does not exist. Only files matching the `prefix` are included. Subdirectories are only traversed when `useRecursive` is `true`. Stops scanning when `maxKeys` is reached.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.bucket` | `string` | -- | Bucket to list. |
| `opts.prefix` | `string` | `''` | Filter by name prefix. |
| `opts.useRecursive` | `boolean` | `false` | Traverse subdirectories. |
| `opts.maxKeys` | `number` | `undefined` | Maximum objects to return. |

**Returns:** Array of `IObjectInfo` with `name`, `size`, `lastModified`. The `etag` field is always `undefined` for disk storage.

## MemoryStorageHelper

Generic in-memory key-value store. Extends `BaseHelper` directly. Does **not** implement `IStorageHelper`.

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

### Static Methods

#### newInstance

```typescript
static newInstance<T extends object = AnyObject>(): MemoryStorageHelper<T>
```

Factory method that creates and returns a new `MemoryStorageHelper` instance.

### Methods

#### isBound

```typescript
isBound(key: string): boolean
```

Returns `true` if the key exists in the container (uses the `in` operator).

#### get

```typescript
get<R>(key: keyof T): R
```

Returns the value for the given key, cast to type `R`.

#### set

```typescript
set<R>(key: string, value: R): void
```

Stores a value under the given key using `Object.assign`.

#### keys

```typescript
keys(): string[]
```

Returns all keys in the container via `Object.keys()`.

#### clear

```typescript
clear(): void
```

Replaces the container with a new empty object.

#### getContainer

```typescript
getContainer(): T
```

Returns the underlying container object.

## Types Reference

### IStorageHelper

The unified interface implemented by `MinioHelper` and `DiskHelper`:

```typescript
interface IStorageHelper {
  isValidName(name: string): boolean;

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
  mimetype: string;               // MIME type (e.g., 'image/png')
  buffer: Buffer;                 // File content
  size: number;                   // File size in bytes
  encoding?: string;              // Optional encoding (e.g., '7bit', 'base64')
  folderPath?: string;            // Optional folder path for organization
  [key: string | symbol]: any;    // Additional properties allowed
}
```

### IUploadResult

```typescript
interface IUploadResult {
  bucketName: string;    // Bucket where file was stored
  objectName: string;    // Stored filename (normalized)
  link: string;          // Access URL
  metaLink?: any;        // Optional metadata link
  metaLinkError?: any;   // Error if metadata link creation failed
}
```

### IFileStat

```typescript
interface IFileStat {
  size: number;                     // File size in bytes
  metadata: Record<string, any>;    // Storage-specific metadata
  lastModified?: Date;              // Last modification date
  etag?: string;                    // Entity tag (MinioHelper only)
  versionId?: string;               // Version ID (MinioHelper only)
}
```

### IBucketInfo

```typescript
interface IBucketInfo {
  name: string;          // Bucket name
  creationDate: Date;    // When the bucket was created
}
```

### IObjectInfo

```typescript
interface IObjectInfo {
  name?: string;          // Object name
  size?: number;          // Object size in bytes
  lastModified?: Date;    // Last modification date
  etag?: string;          // Entity tag
  prefix?: string;        // Prefix (for directory-like listing)
}
```

### IListObjectsOptions

```typescript
interface IListObjectsOptions {
  bucket: string;            // Bucket to list
  prefix?: string;           // Filter by prefix
  useRecursive?: boolean;    // Recursive listing (default: false)
  maxKeys?: number;          // Maximum objects to return
}
```

### IDiskHelperOptions

```typescript
interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;    // Base directory for storage
}
```

### IMinioHelperOptions

```typescript
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

Inherits all `minio.ClientOptions` properties: `endPoint`, `port`, `useSSL`, `accessKey`, `secretKey`, `region`, `transport`, `sessionToken`, `partSize`, `pathStyle`, and others.

## See Also

- [Setup & Usage](./) -- Getting started, examples, and troubleshooting
- [Helpers Index](../index) -- All available helpers
- [Static Asset Component](/references/components/static-asset/) -- Serving stored files via HTTP
