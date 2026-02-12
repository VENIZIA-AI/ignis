# Storage

Unified file storage abstraction with interchangeable backends for S3-compatible object storage, local filesystem, and in-memory key-value caching.

## Quick Reference

| Class | Extends | Backend | Implements |
|-------|---------|---------|------------|
| **MinioHelper** | `BaseStorageHelper` | S3-compatible (MinIO) | `IStorageHelper` |
| **DiskHelper** | `BaseStorageHelper` | Local filesystem | `IStorageHelper` |
| **MemoryStorageHelper** | `BaseHelper` | In-memory key-value | -- |

#### Import Paths

```typescript
// Disk and in-memory storage (from base package)
import { DiskHelper, MemoryStorageHelper } from '@venizia/ignis-helpers';

// MinIO storage (separate export path)
import { MinioHelper } from '@venizia/ignis-helpers/minio';

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
```

## Creating an Instance

### MinIO Storage

`MinioHelper` connects to MinIO or any S3-compatible object storage server. The constructor accepts all `minio.ClientOptions` properties alongside `IStorageHelperOptions`.

```typescript
import { MinioHelper } from '@venizia/ignis-helpers/minio';

const storage = new MinioHelper({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});
```

#### IMinioHelperOptions

`IMinioHelperOptions` extends both `IStorageHelperOptions` and the minio `ClientOptions` type, so all [minio Client options](https://min.io/docs/minio/linux/developers/javascript/API.html) are accepted.

```typescript
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endPoint` | `string` | -- | MinIO server hostname. |
| `port` | `number` | -- | Server port. |
| `useSSL` | `boolean` | -- | Enable HTTPS. |
| `accessKey` | `string` | -- | Access key credential. |
| `secretKey` | `string` | -- | Secret key credential. |
| `scope` | `string` | `'MinioHelper'` | Logger scope name. |
| `identifier` | `string` | `'MinioHelper'` | Helper identifier. |

> [!TIP]
> The underlying `minio.Client` is exposed as `storage.client` for direct access to any minio SDK method not covered by the `IStorageHelper` interface.

### Disk Storage

`DiskHelper` provides local filesystem storage using a bucket-based directory structure. The `basePath` directory is created automatically if it does not exist.

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';

const storage = new DiskHelper({
  basePath: './app_data/storage',
});
```

#### IDiskHelperOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | -- | Base directory where buckets will be created. Resolved to an absolute path internally. Created automatically if it does not exist. |
| `scope` | `string` | `'DiskHelper'` | Logger scope name. |
| `identifier` | `string` | `'DiskHelper'` | Helper identifier. |

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

### In-Memory Storage

`MemoryStorageHelper` is a standalone, generic key-value store for caching or temporary state within a single process. It does **not** implement `IStorageHelper` and has no bucket or file operations.

```typescript
import { MemoryStorageHelper } from '@venizia/ignis-helpers';

// Direct instantiation
const cache = new MemoryStorageHelper();

// With custom scope for logging
const cache = new MemoryStorageHelper({ scope: 'SessionCache' });

// With typed container using the factory method
const cache = MemoryStorageHelper.newInstance<{ counter: number; name: string }>();
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `string` | `'MemoryStorageHelper'` | Logger scope name. |

## Usage

`DiskHelper` and `MinioHelper` implement the same `IStorageHelper` interface, making them interchangeable. All examples below apply to both unless noted otherwise.

### Uploading Files

Pass an array of `IUploadFile` objects to `upload()`. The method validates all file names before writing, then uploads in parallel.

```typescript
const results = await storage.upload({
  bucket: 'my-bucket',
  files: [
    {
      originalName: 'report.pdf',
      mimetype: 'application/pdf',
      buffer: fileBuffer,
      size: fileBuffer.length,
      encoding: '7bit',
    },
  ],
});

console.log(results);
// [{ bucketName: 'my-bucket', objectName: 'report.pdf', link: '/static-assets/my-bucket/report.pdf' }]
```

#### Custom Name and Link Normalization

By default, file names are lowercased with spaces replaced by underscores. The default link prefix differs by backend: MinioHelper uses `/static-assets/{bucket}/{name}`, DiskHelper uses `/static-resources/{bucket}/{name}`. Override either with custom functions:

```typescript
const results = await storage.upload({
  bucket: 'my-bucket',
  files: files,
  normalizeNameFn: ({ originalName, folderPath }) => {
    const timestamp = Date.now();
    return folderPath
      ? `${folderPath}/${timestamp}_${originalName}`
      : `${timestamp}_${originalName}`;
  },
  normalizeLinkFn: ({ bucketName, normalizeName }) => {
    return `/files/${bucketName}/${normalizeName}`;
  },
});
```

#### Upload with Folder Path

When `folderPath` is provided in an `IUploadFile`, the default normalization creates subdirectory-based paths:

```typescript
const results = await storage.upload({
  bucket: 'my-bucket',
  files: [
    {
      originalName: 'avatar.png',
      mimetype: 'image/png',
      buffer: avatarBuffer,
      size: avatarBuffer.length,
      folderPath: 'users',
    },
  ],
});
// objectName: 'users/avatar.png'
```

> [!WARNING]
> DiskHelper uses `/static-resources/` as the default link prefix, while MinioHelper uses `/static-assets/`. Provide a `normalizeLinkFn` if you need consistent links across storage backends.

### Downloading Files

Retrieve a file as a Node.js `Readable` stream:

```typescript
const fileStream = await storage.getFile({
  bucket: 'my-bucket',
  name: 'report.pdf',
});

// Pipe to an HTTP response
fileStream.pipe(response);

// Or write to disk
import fs from 'node:fs';
const writeStream = fs.createWriteStream('./downloads/report.pdf');
fileStream.pipe(writeStream);
```

#### MinIO-Specific Options

MinioHelper supports additional options for server-side encryption and versioning:

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

### Getting File Metadata

```typescript
const stat = await storage.getStat({
  bucket: 'my-bucket',
  name: 'report.pdf',
});

console.log(stat);
// {
//   size: 204800,
//   lastModified: 2025-01-15T10:30:00.000Z,
//   metadata: { mimetype: 'application/pdf' },
//   etag: 'abc123',       // MinioHelper only
//   versionId: 'v1',      // MinioHelper only (if versioning enabled)
// }
```

> [!NOTE]
> DiskHelper populates `metadata.mimetype` using the `getMimeType()` extension-based lookup. It does not return `etag` or `versionId`. MinioHelper returns full metadata from the MinIO server including the original upload metadata, `etag`, and `versionId`.

### Listing Files

```typescript
// List all objects in a bucket
const objects = await storage.listObjects({ bucket: 'my-bucket' });

// List with prefix filter
const docs = await storage.listObjects({
  bucket: 'my-bucket',
  prefix: 'documents/',
});

// Recursive listing (includes files in subdirectories)
const allFiles = await storage.listObjects({
  bucket: 'my-bucket',
  useRecursive: true,
});

// Limit the number of results
const firstTen = await storage.listObjects({
  bucket: 'my-bucket',
  maxKeys: 10,
});

console.log(allFiles);
// [
//   { name: 'report.pdf', size: 204800, lastModified: Date, etag: '...' },
//   { name: 'avatar.png', size: 51200, lastModified: Date },
// ]
```

### Deleting Files

```typescript
// Delete a single object
await storage.removeObject({ bucket: 'my-bucket', name: 'old-file.pdf' });

// Delete multiple objects
await storage.removeObjects({
  bucket: 'my-bucket',
  names: ['file1.pdf', 'file2.jpg', 'file3.png'],
});
```

> [!NOTE]
> DiskHelper's `removeObject()` throws if the file does not exist. DiskHelper's `removeObjects()` processes deletions sequentially. MinioHelper's `removeObjects()` delegates to the minio SDK's batch removal.

### Bucket Operations

```typescript
// Check if a bucket exists
const exists = await storage.isBucketExists({ name: 'my-bucket' });

// Create a new bucket
const bucket = await storage.createBucket({ name: 'my-bucket' });
// Returns: { name: 'my-bucket', creationDate: Date }

// List all buckets
const buckets = await storage.getBuckets();
// Returns: [{ name: 'bucket-1', creationDate: Date }, ...]

// Get a specific bucket
const bucket = await storage.getBucket({ name: 'my-bucket' });
// Returns: { name: 'my-bucket', creationDate: Date } | null

// Remove a bucket
const removed = await storage.removeBucket({ name: 'my-bucket' });
```

> [!IMPORTANT]
> DiskHelper's `removeBucket()` requires the bucket directory to be empty. It throws if files remain. Remove all objects first, then remove the bucket.

### In-Memory Storage Operations

`MemoryStorageHelper` provides a simple key-value API, separate from the bucket-based `IStorageHelper` interface:

```typescript
const cache = new MemoryStorageHelper();

// Store a value
cache.set('user:123', { name: 'Alice', role: 'admin' });

// Retrieve a typed value
const user = cache.get<{ name: string; role: string }>('user:123');

// Check if a key exists
cache.isBound('user:123'); // true

// Get all keys
cache.keys(); // ['user:123']

// Access the underlying container
cache.getContainer(); // { 'user:123': { name: 'Alice', role: 'admin' } }

// Clear all stored data
cache.clear();
```

### Name Validation

All bucket and file operations validate names using `isValidName()` before execution. The following are rejected:

| Rule | Example | Reason |
|------|---------|--------|
| Contains `..`, `/`, or `\` | `../etc/passwd` | Path traversal |
| Starts with `.` | `.hidden` | Hidden file |
| Contains `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` | `file;rm -rf` | Shell injection |
| Contains `\n`, `\r`, or `\0` | `file\nname` | Header injection |
| Longer than 255 characters | (very long string) | DoS prevention |
| Empty or whitespace-only | `""`, `"   "` | Invalid input |

```typescript
storage.isValidName('my-file.pdf');    // true
storage.isValidName('../etc/passwd');  // false
storage.isValidName('.hidden');        // false
```

### MIME Type Detection

`getMimeType()` determines the MIME type from a filename's extension:

```typescript
storage.getMimeType('photo.jpg');    // 'image/jpeg'
storage.getMimeType('data.csv');     // 'text/csv'
storage.getMimeType('unknown.xyz');  // 'application/octet-stream'
```

`getFileType()` categorizes a MIME type into a broad group:

```typescript
storage.getFileType({ mimeType: 'image/png' });        // 'image'
storage.getFileType({ mimeType: 'video/mp4' });         // 'video'
storage.getFileType({ mimeType: 'text/plain' });        // 'text'
storage.getFileType({ mimeType: 'application/pdf' });   // 'unknown'
```

### Common Patterns

#### Storage Abstraction

Use `IStorageHelper` to write storage-agnostic code:

```typescript
class FileService {
  constructor(private storage: IStorageHelper) {}

  async uploadFile(bucket: string, file: IUploadFile) {
    return this.storage.upload({ bucket, files: [file] });
  }
}

// Swap backends without changing service code
const devService = new FileService(new DiskHelper({ basePath: './files' }));
const prodService = new FileService(new MinioHelper({ /* ... */ }));
```

#### Environment-Based Selection

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const createStorage = (): IStorageHelper => {
  if (applicationEnvironment.get('STORAGE_TYPE') === 'minio') {
    return new MinioHelper({
      endPoint: applicationEnvironment.get('MINIO_HOST'),
      port: Number(applicationEnvironment.get('MINIO_PORT')),
      accessKey: applicationEnvironment.get('MINIO_ACCESS_KEY'),
      secretKey: applicationEnvironment.get('MINIO_SECRET_KEY'),
      useSSL: applicationEnvironment.get('MINIO_USE_SSL') === 'true',
    });
  }

  return new DiskHelper({
    basePath: applicationEnvironment.get('DISK_STORAGE_PATH') || './storage',
  });
};
```

## Troubleshooting

### "[createBucket] Invalid name to create bucket!"

**Cause:** The bucket name failed `isValidName()` validation. The name may contain path traversal characters, start with a dot, contain shell-special characters, or exceed 255 characters.

**Fix:** Use a simple alphanumeric bucket name:

```typescript
// Wrong
await storage.createBucket({ name: '../my-bucket' });
await storage.createBucket({ name: '.hidden-bucket' });

// Correct
await storage.createBucket({ name: 'my-bucket' });
```

### "[removeBucket] Invalid name to remove bucket!"

**Cause:** Same as above -- the bucket name failed validation.

**Fix:** Provide a valid bucket name that passes `isValidName()`.

### "[createBucket] Bucket already exists | name: {name}"

**Cause:** DiskHelper throws when calling `createBucket()` on an existing bucket directory.

**Fix:** Check existence first:

```typescript
const exists = await storage.isBucketExists({ name: 'my-bucket' });
if (!exists) {
  await storage.createBucket({ name: 'my-bucket' });
}
```

### "[removeBucket] Bucket does not exist | name: {name}"

**Cause:** DiskHelper throws when attempting to remove a bucket directory that does not exist.

**Fix:** Check existence before removal:

```typescript
const exists = await storage.isBucketExists({ name: 'my-bucket' });
if (exists) {
  await storage.removeBucket({ name: 'my-bucket' });
}
```

### "[removeBucket] Bucket is not empty | name: {name}"

**Cause:** DiskHelper's `removeBucket()` requires the bucket directory to be empty before removal.

**Fix:** Remove all objects first:

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

**Cause:** The target bucket does not exist. Both DiskHelper and MinioHelper validate bucket existence before uploading.

**Fix:** Create the bucket before uploading:

```typescript
const exists = await storage.isBucketExists({ name: 'uploads' });
if (!exists) {
  await storage.createBucket({ name: 'uploads' });
}
await storage.upload({ bucket: 'uploads', files: [...] });
```

### "[upload] Invalid original file name"

**Cause:** A file's `originalName` failed `isValidName()` validation.

**Fix:** Sanitize file names before uploading, or use `normalizeNameFn` to control the stored name:

```typescript
await storage.upload({
  bucket: 'my-bucket',
  files: files,
  normalizeNameFn: ({ originalName }) => {
    return originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  },
});
```

### "[upload] Invalid file size"

**Cause:** A file's `size` property is `0`, `undefined`, or falsy.

**Fix:** Ensure every file in the upload array has a valid `size` value:

```typescript
const file: IUploadFile = {
  originalName: 'doc.pdf',
  mimetype: 'application/pdf',
  buffer: fileBuffer,
  size: fileBuffer.length, // Must be > 0
};
```

### "[getFile] File not found | bucket: {bucket} | name: {name}"

**Cause:** DiskHelper throws when the requested file does not exist on the filesystem.

**Fix:** Verify the file exists before attempting to retrieve it, or handle the error:

```typescript
try {
  const stream = await storage.getFile({ bucket: 'my-bucket', name: 'file.pdf' });
} catch (error) {
  // File not found -- handle gracefully
}
```

### MinioHelper connection errors

**Cause:** Network or configuration issue between the application and the MinIO server.

**Checklist:**
- The MinIO server is running and reachable at the configured `endPoint` and `port`
- `useSSL` matches the server's TLS configuration
- `accessKey` and `secretKey` are correct
- Network and firewall rules allow the connection

## See Also

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers
  - [Queue Helper](../queue/) -- Message queue processing

- **References:**
  - [Static Asset Component](/references/components/static-asset/) -- Serving stored files via HTTP
  - [Request Utilities](/references/utilities/request) -- `parseMultipartBody` for file uploads
  - [API Reference](./api) -- Full method signatures and types

- **External Resources:**
  - [MinIO Documentation](https://min.io/docs/minio/linux/index.html) -- MinIO object storage
  - [MinIO JavaScript SDK](https://min.io/docs/minio/linux/developers/javascript/API.html) -- Full minio client API
