---
title: A static-asset entry serves one bucket, and every switch is a use toggle
description: "A static-asset entry now needs a bucket and takes serverUpload, directUpload and metaLink as use toggles. The bucket routes, onCommit and the disk spool are removed, and direct upload needs a keyPrefix."
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-11-11

## A static-asset entry serves one bucket, and every switch is a use toggle

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="Enhancement" />

**In one line.** A static-asset entry is now one flat object that serves one bucket, and each feature is switched with `{ use: false }` or `{ use: true, ...options }`. Nothing is aliased, so an old entry stops compiling until you move it.

## What changed

- **One bucket per entry.** `bucket` is required and never appears in a URL. The routes that listed, read, created and deleted buckets are removed. The object routes are `/objects/{objectName}`, `/download/{objectName}` and `/upload-policy`.
- **Every switch is a toggle.** `serverUpload`, `directUpload`, `metaLink` and `directUpload.validation` are required, and each is `{ use: false }` or `{ use: true, ...options }`. A toggle you leave out is a type error, so nothing is on or off by accident. `routes.<key>` and `auth.publicRead` use the same shape.
- **Flat options.** `controller` and `extra` are gone. `storage` is gone too: the helper declares whether it is disk or S3.
- **One naming hook.** `serverUpload.objectKey` replaces `resolveObjectName` and `extra.normalizeNameFn`, and `link` replaces `extra.normalizeLinkFn`.
- **Direct upload needs a `keyPrefix`.** It keeps the pending files out of everything the routes serve. `pendingPrefix` must not contain the `keyPrefix`, and the `keyPrefix` must not contain it. The component checks both at start-up.
- **No more `onCommit` and no disk spool.** Check the file in `validation`, which a commit already runs. The whole upload body is parsed into memory before the first file is written, so spooling to disk saved nothing.
- **Labels come from the body only.** A label in the URL is ignored instead of refused. One schema parses the labels on both upload paths, and the MetaLink hook receives `labels` instead of `query`.
- **Folder errors moved.** The storage helper checks the folder, so the codes are `core.storage.folder_path_invalid` and `core.storage.folder_depth_exceeded`.
- **Range on downloads.** The download route now honours a `Range` header, like the stream route.

## Who is affected

- **Apps that declare `StaticAssetComponent` entries.** Every entry needs to change. See the [migration guide](/extensions/components/static-asset/migration).
- **Apps that used the bucket in the URL or the bucket routes.** Declare one entry per bucket and create buckets in your storage. Links already stored with `/buckets/<name>/` need rewriting.
- **Apps that use `directUpload`.** Add a `keyPrefix`. Objects committed before it existed sit outside the new scope, and commit tokens issued before the upgrade fail with `404`.
- **Apps that read the removed codes** (`labels_in_query`, `max_keys_invalid`, `core.static_asset.folder_*`). Branch on the new ones in the table below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Nothing is aliased. Move each option as the table says.

| Old | New | What to do |
|---|---|---|
| `controller.name`, `controller.basePath` | `name` (optional), `basePath` | Lift the keys onto the entry. |
| `controller.isStrict` | removed | Delete it. Routes are always strict. |
| `controller.bucket`, or no bucket | `bucket`, required | Add `bucket`. Declare one entry per bucket. |
| `getBuckets`, `getBucketByName`, `createBucket`, `deleteBucket` | removed | Create buckets in your storage or with `helper.createBucket`. |
| `controller.keyPrefix` | `keyPrefix` | Required with `directUpload`. |
| `controller.routes.X: { enabled: false }` | `routes.X: { use: false }` | Replace the switch. |
| `controller.directUpload` | `directUpload: { use: true, ... }` or `{ use: false }` | Add `validation: { use: false }` when there is no check. |
| `directUpload.onCommit` | removed | Move the check into `validation.handler`. Do work after a commit in the code that calls `commit`. |
| `storage: ...` | removed | Delete it. Use `StorageTypes` from `@venizia/ignis-helpers` if you branch on it. |
| `useMetaLink: true` and `metaLink` | `metaLink: { use: true, repository }` | `metaLink.model` is removed. The hook parameter `query` is now `labels`. |
| `extra.maxBytes`, `extra.parseMultipartBody.maxFiles` | `serverUpload.maxBytes`, `serverUpload.maxFiles` | Move them. |
| `extra.maxFolderDepth` | `maxFolderDepth` on the entry | Move it. It governs every route, so it stays outside `serverUpload`. |
| `extra.parseMultipartBody.storage`, `uploadDir` | removed | Delete them. Use `maxBytes`, or direct upload for large files. |
| `extra.normalizeNameFn`, `resolveObjectName` | `serverUpload.objectKey` | One hook gets `{ bucket, file, defaultKey }`. |
| `extra.normalizeLinkFn` | `link` | Move it. |
| `defineRoutesBefore`, `defineExtraRoutes` | `extend.before`, `extend.after` | Rename. |
| `auth.publicRead: true` | `auth.publicRead: { use: true }` | Wrap it. |
| `StaticAssetStorageTypes` | `StorageTypes` | Import from `@venizia/ignis-helpers`. |
| `core.static_asset.folder_path_invalid`, `folder_segment_invalid`, `folder_depth_exceeded` | `core.storage.folder_path_invalid`, `core.storage.folder_depth_exceeded` | Branch on the new codes. |
| `core.static_asset.labels_in_query`, `core.static_asset.max_keys_invalid` | removed | A label in the URL is ignored, and a bad `maxKeys` is the standard validation error. |

**Before:**

```typescript
assets: {
  controller: {
    name: 'AssetController',
    basePath: '/assets',
    bucket: 'uploads',
    routes: { deleteObject: { enabled: false } },
  },
  storage: StaticAssetStorageTypes.DISK,
  helper: new DiskHelper({ basePath: './app_data' }),
  useMetaLink: true,
  metaLink: { model: BaseMetaLinkModel, repository },
  extra: { maxBytes: 10 * 1024 * 1024 },
},
```

**After:**

```typescript
assets: {
  name: 'AssetController',
  basePath: '/assets',
  bucket: 'uploads',
  helper: new DiskHelper({ basePath: './app_data' }),
  routes: { deleteObject: { use: false } },
  serverUpload: { use: true, maxBytes: 10 * 1024 * 1024 },
  directUpload: { use: false },
  metaLink: { use: true, repository },
},
```

## How to migrate

1. Move each entry to the flat shape with the table above. The compiler lists what is left.
2. Add `serverUpload`, `directUpload` and `metaLink` to every entry, as `{ use: false }` where the feature was off.
3. Give every `directUpload` entry a `keyPrefix`, and check it against `pendingPrefix`.
4. Rewrite links that contain `/buckets/<name>/`. Without a `createMetaLink` hook, `PUT /meta-links/{objectName}` rewrites a row's link.
5. Create the bucket yourself. The component never creates one.

## Details

See [Getting started](/extensions/components/static-asset/getting-started) for three complete declarations, the [migration guide](/extensions/components/static-asset/migration) for a full before and after with a find-and-replace list, and the [error reference](/extensions/components/static-asset/errors) for the new start-up refusals.
