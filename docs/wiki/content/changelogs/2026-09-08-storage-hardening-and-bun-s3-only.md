---
title: Storage Serves Safely, Answers 404, and Runs on Bun S3 Alone
description: A stored upload no longer renders on your API origin, a missing object answers 404, MinioHelper is deprecated, and BunS3Helper gains provider options, byte ranges and bounded concurrency.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-08

## Storage hardening and Bun S3

<Badge type="danger" text="Security" /> <Badge type="danger" text="Bug Fix" /> <Badge type="danger" text="Breaking" /> <Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" /> <Badge type="warning" text="Behaviour Change" /> <Badge type="warning" text="Deprecated" />

**In one line.** An uploaded `evil.html` is no longer served back as `text/html` on your own origin, and the storage surface gets safer, more consistent names and byte-range support.

## What changed

- **Safe content type (Security).** The served content type now comes from the object NAME, through an allow-list of types safe to render. Anything else is served as `application/octet-stream` with `Content-Disposition: attachment`. `image/svg+xml` is excluded, because an SVG carries script. This also fixes the three backends serving the same object three ways (minio served the uploader's claimed type; bun-s3 and disk always served `application/octet-stream`).
- **`WHITELIST_HEADERS` drops `content-type` (Behavior Change).** The served type is never taken from the backend any more. On `bun-s3` and `disk` nothing that worked changes. On `minio` this closes the hole where the uploader's claimed type was served back.
- **`resolveServedContentType` is exported (Enhancement)** from `@venizia/ignis/static-asset`, next to `WHITELIST_HEADERS`. Serving objects from your own controller? It returns `{ contentType, isRenderable }`; `isRenderable` is `false` when the type is served as an attachment, which is also when you want `Content-Disposition`.
- **`BunS3Helper.getStat` (Behavior Change).** `metadata` carried the same string under `contentType` and `mimetype`. Only `mimetype` remains. If you persist that object, rows written after the upgrade have one fewer key. Read `mimetype`, and backfill if a consumer reads `contentType`.
- **A missing object answers 404 (Behaviour Change).** It was `400 core.system_error` on `disk` and `500 core.system_error` on `bun-s3` and `minio`. Storage helpers now throw a catalogued `core.storage.object_not_found` carrying 404, so GET, DOWNLOAD and RECREATE_METALINK answer 404 with a code a client can branch on. Other failures still answer 500. `DELETE` of a missing object still answers 200 on every backend (`disk` used to answer 400).
- **Byte ranges (New Feature).** The object route honours a `Range` header and answers `206` with `Content-Range`. Every response advertises `Accept-Ranges: bytes`, so a video is seekable. On S3 the range becomes a ranged GET. `bytes=-500` means the LAST 500 bytes. An unusable range serves the whole object with 200.
- **`BunS3Helper` provider options (New Feature).** `publicEndpoint` signs URLs against a name a browser can reach (the host is inside every signature). `virtualHostedStyle` supports AWS virtual-hosted buckets, while MinIO and R2 take path style. `partSize`, `queueSize` and `retry` expose Bun's multipart tuning.
- **`listObjects` pagination (Bug Fix).** It followed no continuation token, so a bucket over 1000 keys was silently truncated. It now follows it. `useRecursive: false` is honoured on `bun-s3` (mapped to a delimiter, matching `disk`), and `maxKeys: 0` means zero, not unlimited.
- **Disk path containment (Security).** `DiskHelper.getObject`, `getStat` and `removeObject` joined the name onto the bucket path unvalidated, so `../secret.txt` read and deleted outside the bucket. Both the name and the resolved path are now checked.
- **Bounded concurrency (Behaviour Change).** `upload` and `removeObjects` run at most 16 at a time instead of an unbounded `Promise.all`, and `disk` and `bun-s3` now agree on failure handling. `RedisHelper.publish` is capped at 32.
- **New methods (New Feature).** `getObjectStream({ bucket, name, range? })`, `writeStream({ bucket, name, source, contentType? })` (upload without holding the object in memory), `presignPut`, `presignGet` (takes `responseContentDisposition`), `getObjectTags` and `replaceObjectTags`.
- **`MemoryStorageHelper` (Behaviour Change).** It is an in-process keyed container, not an `IStorageHelper`, and is now built on a `Map` with `unset` and `size` added. `getContainer()` returns a copy instead of the live object. `get()` returns `T[K] | undefined`, so a caller that checked `isBound` first must read the value once and check it.
- **`assert*` and `has*` prefixes (Enhancement).** `assert*` throws and returns `void`; `has*` is the ownership question; `is*` still returns a boolean.

## Who is affected

- **Applications relying on HTML or SVG from the asset routes.** Serve it from a separate domain instead.
- **Anyone using the storage helpers directly.** See the breaking changes below. TypeScript catches the method and option changes.
- **Anyone calling the old route paths.** These do not fail at compile time; the client gets a 404 at runtime.
- **Serving through `AssetControllerFactory` or `StaticAssetComponent`.** Nothing to do for the content type change.

## Breaking changes

> [!WARNING]
> Every storage caller is touched: validators, upload results, method names and two route paths.

**Validators take options objects.**

```typescript
// before
helper.isValidName(name);
helper.isValidPath(objectName, { maxDepth: 3 });
helper.getMimeType(fileName);

// after
helper.isValidName({ name });
helper.isValidPath({ path: objectName, maxDepth: 3 });
helper.getMimeType({ filename: fileName });
```

**The upload result is scoped.** It also carries `size` and `contentType`, so no second `getStat` call is needed.

```typescript
// before
{ bucketName: 'images', objectName: 'photo.png', link: '/assets/...', metaLinkError: 'FAILED' }

// after
{
  bucket: { name: 'images' },
  object: { key: 'photo.png', size: 4823, contentType: 'image/png' },
  link: '/assets/...',
  metaLink: { error: 'META_LINK_CREATE_FAILED' },   // or { data: row }
}
```

**Five methods renamed.** Only the names changed; `getObject` still returns `Promise<Readable>` and `getObjectStream` still returns `Promise<ReadableStream>`.

| Before | After |
|---|---|
| `isBucketExists` | `hasBucket` |
| `getFile` | `getObject` |
| `getFileStream` | `getObjectStream` |
| `getFileType` | `getMediaType` |
| `setObjectTags` | `replaceObjectTags` (it replaces the WHOLE tag set, so flipping one tag used to drop the rest) |

**Two route paths changed.**

| Before | After |
|---|---|
| `POST {base}/upload` | `POST {base}/objects` |
| `GET {base}/download/{objectName}` | `GET {base}/downloads/{objectName}` |

A static route your application registers itself, such as `/download/i18n`, is unaffected.

## Deprecated

`@venizia/ignis-helpers/minio`, `MinioHelper`, the `minio` optional peer dependency and `StaticAssetStorageTypes.MINIO` still ship but are deprecated, and go away in a later release. Nothing to do today. `MinioHelper` does not implement presigned URLs or object tagging (those methods throw), and a missing object throws the same catalogued 404. Move to `BunS3Helper`, which takes any endpoint:

```typescript
new BunS3Helper({
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  endpoint: 'http://minio:9000',
  publicEndpoint: 'https://cdn.example.com',
});
```
