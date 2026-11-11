---
title: A static-asset entry is one flat object, and directUpload.onCommit is removed
description: "The static-asset entry drops controller, extra, storage and useMetaLink for flat, typed options with serverUpload, url, extend and routes set to true or false. directUpload.onCommit is removed in favour of validation."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-11

## A static-asset entry is one flat object, and directUpload.onCommit is removed

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="Enhancement" />

**In one line.** A static-asset entry is now one flat, fully typed object: the nested `controller` and the open-ended `extra` are gone, and nothing is aliased.

## What changed

- **Entry shape.** An entry is `basePath`, `helper`, `bucket`, `keyPrefix`, `url`, `auth`, `routes`, `serverUpload`, `directUpload`, `metaLink` and `extend`. `controller`, `extra`, `storage` and `useMetaLink` no longer exist, and `extra` no longer accepts arbitrary keys.
- **Storage type.** The helper decides it: a `BunS3Helper` records `bun-s3`, anything else records `disk`.
- **MetaLink.** A `metaLink` on the entry turns MetaLink on.
- **Routes.** `routes.X` is `false` (off), `true` (on) or an object (on with overrides) in place of `routes.X.enabled`.
- **Server upload.** `serverUpload` groups `maxBytes`, `maxFiles`, `maxFolderDepth`, `spool` and `objectKey`. `serverUpload: false` removes `POST /objects`.
- **One hook per job.** `serverUpload.objectKey` replaces `resolveObjectName` and `extra.normalizeNameFn`, `url.link` replaces `extra.normalizeLinkFn`, and `extend.before` and `extend.after` replace `defineRoutesBefore` and `defineExtraRoutes`.
- **Direct upload.** It moves to the entry root. `directUpload.authorize` is optional when the entry's `auth` authenticates or authorizes, and `expiresIn` is now `expires.upload`.
- **No `onCommit`.** `directUpload.onCommit` is removed. Put content checks in `directUpload.validation.handler`, which a commit already runs, and do work after a commit in the code that calls `commit`.
- **Types.** The types refuse `directUpload` or `keyPrefix` without a `bucket`, and `directUpload` on a `DiskHelper`.
- **One link.** The default link is built in one place, and a commit returns the entry's link, so an upload and a commit agree.

## Who is affected

- **Apps that declare `StaticAssetComponent` entries.** Compilation fails until each entry moves to the flat shape. See the [migration guide](/extensions/components/static-asset/migration).
- **Apps that use `directUpload.onCommit`.** Move the check into `validation.handler`.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Nothing is aliased. Move each option as the table says.

| Old | New |
|---|---|
| `controller.name`, `controller.basePath` | `name`, `basePath` |
| `controller.isStrict`, `controller.rawObjectPath` | `url.isStrict`, `url.rawObjectPath` |
| `controller.bucket`, `controller.keyPrefix` | `bucket`, `keyPrefix` |
| `controller.routes.X: { enabled: false }` | `routes.X: false` |
| `controller.routes.X: { enabled: true }` | `routes.X: true` |
| `controller.directUpload` | `directUpload` |
| `directUpload.expiresIn` | `directUpload.expires.upload` |
| `directUpload.onCommit` | removed: use `directUpload.validation.handler` |
| `storage` | removed: the helper decides |
| `useMetaLink: true` and `metaLink` | `metaLink` |
| `extra.maxBytes`, `extra.maxFolderDepth` | `serverUpload.maxBytes`, `serverUpload.maxFolderDepth` |
| `extra.parseMultipartBody.maxFiles` | `serverUpload.maxFiles` |
| `extra.parseMultipartBody.storage`, `uploadDir` | `serverUpload.spool`: `{ storage, dir }` |
| `resolveObjectName`, `extra.normalizeNameFn` | `serverUpload.objectKey` |
| `extra.normalizeLinkFn` | `url.link` |
| `defineRoutesBefore`, `defineExtraRoutes` | `extend.before`, `extend.after` |

**Before:**

```typescript
assets: {
  controller: { name: 'AssetController', basePath: '/assets', routes: { deleteObject: { enabled: false } } },
  storage: StaticAssetStorageTypes.DISK,
  helper: new DiskHelper({ basePath: './assets' }),
  useMetaLink: true,
  metaLink: { model: BaseMetaLinkModel, repository },
  extra: { maxBytes: 10 * 1024 * 1024 },
},
```

**After:**

```typescript
assets: {
  basePath: '/assets',
  helper: new DiskHelper({ basePath: './assets' }),
  routes: { deleteObject: false },
  serverUpload: { maxBytes: 10 * 1024 * 1024 },
  metaLink: { model: BaseMetaLinkModel, repository },
},
```

## Details

See [Getting started](/extensions/components/static-asset/getting-started) for three complete declarations and the [migration guide](/extensions/components/static-asset/migration) for a full before and after with a find-and-replace list.
