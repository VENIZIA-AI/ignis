# Configuration Options

## Storage Types

| Type | Constant | Helper | Description |
|------|----------|--------|-------------|
| `'disk'` | `StaticAssetStorageTypes.DISK` | `DiskHelper` | Local filesystem with bucket-based directory structure |
| `'minio'` | `StaticAssetStorageTypes.MINIO` | `MinioHelper` | S3-compatible object storage (MinIO, AWS S3, etc.) |

## `TStaticAssetsComponentOptions`

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

::: details TStaticAssetsComponentOptions -- Full Reference
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
  normalizeNameFn?: (opts: { originalName: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  [key: string]: any;
};

type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseEntity<Schema>;
  repository: DefaultCRUDRepository<Schema>;
};
```
:::

## DiskHelper

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

## MinioHelper

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

## MetaLink Configuration

MetaLink is an optional feature that tracks uploaded files in a database, storing file location, metadata (mimetype, size, etag), storage type, timestamps, and custom metadata (JSONB).

### Benefits

- Query uploaded files by bucket, name, mimetype, etc.
- Track file history and audit trails
- Store custom metadata about files
- Associate files with other entities
- Graceful errors -- upload succeeds even if MetaLink creation fails

### Setup

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
  is_synced       BOOLEAN NOT NULL DEFAULT false
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

## Quick Start Options

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

## Custom Filename Normalization

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
