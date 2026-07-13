# Storage

Unified file storage abstraction with interchangeable backends for S3-compatible object storage, local filesystem, and in-memory key-value caching.

## Quick Reference

| Class | Extends | Backend | Implements |
|-------|---------|---------|------------|
| **MinioHelper** | `BaseStorageHelper` | S3-compatible (MinIO) | `IStorageHelper` |
| **BunS3Helper** | `BaseStorageHelper` | S3-compatible (Bun-native) | `IStorageHelper` |
| **DiskHelper** | `BaseStorageHelper` | Local filesystem | `IStorageHelper` |
| **MemoryStorageHelper** | `BaseHelper` | In-memory key-value | -- |

#### Import Paths

```typescript
// Disk and in-memory storage (from base package)
import { DiskHelper, MemoryStorageHelper } from '@venizia/ignis-helpers';

// MinIO storage (separate export path)
import { MinioHelper } from '@venizia/ignis-helpers/minio';

// Bun S3 storage (separate export path, Bun runtime only)
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

> [!NOTE]
> The underlying `minio.Client` is stored as a private property. Use the `IStorageHelper` methods for all operations. If you need direct minio SDK access, extend `MinioHelper` in a subclass.

### Bun S3 Storage

`BunS3Helper` provides S3-compatible storage using Bun's native `S3Client` for high-performance object operations. Bucket management operations (list, create, delete) use AWS Signature V4 signed requests, while object operations use Bun's native S3 API.

> [!IMPORTANT]
> `BunS3Helper` requires the **Bun runtime**. It uses Bun's built-in `S3Client` class which is not available in Node.js.

```typescript
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

const storage = new BunS3Helper({
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
});
```

#### IBunS3HelperOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `accessKey` | `string` | -- | S3 access key credential. |
| `secretKey` | `string` | -- | S3 secret key credential. |
| `endpoint` | `string` | -- | S3-compatible endpoint URL (e.g., `'http://localhost:9000'`). |
| `region` | `string` | `'us-east-1'` | AWS region for signing. |
| `sessionToken` | `string` | -- | Optional session token for temporary credentials. |
| `scope` | `string` | `'BunS3Helper'` | Logger scope name. |
| `identifier` | `string` | `'BunS3Helper'` | Helper identifier. |

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

`DiskHelper`, `MinioHelper`, and `BunS3Helper` implement the same `IStorageHelper` interface, making them interchangeable. All examples below apply to all three unless noted otherwise.

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

By default, file names are lowercased with spaces replaced by underscores. The default link prefix differs by backend: MinioHelper and BunS3Helper use `/static-assets/{bucket}/{name}`, DiskHelper uses `/static-resources/{bucket}/{name}`. Override either with custom functions:

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

> [!NOTE]
> The output of `normalizeNameFn` is validated with `isValidPath()` before it reaches the filesystem or object store - a traversal payload returned from a custom function (e.g. `../../../etc/cron.d/pwn`) is rejected with `'[upload] Invalid normalized object name | name: {name}'`, not trusted just because it came from application code.

#### Controlling Folder Depth

`upload()` accepts an optional `maxFolderDepth` that overrides `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH` (`2`) for that call. It bounds both the incoming `folderPath` on each file and the folder depth of the resulting normalized object name:

```typescript
const results = await storage.upload({
  bucket: 'my-bucket',
  files: files,
  maxFolderDepth: 4, // allow up to 4 folder segments instead of the default 2
});
```

Omit it to keep the default of `2`.

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
> DiskHelper uses `/static-resources/` as the default link prefix, while MinioHelper and BunS3Helper use `/static-assets/`. Provide a `normalizeLinkFn` if you need consistent links across storage backends.

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
//   etag: 'abc123',       // MinioHelper and BunS3Helper only
//   versionId: 'v1',      // MinioHelper only (if versioning enabled)
// }
```

> [!NOTE]
> DiskHelper populates `metadata.mimetype` using the `getMimeType()` extension-based lookup. It does not return `etag` or `versionId`. MinioHelper returns full metadata from the MinIO server including the original upload metadata, `etag`, and `versionId`. BunS3Helper returns `metadata` with `contentType` and `mimetype` from the S3 stat response, plus `etag` and `lastModified`.

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
> DiskHelper's `removeObject()` throws if the file does not exist. DiskHelper's `removeObjects()` processes deletions sequentially. MinioHelper's `removeObjects()` delegates to the minio SDK's batch removal. BunS3Helper's `removeObjects()` deletes in parallel via `Promise.all()`.

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

Storage helpers use two validation methods depending on context:

- **`isValidName(name)`** - validates a single path segment (bucket names, raw file names). Rejects names that contain `/`, `\`, or `..`.
- **`isValidPath(pathStr)`** - validates a full object path that may include folder segments (e.g., `folder/file.pdf`). Splits on `/` and validates each segment with `isValidName`. Also enforces a max folder depth (default: 2).

Bucket operations (create, remove) validate the bucket name with `isValidName()`. `upload()` validates each file's `originalName` with `isValidName()` and, when provided, the file's `folderPath` with `isValidPath()` so that folder structures like `2025/uploads` are accepted. Read and delete operations (`getFile`, `getStat`, `removeObject`, `listObjects`) do not re-validate names.

The following single-segment inputs are rejected by `isValidName()`:

| Rule | Example | Reason |
|------|---------|--------|
| Contains `..`, `/`, or `\` | `../etc/passwd` | Path traversal |
| Starts with `.` | `.hidden` | Hidden file |
| Contains `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` | `file;rm -rf` | Shell injection |
| Contains `\n`, `\r`, or `\0` | `file\nname` | Header injection |
| Longer than 255 characters | (very long string) | DoS prevention |
| Empty or whitespace-only | `""`, `"   "` | Invalid input |

```typescript
// Single-segment name validation (buckets, raw file names)
storage.isValidName('my-file.pdf');    // true
storage.isValidName('../etc/passwd');  // false - contains path separators
storage.isValidName('.hidden');        // false - starts with dot

// Multi-segment path validation (object names with folder structure)
storage.isValidPath('folder/file.pdf');       // true
storage.isValidPath('../etc/passwd');         // false - path traversal
storage.isValidPath('a/b/c/d/file.pdf');     // false - exceeds max depth (2)
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
const bunService = new FileService(new BunS3Helper({ /* ... */ }));
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

**Cause:** The target bucket does not exist. DiskHelper, MinioHelper, and BunS3Helper all validate bucket existence before uploading.

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

**Cause:** A file's `size` property is `undefined`, `null`, or negative. A zero-byte file is a legal upload - it is not what triggers this error.

**Fix:** Ensure every file in the upload array has a valid `size` value:

```typescript
const file: IUploadFile = {
  originalName: 'doc.pdf',
  mimetype: 'application/pdf',
  buffer: fileBuffer,
  size: fileBuffer.length, // Must be a number >= 0
};
```

### "[upload] Invalid normalized object name | name: {name}"

**Cause:** A custom `normalizeNameFn` returned a value that fails `isValidPath()` - typically a path-traversal payload (e.g. `../../../etc/cron.d/pwn`) or a name exceeding `maxFolderDepth`.

**Fix:** Ensure `normalizeNameFn` returns a plain relative name/path with no `..` segments, no leading `/`, and no more folder segments than `maxFolderDepth` (default `2`) allows.

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
  - [Static Asset Component](/extensions/components/static-asset/) -- Serving stored files via HTTP
  - [Request Utilities](/references/utilities/request) -- `parseMultipartBody` for file uploads
  - [API Reference](./api) -- Full method signatures and types

- **External Resources:**
  - [MinIO Documentation](https://min.io/docs/minio/linux/index.html) -- MinIO object storage
  - [MinIO JavaScript SDK](https://min.io/docs/minio/linux/developers/javascript/API.html) -- Full minio client API
