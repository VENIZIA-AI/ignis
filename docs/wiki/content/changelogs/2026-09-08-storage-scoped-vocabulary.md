---
title: Every Storage Method Names Its Bucket and Its Object
description: IStorageHelper methods take { bucket, object } instead of { bucket, name }, presign expiry takes an IDuration instead of a seconds number, and IFileStat.metadata declares mimetype.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-08

## One vocabulary, on every method

<Badge type="danger" text="Breaking" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every storage method now takes the same two nouns it returns, so a value you got back can be passed to the next call.

## What changed

- **Scoped locations.** New `IBucketRef { name }`, `IObjectRef { key }` and `IObjectLocation { bucket, object }` replace `{ bucket, name }` and `{ bucketName, objectName }` everywhere.
- **Bucket methods take `{ bucket }`.** `hasBucket`, `getBucket`, `createBucket` and `removeBucket` take `{ bucket }`; `listObjects` and `upload` take `bucket: IBucketRef`.
- **Object methods take `{ bucket, object }`.** `getObject`, `getObjectStream`, `getStat`, `removeObject`, `getObjectTags`, `replaceObjectTags`, `presignPut`, `presignGet` and `BunS3Helper.writeStream`.
- **Other signatures.** `removeObjects` takes `{ bucket, objects: IObjectRef[] }`, `normalizeLinkFn` takes `IObjectLocation`, and `buildObjectLink` takes `{ bucket, object, ... }`.
- **`isValidName` is split.** Use `isValidSegment({ segment })`, `isValidBucketName({ bucket: { name } })` or `isValidObjectKey({ object: { key }, maxDepth })`. The rules are unchanged. `isValidPath` is now `isValidObjectKey`.
- **Presign expiry is a duration.** `expiresInSeconds: number` is `expiresIn: IDuration`. `StoragePresignDefaults.PUT_EXPIRES_IN_SECONDS` is now `PUT_EXPIRES_IN` (10 minutes), and `GET_EXPIRES_IN` is one minute. `toExpirySeconds` is exported for a helper that signs its own URLs; it throws on an unknown unit. An expiry over 7 days is refused, because SigV4 caps a presigned URL there.
- **Range reads (Behavior Change).** The base `getObjectStream` fallback no longer buffers the whole range in memory and destroys the source when a client disconnects. `MinioHelper` issues a native ranged GET through `getPartialObject`.
- **`IFileStat.metadata` declares `mimetype` (Behavior Change).** It is optional, because a backend may report nothing. If you persist it into a NOT NULL column, add a fallback. The built-in asset controller derives one from the object name.

## Who is affected

- **You call a storage helper directly.** Every call site moves, and the compiler lists them.
- **You wrote your own `IStorageHelper`.** The abstract members changed shape; the compiler lists them.
- **You use `AssetControllerFactory` or `StaticAssetComponent`.** Nothing to do. URLs, routes and response bodies are unchanged.

## Breaking changes

> [!WARNING]
> Every direct storage call changes. TypeScript catches every one of them.

**Before:**

```ts
await helper.getObject({ bucket: 'assets', name: 'photos/q1.png' });
```

**After:**

```ts
await helper.getObject({ bucket: { name: 'assets' }, object: { key: 'photos/q1.png' } });

await helper.presignGet({
  bucket: { name: 'assets' },
  object: { key: 'report.pdf' },
  expiresIn: { unit: DurationUnits.MINUTE, value: 15 },
});
```

## See also

- [Storage Serves Safely, Answers 404, and Runs on Bun S3 Alone](./2026-09-08-storage-hardening-and-bun-s3-only) - the rest of this batch
