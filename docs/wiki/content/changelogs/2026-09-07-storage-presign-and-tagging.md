---
title: Storage Gains Presigned URLs and Object Tagging
description: IStorageHelper adds presignPut, presignGet, getObjectTags and replaceObjectTags, so you no longer need a hand-written S3 class for presigned uploads and tags.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-07

## Presigned URLs and object tagging on IStorageHelper

<Badge type="tip" text="New Feature" />

**In one line.** Ask for a presigned upload URL and tag the object once it lands, without a hand-written S3 class.

```typescript
const putUrl = await storage.presignPut({ bucket: 'imports', name: 'q1-workbook.csv' });
// hand putUrl to the browser - it uploads straight to S3, never through this backend

await storage.replaceObjectTags({
  bucket: 'imports',
  name: 'q1-workbook.csv',
  tags: { temp: 'true', total_rows: '48210' },
});
```

## What changed

- **`presignPut(opts)`.** Returns a time-limited PUT URL. `expiresInSeconds` defaults to 600. A content type on a presigned PUT is never sent to S3, so there is no such option.
- **`presignGet(opts)`.** Returns a time-limited GET URL. `expiresInSeconds` defaults to 60. `responseContentType` is forwarded as the download's `Content-Type`.
- **`getObjectTags(opts)`.** Returns an object's tags as a plain `Record<string, string>`. A missing object returns `{}`; any other failure throws.
- **`replaceObjectTags(opts)`.** Replaces the object's tags.
- **`StoragePresignDefaults`.** New const class with `PUT_EXPIRES_IN_SECONDS` (600) and `GET_EXPIRES_IN_SECONDS` (60).
- **Backends.** `MinioHelper` and `BunS3Helper` implement all four. A backend with no transport for them, such as `DiskHelper`, throws with a message naming the class and the method instead of returning a fake result.

## Who is affected

- **Applications that hand-rolled presigned URLs or S3 tagging.** Switch to the four methods and delete the custom class.
- **Everyone else.** No action needed - the methods are additive.
