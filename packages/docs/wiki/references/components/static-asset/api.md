# Static Asset -- API Reference

> Controller factory, storage interface, type definitions, and component internals.

## Controller Factory

The `AssetControllerFactory.defineAssetController()` method dynamically creates controller classes at runtime. For each storage backend in the options:

1. A new class extending `BaseController` is created with `@controller({ path: basePath })`
2. The class name is set dynamically via `Object.defineProperty(_controller, 'name', { value: name })`
3. Routes are bound in the controller's `binding()` method using `this.bindRoute().to()`
4. The controller is registered via `this.application.controller()`

```
StaticAssetComponent.binding()
    | iterates options
AssetControllerFactory.defineAssetController({ controller, storage, helper, ... })
    | creates
@controller({ path: basePath })
class _controller extends BaseController { ... }
    | registered via
this.application.controller(_controller)
```

### IAssetControllerOptions

The factory method accepts the following options:

```typescript
interface IAssetControllerOptions {
  controller: {
    name: string;
    basePath: string;
    isStrict?: boolean;   // Default: true
  };
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  metaLink?: TMetaLinkConfig;
  options?: TStaticAssetExtraOptions;
}
```

## StaticAssetStorageTypes

A constants class following the Ignis pattern with `static readonly` fields, a `SCHEME_SET`, and an `isValid()` method:

```typescript
class StaticAssetStorageTypes {
  static readonly DISK = 'disk';
  static readonly MINIO = 'minio';

  static readonly SCHEME_SET = new Set([this.DISK, this.MINIO]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

type TStaticAssetStorageType = TConstValue<typeof StaticAssetStorageTypes>;
// Resolves to: 'disk' | 'minio'
```

## MultipartBodySchema

The Zod schema used to validate the upload request body:

```typescript
const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
  }),
});
```

This accepts either a single `File` or an array of `File` objects. The OpenAPI spec representation uses `type: 'array'` with `format: 'binary'` items for compatibility with Swagger/OpenAPI tooling.

## Header Sanitization

When streaming files (both inline and download), the controller forwards a specific set of whitelisted headers from the storage metadata to the response. All other metadata headers are dropped.

### WHITELIST_HEADERS

The exact list of forwarded headers:

```typescript
const WHITELIST_HEADERS = [
  'content-type',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
] as const;
```

These correspond to `HTTP.Headers.CONTENT_TYPE`, `HTTP.Headers.CONTENT_ENCODING`, `HTTP.Headers.CACHE_CONTROL`, `HTTP.Headers.ETAG`, and `HTTP.Headers.LAST_MODIFIED` from `@venizia/ignis-helpers`.

All header values are sanitized by stripping `\r` and `\n` characters via `String(value).replace(/[\r\n]/g, '')` to prevent HTTP header injection attacks. If no `content-type` header is present in the storage metadata, the controller falls back to `application/octet-stream`.

### HTTP Security Headers

All file streaming responses include:

```http
X-Content-Type-Options: nosniff
Content-Type: <from metadata or application/octet-stream>
Content-Length: <file size in bytes>
Content-Disposition: attachment; filename="..."  (download endpoint only)
```

Whitelisted metadata headers forwarded from storage: `content-type`, `content-encoding`, `cache-control`, `etag`, `last-modified`. All other metadata headers are dropped. Header values are sanitized (see [Header Sanitization](#header-sanitization)).

## IStorageHelper Interface

All storage helpers implement this unified interface:

```typescript
interface IStorageHelper {
  isValidName(name: string): boolean;

  // Bucket operations
  isBucketExists(opts: { name: string }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  createBucket(opts: { name: string }): Promise<IBucketInfo | null>;
  removeBucket(opts: { name: string }): Promise<boolean>;

  // File operations
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

  // Utility
  getFileType(opts: { mimeType: string }): string;
}
```

### Supporting Types

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

### Storage Helper Hierarchy

```
IStorageHelper (interface)
    |
BaseStorageHelper (abstract class)
    |
    +-- DiskHelper (local filesystem)
    +-- MinioHelper (S3-compatible)
```

## MetaLink SQL Schema

**Table:** `MetaLink`

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | TEXT | No | -- | Primary key (UUID) |
| `created_at` | TIMESTAMP | No | `NOW()` | When record was created |
| `modified_at` | TIMESTAMP | No | `NOW()` | When record was last updated |
| `bucket_name` | TEXT | No | -- | Storage bucket name |
| `object_name` | TEXT | No | -- | File object name |
| `link` | TEXT | No | -- | Access URL to the file |
| `mimetype` | TEXT | No | -- | File MIME type |
| `size` | INTEGER | No | -- | File size in bytes |
| `etag` | TEXT | Yes | -- | Entity tag for versioning |
| `metadata` | JSONB | Yes | -- | Additional file metadata |
| `storage_type` | TEXT | No | -- | Storage type (`'disk'` or `'minio'`) |
| `is_synced` | BOOLEAN | No | `false` | Whether MetaLink is synchronized with storage |
| `principal_type` | TEXT | Yes | -- | Type of the associated principal (e.g., `'user'`, `'service'`) |
| `principal_id` | TEXT | Yes | -- | ID of the associated principal (always stored as string) |

**Indexes:** `bucket_name`, `object_name`, `storage_type`, `is_synced`.

> [!NOTE]
> The `isSynced` field is automatically set to `true` when files are uploaded or synced via the meta-links endpoint. When a file is deleted, the MetaLink record is removed entirely. The `principalType` and `principalId` fields are only populated during upload when the corresponding query parameters are provided.

### MetaLink Tracking

When `useMetaLink: true`, the component:

- **On upload:** Creates a MetaLink database record for each uploaded file after fetching file stats from storage. Stores `principalType` and `principalId` from query parameters (if provided). The `principalId` is always coerced to a string via `String()`. If MetaLink creation fails, the upload still succeeds and the response includes `metaLink: null` with a `metaLinkError` message.
- **On delete:** Initiates MetaLink record deletion as fire-and-forget (the `.then()/.catch()` promise chain is not awaited). The HTTP response with `{ "success": true }` returns before the database deletion completes. Deletion errors are logged but do not fail the request.
- **On sync (PUT meta-links):** Checks if a MetaLink exists for the object (matched by `bucketName` + `objectName`). Updates it if found, creates a new one if not. Always sets `isSynced: true`. Returns `{ success: true, metaLink: ... }`.

## Component Lifecycle

1. **`binding()`** -- Reads `STATIC_ASSET_COMPONENT_OPTIONS` from the DI container
2. **Iterates each storage key** -- For each entry, calls `AssetControllerFactory.defineAssetController()`
3. **Generates default `normalizeLinkFn`** -- If not provided, creates links in the format <code v-pre>{basePath}/buckets/{bucket}/objects/{encodedName}</code>
4. **Registers controller** -- Calls `this.application.controller()` with the dynamically created class
5. **Logs binding** -- Logs the storage key, type, and MetaLink status for each registered backend

> [!TIP]
> When MetaLink deletion fails on object delete, the error is logged but the HTTP response still returns `{ "success": true }`. Check your application logs if MetaLink records are not being cleaned up. Since the deletion is fire-and-forget, the response may return before the deletion attempt even starts.

## See Also

- [Setup & Configuration](./) - Quick Reference, Setup Steps, Configuration Options
- [Usage & Examples](./usage) - API Endpoints and Frontend Integration
- [Error Reference](./errors) - Name Validation and Troubleshooting
