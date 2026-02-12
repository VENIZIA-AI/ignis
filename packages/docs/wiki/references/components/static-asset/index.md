# Static Asset

> Flexible file management system with support for multiple storage backends (local disk, MinIO/S3-compatible) through a unified interface, featuring factory-based controller generation and optional database file tracking via MetaLink.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `StaticAssetComponent` |
| **Helper** | [`DiskHelper`](/references/helpers/storage/), [`MinioHelper`](/references/helpers/storage/) |
| **Runtimes** | Both |

#### Import Paths
```typescript
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  DiskHelper,
  MinioHelper,
} from '@venizia/ignis';
import type {
  TStaticAssetsComponentOptions,
  TMetaLinkConfig,
  TStaticAssetExtraOptions,
  TStaticAssetStorageType,
} from '@venizia/ignis';
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Unified Storage Interface** | Single API for all storage types |
| **Multiple Storage Instances** | Configure multiple storage backends simultaneously |
| **Factory Pattern** | Dynamic controller generation per storage backend |
| **Built-in Security** | Comprehensive name validation, path traversal protection, header sanitization |
| **Database Tracking (MetaLink)** | Optional database-backed file tracking with metadata, principal association, and sync status |
| **Flexible Configuration** | Environment-based, production-ready setup |

## Setup

### Step 1: Bind Configuration

```typescript
import {
  BaseApplication,
  DiskHelper,
  MinioHelper,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  TStaticAssetsComponentOptions,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure() {
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // MinIO storage for user uploads
      staticAsset: {
        controller: {
          name: 'AssetController',
          basePath: '/assets',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.MINIO,
        helper: new MinioHelper({
          endPoint: 'localhost',
          port: 9000,
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
          useSSL: false,
        }),
        extra: {
          parseMultipartBody: { storage: 'memory' },
        },
      },
      // Local disk storage for temporary files
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
          parseMultipartBody: { storage: 'memory' },
        },
      },
    });
  }
}
```

Each storage backend gets a unique key (`staticAsset`, `staticResource`), its own controller configuration, and a helper instance.

### Step 2: Register Component

```typescript
import { StaticAssetComponent } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure() {
    // ... Step 1 binding ...
    this.component(StaticAssetComponent);
  }
}
```

### Step 3: Use the Endpoints

The component auto-registers REST endpoints for each configured backend. No injection needed in downstream code.

```
GET    /assets/buckets                                — List all buckets
GET    /assets/buckets/:bucketName                    — Get bucket details (or null)
POST   /assets/buckets/:bucketName                    — Create a bucket
DELETE /assets/buckets/:bucketName                    — Delete a bucket
POST   /assets/buckets/:bucketName/upload             — Upload files
GET    /assets/buckets/:bucketName/objects             — List objects in bucket
GET    /assets/buckets/:bucketName/objects/:obj        — Stream file inline
GET    /assets/buckets/:bucketName/objects/:obj/download — Download file (attachment)
DELETE /assets/buckets/:bucketName/objects/:obj        — Delete file
PUT    /assets/buckets/:bucketName/objects/:obj/meta-links — Sync MetaLink (MetaLink only)
```

Each storage backend gets its own base path (`/assets`, `/resources`, etc.) with the same endpoint structure.

#### Environment Variables

Add these to your `.env` file for MinIO:

```bash
APP_ENV_MINIO_HOST=localhost
APP_ENV_MINIO_API_PORT=9000
APP_ENV_MINIO_ACCESS_KEY=minioadmin
APP_ENV_MINIO_SECRET_KEY=minioadmin
```

#### Environment Keys Configuration

```typescript
// src/common/environments.ts
import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  static readonly APP_ENV_MINIO_HOST = 'APP_ENV_MINIO_HOST';
  static readonly APP_ENV_MINIO_API_PORT = 'APP_ENV_MINIO_API_PORT';
  static readonly APP_ENV_MINIO_ACCESS_KEY = 'APP_ENV_MINIO_ACCESS_KEY';
  static readonly APP_ENV_MINIO_SECRET_KEY = 'APP_ENV_MINIO_SECRET_KEY';
}
```

#### Docker Compose for MinIO

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

Start with `docker-compose up -d` and access the console at `http://localhost:9001`.

## Configuration

### Storage Types

| Type | Constant | Helper | Description |
|------|----------|--------|-------------|
| `'disk'` | `StaticAssetStorageTypes.DISK` | `DiskHelper` | Local filesystem with bucket-based directory structure |
| `'minio'` | `StaticAssetStorageTypes.MINIO` | `MinioHelper` | S3-compatible object storage (MinIO, AWS S3, etc.) |

The `StaticAssetStorageTypes` class provides a `SCHEME_SET` (a `Set` of all valid storage type strings) and an `isValid(orgType)` method for runtime validation:

```typescript
StaticAssetStorageTypes.isValid('minio'); // true
StaticAssetStorageTypes.isValid('s3');    // false
StaticAssetStorageTypes.SCHEME_SET;       // Set { 'disk', 'minio' }
```

### `TStaticAssetsComponentOptions`

Each key in the options object defines a separate storage backend with its own controller:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `controller.name` | `string` | -- | Controller class name |
| `controller.basePath` | `string` | -- | Base URL path (e.g., `'/assets'`) |
| `controller.isStrict` | `boolean` | `true` | Strict routing mode |
| `storage` | `'disk' \| 'minio'` | -- | Storage type |
| `helper` | `DiskHelper \| MinioHelper` | -- | Storage helper instance |
| `extra` | `TStaticAssetExtraOptions` | `undefined` | Extra options (multipart parsing, name normalization) |
| `useMetaLink` | `boolean` | `false` | Enable database file tracking |
| `metaLink` | `TMetaLinkConfig` | -- | MetaLink configuration (required when `useMetaLink: true`) |

#### TStaticAssetsComponentOptions -- Full Reference
```typescript
type TStaticAssetsComponentOptions = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;
    };
    extra?: TStaticAssetExtraOptions;
  } & (
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
    | { storage: typeof StaticAssetStorageTypes.MINIO; helper: MinioHelper }
  ) &
    ({ useMetaLink?: false | undefined } | { useMetaLink: true; metaLink: TMetaLinkConfig });
};

type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  [key: string]: any;
};

type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseEntity<Schema>;
  repository: DefaultCRUDRepository<Schema>;
};
```

### DiskHelper

Stores files on the local filesystem using a bucket-based directory structure.

```typescript
new DiskHelper({
  basePath: string;    // Base directory for storage
  scope?: string;      // Logger scope
  identifier?: string; // Helper identifier
})
```

**Example:**

```typescript
const diskHelper = new DiskHelper({
  basePath: './app_data/storage',
});
```

**Directory structure:**
```
app_data/storage/
├── bucket-1/
│   ├── file1.pdf
│   └── file2.jpg
├── bucket-2/
│   └── document.docx
```

Features: automatic directory creation, built-in path validation, metadata from file stats, stream-based operations.

### MinioHelper

Connects to MinIO or any S3-compatible object storage.

```typescript
new MinioHelper({
  endPoint: string;    // MinIO server hostname
  port: number;        // API port (default: 9000)
  useSSL: boolean;     // Use HTTPS
  accessKey: string;   // Access key
  secretKey: string;   // Secret key
})
```

**Example:**

```typescript
const minioHelper = new MinioHelper({
  endPoint: 'minio.example.com',
  port: 9000,
  useSSL: true,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
```

### MetaLink Configuration

MetaLink is an optional feature that tracks uploaded files in a database, storing file location, metadata (mimetype, size, etag), storage type, principal association (`principalType`, `principalId`), timestamps, and custom metadata (JSONB).

#### Benefits

- Query uploaded files by bucket, name, mimetype, etc.
- Track file history and audit trails
- Store custom metadata about files
- Associate files with principals via `principalType` and `principalId` (passed as query parameters on the upload endpoint)
- Graceful errors -- upload succeeds even if MetaLink creation fails

#### Setup

**1. Create Model:**

```typescript
import { BaseMetaLinkModel, model } from '@venizia/ignis';

@model({ type: 'entity' })
export class FileMetaLinkModel extends BaseMetaLinkModel {
  // Inherits all fields from BaseMetaLinkModel
}
```

**2. Create Repository:**

```typescript
import { BaseMetaLinkRepository, repository, inject, IDataSource } from '@venizia/ignis';

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

**3. Create Database Table:**

The model has `skipMigrate: true`, so create the table manually:

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
  is_synced       BOOLEAN NOT NULL DEFAULT false,
  principal_type  TEXT,
  principal_id    TEXT
);

CREATE INDEX "IDX_MetaLink_bucketName" ON "MetaLink"(bucket_name);
CREATE INDEX "IDX_MetaLink_objectName" ON "MetaLink"(object_name);
CREATE INDEX "IDX_MetaLink_storageType" ON "MetaLink"(storage_type);
CREATE INDEX "IDX_MetaLink_isSynced" ON "MetaLink"(is_synced);
```

**4. Configure Component:**

```typescript
import { FileMetaLinkModel, FileMetaLinkRepository } from './your-models';

export class Application extends BaseApplication {
  configureComponents(): void {
    this.repository(FileMetaLinkRepository);

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

**5. Upload with Principal Association:**

When MetaLink is enabled, you can associate uploaded files with a principal (user, service, etc.) by passing query parameters on the upload endpoint:

```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

// Associate the upload with a user
const response = await fetch(
  '/uploads/buckets/user-files/upload?principalType=user&principalId=42',
  { method: 'POST', body: formData },
);
```

The `principalId` value is always stored as a string regardless of input type (coerced via `String()`).

#### Querying MetaLinks

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

// Get files by principal
const userFiles = await fileMetaLinkRepository.find({
  where: { principalType: 'user', principalId: '42' },
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

### Custom Filename Normalization

```typescript
{
  uploads: {
    controller: { name: 'UploadController', basePath: '/uploads' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({ /* ... */ }),
    extra: {
      parseMultipartBody: { storage: 'memory' },
      normalizeNameFn: ({ originalName, folderPath }) => {
        const prefix = folderPath ? `${folderPath}/` : '';
        return `${prefix}${Date.now()}_${originalName.toLowerCase().replace(/\s/g, '_')}`;
      },
      normalizeLinkFn: ({ bucketName, normalizeName }) => {
        return `/api/files/${bucketName}/${encodeURIComponent(normalizeName)}`;
      },
    },
  },
}
```

The `normalizeNameFn` receives both the `originalName` and an optional `folderPath` from the uploaded file. The `folderPath` is passed through from the `IUploadFile` object and can be used to organize files into subdirectories.

### Custom Storage Implementation

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
    normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
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

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/static-asset-component/options` | `StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` | `TStaticAssetsComponentOptions` | Yes | `{}` |

> [!NOTE]
> The component provides an empty default binding. You must bind this key with your storage configuration before registering the component.

## See Also

- [Usage & Examples](./usage) - API Endpoints and Frontend Integration
- [API Reference](./api) - Controller Factory, Storage Interface, MetaLink Schema
- [Error Reference](./errors) - Name Validation and Troubleshooting
- [Storage Helpers](/references/helpers/storage/) - DiskHelper, MinioHelper, BaseStorageHelper
- [Request Utilities](/references/utilities/request) - File upload utilities
- [Security Guidelines](/best-practices/security-guidelines) - File upload security
- [Components Overview](/guides/core-concepts/components) - Component system basics
- [Controllers](/guides/core-concepts/controllers) - File upload endpoints
