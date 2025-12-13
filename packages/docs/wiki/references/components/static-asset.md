# Static Asset Component

> **Version 2.0 - Unified Storage Architecture**  
> The Static Asset Component provides a flexible, extensible file management system with support for multiple storage backends through a unified interface.

## Overview

| Feature | Description |
|---------|-------------|
| **Component** | `StaticAssetComponent` |
| **Architecture** | Factory-based controller generation with unified storage interface |
| **Storage Types** | `DiskHelper` (local filesystem), `MinioHelper` (S3-compatible) |
| **Extensibility** | Easy to add new storage backends (S3, Azure Blob, Google Cloud Storage) |
| **Dependencies** | Node.js `fs`, `path`, `stream`; MinIO client (optional) |

## Key Features

✅ **Unified Storage Interface** - Single API for all storage types  
✅ **Multiple Storage Instances** - Configure multiple storage backends simultaneously  
✅ **Factory Pattern** - Dynamic controller generation  
✅ **Built-in Security** - Comprehensive name validation, path traversal protection  
✅ **Type-Safe** - Full TypeScript support with strict interfaces  
✅ **Flexible Configuration** - Environment-based, production-ready setup  

---

## Architecture

### Storage Helper Hierarchy

```typescript
IStorageHelper (interface)
    ↓
BaseStorageHelper (abstract class)
    ↓
    ├── DiskHelper (local filesystem)
    └── MinioHelper (S3-compatible)
```

### Component Flow

```
Application Configuration
    ↓
StaticAssetComponent
    ↓
AssetControllerFactory
    ↓
Dynamic Controller(s) ← uses → IStorageHelper
```

---

## Installation & Setup

### New Configuration Format (v2.0)

The configuration API has been completely redesigned for flexibility and extensibility:

```typescript
import {
  applicationEnvironment,
  BaseApplication,
  DiskHelper,
  int,
  MinioHelper,
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  TStaticAssetsComponentOptions,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  override preConfigure(): ValueOrPromise<void> {
    // Configure multiple storage backends
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // Storage backend 1: MinIO (cloud storage)
      minioStorage: {
        controller: {
          name: 'MinIOAssetController',
          basePath: '/static-assets',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.MINIO,
        helper: new MinioHelper({
          endPoint: applicationEnvironment.get('APP_ENV_MINIO_HOST'),
          port: int(applicationEnvironment.get('APP_ENV_MINIO_API_PORT')),
          accessKey: applicationEnvironment.get('APP_ENV_MINIO_ACCESS_KEY'),
          secretKey: applicationEnvironment.get('APP_ENV_MINIO_SECRET_KEY'),
          useSSL: false,
        }),
        extra: {
          parseMultipartBody: {
            storage: 'memory', // or 'disk'
          },
        },
      },
      
      // Storage backend 2: Local disk
      diskStorage: {
        controller: {
          name: 'DiskAssetController',
          basePath: '/disk-assets',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.DISK,
        helper: new DiskHelper({
          basePath: './app_data/disk-storage',
        }),
        extra: {
          parseMultipartBody: {
            storage: 'disk',
            uploadDir: './temp-uploads',
          },
        },
      },
    });

    // Register the component
    this.component(StaticAssetComponent);
  }
}
```

### Configuration Options

#### `TStaticAssetsComponentOptions`

```typescript
type TStaticAssetsComponentOptions = {
  [key: string]: {
    // Controller configuration
    controller: {
      name: string;        // Controller class name
      basePath: string;    // Base URL path (e.g., '/static-assets')
      isStrict?: boolean;  // Strict routing mode
    };
    
    // Storage configuration
    storage: 'disk' | 'minio';  // Storage type
    helper: IStorageHelper;      // Storage helper instance
    
    // Extra options
    extra?: {
      parseMultipartBody?: {
        storage?: 'memory' | 'disk';
        uploadDir?: string;
      };
      normalizeNameFn?: (opts: { originalName: string }) => string;
      normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
    };
  };
};
```

---

## Storage Helpers

### DiskHelper (Local Filesystem)

Stores files on the local filesystem using a bucket-based directory structure.

#### Constructor

```typescript
new DiskHelper({
  basePath: string;  // Base directory for storage
  scope?: string;    // Logger scope
  identifier?: string; // Helper identifier
})
```

#### Example

```typescript
const diskHelper = new DiskHelper({
  basePath: './app_data/storage',
});
```

**Directory Structure:**
```
app_data/storage/
├── bucket-1/
│   ├── file1.pdf
│   └── file2.jpg
├── bucket-2/
│   └── document.docx
```

#### Features

- Automatic directory creation
- Built-in path validation
- Metadata stored in file stats
- Stream-based file operations

---

### MinioHelper (S3-Compatible Storage)

Connects to MinIO or any S3-compatible object storage.

#### Constructor

```typescript
new MinioHelper({
  endPoint: string;      // MinIO server hostname
  port: number;          // API port (default: 9000)
  useSSL: boolean;       // Use HTTPS
  accessKey: string;     // Access key
  secretKey: string;     // Secret key
})
```

#### Example

```typescript
const minioHelper = new MinioHelper({
  endPoint: 'minio.example.com',
  port: 9000,
  useSSL: true,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
```

---

## IStorageHelper Interface

All storage helpers implement this unified interface:

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

---

## API Endpoints

The component dynamically generates REST endpoints for each configured storage backend.

### Common Endpoints

All storage backends expose the same API structure:

#### **Get All Buckets**

```http
GET /{basePath}/buckets
```

**Response:**
```json
[
  { "name": "my-bucket", "creationDate": "2025-01-01T00:00:00.000Z" }
]
```

---

#### **Get Bucket by Name**

```http
GET /{basePath}/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Bucket name

**Validation:**
- ✅ Bucket name validated with `isValidName()`
- ❌ Returns 400 if invalid

**Response:**
```json
{ "name": "my-bucket", "creationDate": "2025-01-01T00:00:00.000Z" }
```

---

#### **Create Bucket**

```http
POST /{basePath}/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Name of the new bucket

**Response:**
```json
{ "name": "my-bucket", "creationDate": "2025-12-12T00:00:00.000Z" }
```

---

#### **Delete Bucket**

```http
DELETE /{basePath}/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Bucket to delete

**Response:**
```json
{ "success": true }
```

---

#### **Upload Files**

```http
POST /{basePath}/buckets/:bucketName/upload
```

**Query Parameters:**
- `folderPath` (optional): Subfolder path within bucket

**Request Body:**
- `multipart/form-data` with file fields

**Response:**
```json
[
  {
    "bucketName": "my-bucket",
    "objectName": "file.pdf",
    "link": "/static-assets/buckets/my-bucket/objects/file.pdf"
  }
]
```

---

#### **Get Object (Stream)**

```http
GET /{basePath}/buckets/:bucketName/objects/:objectName
```

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:**
- ✅ Both bucket and object names validated
- ❌ Returns 400 if either is invalid

**Response:**
- Streams file content with appropriate headers
- Content-Type: From metadata or `application/octet-stream`
- Content-Length: File size in bytes
- X-Content-Type-Options: `nosniff`

---

#### **Download Object**

```http
GET /{basePath}/buckets/:bucketName/objects/:objectName/download
```

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Response:**
- Streams file with download headers
- Content-Disposition: `attachment; filename="..."`
- Triggers browser download dialog

---

#### **Delete Object**

```http
DELETE /{basePath}/buckets/:bucketName/objects/:objectName
```

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object to delete

**Response:**
```json
{ "success": true }
```

---

#### **List Objects**

```http
GET /{basePath}/buckets/:bucketName/objects
```

**Query Parameters:**
- `prefix` (optional): Filter by prefix
- `recursive` (optional, boolean): Recursive listing
- `maxKeys` (optional, number): Maximum objects to return

**Response:**
```json
[
  {
    "name": "file1.pdf",
    "size": 1024,
    "lastModified": "2025-12-12T00:00:00.000Z",
    "etag": "abc123"
  }
]
```

---

## Security Features

### Built-in Name Validation

All storage helpers implement comprehensive name validation:

```typescript
isValidName(name: string): boolean {
  // ❌ Prevents path traversal
  if (name.includes('..') || name.includes('/') || name.includes('\\'))
    return false;

  // ❌ Prevents hidden files
  if (name.startsWith('.')) return false;

  // ❌ Prevents shell injection
  const dangerousChars = /[;|&$`<>(){}[\]!#]/;
  if (dangerousChars.test(name)) return false;

  // ❌ Prevents header injection
  if (name.includes('\n') || name.includes('\r') || name.includes('\0'))
    return false;

  // ❌ Prevents DoS (long names)
  if (name.length > 255) return false;

  // ❌ Prevents empty names
  if (name.trim().length === 0) return false;

  return true;
}
```

**Blocked Patterns:**
```
../etc/passwd           ❌ Path traversal
.hidden                 ❌ Hidden file
file;rm -rf /           ❌ Shell injection
file\ninjected          ❌ Header injection
very_long_name...       ❌ > 255 characters
```

### HTTP Security Headers

All responses include security headers:

```http
X-Content-Type-Options: nosniff
Content-Disposition: attachment; filename="..."
```

---

## Migration from v1.0

### Old Configuration (v1.0)

```typescript
// ❌ Old API - no longer supported
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  minioAsset: {
    enable: true,
    minioHelper: new MinioHelper({ /* ... */ }),
    options: { /* ... */ },
  },
  staticResource: {
    enable: true,
    resourceBasePath: './storage',
    options: { /* ... */ },
  },
});
```

### New Configuration (v2.0)

```typescript
// ✅ New API - flexible and extensible
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  minioStorage: {
    controller: { name: 'MinIOController', basePath: '/static-assets' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({ /* ... */ }),
    extra: { /* ... */ },
  },
  diskStorage: {
    controller: { name: 'DiskController', basePath: '/disk-assets' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './storage' }),
    extra: { /* ... */ },
  },
});
```

### Key Differences

| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Configuration | Fixed keys (`minioAsset`, `staticResource`) | Dynamic keys |
| Controllers | 2 separate controllers | Factory-generated |
| Storage Interface | Direct helper usage | `IStorageHelper` interface |
| Extensibility | Limited to MinIO and local | Any storage backend |
| Multiple Instances | Not supported | Fully supported |

---

## Usage Examples

### Example 1: Multiple Storage Backends

```typescript
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  // User uploads → MinIO
  uploads: {
    controller: { name: 'UploadController', basePath: '/uploads' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({ /* ... */ }),
    extra: { parseMultipartBody: { storage: 'memory' } },
  },
  
  // Temporary files → Local disk
  temp: {
    controller: { name: 'TempController', basePath: '/temp' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './temp' }),
    extra: { parseMultipartBody: { storage: 'disk' } },
  },
  
  // Public assets → Local disk
  public: {
    controller: { name: 'PublicController', basePath: '/public' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './public' }),
    extra: { parseMultipartBody: { storage: 'memory' } },
  },
});
```

**Result:** 3 independent storage systems with different endpoints:
- `/uploads/buckets/...`
- `/temp/buckets/...`
- `/public/buckets/...`

### Example 2: Frontend Integration

```typescript
// Upload file to MinIO
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/static-assets/buckets/user-uploads/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  // [{ bucketName: 'user-uploads', objectName: 'file.pdf', link: '...' }]
  return result[0].link;
}

// Download file
function downloadFile(bucketName: string, objectName: string) {
  const url = `/static-assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/download`;
  window.open(url, '_blank');
}

// List files in bucket
async function listFiles(bucketName: string, prefix?: string) {
  const url = new URL(`/static-assets/buckets/${bucketName}/objects`, window.location.origin);
  if (prefix) url.searchParams.append('prefix', prefix);

  const response = await fetch(url);
  return await response.json();
}
```

---

## Custom Storage Implementation

You can implement your own storage backend:

```typescript
import { BaseStorageHelper, IUploadFile, IUploadResult, /* ... */ } from '@venizia/ignis-helpers';

class S3Helper extends BaseStorageHelper {
  constructor(config: S3Config) {
    super({ scope: 'S3Helper', identifier: 'S3Helper' });
    // Initialize S3 client
  }

  async isBucketExists(opts: { name: string }): Promise<boolean> {
    // Implementation
  }

  async upload(opts: {
    bucket: string;
    files: IUploadFile[];
    // ...
  }): Promise<IUploadResult[]> {
    // Implementation
  }

  // Implement other methods...
}

// Usage
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  s3Storage: {
    controller: { name: 'S3Controller', basePath: '/s3-assets' },
    storage: 'custom-s3', // Custom type
    helper: new S3Helper({ /* ... */ }),
    extra: {},
  },
});
```

---

## Troubleshooting

### Issue: "Invalid bucket/object name" errors

**Cause:** Name fails `isValidName()` validation

**Solution:** Ensure names:
- Don't contain `..`, `/`, `\`
- Don't start with `.`
- Don't contain shell special characters
- Are <= 255 characters
- Are not empty or whitespace-only

### Issue: Controller not registering

**Cause:** Configuration key might be invalid

**Solution:** Ensure each storage configuration has:
```typescript
{
  [uniqueKey]: {
    controller: { name, basePath, isStrict },
    storage: 'disk' | 'minio',
    helper: IStorageHelper,
    extra: {}
  }
}
```

### Issue: Files not uploading

**Cause:** Storage helper not properly initialized

**Solution for DiskHelper:**
- Ensure `basePath` directory exists or can be created
- Check filesystem permissions

**Solution for MinioHelper:**
- Verify MinIO server is running
- Check credentials (accessKey, secretKey)
- Verify network connectivity

---

## Related Documentation

- [Storage Helpers](../helpers/storage.md) - DiskHelper, MinioHelper, BaseStorageHelper
- [Request Utilities](../utilities/request.md) - `parseMultipartBody`, `createContentDispositionHeader`
- [Components Overview](./index.md)
- [Controllers](../base/controllers.md)

---

## Breaking Changes from v1.0

⚠️ **Version 2.0 introduces breaking changes:**

1. **Configuration API completely changed**
   - Old fixed keys → New dynamic keys
   - Old `enable` flags → Removed (just don't configure if not needed)

2. **Import paths changed**
   - `controller.ts` → `controller/factory.ts`
   - Separate controllers → Factory pattern

3. **Type definitions changed**
   - `TStaticAssetsComponentOptions` structure completely different
   - New `StaticAssetStorageTypes` constants

4. **Helper constructors changed**
   - `DiskHelper` requires `basePath` instead of being created internally
   - All helpers now implement `IStorageHelper`

**Migration required for all existing applications using v1.0**
