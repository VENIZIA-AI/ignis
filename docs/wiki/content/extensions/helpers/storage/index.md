---
title: Storage
description: A unified file storage interface with interchangeable S3-compatible, filesystem, and in-memory backends
difficulty: intermediate
---

# Storage

Storage gives you one file-storage interface with interchangeable backends for S3-compatible object storage, the local filesystem, and in-memory key-value caching.

## In one example

`DiskHelper` needs no external server, so it is the fastest way to see the shape of the API - create a bucket, upload a file, get a link back.

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';

const storage = new DiskHelper({ basePath: './app_data/storage' });

await storage.createBucket({ name: 'uploads' });

const [result] = await storage.upload({
  bucket: 'uploads',
  files: [
    {
      originalName: 'report.pdf',
      mimetype: 'application/pdf',
      buffer: fileBuffer,
      size: fileBuffer.length,
    },
  ],
});

console.log(result);
// { bucketName: 'uploads', objectName: 'report.pdf', link: '/static-resources/uploads/report.pdf' }
```

`MinioHelper` and `BunS3Helper` accept the same `upload()` call against S3-compatible storage - swap the constructor, keep everything else unchanged.

## How it works

- **`BaseStorageHelper` owns the shared logic.** It's an abstract class implementing `IStorageHelper` - name/path validation, MIME type detection, and the `upload()` orchestration itself (check the bucket exists, validate every file, write in parallel). Each backend only supplies two protected hooks: `defaultLinkPrefix` and `writeObject()`.
- **Everything else is per-backend.** `isBucketExists`, `getBuckets`, `createBucket`, `getFile`, `getStat`, `removeObject`, `listObjects`, and the rest of `IStorageHelper` are implemented independently per backend - a filesystem `stat()` and a MinIO `statObject()` share nothing beyond the return shape.
- **The three backends are interchangeable.** Write services against `IStorageHelper`, not a concrete class, and swap backends by construction only.
- **`MemoryStorageHelper` is unrelated.** A standalone generic key-value store for in-process caching, extending `BaseHelper` directly - no bucket or file concept.
- **Every write path is validated first.** `originalName` and `folderPath` run through `isValidName()`/`isValidPath()` before touching the filesystem or object store, rejecting path traversal (`../`), shell-injection characters, hidden files, and folder nesting beyond `maxFolderDepth` (default `2`). The same check re-runs on whatever a custom `normalizeNameFn` returns, so a traversal payload smuggled back from application code is rejected too.
- **Two backends stay optional.** `MinioHelper` and `BunS3Helper` live behind separate sub-path exports, so apps that only need `DiskHelper` or `MemoryStorageHelper` don't pull in the `minio` package or require the Bun runtime.

**Backends**

| Backend | Storage | Mechanism | Import |
|---|---|---|---|
| `MinioHelper` | S3-compatible object storage | `minio` SDK | `@venizia/ignis-helpers/minio` |
| `BunS3Helper` | S3-compatible object storage | Bun's native `S3Client` (Bun runtime only) | `@venizia/ignis-helpers/bun-s3` |
| `DiskHelper` | Local filesystem, one directory per bucket | Node `fs`/`fs/promises` | `@venizia/ignis-helpers` |
| `MemoryStorageHelper` | In-process key-value cache | Plain object | `@venizia/ignis-helpers` |

## Common tasks

### Choose and construct a backend

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';
import { MinioHelper } from '@venizia/ignis-helpers/minio';

const disk = new DiskHelper({ basePath: './app_data/storage' });

const minio = new MinioHelper({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});
```

### Upload with a folder path

When `folderPath` is set, the default normalization creates a subdirectory-based object name.

```typescript
const [result] = await storage.upload({
  bucket: 'uploads',
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

### Download a file

`getFile()` returns a Node.js `Readable` on every backend, so piping to a response or a write stream works identically.

```typescript
const fileStream = await storage.getFile({ bucket: 'uploads', name: 'report.pdf' });
fileStream.pipe(response);
```

### List and delete objects

```typescript
const objects = await storage.listObjects({ bucket: 'uploads', useRecursive: true });

await storage.removeObjects({
  bucket: 'uploads',
  names: objects.map(object => object.name!),
});
```

### Write storage-agnostic services

Depend on `IStorageHelper`, not a concrete class, so backends swap without touching service code.

```typescript
import type { IStorageHelper, IUploadFile } from '@venizia/ignis-helpers';

class FileService {
  constructor(private storage: IStorageHelper) {}

  uploadFile(bucket: string, file: IUploadFile) {
    return this.storage.upload({ bucket, files: [file] });
  }
}
```

### Cache values in-memory

`MemoryStorageHelper` is a separate, generic key-value store - not a bucket-based backend.

```typescript
import { MemoryStorageHelper } from '@venizia/ignis-helpers';

const cache = MemoryStorageHelper.newInstance<{ counter: number }>();
cache.set('counter', 1);
cache.get<number>('counter'); // 1
```

## See also

- [Full reference](./api) - every class, method signature, validation rule, and error message
- [Static Asset Component](/extensions/components/static-asset/) - serving stored files over HTTP
- [Request Utilities](/references/utilities/request) - `parseMultipartBody` for file uploads
- [Helpers Index](../index) - all available helpers
- [Queue Helper](../queue/) - message queue processing

**Files:**

- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts) - `BaseStorageHelper`
- [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts) - `MinioHelper`
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `BunS3Helper`
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts) - `DiskHelper`
- [`packages/helpers/src/modules/storage/in-memory/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/in-memory/helper.ts) - `MemoryStorageHelper`
