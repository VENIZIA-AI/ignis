---
title: Every Storage Method Names Its Bucket and Its Object
description: IStorageHelper takes { bucket, object } instead of { bucket, name }, presign expiry takes an IDuration instead of a seconds number, and IFileStat.metadata declares mimetype.
---

# Changelog - 2026-09-08

## One vocabulary, on every method

<Badge type="danger" text="Breaking" />

**In one line.** Every storage method now takes the same two nouns it returns.

```ts
// before
await helper.getObject({ bucket: 'assets', name: 'photos/q1.png' });

// now
await helper.getObject({ bucket: { name: 'assets' }, object: { key: 'photos/q1.png' } });
```

## The problem it solves

`IUploadResult` already answered in scoped form - `{ bucket: { name }, object: { key } }`. Every
method that took a location asked for `{ bucket: string, name: string }` instead, and the controller
layer used a third spelling, `{ bucketName, objectName }`.

So the value you got back could not be passed to the next call. `name` meant the object on one
method and the bucket on another. Three vocabularies for two nouns.

Three interfaces replace all of it:

```ts
interface IBucketRef { name: string }
interface IObjectRef { key: string }
interface IObjectLocation { bucket: IBucketRef; object: IObjectRef }
```

`key` is the word S3 uses, and the word `IUploadResult` already returned.

## What changed

| Method | Before | Now |
|---|---|---|
| `hasBucket`, `getBucket`, `createBucket`, `removeBucket` | `{ name }` | `{ bucket }` |
| `getObject`, `getObjectStream`, `getStat`, `removeObject` | `{ bucket, name }` | `{ bucket, object }` |
| `getObjectTags`, `replaceObjectTags` | `{ bucket, name }` | `{ bucket, object }` |
| `presignPut`, `presignGet` | `{ bucket, name }` | `{ bucket, object }` |
| `removeObjects` | `{ bucket, names: string[] }` | `{ bucket, objects: IObjectRef[] }` |
| `listObjects`, `upload` | `bucket: string` | `bucket: IBucketRef` |
| `normalizeLinkFn` | `{ bucketName, normalizeName }` | `IObjectLocation` |
| `buildObjectLink` | `{ bucketName, objectName, ... }` | `{ bucket, object, ... }` |
| `BunS3Helper.writeStream` | `{ bucket, name, source }` | `{ bucket, object, source }` |
| `isValidName` | `{ name }`, for a bucket AND for a key segment | split, see below |
| `isValidPath` | `{ path, maxDepth }` | `isValidObjectKey({ object, maxDepth })` |

TypeScript catches every one of these. There is no runtime-only case in this batch.

## One validator did two jobs

<Badge type="danger" text="Breaking" />

`isValidName` validated a bucket name in one call site and an object key segment in the next - the
two nouns this release just separated everywhere else. It is now three names for three questions:

```ts
helper.isValidSegment({ segment: 'photo.png' });                 // one segment or file name
helper.isValidBucketName({ bucket: { name: 'assets' } });        // a bucket name
helper.isValidObjectKey({ object: { key: 'a/b/photo.png' } });   // a whole object key
```

The rules did not change, only which one you ask for. `isValidObjectKey` still takes `maxDepth`.

## Presign expiry takes a duration, not a number

<Badge type="danger" text="Breaking" />

`expiresInSeconds: number` is `expiresIn: IDuration` - the same `{ unit, value }` shape IGNIS already
uses everywhere else:

```ts
await helper.presignGet({
  bucket: { name: 'assets' },
  object: { key: 'report.pdf' },
  expiresIn: { unit: DurationUnits.MINUTE, value: 15 },
});
```

A bare number never said which unit it was, and every caller had to convert. The defaults moved with
it: `StoragePresignDefaults.PUT_EXPIRES_IN_SECONDS` is now `PUT_EXPIRES_IN`, a `{ unit: 'minute',
value: 10 }`. `GET_EXPIRES_IN` is one minute.

`toExpirySeconds` is exported for a helper that signs its own URLs. It throws on an unknown unit,
rather than letting a `null` reach the driver where it would read as "no expiry".

**It also refuses more than 7 days.** SigV4 caps a presigned URL there, so `{ unit: 'month' }`
type-checks and then produces a URL the provider rejects. It is refused here, where the unit is
still readable.

## The range fallback no longer buffers, and MinIO seeks natively

<Badge type="warning" text="Behavior Change" />

The base `getObjectStream` fallback read the whole requested range into memory before the consumer
took a byte, and left the backend stream draining when a client disconnected. It now reads one chunk
per demand and destroys the source on cancel.

`MinioHelper` no longer uses that fallback at all: it issues a native ranged GET through
`getPartialObject`, like the other two backends.

## IFileStat.metadata declares mimetype

<Badge type="warning" text="Behavior Change" />

`metadata` was `Record<string, any>`, so `metadata['mimetype']` typed as `any` and a rename of that
key broke nothing at compile time - while a column downstream read exactly that key.

```ts
interface IObjectMetadata {
  mimetype?: string;
  [key: string]: any;
}
```

Optional, because a backend may report nothing. **If you persist it into a NOT NULL column, add a
fallback** - the built-in asset controller derives one from the object name, which is what decides
the served type anyway.

## Who is affected

**You call a storage helper directly.** Every call site moves, and the compiler lists them.

**You use `AssetControllerFactory` or `StaticAssetComponent`.** Nothing to do. The URLs, the routes
and the response bodies are unchanged.

**You wrote your own `IStorageHelper`.** The abstract members changed shape; the compiler lists them.

## See also

- [Storage Serves Safely, Answers 404, and Runs on Bun S3 Alone](./2026-09-08-storage-hardening-and-bun-s3-only) - the rest of this batch
