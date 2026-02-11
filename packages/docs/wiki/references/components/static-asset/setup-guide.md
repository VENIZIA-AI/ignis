# Setup Guide

## Step 1: Bind Configuration

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

## Step 2: Register Component

```typescript
import { StaticAssetComponent } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure() {
    // ... Step 1 binding ...
    this.component(StaticAssetComponent);
  }
}
```

## Step 3: Use the Endpoints

The component auto-registers REST endpoints for each configured backend. No injection needed in downstream code.

```
GET  /assets/buckets                          — List all buckets
POST /assets/buckets/:bucketName              — Create a bucket
POST /assets/buckets/:bucketName/upload       — Upload files
GET  /assets/buckets/:bucketName/objects      — List objects
GET  /assets/buckets/:bucketName/objects/:obj — Stream file
DELETE /assets/buckets/:bucketName/objects/:obj — Delete file
```

Each storage backend gets its own base path (`/assets`, `/resources`, etc.) with the same endpoint structure.

### Environment Variables

Add these to your `.env` file for MinIO:

```bash
APP_ENV_MINIO_HOST=localhost
APP_ENV_MINIO_API_PORT=9000
APP_ENV_MINIO_ACCESS_KEY=minioadmin
APP_ENV_MINIO_SECRET_KEY=minioadmin
```

### Environment Keys Configuration

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

Start with `docker-compose up -d` and access the console at `http://localhost:9001`.
