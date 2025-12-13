# Storage Helpers

Storage solutions for in-memory, local filesystem, and cloud object storage with a unified interface.

## Quick Reference

| Helper | Type | Implements | Use Case |
|--------|------|------------|----------|
| **MemoryStorageHelper** | In-memory key-value | - | Caching, temporary state, single-process data |
| **DiskHelper** | Local filesystem | `IStorageHelper` | Local file storage, development, small-scale apps |
| **MinioHelper** | S3-compatible storage | `IStorageHelper` | Cloud storage, production, scalable file management |

### MemoryStorageHelper Methods

| Method | Purpose |
|--------|---------|
| `set(key, value)` | Store value |
| `get<T>(key)` | Retrieve value |
| `isBound(key)` | Check if key exists |
| `keys()` | Get all keys |
| `clear()` | Clear all data |

### IStorageHelper Operations

All storage helpers implementing `IStorageHelper` provide these operations:

| Operation | Methods |
|-----------|---------|
| **Validation** | `isValidName()` |
| **Bucket** | `isBucketExists()`, `getBuckets()`, `getBucket()`, `createBucket()`, `removeBucket()` |
| **Upload** | `upload({ bucket, files, normalizeNameFn, normalizeLinkFn })` |
| **Download** | `getFile({ bucket, name })`, `getStat({ bucket, name })` |
| **Delete** | `removeObject()`, `removeObjects()` |
| **List** | `listObjects({ bucket, prefix, useRecursive, maxKeys })` |
| **Utility** | `getFileType({ mimeType })` |

---

## Storage Architecture

### IStorageHelper Interface

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

### BaseStorageHelper

Abstract base class providing common functionality:

```typescript
abstract class BaseStorageHelper implements IStorageHelper {
  // Built-in security validation
  isValidName(name: string): boolean;
  
  // MIME type detection
  getFileType(opts: { mimeType: string }): string;
  
  // Abstract methods that implementations must provide
  abstract isBucketExists(opts: { name: string }): Promise<boolean>;
  abstract upload(opts: { /* ... */ }): Promise<IUploadResult[]>;
  // ... other abstract methods
}
```

---

## `MemoryStorageHelper`

The `MemoryStorageHelper` is a simple in-memory key-value store. It's useful for caching, storing temporary application state, or passing data between loosely coupled parts of your application within a single process.

### Creating an Instance

```typescript
import { MemoryStorageHelper } from '@venizia/ignis';

const memoryStore = new MemoryStorageHelper();
```

### Usage

```typescript
// Set a value
memoryStore.set('my-key', { a: 1, b: 2 });

// Get a value
const value = memoryStore.get<{ a: number; b: number }>('my-key');
// => { a: 1, b: 2 }

// Check if a key exists
const hasKey = memoryStore.isBound('my-key');
// => true

// Get all keys
const allKeys = memoryStore.keys();
// => ['my-key']

// Clear the storage
memoryStore.clear();
```

---

## `DiskHelper`

The `DiskHelper` provides local filesystem storage using a bucket-based directory structure. It implements the `IStorageHelper` interface, making it easy to switch between local and cloud storage.

### Creating an Instance

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';

const diskHelper = new DiskHelper({
  basePath: './app_data/storage',  // Base directory for storage
});
```

**Options:**
- `basePath` (string, required): Base directory where buckets will be created
- `scope` (string, optional): Logger scope name
- `identifier` (string, optional): Helper identifier

**Directory Structure:**
```
app_data/storage/           ← basePath
├── bucket-1/               ← bucket (directory)
│   ├── file1.pdf          ← object (file)
│   └── file2.jpg
├── bucket-2/
│   └── document.docx
└── user-uploads/
    ├── avatar.png
    └── resume.pdf
```

### Key Features

✅ **Automatic Directory Creation** - Creates directories as needed  
✅ **Built-in Security** - Path traversal protection, name validation  
✅ **Stream-Based** - Efficient for large files  
✅ **Metadata Support** - Uses filesystem stats  
✅ **Compatible Interface** - Same API as MinioHelper  

### Bucket Operations

```typescript
// Check if bucket exists
const exists = await diskHelper.isBucketExists({ name: 'my-bucket' });

// Create a bucket (creates directory)
const bucket = await diskHelper.createBucket({ name: 'my-bucket' });
// Returns: { name: 'my-bucket', creationDate: Date }

// Get all buckets
const buckets = await diskHelper.getBuckets();
// Returns: [{ name: 'bucket-1', creationDate: Date }, ...]

// Get specific bucket
const bucket = await diskHelper.getBucket({ name: 'my-bucket' });
// Returns: { name: 'my-bucket', creationDate: Date } | null

// Remove bucket (removes directory, must be empty)
const removed = await diskHelper.removeBucket({ name: 'my-bucket' });
```

### File Operations

#### Upload Files

```typescript
// Basic upload
const result = await diskHelper.upload({
  bucket: 'my-bucket',
  files: [
    {
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      buffer: fileBuffer,
      size: fileBuffer.length,
    },
  ],
});
// Returns: [{ bucketName: 'my-bucket', objectName: 'document.pdf', link: '...' }]

// Upload with custom normalization
const result = await diskHelper.upload({
  bucket: 'my-bucket',
  files: files,
  normalizeNameFn: ({ originalName }) => {
    return `${Date.now()}_${originalName.toLowerCase()}`;
  },
  normalizeLinkFn: ({ bucketName, normalizeName }) => {
    return `/files/${bucketName}/${normalizeName}`;
  },
});
```

#### Get File (Stream)

```typescript
const fileStream = await diskHelper.getFile({
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

#### Get File Metadata

```typescript
const stat = await diskHelper.getStat({
  bucket: 'my-bucket',
  name: 'document.pdf',
});

console.log(stat);
// {
//   size: 1024,
//   metadata: { /* filesystem stats */ },
//   lastModified: Date,
//   etag: 'hash',
// }
```

#### List Objects

```typescript
// List all objects in bucket
const objects = await diskHelper.listObjects({
  bucket: 'my-bucket',
});

// List with prefix (folder-like behavior)
const objects = await diskHelper.listObjects({
  bucket: 'my-bucket',
  prefix: 'documents/',
  useRecursive: false,  // Non-recursive by default
});

// Limit results
const objects = await diskHelper.listObjects({
  bucket: 'my-bucket',
  maxKeys: 100,
});

console.log(objects);
// [
//   { name: 'file1.pdf', size: 1024, lastModified: Date },
//   { name: 'file2.jpg', size: 2048, lastModified: Date },
// ]
```

#### Delete Objects

```typescript
// Delete single object
await diskHelper.removeObject({
  bucket: 'my-bucket',
  name: 'old-file.pdf',
});

// Delete multiple objects
await diskHelper.removeObjects({
  bucket: 'my-bucket',
  names: ['file1.pdf', 'file2.jpg', 'file3.png'],
});
```

### Security & Validation

```typescript
// Name validation (inherited from BaseStorageHelper)
const isValid = diskHelper.isValidName('my-file.pdf');  // true
const isValid = diskHelper.isValidName('../etc/passwd'); // false ❌ path traversal
const isValid = diskHelper.isValidName('.hidden');       // false ❌ hidden file
const isValid = diskHelper.isValidName('file;rm -rf');   // false ❌ shell injection

// All operations validate names before execution
try {
  await diskHelper.createBucket({ name: '../../../etc' });
} catch (error) {
  // Error: Invalid bucket name
}
```

### Use Cases

**Development & Testing:**
```typescript
const devStorage = new DiskHelper({ basePath: './dev-storage' });
```

**Small-Scale Production:**
```typescript
const prodStorage = new DiskHelper({ basePath: '/var/app/storage' });
```

**Temporary Files:**
```typescript
const tempStorage = new DiskHelper({ basePath: './temp' });
```

**Hybrid Setup:**
```typescript
// User uploads → Cloud (MinIO)
const cloudStorage = new MinioHelper({ /* ... */ });

// System files → Local (Disk)
const localStorage = new DiskHelper({ basePath: './system-files' });
```

---

## `MinioHelper`

The `MinioHelper` is a comprehensive client for interacting with MinIO or any S3-compatible object storage service. It implements the `IStorageHelper` interface for unified storage operations.

### Creating a MinIO Client

```typescript
import { MinioHelper } from '@venizia/ignis';

const minioClient = new MinioHelper({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});
```

### Bucket Operations

```typescript
// Create a bucket if it doesn't exist
const bucketName = 'my-bucket';
const bucketExists = await minioClient.isBucketExists({ name: bucketName });
if (!bucketExists) {
  await minioClient.createBucket({ name: bucketName });
}
```

### Object Operations

#### Uploading a File

The `upload` method takes an array of file objects, typically from a multipart form data request.

```typescript
// Basic upload
const uploadResult = await minioClient.upload({
  bucket: 'my-bucket',
  files: files,
});
// => [{ bucket: 'my-bucket', fileName: '...', link: '...' }]

// Upload with custom filename normalization
const uploadResult = await minioClient.upload({
  bucket: 'my-bucket',
  files: files,
  normalizeNameFn: ({ originalName }) => {
    // Custom logic to normalize filename
    return `${Date.now()}_${originalName.toLowerCase().replace(/\s/g, '-')}`;
  },
  normalizeLinkFn: ({ bucketName, normalizeName }) => {
    // Custom link generation
    return `/api/files/${bucketName}/${encodeURIComponent(normalizeName)}`;
  },
});
```

**Options:**
- `bucket` (string): Target bucket name
- `files` (Array<IUploadFile>): Array of file objects to upload
- `normalizeNameFn` (optional): Custom function to normalize filenames (default: lowercase + replace spaces with underscores)
- `normalizeLinkFn` (optional): Custom function to generate file access links (default: `/static-assets/{bucket}/{encodedName}`)

**IUploadFile Interface:**
```typescript
interface IUploadFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;  // Optional encoding information
}
```

**Note:** MinioHelper now implements the same `IStorageHelper` interface as `DiskHelper`, making them interchangeable. See the DiskHelper section for detailed API documentation, which applies to both helpers.

#### Getting an Object

The `getFile` method returns a `Readable` stream for an object.

```typescript
const fileStream = await minioClient.getFile({
  bucket: 'my-bucket',
  name: 'my-file.txt',
});

fileStream.pipe(process.stdout);
```

#### Removing Objects

```typescript
// Remove a single object
await minioClient.removeObject({ bucket: 'my-bucket', name: 'my-file.txt' });

// Remove multiple objects
await minioClient.removeObjects({ bucket: 'my-bucket', names: ['file1.txt', 'file2.txt'] });
```

---

## DiskHelper vs MinioHelper Comparison

Both helpers implement the same `IStorageHelper` interface, making them functionally equivalent from an API perspective.

### Feature Comparison

| Feature | DiskHelper | MinioHelper |
|---------|------------|-------------|
| **Storage Type** | Local filesystem | S3-compatible cloud |
| **Interface** | `IStorageHelper` | `IStorageHelper` |
| **Scalability** | Limited to single server | Horizontally scalable |
| **Setup Complexity** | Simple (just a directory) | Requires MinIO server |
| **Performance** | Fast (local disk I/O) | Network-dependent |
| **Backup** | Manual filesystem backup | Built-in replication |
| **Cost** | Disk space only | Server + storage costs |
| **Use Case** | Development, small apps | Production, large scale |

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

---

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
import { applicationEnvironment } from '@venizia/ignis';

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

### Pattern 3: Fallback Strategy

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

---

## Related Documentation

- [Static Asset Component](../components/static-asset.md) - Uses storage helpers
- [Request Utilities](../utilities/request.md) - `parseMultipartBody`
- [Base Helpers](./index.md) - Helper architecture

---

## TypeScript Interfaces Reference

### IUploadFile

```typescript
interface IUploadFile {
  originalname: string;  // Original filename
  mimetype: string;      // MIME type (e.g., 'image/png')
  buffer: Buffer;        // File content
  size: number;          // File size in bytes
  encoding?: string;     // Optional encoding (e.g., '7bit', 'base64')
}
```

### IUploadResult

```typescript
interface IUploadResult {
  bucketName: string;  // Bucket where file was stored
  objectName: string;  // Stored filename
  link: string;        // Access URL
}
```

### IFileStat

```typescript
interface IFileStat {
  size: number;                    // File size in bytes
  metadata: Record<string, any>;   // Storage-specific metadata
  lastModified?: Date;             // Last modification date
  etag?: string;                   // Entity tag
  versionId?: string;              // Version ID (if versioning enabled)
}
```

### IBucketInfo

```typescript
interface IBucketInfo {
  name: string;         // Bucket name
  creationDate: Date;   // When bucket was created
}
```

### IObjectInfo

```typescript
interface IObjectInfo {
  name?: string;         // Object name
  size?: number;         // Object size in bytes
  lastModified?: Date;   // Last modification date
  etag?: string;         // Entity tag
  prefix?: string;       // Prefix (for directory-like listing)
}
```

### IListObjectsOptions

```typescript
interface IListObjectsOptions {
  bucket: string;          // Bucket to list
  prefix?: string;         // Filter by prefix
  useRecursive?: boolean;  // Recursive listing
  maxKeys?: number;        // Maximum objects to return
}
```
