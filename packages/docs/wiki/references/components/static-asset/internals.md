# Component Internals

## Controller Factory

The `AssetControllerFactory.defineAssetController()` method dynamically creates controller classes at runtime. For each storage backend in the options:

1. A new class extending `BaseController` is created with `@controller({ path: basePath })`
2. The class name is set dynamically via `Object.defineProperty(_controller, 'name', { value: name })`
3. Routes are bound in the controller's `binding()` method using `this.bindRoute().to()`
4. The controller is registered via `this.application.controller()`

```
StaticAssetComponent.binding()
    ↓ iterates options
AssetControllerFactory.defineAssetController({ controller, storage, helper, ... })
    ↓ creates
@controller({ path: basePath })
class _controller extends BaseController { ... }
    ↓ registered via
this.application.controller(_controller)
```

## Name Validation

All bucket and object names go through `helper.isValidName()` before any storage operation. The validation blocks:

| Pattern | Example | Reason |
|---------|---------|--------|
| Path traversal | `../etc/passwd` | Contains `..`, `/`, or `\` |
| Hidden files | `.hidden` | Starts with `.` |
| Shell injection | `file;rm -rf /` | Contains `;`, `\|`, `&`, `$`, etc. |
| Header injection | `file\ninjected` | Contains `\n`, `\r`, or `\0` |
| Long names | 256+ chars | Exceeds 255 character limit |
| Empty names | `""`, `"  "` | Empty or whitespace-only |

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
    normalizeNameFn?: (opts: { originalName: string }) => string;
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

## Storage Helper Hierarchy

```
IStorageHelper (interface)
    |
BaseStorageHelper (abstract class)
    |
    +-- DiskHelper (local filesystem)
    +-- MinioHelper (S3-compatible)
```

## MetaLink Tracking

When `useMetaLink: true`, the component:

- **On upload:** Creates a MetaLink database record for each uploaded file after fetching file stats from storage. If MetaLink creation fails, the upload still succeeds and the response includes `metaLink: null` with a `metaLinkError` message.
- **On delete:** Asynchronously deletes the MetaLink record after removing the file from storage. Deletion errors are logged but don't fail the request.
- **On sync (PUT meta-links):** Checks if a MetaLink exists for the object. Updates it if found, creates a new one if not. Always sets `isSynced: true`.

## MetaLink SQL Schema

**Table:** `MetaLink`

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT | Primary key (UUID) |
| `created_at` | TIMESTAMP | When record was created |
| `modified_at` | TIMESTAMP | When record was last updated |
| `bucket_name` | TEXT | Storage bucket name |
| `object_name` | TEXT | File object name |
| `link` | TEXT | Access URL to the file |
| `mimetype` | TEXT | File MIME type |
| `size` | INTEGER | File size in bytes |
| `etag` | TEXT | Entity tag for versioning |
| `metadata` | JSONB | Additional file metadata |
| `storage_type` | TEXT | Storage type (`'disk'` or `'minio'`) |
| `is_synced` | BOOLEAN | Whether MetaLink is synchronized with storage (default: `false`) |

**Indexes:** `bucket_name`, `object_name`, `storage_type`, `is_synced`.

> [!NOTE]
> The `isSynced` field is automatically set to `true` when files are uploaded or synced via the meta-links endpoint. When a file is deleted, the MetaLink record is removed entirely.

## HTTP Security Headers

All file streaming responses include:

```http
X-Content-Type-Options: nosniff
Content-Disposition: attachment; filename="..."  (download endpoint only)
```

Whitelisted metadata headers forwarded from storage: `content-type`, `content-encoding`, `cache-control`, `etag`, `last-modified`.

## Component Lifecycle

1. **`binding()`** -- Reads `STATIC_ASSET_COMPONENT_OPTIONS` from the DI container
2. **Iterates each storage key** -- For each entry, calls `AssetControllerFactory.defineAssetController()`
3. **Generates default `normalizeLinkFn`** -- If not provided, creates links in the format `{basePath}/buckets/{bucket}/objects/{encodedName}`
4. **Registers controller** -- Calls `this.application.controller()` with the dynamically created class
5. **Logs binding** -- Logs the storage key, type, and MetaLink status for each registered backend

> [!TIP]
> When MetaLink deletion fails on object delete, the error is logged but the HTTP response still returns `{ "success": true }`. Check your logs if MetaLink records are not being cleaned up.
