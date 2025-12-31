# Static Asset Component

The Static Asset Component provides a flexible, extensible file management system with support for multiple storage backends through a unified interface.

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
✅ **Database Tracking (MetaLink)** - Optional database-backed file tracking with metadata  

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

### Complete Setup Example

Here's a real-world example from the Vert application showing how to configure storage backends:

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
import { EnvironmentKeys } from './common/environments';

export class Application extends BaseApplication {
  configureComponents(): void {
    // Configure Static Asset Component
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // MinIO storage for user uploads and media
      staticAsset: {
        controller: {
          name: 'AssetController',
          basePath: '/assets',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.MINIO,
        helper: new MinioHelper({
          endPoint: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_HOST),
          port: int(applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_API_PORT)),
          accessKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_ACCESS_KEY),
          secretKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_SECRET_KEY),
          useSSL: false,
        }),
        extra: {
          parseMultipartBody: {
            storage: 'memory',
          },
        },
      },
      // Local disk storage for temporary files and cache
      staticResource: {
        controller: {
          name: 'ResourceController',
          basePath: '/resources',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.DISK,
        helper: new DiskHelper({
          basePath: './app_data/resources',
        }),
        extra: {
          parseMultipartBody: {
            storage: 'memory',
          },
        },
      },
    });

    // Register the component
    this.component(StaticAssetComponent);
  }

  preConfigure() {
    this.configureComponents();
  }
}
```

**Key Configuration Elements:**
- Each storage backend gets a unique key (`staticAsset`, `staticResource`)
- Each backend has its own controller configuration (name, basePath)
- Storage type is explicitly set using `StaticAssetStorageTypes`
- Helper instances are created with environment variables
- Extra options configure multipart body parsing

### Environment Variables

Add these to your `.env` file:

```bash
# MinIO Configuration
APP_ENV_MINIO_HOST=localhost
APP_ENV_MINIO_API_PORT=9000
APP_ENV_MINIO_ACCESS_KEY=minioadmin
APP_ENV_MINIO_SECRET_KEY=minioadmin
```

### Environment Keys Configuration

Define the environment keys in your application:

```typescript
// src/common/environments.ts
import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  // MinIO Configuration Keys
  static readonly APP_ENV_MINIO_HOST = 'APP_ENV_MINIO_HOST';
  static readonly APP_ENV_MINIO_API_PORT = 'APP_ENV_MINIO_API_PORT';
  static readonly APP_ENV_MINIO_ACCESS_KEY = 'APP_ENV_MINIO_ACCESS_KEY';
  static readonly APP_ENV_MINIO_SECRET_KEY = 'APP_ENV_MINIO_SECRET_KEY';
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
      basePath: string;    // Base URL path (e.g., '/assets')
      isStrict?: boolean;  // Strict routing mode (default: true)
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
      normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
      normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
    };
  } & (
    // MetaLink configuration (optional)
    | { useMetaLink?: false }
    | { useMetaLink: true; metaLink: TMetaLinkConfig }
  );
};

type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseEntity<Schema>;        // MetaLink model class
  repository: DefaultCRUDRepository<Schema>; // MetaLink repository instance
};
```

### Quick Start Options

**Option 1: MinIO Only**
```typescript
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  cloudStorage: {
    controller: { name: 'CloudController', basePath: '/cloud' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({ /* ... */ }),
    extra: { parseMultipartBody: { storage: 'memory' } },
  },
});
this.component(StaticAssetComponent);
```

**Option 2: Local Disk Only**
```typescript
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  localStorage: {
    controller: { name: 'LocalController', basePath: '/files' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './uploads' }),
    extra: { parseMultipartBody: { storage: 'disk' } },
  },
});
this.component(StaticAssetComponent);
```

**Option 3: Multiple Storage Backends (Recommended)**
```typescript
// Use different storage types for different purposes
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  userUploads: {
    controller: { name: 'UploadsController', basePath: '/uploads' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({ /* ... */ }),
    extra: {},
  },
  tempFiles: {
    controller: { name: 'TempController', basePath: '/temp' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './temp' }),
    extra: {},
  },
  publicAssets: {
    controller: { name: 'PublicController', basePath: '/public' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './public' }),
    extra: {},
  },
});
this.component(StaticAssetComponent);
```


## MetaLink: Database File Tracking

MetaLink is an optional feature that tracks uploaded files in a database, enabling advanced file management, querying, and metadata storage.

### What is MetaLink?

MetaLink creates a database record for every uploaded file, storing:
- File location (bucket, object name, access link)
- File metadata (mimetype, size, etag)
- Storage type (disk or minio)
- Timestamps (created, modified)
- Custom metadata (JSONB field)

### Benefits

✅ **Query uploaded files** - Find files by bucket, name, mimetype, etc.  
✅ **Track file history** - Know when files were uploaded  
✅ **Store metadata** - Keep custom information about files  
✅ **Database integration** - Associate files with other entities  
✅ **Audit trail** - Track what was uploaded and when  
✅ **Graceful errors** - Upload succeeds even if MetaLink creation fails  

### Database Schema

**Table:** `MetaLink`

```sql
CREATE TABLE "MetaLink" (
  id              TEXT PRIMARY KEY,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  modified_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  bucket_name     TEXT NOT NULL,
  object_name     TEXT NOT NULL,
  link            TEXT NOT NULL,
  mimetype        TEXT NOT NULL,
  size            INTEGER NOT NULL,
  etag            TEXT,
  metadata        JSONB,
  storage_type    TEXT NOT NULL,
  is_synced       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX "IDX_MetaLink_bucketName" ON "MetaLink"(bucket_name);
CREATE INDEX "IDX_MetaLink_objectName" ON "MetaLink"(object_name);
CREATE INDEX "IDX_MetaLink_storageType" ON "MetaLink"(storage_type);
CREATE INDEX "IDX_MetaLink_isSynced" ON "MetaLink"(is_synced);
```

**Schema Fields:**

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
| `storage_type` | TEXT | Storage type ('disk' or 'minio') |
| `is_synced` | BOOLEAN | Whether MetaLink is synchronized with storage (default: false) |

### Setup

#### Step 1: Create Model

```typescript
import { BaseMetaLinkModel } from '@venizia/ignis';
import { model } from '@venizia/ignis';

@model({ type: 'entity' })
export class FileMetaLinkModel extends BaseMetaLinkModel {
  // Inherits all fields from BaseMetaLinkModel
}
```

#### Step 2: Create Repository

```typescript
import { BaseMetaLinkRepository } from '@venizia/ignis';
import { repository, inject } from '@venizia/ignis';
import { IDataSource } from '@venizia/ignis';

@repository({})
export class FileMetaLinkRepository extends BaseMetaLinkRepository {
  constructor(@inject({ key: 'datasources.postgres' }) dataSource: IDataSource) {
    super({
      entityClass: FileMetaLinkModel,
      relations: {},
      dataSource,
    });
  }
}
```

#### Step 3: Create Database Table

The model has `skipMigrate: true`, so you need to create the table manually:

```sql
-- Run this in your database
CREATE TABLE "MetaLink" (
  id              TEXT PRIMARY KEY,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  modified_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  bucket_name     TEXT NOT NULL,
  object_name     TEXT NOT NULL,
  link            TEXT NOT NULL,
  mimetype        TEXT NOT NULL,
  size            INTEGER NOT NULL,
  etag            TEXT,
  metadata        JSONB,
  storage_type    TEXT NOT NULL,
  is_synced       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX "IDX_MetaLink_bucketName" ON "MetaLink"(bucket_name);
CREATE INDEX "IDX_MetaLink_objectName" ON "MetaLink"(object_name);
CREATE INDEX "IDX_MetaLink_storageType" ON "MetaLink"(storage_type);
CREATE INDEX "IDX_MetaLink_isSynced" ON "MetaLink"(is_synced);
```

#### Step 4: Configure Component

```typescript
import { FileMetaLinkModel, FileMetaLinkRepository } from './your-models';

export class Application extends BaseApplication {
  configureComponents(): void {
    // Register repository
    this.repository(FileMetaLinkRepository);

    // Configure Static Asset Component with MetaLink
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      uploads: {
        controller: {
          name: 'UploadController',
          basePath: '/uploads',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.MINIO,
        helper: new MinioHelper({ /* ... */ }),
        useMetaLink: true,
        metaLink: {
          model: FileMetaLinkModel,
          repository: this.getSync(FileMetaLinkRepository),
        },
        extra: {
          parseMultipartBody: { storage: 'memory' },
        },
      },
    });

    this.component(StaticAssetComponent);
  }
}
```

### API Response with MetaLink

When `useMetaLink: true`, upload responses include the database record:

```json
[
  {
    "bucketName": "user-uploads",
    "objectName": "document.pdf",
    "link": "/uploads/buckets/user-uploads/objects/document.pdf",
    "metaLink": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "bucketName": "user-uploads",
      "objectName": "document.pdf",
      "link": "/uploads/buckets/user-uploads/objects/document.pdf",
      "mimetype": "application/pdf",
      "size": 1048576,
      "etag": "abc123def456",
      "metadata": {
        "originalName": "My Document.pdf",
        "uploadedBy": "user123"
      },
      "storageType": "minio",
      "isSynced": true,
      "createdAt": "2025-12-15T03:00:00.000Z",
      "modifiedAt": "2025-12-15T03:00:00.000Z"
    }
  }
]
```

**Note:** The `isSynced` field is automatically set to `true` when files are uploaded, indicating the MetaLink is synchronized with the actual file in storage.

### Error Handling

If MetaLink creation fails, the upload still succeeds:

```json
[
  {
    "bucketName": "user-uploads",
    "objectName": "document.pdf",
    "link": "/uploads/buckets/user-uploads/objects/document.pdf",
    "metaLink": null,
    "metaLinkError": "Database connection error"
  }
]
```

### Querying MetaLinks

```typescript
// Get all files in a bucket
const files = await fileMetaLinkRepository.find({
  where: { bucketName: 'user-uploads' },
});

// Get files by mimetype
const pdfs = await fileMetaLinkRepository.find({
  where: { mimetype: 'application/pdf' },
});

// Get files by storage type
const minioFiles = await fileMetaLinkRepository.find({
  where: { storageType: 'minio' },
});

// Get synced files only
const syncedFiles = await fileMetaLinkRepository.find({
  where: { isSynced: true },
});

// Get unsynced files (for manual sync operations)
const unsyncedFiles = await fileMetaLinkRepository.find({
  where: { isSynced: false },
});

// Count synced files
const syncedCount = await fileMetaLinkRepository.count({
  where: { isSynced: true },
});

// Get recent uploads
const recent = await fileMetaLinkRepository.find({
  orderBy: { createdAt: 'desc' },
  limit: 10,
});
```

### Automatic Cleanup

When you delete a file, MetaLink records are automatically deleted:

```http
DELETE /uploads/buckets/user-uploads/objects/document.pdf
```

- Deletes file from storage
- Deletes MetaLink record from database
- Returns `{ "success": true }`


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


#### **Create Bucket**

```http
POST /{basePath}/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Name of the new bucket

**Response:**
```json
{ "name": "my-bucket", "creationDate": "2025-12-13T00:00:00.000Z" }
```


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


#### **Upload Files**

```http
POST /{basePath}/buckets/:bucketName/upload
```

**Request Body:**
- `multipart/form-data` with file fields
- Each file can optionally include `folderPath` for organization

**Response (without MetaLink):**
```json
[
  {
    "bucketName": "my-bucket",
    "objectName": "file.pdf",
    "link": "/assets/buckets/my-bucket/objects/file.pdf"
  }
]
```

**Response (with MetaLink enabled):**
```json
[
  {
    "bucketName": "my-bucket",
    "objectName": "file.pdf",
    "link": "/assets/buckets/my-bucket/objects/file.pdf",
    "metaLink": {
      "id": "uuid",
      "bucketName": "my-bucket",
      "objectName": "file.pdf",
      "link": "/assets/buckets/my-bucket/objects/file.pdf",
      "mimetype": "application/pdf",
      "size": 1024,
      "etag": "abc123",
      "metadata": {},
      "storageType": "minio",
      "isSynced": true,
      "createdAt": "2025-12-15T03:00:00.000Z",
      "modifiedAt": "2025-12-15T03:00:00.000Z"
    }
  }
]
```

**Example:**
```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

const response = await fetch('/assets/buckets/uploads/upload', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log(result[0].metaLink); // Database record (if MetaLink enabled)
```


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

**Example:**
```typescript
const downloadUrl = `/assets/buckets/uploads/objects/${encodeURIComponent('document.pdf')}/download`;
window.open(downloadUrl, '_blank');
```


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
    "lastModified": "2025-12-13T00:00:00.000Z",
    "etag": "abc123"
  }
]
```


#### **Delete Object**

```http
DELETE /{basePath}/buckets/:bucketName/objects/:objectName
```

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object to delete (URL-encoded)

**Validation:**
- ✅ Both bucket and object names validated
- ❌ Returns 400 if either is invalid

**Behavior:**
- Deletes file from storage
- If MetaLink enabled, also deletes database record
- MetaLink deletion errors are logged but don't fail the request

**Response:**
```json
{
  "success": true
}
```

**Example:**
```typescript
const bucketName = 'user-uploads';
const objectName = 'document.pdf';

await fetch(`/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}`, {
  method: 'DELETE',
});

// File deleted from storage
// MetaLink record deleted from database (if enabled)
```


#### **Sync MetaLink** (MetaLink only)

```http
PUT /{basePath}/buckets/:bucketName/objects/:objectName/meta-links
```

**Availability:** Only available when `useMetaLink: true`

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:**
- ✅ Both bucket and object names validated
- ❌ Returns 400 if either is invalid

**Behavior:**
- Fetches current file metadata from storage
- If MetaLink exists: Updates with latest metadata
- If MetaLink doesn't exist: Creates new MetaLink record
- Sets `isSynced: true` to mark as synchronized

**Use Cases:**
- Manually sync files that exist in storage but not in database
- Update MetaLink metadata after file changes
- Rebuild MetaLink records after database restore
- Bulk synchronization operations

**Response (MetaLink created):**
```json
{
  "id": "uuid",
  "bucketName": "user-uploads",
  "objectName": "document.pdf",
  "link": "/assets/buckets/user-uploads/objects/document.pdf",
  "mimetype": "application/pdf",
  "size": 1048576,
  "etag": "abc123",
  "metadata": {},
  "storageType": "minio",
  "isSynced": true,
  "createdAt": "2025-12-15T03:00:00.000Z",
  "modifiedAt": "2025-12-15T03:00:00.000Z"
}
```

**Response (MetaLink updated):**
```json
{
  "id": "existing-uuid",
  "bucketName": "user-uploads",
  "objectName": "document.pdf",
  "link": "/assets/buckets/user-uploads/objects/document.pdf",
  "mimetype": "application/pdf",
  "size": 1048576,
  "etag": "abc123updated",
  "metadata": {},
  "storageType": "minio",
  "isSynced": true,
  "createdAt": "2025-12-15T02:00:00.000Z",
  "modifiedAt": "2025-12-15T03:00:00.000Z"
}
```

**Example:**
```typescript
// Sync a single file
const bucketName = 'user-uploads';
const objectName = 'document.pdf';

const response = await fetch(
  `/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/meta-links`,
  { method: 'PUT' }
);

const metaLink = await response.json();
console.log('Synced:', metaLink.isSynced); // true

// Bulk sync example: sync all files in storage
const objects = await fetch(`/assets/buckets/${bucketName}/objects`).then(r => r.json());

for (const obj of objects) {
  await fetch(
    `/assets/buckets/${bucketName}/objects/${encodeURIComponent(obj.name)}/meta-links`,
    { method: 'PUT' }
  );
}
```


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

  const response = await fetch('/assets/buckets/user-uploads/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  return result[0].link;
}

// Download file
function downloadFile(bucketName: string, objectName: string) {
  const url = `/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/download`;
  window.open(url, '_blank');
}

// List files in bucket
async function listFiles(bucketName: string, prefix?: string) {
  const url = new URL(`/assets/buckets/${bucketName}/objects`, window.location.origin);
  if (prefix) url.searchParams.append('prefix', prefix);

  const response = await fetch(url);
  return await response.json();
}
```

### Example 3: Custom Filename Normalization

```typescript
{
  uploads: {
    controller: { name: 'UploadController', basePath: '/uploads' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({ /* ... */ }),
    extra: {
      parseMultipartBody: { storage: 'memory' },
      normalizeNameFn: ({ originalName }) => {
        // Add timestamp prefix
        return `${Date.now()}_${originalName.toLowerCase().replace(/\s/g, '_')}`;
      },
      normalizeLinkFn: ({ bucketName, normalizeName }) => {
        // Custom link format
        return `/api/files/${bucketName}/${encodeURIComponent(normalizeName)}`;
      },
    },
  },
}
```


## Custom Storage Implementation

You can implement your own storage backend by extending `BaseStorageHelper`:

```typescript
import { BaseStorageHelper, IUploadFile, IUploadResult } from '@venizia/ignis-helpers';

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
  }): Promise<IUploadResult[]> {
    // Implementation
  }

  // Implement other IStorageHelper methods...
}

// Usage
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  s3Storage: {
    controller: { name: 'S3Controller', basePath: '/s3-assets' },
    storage: 'custom-s3',
    helper: new S3Helper({ /* ... */ }),
    extra: {},
  },
});
```


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

**Cause:** Configuration key might be invalid or missing required fields

**Solution:** Ensure each storage configuration has all required fields:
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

**DiskHelper:**
- Ensure `basePath` directory exists or can be created
- Check filesystem permissions

**MinioHelper:**
- Verify MinIO server is running
- Check credentials (accessKey, secretKey)
- Verify network connectivity (endPoint, port)

### Issue: Large file uploads failing

**Solution:** Switch to disk-based multipart parsing:

```typescript
extra: {
  parseMultipartBody: {
    storage: 'disk',        // Use disk instead of memory
    uploadDir: './uploads', // Temporary upload directory
  },
}
```


## Docker Setup for Development

### Docker Compose for MinIO

```yaml
version: '3.8'
services:
  minio:
    image: minio/minio:latest
    container_name: minio
    ports:
      - "9000:9000"   # API port
      - "9001:9001"   # Console port
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  minio_data:
```

**Start MinIO:**
```bash
docker-compose up -d
```

**Access MinIO Console:**
```
http://localhost:9001
```


## Related Documentation

- [Storage Helpers](../helpers/storage.md) - DiskHelper, MinioHelper, BaseStorageHelper
- [Request Utilities](../utilities/request.md) - `parseMultipartBody`, `createContentDispositionHeader`
- [Components Overview](./index.md)
- [Controllers](../base/controllers.md)
