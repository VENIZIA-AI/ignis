# Static Asset

> Flexible file management system with support for multiple storage backends (local disk, MinIO/S3-compatible, Bun S3) through a unified interface, featuring factory-based controller generation and optional database file tracking via MetaLink.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `StaticAssetComponent` |
| **Helper** | [`DiskHelper`](/extensions/helpers/storage/), [`MinioHelper`](/extensions/helpers/storage/), [`BunS3Helper`](/extensions/helpers/storage/) |
| **Runtimes** | Both |

#### Import Paths

> [!IMPORTANT]
> `StaticAssetComponent` and its related exports are **not** exported from the `@venizia/ignis` barrel. You must import from the `@venizia/ignis/static-asset` subpath.

```typescript
// From core -- subpath import (NOT from '@venizia/ignis')
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  AssetControllerFactory,
  BaseMetaLinkModel,
  BaseMetaLinkRepository,
} from '@venizia/ignis/static-asset';

import { DiskHelper } from '@venizia/ignis-helpers';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

import type {
  TStaticAssetsComponentOptions,
  TMetaLinkConfig,
  TStaticAssetExtraOptions,
  TStaticAssetStorageType,
} from '@venizia/ignis/static-asset';
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Unified Storage Interface** | Single API for all storage types |
| **Multiple Storage Instances** | Configure multiple storage backends simultaneously |
| **Factory Pattern** | Dynamic controller generation per storage backend |
| **Built-in Security** | Comprehensive name validation, path traversal protection, header sanitization |
| **Database Tracking (MetaLink)** | Optional database-backed file tracking with metadata, principal association, variant support, and sync status |
| **Per-Route Configuration** | Override authentication, middleware, and path for individual routes |
| **Flexible Configuration** | Environment-based, production-ready setup |

## Setup

### Step 1: Bind Configuration

```typescript
import { BaseApplication } from '@venizia/ignis';
import {
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
} from '@venizia/ignis/static-asset';
import { DiskHelper } from '@venizia/ignis-helpers';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
import type { TStaticAssetsComponentOptions } from '@venizia/ignis/static-asset';

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
import { StaticAssetComponent } from '@venizia/ignis/static-asset';

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
GET    /assets/buckets                                - List all buckets
GET    /assets/buckets/:bucketName                    - Get bucket details (or null)
POST   /assets/buckets/:bucketName                    - Create a bucket
DELETE /assets/buckets/:bucketName                    - Delete a bucket
POST   /assets/buckets/:bucketName/upload             - Upload files
GET    /assets/buckets/:bucketName/objects             - List objects in bucket
GET    /assets/buckets/:bucketName/objects/:obj        - Stream file inline
GET    /assets/buckets/:bucketName/download/:obj        - Download file (attachment)
DELETE /assets/buckets/:bucketName/objects/:obj        - Delete file
PUT    /assets/buckets/:bucketName/meta-links/:obj      - Sync MetaLink (MetaLink only)
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
| `'bun-s3'` | `StaticAssetStorageTypes.BUN_S3` | `BunS3Helper` | Bun-native S3 client (requires Bun runtime) |

The `StaticAssetStorageTypes` class provides a `SCHEME_SET` (a `Set` of all valid storage type strings) and an `isValid(orgType)` method for runtime validation:

```typescript
StaticAssetStorageTypes.isValid('minio');  // true
StaticAssetStorageTypes.isValid('bun-s3'); // true
StaticAssetStorageTypes.isValid('s3');     // false
StaticAssetStorageTypes.SCHEME_SET;        // Set { 'disk', 'minio', 'bun-s3' }
```

### `TStaticAssetsComponentOptions`

Each key in the options object defines a separate storage backend with its own controller:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `controller.name` | `string` | -- | Controller class name |
| `controller.basePath` | `string` | -- | Base URL path (e.g., `'/assets'`) |
| `controller.isStrict` | `boolean` | `true` | Strict routing mode |
| `controller.routes` | `object` | `undefined` | Per-route overrides (authenticate, middleware, path) |
| `storage` | `'disk' \| 'minio' \| 'bun-s3'` | -- | Storage type |
| `helper` | `DiskHelper \| MinioHelper \| BunS3Helper` | -- | Storage helper instance |
| `extra` | `TStaticAssetExtraOptions` | `undefined` | Extra options (multipart parsing, name normalization) |
| `useMetaLink` | `boolean` | `false` | Enable database file tracking |
| `metaLink` | `TMetaLinkConfig` | -- | MetaLink configuration (required when `useMetaLink: true`) |

#### Per-Route Configuration

Each route can be individually configured with authentication, middleware, and path overrides:

```typescript
{
  controller: {
    name: 'AssetController',
    basePath: '/assets',
    routes: {
      getBuckets: { authenticate: { strategies: ['jwt'], mode: 'any' } },
      upload: { authenticate: { strategies: ['jwt'], mode: 'any' }, middleware: [rateLimitMw] },
      getObjectByName: { /* public -- no authenticate */ },
      downloadObjectByName: { /* public */ },
      deleteObject: { authenticate: { strategies: ['jwt'], mode: 'any' } },
      deleteBucket: { authenticate: { strategies: ['jwt'], mode: 'any' } },
    },
  },
  // ...
}
```

Available route keys: `getBuckets`, `getBucketByName`, `createBucket`, `deleteBucket`, `upload`, `listObjects`, `deleteObject`, `getObjectByName`, `downloadObjectByName`, `recreateMetaLink`.

#### TStaticAssetsComponentOptions -- Full Reference
```typescript
type TStaticAssetsComponentOptions = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;
      routes?: {
        getBuckets?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        getBucketByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        createBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        deleteBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        upload?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        listObjects?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        deleteObject?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        getObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        downloadObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        recreateMetaLink?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
      };
    };
    extra?: TStaticAssetExtraOptions;
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
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
  normalizeNameFn?: (opts: { originalName: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  [key: string]: any;
};

type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseEntity<Schema>;
  repository: DefaultCRUDRepository<Schema>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    query: TUploadQuery;
  }) => ValueOrPromise<{ count: number; data: Schema }>;
};
```

> [!NOTE]
> The `normalizeNameFn` receives only `{ originalName }` -- there is no `folderPath` parameter.

> [!TIP]
> The `createMetaLink` callback on `TMetaLinkConfig` is optional. When provided, it replaces the default MetaLink creation logic during upload, giving you full control over how file metadata is stored.

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

### BunS3Helper

Bun-native S3 client for direct S3/S3-compatible access using Bun's built-in S3 support. Requires Bun runtime.

```typescript
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
```

### MetaLink Configuration

MetaLink is an optional feature that tracks uploaded files in a database, storing file location, metadata (mimetype, size, etag), storage type, principal association (`principalType`, `principalId`), variant, timestamps, and custom metadata (JSONB).

#### Benefits

- Query uploaded files by bucket, name, mimetype, variant, etc.
- Track file history and audit trails
- Store custom metadata about files
- Associate files with principals via `principalType` and `principalId` (passed as query parameters on the upload endpoint)
- Tag uploads with a `variant` query parameter (e.g., `"thumbnail"`, `"original"`)
- Custom `createMetaLink` callback for full control over MetaLink creation
- Graceful errors -- upload succeeds even if MetaLink creation fails

#### Setup

**1. Create Model:**

```typescript
import { BaseMetaLinkModel } from '@venizia/ignis/static-asset';
import { model } from '@venizia/ignis';

@model({ type: 'entity' })
export class FileMetaLinkModel extends BaseMetaLinkModel {
  // Inherits all fields from BaseMetaLinkModel
}
```

**2. Create Repository:**

```typescript
import { BaseMetaLinkRepository } from '@venizia/ignis/static-asset';
import { repository, inject } from '@venizia/ignis';
import type { IDataSource } from '@venizia/ignis';

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
  variant         TEXT,
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
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
} from '@venizia/ignis/static-asset';
import type { TStaticAssetsComponentOptions } from '@venizia/ignis/static-asset';

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

**5. Upload with Principal Association and Variant:**

When MetaLink is enabled, you can associate uploaded files with a principal and variant by passing query parameters on the upload endpoint:

```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

// Associate the upload with a user and tag as 'original' variant
const response = await fetch(
  '/uploads/buckets/user-files/upload?principalType=user&principalId=42&variant=original',
  { method: 'POST', body: formData },
);
```

The `principalId` value is always stored as a string regardless of input type (coerced via `String()`).

#### Custom MetaLink Creation

You can provide a custom `createMetaLink` callback to fully control how MetaLink records are created:

```typescript
metaLink: {
  model: FileMetaLinkModel,
  repository: this.getSync(FileMetaLinkRepository),
  createMetaLink: async ({ uploadResult, fileStat, query }) => {
    // Custom logic -- e.g., add extra fields, validate, transform
    return metaLinkRepo.create({
      data: {
        bucketName: uploadResult.bucketName,
        objectName: uploadResult.objectName,
        link: uploadResult.link,
        mimetype: fileStat.metadata?.['mimetype'],
        size: fileStat.size,
        etag: fileStat.etag,
        metadata: fileStat.metadata,
        storageType: 'minio',
        isSynced: true,
        principalId: query.principalId ? String(query.principalId) : undefined,
        principalType: query.principalType,
        variant: query.variant,
        // ... additional custom fields
      },
    });
  },
},
```

When `createMetaLink` is not provided, the component uses a default implementation that stores all standard fields.

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

// Get files by variant
const thumbnails = await fileMetaLinkRepository.find({
  where: { variant: 'thumbnail' },
});

// Get synced files only
const syncedFiles = await fileMetaLinkRepository.find({
  where: { isSynced: true },
});
```

### Quick Start Options

**Option 1: MinIO Only**
```typescript
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
} from '@venizia/ignis/static-asset';

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
      normalizeNameFn: ({ originalName }) => {
        return `${Date.now()}_${originalName.toLowerCase().replace(/\s/g, '_')}`;
      },
      normalizeLinkFn: ({ bucketName, normalizeName }) => {
        return `/api/files/${bucketName}/${encodeURIComponent(normalizeName)}`;
      },
    },
  },
}
```

The `normalizeNameFn` receives only the `originalName` of the uploaded file.

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
- [Storage Helpers](/extensions/helpers/storage/) - DiskHelper, MinioHelper, BaseStorageHelper
- [Request Utilities](/references/utilities/request) - File upload utilities
- [Security Guidelines](/best-practices/security-guidelines) - File upload security
- [Components Overview](/guides/core-concepts/components) - Component system basics
- [Controllers](/guides/core-concepts/rest-controllers) - File upload endpoints
