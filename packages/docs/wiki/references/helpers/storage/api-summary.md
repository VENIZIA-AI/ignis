# API Summary

::: details MemoryStorageHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value)` | `void` | Store a value by key |
| `get<R>(key)` | `R \| undefined` | Retrieve typed value by key |
| `isBound(key)` | `boolean` | Check if key exists |
| `keys()` | `string[]` | Get all stored keys |
| `clear()` | `void` | Clear all data |
| `getContainer()` | `object` | Get the underlying container object |
| `static newInstance<T>()` | `MemoryStorageHelper` | Factory method to create a new instance |

:::

::: details IStorageHelper (DiskHelper / MinioHelper)

| Method | Returns | Description |
|--------|---------|-------------|
| `isValidName(name)` | `boolean` | Validate name against security rules |
| `getMimeType(filename)` | `string` | Detect MIME type from filename extension |
| `getFileType(opts)` | `string` | Categorize MIME type into broad groups |
| `isBucketExists(opts)` | `Promise<boolean>` | Check if bucket exists |
| `getBuckets()` | `Promise<IBucketInfo[]>` | List all buckets |
| `getBucket(opts)` | `Promise<IBucketInfo \| null>` | Get specific bucket info |
| `createBucket(opts)` | `Promise<IBucketInfo \| null>` | Create a new bucket |
| `removeBucket(opts)` | `Promise<boolean>` | Remove an empty bucket |
| `upload(opts)` | `Promise<IUploadResult[]>` | Upload one or more files to a bucket |
| `getFile(opts)` | `Promise<Readable>` | Get file as a readable stream |
| `getStat(opts)` | `Promise<IFileStat>` | Get file metadata (size, lastModified, etc.) |
| `removeObject(opts)` | `Promise<void>` | Delete a single object |
| `removeObjects(opts)` | `Promise<void>` | Delete multiple objects |
| `listObjects(opts)` | `Promise<IObjectInfo[]>` | List objects in a bucket with optional prefix/limit |

:::

::: details TypeScript Interfaces

### IStorageHelperOptions

```typescript
interface IStorageHelperOptions {
  scope?: string;       // Logger scope name
  identifier?: string;  // Helper identifier
}
```

### IDiskHelperOptions

```typescript
interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;  // Base directory for storage (resolved to absolute path)
}
```

### IMinioHelperOptions

```typescript
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
// Inherits all minio ClientOptions: endPoint, port, useSSL, accessKey, secretKey, etc.
```

### IUploadFile

```typescript
interface IUploadFile {
  originalName: string;  // Original filename (camelCase, not 'originalname')
  mimetype: string;      // MIME type (e.g., 'image/png')
  buffer: Buffer;        // File content
  size: number;          // File size in bytes
  encoding?: string;     // Optional encoding (e.g., '7bit', 'base64')
  folderPath?: string;   // Optional folder path for organization
  [key: string | symbol]: any;  // Additional properties allowed
}
```

### IUploadResult

```typescript
interface IUploadResult {
  bucketName: string;   // Bucket where file was stored
  objectName: string;   // Stored filename (normalized)
  link: string;         // Access URL
  metaLink?: any;       // MetaLink database record (if enabled)
  metaLinkError?: any;  // Error message if MetaLink creation failed
}
```

### IFileStat

```typescript
interface IFileStat {
  size: number;                    // File size in bytes
  metadata: Record<string, any>;   // Storage-specific metadata
  lastModified?: Date;             // Last modification date
  etag?: string;                   // Entity tag (MinioHelper only)
  versionId?: string;              // Version ID (MinioHelper only, if versioning enabled)
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
  useRecursive?: boolean;  // Recursive listing (default: false)
  maxKeys?: number;        // Maximum objects to return
}
```

:::
