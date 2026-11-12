---
title: Static asset serves with ETag and 304, uploads get a unique key, maxBytes bounds each file
description: "The serve routes send ETag and Last-Modified and answer 304 without reading the object. The server upload's default key carries a uuid. serverUpload.maxBytes no longer refuses a body that is only larger than one file."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-12

## Static asset serves with ETag and 304, uploads get a unique key, maxBytes bounds each file

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="Improvement" /> <Badge type="danger" text="Bug Fix" />

**In one line.** A browser can cache what the serve routes send, a same-name server upload no longer overwrites the first one, and two files under `maxBytes` no longer fail together.

## What changed

- **`ETag`, `Last-Modified` and `304`.** `GET {base}/objects/*` and `GET {base}/download/*` send `ETag` (quoted, if the backend's is not) and `Last-Modified` from the object's stat. A matching `If-None-Match` (weak comparison, or `*`) answers `304`; with no `If-None-Match`, an `If-Modified-Since` that is not older than the object does. The object is not read for a `304`. Before, neither header was ever sent, because the code looked for them in the metadata, where the storage helpers do not put them.
- **No default `Cache-Control`.** The routes still set none. Add one in your own middleware if you want it.
- **`StaticAssetServe.applyValidators({ ctx, stat })`.** Public. It sets the two headers and returns `true` when a `304` is due, so a route of your own reuses the same rules.
- **A unique default key.** A server upload with no `serverUpload.objectKey` is stored as `<keyPrefix><folderPath>/<uuid>/<name>`, the shape the direct upload uses, so the folder still groups its keys. Before, the key was the lowercased name, so a second upload of `report.pdf` overwrote the first and left a stale MetaLink row beside it. The uuid folder does not count against `maxFolderDepth`. A download still carries the plain name.
- **`serverUpload.maxBytes` bounds a file.** A hand-written check compared the whole request body with `maxBytes`, so two 3 MB files under a `maxBytes` of 5 MB answered `413`. It is gone. The route's body limit, `maxFiles` x `maxBytes` plus multipart framing, refuses an oversized body before it is read, and each file is checked against `maxBytes` in the handler. An oversized body answers `core.request.body_too_large` instead of `upload_too_large`; an oversized file still answers `upload_too_large`.
- **Removed.** `StaticAssetHeaders.ALLOWED` and the metadata header loop. The internal length guard of the upload route is now a body limit; `StaticAssetRouteOptionsUtility` is not exported, so no app code changes.
- **Docs.** The upload labels (`principalId`, `principalType`, `variant`, `sequence`) are what the client sends, not authorization. Use direct upload's signed `resolvers.metadata` when the value must be trustworthy.

## Who is affected

- **Apps that use the default server-upload key.** A key that you built from the file name (`/objects/photo.jpg`) no longer finds the object. Read `object.key` or `link` from the upload response, or set `serverUpload.objectKey`.
- **Apps that read `StaticAssetHeaders.ALLOWED`.** It does not exist any more.
- **Clients behind a cache.** They now revalidate with `304` instead of fetching the object each time.

## Migration

1. Stop building object URLs from the file name. Use the `link` or `object.key` the upload answers.
2. To keep a name-based key, set `serverUpload.objectKey`:

```ts
import { BaseStorageHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetObjectKeyResolver } from '@venizia/ignis/static-asset';

export const objectKey: TStaticAssetObjectKeyResolver = ({ file }) =>
  BaseStorageHelper.normalizeObjectName({ file });
```


See [Server upload](../extensions/components/static-asset/server-upload) and the [migration page](../extensions/components/static-asset/migration#behaviour-that-changed).
