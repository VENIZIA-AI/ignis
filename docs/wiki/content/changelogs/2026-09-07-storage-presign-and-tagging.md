---
title: Storage Gains Presigned URLs and Object Tagging
description: IStorageHelper adds presignPut, presignGet, getObjectTags and setObjectTags. MinioHelper and BunS3Helper implement all four; a backend with no transport for them throws instead of returning a fake result.
---

# Changelog - 2026-09-07

## Presigned URLs and object tagging on IStorageHelper

<Badge type="tip" text="New Feature" />

**In one line.** Ask for a presigned upload URL and tag the object once it lands, without a hand-written S3 class.

```typescript
const putUrl = await storage.presignPut({ bucket: 'imports', name: 'q1-workbook.csv' });
// hand putUrl to the browser - it uploads straight to S3, never through this backend

await storage.setObjectTags({
  bucket: 'imports',
  name: 'q1-workbook.csv',
  tags: { temp: 'true', total_rows: '48210' },
});

// once the row validates:
await storage.setObjectTags({
  bucket: 'imports',
  name: 'q1-workbook.csv',
  tags: { temp: 'false', total_rows: '48210', validated: 'true' },
});
```

### The problem it solves

A two-phase upload asks the backend for a presigned URL, uploads straight to S3, then tags the object to mark it provisional until a later step validates it. `IStorageHelper` could not express either half. One application kept a 559-line storage class of its own to do this, including a hand-written XML parser for reading tags back from S3.

### What changed

| Symbol | Change | Package |
|---|---|---|
| `IStorageHelper.presignPut(opts)` | New. Returns a time-limited PUT URL | helpers |
| `IStorageHelper.presignGet(opts)` | New. Returns a time-limited GET URL, with an optional response content type | helpers |
| `IStorageHelper.getObjectTags(opts)` | New. Returns an object's tags as a plain `Record<string, string>` | helpers |
| `IStorageHelper.setObjectTags(opts)` | New. Replaces an object's tags | helpers |
| `StoragePresignDefaults` | New const class: `PUT_EXPIRES_IN_SECONDS` (600), `GET_EXPIRES_IN_SECONDS` (60) | helpers |

| Method | `expiresInSeconds` default | Extra option |
|---|---|---|
| `presignPut` | 600 | none - a content type on a presigned PUT is never sent to S3 |
| `presignGet` | 60 | `responseContentType`, forwarded as the download's `Content-Type` |

`MinioHelper` and `BunS3Helper` implement all four. `BaseStorageHelper` implements them too, but only to throw - a backend with no transport for presigning or tagging says so with a message naming the class and the method, rather than returning `undefined` or a broken link. `DiskHelper` has no object storage to presign against, so it inherits that throw.

### Who is affected

- **Applications that hand-rolled presigned URLs or S3 tagging.** Switch to `presignPut`/`presignGet`/`getObjectTags`/`setObjectTags` and delete the custom class.
- **Everyone else.** No action needed - the four methods are additive.

## Details

- `getObjectTags` on a missing object returns `{}`; it does not throw. Any other failure throws with the status code and the response body attached.
- `BunS3Helper` has no tagging SDK to call, since Bun's `S3Client` does not expose one. It signs its own `GET`/`PUT ?tagging` requests and reads or writes S3's tagging XML by hand - the same technique `getBuckets`/`createBucket`/`removeBucket` already used for bucket management.
- Reference: [Storage](/extensions/helpers/storage/), [Storage - Full Reference](/extensions/helpers/storage/api).
