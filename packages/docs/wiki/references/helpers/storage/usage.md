# Usage

## MemoryStorageHelper

```typescript
// Set a value
memoryStore.set('my-key', { a: 1, b: 2 });

// Get a value (typed return)
const value = memoryStore.get<{ a: number; b: number }>('my-key');
// => { a: 1, b: 2 }

// Check if a key exists
const hasKey = memoryStore.isBound('my-key');
// => true

// Get all keys
const allKeys = memoryStore.keys();
// => ['my-key']

// Get the underlying container object
const container = memoryStore.getContainer();
// => { 'my-key': { a: 1, b: 2 } }

// Clear the storage
memoryStore.clear();
```

## DiskHelper / MinioHelper (IStorageHelper)

Both `DiskHelper` and `MinioHelper` implement the same `IStorageHelper` interface, making them interchangeable. The examples below apply to both.

### Storage Architecture

The unified storage interface implemented by all file storage helpers:

```typescript
interface IStorageHelper {
  // Name validation
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

::: details BaseStorageHelper

Abstract base class providing common functionality. Extends `BaseHelper` for scoped logging.

```typescript
abstract class BaseStorageHelper extends BaseHelper implements IStorageHelper {
  // Built-in security validation
  isValidName(name: string): boolean;

  // MIME type detection from filename extension
  getMimeType(filename: string): string;

  // Categorize MIME type into broad groups (image, video, text, unknown)
  getFileType(opts: { mimeType: string }): string;

  // Abstract methods that implementations must provide
  abstract isBucketExists(opts: { name: string }): Promise<boolean>;
  abstract upload(opts: { /* ... */ }): Promise<IUploadResult[]>;
  // ... other abstract methods
}
```
:::

::: details Supported MIME types in `getMimeType()`
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

Falls back to `application/octet-stream` for unknown extensions.
:::

### Bucket Operations

```typescript
// Check if bucket exists
const exists = await storage.isBucketExists({ name: 'my-bucket' });

// Create a bucket (creates directory for Disk, creates bucket for MinIO)
const bucket = await storage.createBucket({ name: 'my-bucket' });
// Returns: { name: 'my-bucket', creationDate: Date }

// Get all buckets
const buckets = await storage.getBuckets();
// Returns: [{ name: 'bucket-1', creationDate: Date }, ...]

// Get specific bucket
const bucket = await storage.getBucket({ name: 'my-bucket' });
// Returns: { name: 'my-bucket', creationDate: Date } | null

// Remove bucket (must be empty, throws if not)
const removed = await storage.removeBucket({ name: 'my-bucket' });
```

### Upload Files

```typescript
// Basic upload
const result = await storage.upload({
  bucket: 'my-bucket',
  files: [
    {
      originalName: 'document.pdf',
      mimetype: 'application/pdf',
      buffer: fileBuffer,
      size: fileBuffer.length,
    },
  ],
});
// Returns: [{ bucketName: 'my-bucket', objectName: 'document.pdf', link: '...' }]

// Upload with custom normalization
const result = await storage.upload({
  bucket: 'my-bucket',
  files: files,
  normalizeNameFn: ({ originalName, folderPath }) => {
    return folderPath ? `${folderPath}/${originalName}` : originalName;
  },
  normalizeLinkFn: ({ bucketName, normalizeName }) => {
    return `/files/${bucketName}/${normalizeName}`;
  },
});
```

> [!WARNING]
> DiskHelper uses `/static-resources/{bucket}/{encodedName}` as the default link prefix. MinioHelper uses `/static-assets/{bucket}/{encodedName}` instead. Provide a `normalizeLinkFn` if you need consistent links across storage backends.

### Get File (Stream)

```typescript
const fileStream = await storage.getFile({
  bucket: 'my-bucket',
  name: 'document.pdf',
});

// Pipe to response
fileStream.pipe(response);

// Or save to another location
import fs from 'fs';
const writeStream = fs.createWriteStream('./backup/document.pdf');
fileStream.pipe(writeStream);
```

::: details MinioHelper `getFile` options
MinioHelper supports additional options for `getFile` that DiskHelper does not:

```typescript
const fileStream = await minioClient.getFile({
  bucket: 'my-bucket',
  name: 'my-file.txt',
  options: {
    versionId: 'specific-version-id',
    SSECustomerAlgorithm: 'AES256',
    SSECustomerKey: 'encryption-key',
    SSECustomerKeyMD5: 'key-md5-hash',
  },
});
```
:::

### Get File Metadata

```typescript
const stat = await storage.getStat({
  bucket: 'my-bucket',
  name: 'document.pdf',
});

console.log(stat);
// {
//   size: 1024,
//   lastModified: Date,
//   metadata: { mimetype: 'application/pdf' },
// }
```

> [!NOTE]
> DiskHelper's `getStat()` returns the filesystem MIME type in `metadata.mimetype` (detected via `getMimeType()`) but does not return `etag` or `versionId`. Those fields are only populated by MinioHelper.

### List Objects

```typescript
// List all objects in bucket
const objects = await storage.listObjects({
  bucket: 'my-bucket',
});

// List with prefix (folder-like behavior)
const objects = await storage.listObjects({
  bucket: 'my-bucket',
  prefix: 'documents/',
  useRecursive: false,  // Non-recursive by default
});

// Limit results
const objects = await storage.listObjects({
  bucket: 'my-bucket',
  maxKeys: 100,
});

console.log(objects);
// [
//   { name: 'file1.pdf', size: 1024, lastModified: Date },
//   { name: 'file2.jpg', size: 2048, lastModified: Date },
// ]
```

### Delete Objects

```typescript
// Delete single object (throws if file not found)
await storage.removeObject({
  bucket: 'my-bucket',
  name: 'old-file.pdf',
});

// Delete multiple objects (sequential for Disk, batched via SDK for MinIO)
await storage.removeObjects({
  bucket: 'my-bucket',
  names: ['file1.pdf', 'file2.jpg', 'file3.png'],
});
```

## File Validation

::: details `isValidName()` validation rules
The `isValidName()` method (inherited from `BaseStorageHelper`) rejects names that:

| Rule | Example | Reason |
|------|---------|--------|
| Contains `..`, `/`, or `\` | `../etc/passwd` | Path traversal |
| Starts with `.` | `.hidden` | Hidden file |
| Contains `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` | `file;rm -rf` | Shell injection |
| Contains `\n`, `\r`, or `\0` | `file\nname` | Header injection |
| Longer than 255 characters | very long string... | DoS prevention |
| Empty or whitespace-only | `""`, `"   "` | Invalid input |
:::

```typescript
// All operations validate names before execution
const isValid = storage.isValidName('my-file.pdf');  // true
const isValid = storage.isValidName('../etc/passwd'); // false - path traversal
const isValid = storage.isValidName('.hidden');       // false - hidden file
const isValid = storage.isValidName('file;rm -rf');   // false - shell injection
```

## Common Patterns

### Pattern 1: Storage Abstraction

```typescript
class FileService {
  constructor(private storage: IStorageHelper) {}

  async uploadFile(bucket: string, file: IUploadFile) {
    return await this.storage.upload({ bucket, files: [file] });
  }

  async getFile(bucket: string, name: string) {
    return await this.storage.getFile({ bucket, name });
  }
}

// Use with either storage type
const service1 = new FileService(new DiskHelper({ basePath: './files' }));
const service2 = new FileService(new MinioHelper({ /* ... */ }));
```

### Pattern 2: Environment-Based Selection

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const createStorageHelper = (): IStorageHelper => {
  const storageType = applicationEnvironment.get('STORAGE_TYPE');

  if (storageType === 'minio') {
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

const storage = createStorageHelper();
```

::: details Pattern 3: Fallback Strategy
```typescript
class ResilientStorage implements IStorageHelper {
  constructor(
    private primary: IStorageHelper,
    private fallback: IStorageHelper,
  ) {}

  async upload(opts: any) {
    try {
      return await this.primary.upload(opts);
    } catch (error) {
      console.error('Primary storage failed, using fallback', error);
      return await this.fallback.upload(opts);
    }
  }

  // Implement other methods with similar fallback logic...
}

// Usage
const storage = new ResilientStorage(
  new MinioHelper({ /* ... */ }),  // Primary: Cloud
  new DiskHelper({ basePath: './backup' }),  // Fallback: Local
);
```
:::

### When to Use Each

**Use DiskHelper when:**
- Developing/testing locally
- Running on a single server
- Storage needs are < 100GB
- Simplicity is priority
- No cloud infrastructure

**Use MinioHelper when:**
- Deploying to production
- Need horizontal scaling
- Storage needs > 100GB
- Need backup/replication
- Multi-server deployment

### Hybrid Approach

Use both simultaneously for different purposes:

```typescript
import { DiskHelper, MinioHelper } from '@venizia/ignis-helpers';

// Cloud storage for user content
const userStorage = new MinioHelper({ /* ... */ });

// Local storage for system files
const systemStorage = new DiskHelper({ basePath: './system' });

// Local storage for temporary files
const tempStorage = new DiskHelper({ basePath: './temp' });
```
