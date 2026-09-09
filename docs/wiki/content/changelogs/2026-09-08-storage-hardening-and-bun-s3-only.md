---
title: Storage Serves Safely, Answers 404, and Runs on Bun S3 Alone
description: A stored upload no longer renders on your API origin, a missing object answers 404, MinioHelper is removed, and BunS3Helper gains provider options, byte ranges and bounded concurrency.
---

# Changelog - 2026-09-08

## A stored upload no longer renders on your API origin

<Badge type="danger" text="Security" />

**In one line.** Upload `evil.html` and the API used to serve it back as `text/html` - a script
running with your application's cookies, on your own origin.

The served content type now comes from the object NAME, through an allow-list of types that are safe
to render. Anything outside it is served as `application/octet-stream` with
`Content-Disposition: attachment`. `image/svg+xml` is deliberately excluded, because an SVG carries
script.

`X-Content-Type-Options: nosniff` never helped here. It stops a browser guessing a type; it cannot
stop one we declared ourselves.

**This also fixes a plain bug.** What each backend reported was different, so the same object was
served three ways:

| Backend | Before | Now |
|---|---|---|
| minio | the type the uploader claimed | from the object name |
| bun-s3 | always `application/octet-stream`, so images downloaded instead of displaying | from the object name |
| disk | always `application/octet-stream` | from the object name |

If your application relied on serving HTML or SVG from the asset routes, serve it from a separate
domain instead. That is the structural control OWASP recommends and IGNIS cannot impose it for you.

## WHITELIST_HEADERS no longer carries content-type

<Badge type="warning" text="Behavior Change" />

`WHITELIST_HEADERS` decides which backend metadata headers reach the response. `content-type` left the
list on purpose: the served type is decided from the object name now, never from the backend. That
list is the mechanism behind the XSS fix at the top of this page.

**Which backend you use decides whether you notice.**

| Backend | `getStat` metadata key | Reached the whitelist before? |
|---|---|---|
| minio | `content-type` | Yes - the uploader's claimed type was served back |
| bun-s3, disk | `contentType` | No - `applyMetadataHeaders` lowercases to `contenttype`, which never matched |

So on `bun-s3` and `disk` this changes nothing that was working. On `minio` it closes the exact hole:
the type an uploader claimed no longer decides how a browser treats the file.

**Serving objects from your own controller?** `resolveServedContentType` is exported now, so you make
the same decision the built-in route makes instead of copying it:

```ts
import { resolveServedContentType, WHITELIST_HEADERS } from '@venizia/ignis/static-asset';

applyMetadataHeaders({ ctx, metadata });

const served = resolveServedContentType({ helper, objectName });
ctx.header(HTTP.Headers.CONTENT_TYPE, served.contentType);
```

It returns `{ contentType, isRenderable }` - `isRenderable` is `false` when the type is served as an
attachment, which is also when you want `Content-Disposition`.

Nothing here breaks your build. The constant kept its name and its subpath, so TypeScript stays green
either way.

Serving through `AssetControllerFactory` or `StaticAssetComponent`? Nothing to do.

## BunS3Helper.getStat drops the duplicated contentType key

<Badge type="warning" text="Behavior Change" />

`getStat().metadata` carried the same string twice, under `contentType` and under `mimetype`. Only
`mimetype` remains:

```ts
// before
metadata: { contentType: stat.type, mimetype: stat.type }
// now
metadata: { mimetype: stat.type }
```

`size`, `etag` and `lastModified` are untouched.

**Persisting that object into a column?** Rows written after the upgrade have one fewer key than rows
written before it, and nothing warns you. Read `mimetype`, and backfill if a consumer reads
`contentType`.

## A missing object answers 404

<Badge type="warning" text="Behaviour Change" />

Before, it depended on the backend: `disk` answered `400 core.system_error`, `bun-s3` and `minio`
answered `500 core.system_error`. Neither is right, and they disagreed with each other.

Storage helpers now throw a catalogued `core.storage.object_not_found` carrying a 404, so GET,
DOWNLOAD and RECREATE_METALINK answer 404 with a code a client can branch on. A failure that is *not*
a missing object still answers 500 - that discrimination is the point.

`DELETE` of a missing object still answers **200** on every backend. S3 deletes idempotently and
consumers depend on it. The `disk` backend used to answer 400 here and now matches.

## Byte ranges, so a video is seekable

<Badge type="tip" text="New Feature" />

The object route honours a `Range` request header and answers `206` with `Content-Range`. Every
response advertises `Accept-Ranges: bytes`, which is what makes a player offer a seek bar at all.

```bash
curl -H 'Range: bytes=1000-2000' /assets/buckets/videos/objects/clip.mp4
# 206 Partial Content
# Content-Range: bytes 1000-2000/50000
```

On S3 the range becomes a ranged GET, so only those bytes leave the bucket. A suffix range
(`bytes=-500`) means the LAST 500 bytes. An unusable range serves the whole object with 200.

## MinioHelper is deprecated, not removed

<Badge type="warning" text="Deprecated" />

`@venizia/ignis-helpers/minio`, the `MinioHelper` class, the `minio` optional peer dependency and the
`StaticAssetStorageTypes.MINIO` value all still ship. Your editor now strikes them through, and they
go away in a later release once the Bun S3 path has settled. Nothing to do today.

Two methods changed name with the rest of the storage surface: `isBucketExists` is `hasBucket`, and
`getFile` is `getObject`. A missing object throws the same catalogued 404 the other backends throw.

`MinioHelper` does not implement presigned URLs or object tagging - those methods throw. Move to
`BunS3Helper` when you need them.

**Move when you can.** MinIO speaks S3, and `BunS3Helper` takes any endpoint, plus presigned URLs,
object tagging and native byte ranges. Point it at your MinIO server:

```typescript
new BunS3Helper({
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  endpoint: 'http://minio:9000',
  publicEndpoint: 'https://cdn.example.com',
});
```

## BunS3Helper works with every S3 provider

<Badge type="tip" text="New Feature" />

| Option | What it solves |
|---|---|
| `publicEndpoint` | `host` is inside every signature, so a URL signed against `http://minio:9000` cannot be rewritten afterwards. Sign against the name a browser can reach. |
| `virtualHostedStyle` | AWS requires `bucket.s3.region.amazonaws.com` for newer buckets; MinIO and R2 take path style. Each bucket gets its own host, so one helper still serves many. |
| `partSize`, `queueSize`, `retry` | Multipart tuning Bun already had and IGNIS did not expose. |

## listObjects no longer stops at 1000 keys

<Badge type="danger" text="Bug Fix" />

S3 returns at most 1000 keys per call. The old code made one call and returned, so any larger bucket
was silently truncated - no error, no warning. It now follows the continuation token.

Two more corrections on the same method: `useRecursive: false` was ignored on `bun-s3` (it now maps
to a delimiter, matching `disk`), and `maxKeys: 0` was read as "unlimited" instead of zero.

## Storage validators take options objects

<Badge type="danger" text="Breaking" />

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

TypeScript catches every call site, so this breaks at compile time rather than silently.

## Path containment on the disk backend

<Badge type="danger" text="Security" />

`DiskHelper.getObject`, `getStat` and `removeObject` joined the object name onto the bucket path with
no validation. A name of `../secret.txt` read - and deleted - outside the bucket. `upload` had always
validated; the read and delete paths had not.

Both the name and the resolved path are now checked, so a rule we get wrong later still cannot escape
the bucket root.

## Bounded concurrency

<Badge type="warning" text="Behaviour Change" />

`upload` and `removeObjects` fanned out with an unbounded `Promise.all`: 10,000 keys meant 10,000
simultaneous requests. Both now run at most 16 at a time, and `disk` and `bun-s3` finally agree - one
used to run sequentially and stop halfway on the first failure. `RedisHelper.publish` is capped at 32
for the same reason.

## New APIs

| Method | Use it for |
|---|---|
| `getObjectStream({ bucket, name, range? })` | The bytes as a web stream, which is what a `Response` body wants. Ranged when asked. |
| `writeStream({ bucket, name, source, contentType? })` | Upload without holding the object in memory. `upload` takes a `Buffer`, so a 5 GB file is 5 GB of heap; this is not. |
| `presignPut`, `presignGet` | Signed URLs. `presignGet` takes `responseContentDisposition`, which keeps the attachment guarantee when S3 serves the object directly. |
| `getObjectTags`, `replaceObjectTags` | Object tags, parsed into a plain object. |

## MemoryStorageHelper

<Badge type="warning" text="Behaviour Change" />

It was never an `IStorageHelper` - it is an in-process keyed container - and it now says so. Built on
a `Map`, with `unset` and `size` added. `getContainer()` returns a **copy**: it used to hand out the
live object, so any caller could mutate the helper's state.

`get()` now returns `T[K] | undefined` instead of asserting a type that was never guaranteed. A caller
that checked `isBound` first will need to read the value once and check it.

## The upload result is scoped, not a flat field pair

<Badge type="danger" text="Breaking" />

`bucketName` and `objectName` were two entities flattened into a field pair. `metaLink` and
`metaLinkError` were a second pair where only one of four possible states ever meant anything.

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

The result now carries `size` and `contentType` too, so a caller no longer needs a second `getStat`
call to learn what it just uploaded.

## Five methods renamed

<Badge type="danger" text="Breaking" />

| Before | After | Why |
|---|---|---|
| `isBucketExists` | `hasBucket` | `is` + `Exists` is not English. `has*` is the ownership question |
| `getFile` | `getObject` | one interface was using two words for one thing |
| `getFileStream` | `getObjectStream` | same |
| `getFileType` | `getMediaType` | it returns `image`/`video`/`text`, and the old name read like `getMimeType` |
| `setObjectTags` | `replaceObjectTags` | `set` hid the fact that it replaces the WHOLE tag set - a caller flipping one tag silently dropped `retention` and `classification` |

TypeScript catches every one of these.

**The names changed, the types did not.** `getObject` still returns `Promise<Readable>` and
`getObjectStream` still returns `Promise<ReadableStream>`. There is no stream-versus-buffer trap
hiding behind the rename - fix the name and you are done.

## Two route paths changed

<Badge type="danger" text="Breaking" />

| Before | After |
|---|---|
| `POST {base}/upload` | `POST {base}/objects` |
| `GET {base}/download/{objectName}` | `GET {base}/downloads/{objectName}` |

`upload` was a verb sitting where a resource belongs; `POST` into the object collection already says
it. `download` became plural for the same reason - it names a set of representations, not an action.

**These two do NOT fail at compile time.** A client calling the old path gets a 404 at runtime.

The action stays *before* the key rather than after it, and that is forced rather than chosen: with
nested object keys enabled, a suffix route never matches at all. Measured on Hono, a request to
`/objects/photos/2024/a.png/download` is served by the catch-all with the key
`photos/2024/a.png/download` - the `/download` suffix route is unreachable.

A static route an application registers itself - `/download/i18n`, say - is unaffected, because it is
the application's own string. It also stops depending on registration order, since nothing catches
all of `/download/*` any more.

## assert* and has* join the verb prefix table

<Badge type="tip" text="Enhancement" />

`is*` returns a boolean and leaves the branch to the caller. `assert*` throws and returns `void`, so
the code after it needs no branch - reach for it when every caller would throw on `false` anyway.
`has*` is the ownership question.

The table describes utility functions. Service and controller methods lean on a wider set (`find`,
`create`, `update`, `validate`, `load`, `count`); do not force those into it.
