---
title: Static Asset Component - Migration
description: Move a static-asset declaration from the old controller/extra shape to the flat entry with toggles - the old-to-new map for every option, one full before and after, and a find-and-replace list.
---

# Migration

An entry is now one flat object, and every switch is a toggle: `{ use: false }` or `{ use: true, ...options }`. Nothing is aliased. An old option fails type-checking until you move it. This page maps every one.

Three changes need more than a rename:

- **One bucket per entry.** `bucket` is required and leaves the URL. The four bucket routes are gone. Stored links that contain `/buckets/<name>/` stop working. See [Links already stored](#links-already-stored).
- **Direct upload needs a `keyPrefix`.** Committed keys move under it. See [Direct upload entries](#direct-upload-entries).
- **No more `onCommit`, no more spool.** Check the file in `validation`, and do work after a commit in the code that calls `commit`.

## Old to new

| Old | New |
|---|---|
| `controller.name` | `name`, optional: derived from the entry key (`staticAsset` becomes `StaticAssetController`) |
| `controller.basePath` | `basePath` |
| `controller.isStrict` | removed: routes are always strict (`/path` and `/path/` differ) |
| `controller.rawObjectPath` | `rawObjectPath` |
| `controller.bucket` | `bucket`, **required** |
| no `controller.bucket` (bucket in the URL) | removed: declare one entry per bucket |
| `getBuckets`, `getBucketByName`, `createBucket`, `deleteBucket` routes | removed. Create the bucket in your storage or with `helper.createBucket` |
| `controller.keyPrefix` | `keyPrefix`, required with `directUpload` |
| `controller.routes.X: { enabled: false }` | `routes.X: { use: false }` |
| `controller.routes.X: { enabled: true }` or overrides | `routes.X: { use: true, ...overrides }` |
| `controller.directUpload` | `directUpload: { use: true, ... }`, or `directUpload: { use: false }` |
| `directUpload.validation` | `directUpload.validation`: `{ use: false }`, or `StaticAssetValidation.define(...)`, which returns it switched on |
| `directUpload.onCommit` | removed: check the file in `validation`, and do work after a commit in the code that calls `commit` |
| `storage: 'bun-s3'` or `'disk'` | removed: the helper declares it (`helper.storageType`) |
| `StaticAssetStorageTypes` | `StorageTypes` from `@venizia/ignis-helpers` |
| `useMetaLink: true` and `metaLink` | `metaLink: { use: true, repository, createMetaLink? }`, or `metaLink: { use: false }` |
| `metaLink.model` | removed |
| `createMetaLink({ ..., query })` | `createMetaLink({ ..., labels })` |
| `TStaticAssetUploadQuery` | `TStaticAssetUploadLabels` (`folderPath` is no longer a label) |
| `extra.maxBytes` | `serverUpload.maxBytes` |
| `extra.maxFolderDepth` | `serverUpload.maxFolderDepth` |
| `extra.parseMultipartBody.maxFiles` | `serverUpload.maxFiles`, and `directUpload.maxFiles` for a policy request |
| `extra.parseMultipartBody.storage` and `uploadDir` | removed: the whole body is parsed into memory before the first file is written, so spooling to disk saved nothing |
| `extra.normalizeNameFn` and `resolveObjectName` | `serverUpload.objectKey`: one hook that gets `{ bucket, file, defaultKey }` |
| `TStaticAssetObjectNameResolver` | `TStaticAssetObjectKeyResolver` |
| `extra.normalizeLinkFn` | `link` |
| `extra` | removed: every option is typed |
| `defineRoutesBefore` | `extend.before` |
| `defineExtraRoutes` | `extend.after` |
| `auth.publicRead: true` | `auth.publicRead: { use: true }` |
| `TStaticAssetExtraOptions`, `TStaticAssetBucketParams`, `TStaticAssetListQuery` | removed |

### Behaviour that changed

| Old | New |
|---|---|
| A label in the query string answered `400` (`labels_in_query`) | Labels are read from the body only. A label in the URL is ignored. |
| Labels were checked by hand, in two places | One schema parses `principalType`, `principalId`, `variant` and `sequence` on both paths. A `sequence` that is not an integer is the standard validation error (`422`) on both paths. |
| `listObjects` parsed `maxKeys` by hand (`max_keys_invalid`) | The route's schema parses it. A bad value is the standard validation error. |
| The upload handler checked the folder path (`core.static_asset.folder_*`) | The storage helper checks it: `core.storage.folder_path_invalid` and `core.storage.folder_depth_exceeded`. The segment check is part of the path check. |
| `directUpload.authorize` was required | Optional when the entry's `auth` authenticates or authorizes. |

The folder, labels and `maxKeys` changes also change codes. See the [error reference](./errors#catalogued-errors).

### Unchanged, on purpose

`StaticAssetIngestUtility.fromUrl`, `rawObjectPath`, `extend.before` and `extend.after`, and the `recreateMetaLink` route stay. `commit({ token, owner?, labels? })`, `verify` and `validate` keep their shape.

### New and not breaking

- The download route honours a `Range` header, like `getObjectByName`.
- `BunS3Helper` and `DiskHelper` declare `storageType`. On `IStorageHelper` it is optional, so a custom helper compiles, but an entry refuses a helper that declares neither `disk` nor `bun-s3`.

## One declaration, before and after

```typescript
// Before
{
  assets: {
    auth: { authenticate: { strategies: ['jwt'] }, publicRead: true },
    controller: {
      name: 'AssetController',
      basePath: '/assets',
      isStrict: true,
      bucket: 'uploads',
      keyPrefix: 'tenant-a',
      routes: { getBuckets: { enabled: true }, deleteObject: { enabled: false } },
      directUpload: {
        authorize: ({ context }) => Boolean(context.get('currentUser')),
        secretKey,
        maxBytes: 100 * 1024 * 1024,
        expires: { upload: { unit: 'minute', value: 10 } },
        onCommit: scanForViruses,
      },
    },
    storage: StaticAssetStorageTypes.BUN_S3,
    helper: storageHelper,
    useMetaLink: true,
    metaLink: { model: BaseMetaLinkModel, repository: metaLinkRepository },
    extra: {
      maxBytes: 10 * 1024 * 1024,
      maxFolderDepth: 3,
      parseMultipartBody: { storage: 'disk', uploadDir: './spool', maxFiles: 5 },
      normalizeLinkFn: ({ object }) => `https://cdn.example.com/${object.key}`,
    },
    resolveObjectName: ({ defaultKey }) => defaultKey,
    defineExtraRoutes: addHealthRoute,
  },
}
```

```ts
// After
import { Authentication } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { DurationUnits } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { StaticAssetValidation } from '@venizia/ignis/static-asset';
import type {
  BaseMetaLinkRepository,
  TStaticAssetComponentOptions,
  TStaticAssetDefineExtraRoutes,
} from '@venizia/ignis/static-asset';

export const migrated = (opts: {
  storageHelper: BunS3Helper;
  metaLinkRepository: BaseMetaLinkRepository;
  secretKey: string;
  addHealthRoute: TStaticAssetDefineExtraRoutes;
  scanForViruses: (opts: { bucketName: string; key: string }) => Promise<string[]>;
}): TStaticAssetComponentOptions => ({
  assets: {
    name: 'AssetController',
    basePath: '/assets',
    bucket: 'uploads',
    keyPrefix: 'tenant-a/',
    helper: opts.storageHelper,
    link: ({ object }) => `https://cdn.example.com/${object.key}`,
    auth: {
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      publicRead: { use: true },
    },
    routes: { deleteObject: { use: false } },
    serverUpload: { use: true, maxBytes: 10 * 1024 * 1024, maxFiles: 5, maxFolderDepth: 3 },
    directUpload: {
      use: true,
      secretKey: opts.secretKey,
      maxBytes: 100 * 1024 * 1024,
      expires: { upload: { unit: DurationUnits.MINUTE, value: 10 } },
      // onCommit is gone: the check that ran there is the validation.
      validation: StaticAssetValidation.define({
        issueSchema: z.object({ message: z.string() }),
        handler: async ({ object }) => {
          const problems = await opts.scanForViruses({ bucketName: 'uploads', key: object.key });

          return { isValid: problems.length === 0, issues: problems.map((message) => ({ message })) };
        },
      }),
    },
    metaLink: { use: true, repository: opts.metaLinkRepository },
    extend: { after: opts.addHealthRoute },
  },
});
```

What changed besides names:

- `getBuckets` is gone with every bucket route. There is nothing to turn on.
- `directUpload.authorize` is left out because `auth` already authenticates every route.
- `resolveObjectName: ({ defaultKey }) => defaultKey` did nothing, so `objectKey` is left out.
- `storage` is gone: the helper is an S3 helper, so MetaLink rows record `bun-s3`.
- `parseMultipartBody` is gone: the body is held in memory, so `maxBytes` is the guard.
- `keyPrefix` gained a trailing slash. Both spellings work, because the component normalizes it.

## Direct upload entries

`keyPrefix` is now required with `directUpload`. It keeps the pending files out of everything the routes serve. An entry that had no `keyPrefix` must add one, and that has two effects:

- **Committed keys move under the prefix.** An object already committed at the bucket root (`<generated>/<name>`) is outside the new scope, so the entry answers `404` for it. Move the object under the prefix, and update its MetaLink row, or keep the old objects reachable through another entry on the same bucket without a prefix.
- **Tokens issued before the upgrade fail.** A commit token names the old pending key, which is outside the new scope. The commit answers `404`. Users upload again.

An entry that already had a `keyPrefix` keeps its keys. Check that `pendingPrefix` (default `pending/`) and `keyPrefix` do not contain one another, or the entry refuses to start. See [The pending prefix](./security#the-pending-prefix).

## Links already stored

With the bucket in the URL gone, the object route is `/objects/{objectName}` and the download route is `/download/{objectName}`. A MetaLink row written before the upgrade holds the old link (`/assets/buckets/uploads/objects/...`) in its `link` column.

- Without a `createMetaLink` hook, `PUT /meta-links/{objectName}` rewrites `link` for every row of that object.
- With a hook, the hook owns `link`: update the column with a migration of your own.
- A client that built URLs by hand drops `/buckets/{bucketName}` from them.

## Services built by hand

Most apps never construct the two services: the component builds and binds them. If yours does, the options changed.

| Service | Options now |
|---|---|
| `StaticAssetUploadPolicyService` | `{ scope, helper, bucket, keyPrefix, directUpload: { maxBytes, expires?, secretKey, pendingPrefix? } }` |
| `StaticAssetUploadCommitService` | `{ scope, helper, keyPrefix, directUpload: { secretKey, pendingPrefix?, validation? }, storage, metaLink?, link }` |

`keyPrefix` is a `string` on both. `StaticAssetControllerFactory.build({ key, entry, policyService?, commitService? })` resolves the entry itself, so a hand-built controller takes the entry as you wrote it.

## Find and replace

Search a file at a time and read each hit: these move options between objects, so a blind replace misses the nesting.

| Search | Replace with |
|---|---|
| `controller: {` | lift its keys onto the entry |
| `{ enabled: false }` | `{ use: false }` |
| `{ enabled: true }` | `{ use: true }` |
| `useMetaLink: true,` | delete the line, and add `use: true` to `metaLink` |
| `storage: StaticAssetStorageTypes.` | delete the line |
| `extra: {` | split into `serverUpload` and `link` |
| `resolveObjectName` / `normalizeNameFn` | `serverUpload.objectKey` |
| `normalizeLinkFn` (in an entry) | `link` |
| `defineRoutesBefore` | `extend.before` |
| `defineExtraRoutes` | `extend.after` |
| `publicRead: true` | `publicRead: { use: true }` |
| `onCommit` | delete, and move the check into `validation.handler` |
| `model: BaseMetaLinkModel` (in a `metaLink`) | delete the line |
| `query` (in a `createMetaLink` hook) | `labels` |
| `StaticAssetStorageTypes` | `StorageTypes` |

A toggle you did not have before is **required**. Add `serverUpload`, `directUpload` and `metaLink` to every entry, as `{ use: false }` where the feature was off.

## Earlier renames

The names of the component's exports changed in an earlier release - `StaticAssetComponentBindingKeys` to `StaticAssetBindingKeys`, `AssetControllerFactory.defineAssetController` to `StaticAssetControllerFactory.build`, the `@app/static-asset-component/...` key strings to `@app/static-asset/...`, and the rest. The [changelog](/changelogs/) lists each one with its replacement.

**Files:**

- [`packages/core-server/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/types.ts) - `TStaticAssetEntry`
- [`packages/core-server/src/components/static-asset/utilities/entry.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/entry.utility.ts) - the start-up rules
