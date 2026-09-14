---
title: The Download Route Drops Its Plural
description: GET /downloads/{objectName} becomes GET /download/{objectName}. A verb segment names one action, not a collection, and this reverses one row of the 2026-09-08 rename.
---

# Changelog - 2026-09-14

## The download route drops its plural

<Badge type="danger" text="Breaking" />

**In one line.** The static-asset download route is now singular.

| Before | After |
|---|---|
| `GET {base}/downloads/{objectName}` | `GET {base}/download/{objectName}` |

Nothing else moves. `{base}` is `/buckets/{bucketName}` unless `controller.bucket` is configured.

## Why the plural was wrong

`/buckets` and `/objects` are plural because each names a collection you can list. `/download` names
neither - it is the action you take on one object, and the object is already in the next segment.
The [2026-09-08 rename](./2026-09-08-storage-hardening-and-bun-s3-only) argued the segment named "a
set of representations". It does not. There is one representation, and one verb.

`POST {base}/objects` for upload is unaffected, and correct for the same reason: the collection is
the resource, and `POST` is already the verb.

The action still sits **before** the key, and that part is forced rather than chosen. With nested
object keys enabled, a suffix route never matches - Hono serves `/objects/photos/a.png/download`
through the catch-all with the key `photos/a.png/download`.

## Who is affected

**You never called the download route.** Nothing.

**You are on `0.2.0-31` and call `/downloads/{objectName}`.** Drop the `s`. A client on the old path
gets a `404` at runtime; nothing fails at compile time.

**You pin the path yourself.** An override wins over both spellings:

```ts
application.component(StaticAssetComponent, {
  options: {
    controller: {
      routes: { downloadObjectByName: { path: '/download/{objectName}{.+}' } },
    },
  },
});
```

The route key `downloadObjectByName` and the handler name are unchanged - only the URL segment moved.

**Files:**

- [`packages/core-server/src/components/static-asset/controller/base.definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/base.definition.ts) - `DOWNLOAD_OBJECT_BY_NAME`
