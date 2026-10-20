---
title: Storage
description: A unified file storage interface with interchangeable S3-compatible, filesystem, and in-memory backends
difficulty: intermediate
---

# Storage

Storage gives you one file-storage interface with interchangeable backends for S3-compatible object storage, the local filesystem, and in-memory key-value caching.

## In one example

`DiskHelper` needs no external server, so it's the fastest way to see the shape of the API. Create a bucket, upload a file, get a link back.

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';

const storage = new DiskHelper({ basePath: './app_data/storage' });

await storage.createBucket({ bucket: { name: 'uploads' } });

const [result] = await storage.upload({
  bucket: { name: 'uploads' },
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
// {
//   bucket: { name: 'uploads' },
//   object: { key: 'report.pdf', size: 12345, contentType: 'application/pdf' },
//   link: '/static-resources/uploads/report.pdf',
// }
```

Every public method takes one options object with nested refs: a bucket is `{ name }`, an object is `{ key }`.

`BunS3Helper` and `DiskHelper` accept the same `upload()` call - swap the constructor, keep everything else unchanged.

## How it works

- **`BaseStorageHelper` owns the shared logic.** It's an abstract class implementing `IStorageHelper`: name/path validation, MIME type detection, and the `upload()` orchestration itself. Each backend only supplies two protected hooks: `defaultLinkPrefix` and `writeObject()`.
- **Everything else is per-backend.** `hasBucket`, `getBuckets`, `createBucket`, `getObject`, `getStat`, `removeObject`, `listObjects`, and the rest of `IStorageHelper` are implemented independently per backend. A filesystem `stat()` and an S3 `stat()` share nothing beyond the return shape.
- **The object-storage backends are interchangeable.** Write services against `IStorageHelper`, not a concrete class, and swap backends by construction only.
- **`MemoryStorageHelper` is unrelated.** It's a standalone generic key-value store for in-process caching, extending `BaseHelper` directly - no bucket or file concept.
- **Every write path is validated first.** Every key and every `folderPath` runs through the path rule `isValidObjectKey()` enforces, before anything touches the filesystem or object store.
- **The original file name is checked by what it becomes.** Without `normalizeNameFn` it is the key, so it must pass `isValidSegment()`. With one, it is only metadata: `Báo cáo [Q3] & tổng hợp #1!.xlsx` is accepted, and only control characters, an empty name or more than 255 characters are refused.
- **Validation blocks four kinds of bad input:** path traversal (`../`), shell-injection characters, hidden files, and folder nesting beyond `maxFolderDepth` (default `2`).
- **A custom `normalizeNameFn` doesn't get a free pass.** Its output runs through the same check, so a traversal payload smuggled back from application code is rejected too.
- **The S3 backend stays optional.** `BunS3Helper` lives behind a separate sub-path export, so an app that only needs `DiskHelper` or `MemoryStorageHelper` never requires the Bun runtime.

**Backends**

| Backend | Storage | Mechanism | Import |
|---|---|---|---|
| `BunS3Helper` | S3-compatible object storage | Bun's native `S3Client` (Bun runtime only) | `@venizia/ignis-helpers/bun-s3` |
| `DiskHelper` | Local filesystem, one directory per bucket | Node `fs`/`fs/promises` | `@venizia/ignis-helpers` |
| `MinioHelper` (deprecated) | MinIO and other S3-compatible servers | The `minio` driver | `@venizia/ignis-helpers/minio` |
| `MemoryStorageHelper` | In-process key-value cache | A `Map` | `@venizia/ignis-helpers` |

> [!WARNING]
> `MinioHelper` is deprecated. Use `BunS3Helper`: it reaches MinIO over the same S3 API, and adds presigned URLs, object tagging and byte ranges.

## Common tasks

### Choose and construct a backend

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

const disk = new DiskHelper({ basePath: './app_data/storage' });

// Any S3-compatible endpoint: AWS, Cloudflare R2, DigitalOcean Spaces, MinIO.
const s3 = new BunS3Helper({
  endpoint: { default: 'http://localhost:9000' },
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  region: 'us-east-1',
});
```

### Upload with a folder path

When `folderPath` is set, the default normalization creates a subdirectory-based object name.

```typescript
const [result] = await storage.upload({
  bucket: { name: 'uploads' },
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
// result.object.key: 'users/avatar.png'
```

### Download a file

`getObject()` returns a Node.js `Readable` on every backend, so piping to a response or a write stream works identically.

```typescript
const fileStream = await storage.getObject({
  bucket: { name: 'uploads' },
  object: { key: 'report.pdf' },
});
fileStream.pipe(response);
```

`getObjectStream()` returns a web `ReadableStream` instead, which is what a `Response` body wants. It also takes an optional `range`.

### List and delete objects

```typescript
const objects = await storage.listObjects({ bucket: { name: 'uploads' }, useRecursive: true });

await storage.removeObjects({
  bucket: { name: 'uploads' },
  objects: objects.map(object => ({ key: object.name! })),
});
```

### Write storage-agnostic services

Depend on `IStorageHelper`, not a concrete class, so backends swap without touching service code.

```typescript
import type { IBucketRef, IStorageHelper, IUploadFile } from '@venizia/ignis-helpers';

class FileService {
  constructor(private storage: IStorageHelper) {}

  uploadFile(opts: { bucket: IBucketRef; file: IUploadFile }) {
    const { bucket, file } = opts;
    return this.storage.upload({ bucket, files: [file] });
  }
}
```

### Cache values in-memory

`MemoryStorageHelper` is a separate, generic key-value store - not a bucket-based backend. The value type comes from the key, so you never pass a type argument at the call site.

```typescript
import { MemoryStorageHelper } from '@venizia/ignis-helpers';

const cache = MemoryStorageHelper.newInstance<{ counter: number }>();
cache.set('counter', 1);
cache.get('counter'); // 1, typed number | undefined
cache.unset('counter'); // true - it was bound
```

## See also

- [Full reference](./api) - every class, method signature, validation rule, and error message
- [Static Asset Component](/extensions/components/static-asset/) - serving stored files over HTTP
- [Request Utilities](/references/utilities/request) - `parseMultipartBody` for file uploads
- [Helpers Index](../index) - all available helpers
- [Queue Helper](../queue/) - message queue processing

**Files:**

- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts) - `BaseStorageHelper`
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `BunS3Helper`
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts) - `DiskHelper`
- [`packages/helpers/src/modules/storage/minio/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/minio/helper.ts) - `MinioHelper` (deprecated)
- [`packages/helpers/src/modules/storage/in-memory/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/in-memory/helper.ts) - `MemoryStorageHelper`
