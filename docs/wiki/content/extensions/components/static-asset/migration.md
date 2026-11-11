---
title: Static Asset Component - Migration
description: Move a static-asset declaration from the old controller/extra shape to the flat entry - the old-to-new map for every option, one full before and after, and a find-and-replace list.
---

# Migration

The entry is now one flat object. Nothing is aliased: an old option fails type-checking until you move it. This page maps every one.

## Old to new

| Old | New |
|---|---|
| `controller.name` | `name` (optional: derived from the entry key) |
| `controller.basePath` | `basePath` |
| `controller.isStrict` | `url.isStrict` |
| `controller.rawObjectPath` | `url.rawObjectPath` |
| `controller.bucket` | `bucket` |
| `controller.keyPrefix` | `keyPrefix` |
| `controller.routes` | `routes` |
| `controller.routes.X: { enabled: false }` | `routes.X: false` |
| `controller.routes.X: { enabled: true }` | `routes.X: true` (the four bucket routes need it) |
| `controller.directUpload` | `directUpload` |
| `directUpload.expiresIn` | `directUpload.expires.upload` |
| `directUpload.onCommit` | removed: put content checks in `directUpload.validation.handler`, and work after a commit in the code that calls `commit` |
| `directUpload.authorize` (required) | optional when the entry has `auth` |
| `storage` | removed: the storage type is the helper's |
| `helper` | `helper` |
| `useMetaLink: true` + `metaLink` | `metaLink` (its presence turns MetaLink on) |
| `extra.maxBytes` | `serverUpload.maxBytes` |
| `extra.maxFolderDepth` | `serverUpload.maxFolderDepth` |
| `extra.parseMultipartBody.maxFiles` | `serverUpload.maxFiles` (and `directUpload.maxFiles` for a policy request) |
| `extra.parseMultipartBody.storage` + `uploadDir` | `serverUpload.spool`: `{ storage: 'memory' }` or `{ storage: 'disk', dir }` |
| `extra.normalizeNameFn` | `serverUpload.objectKey`, ignoring `defaultKey` |
| `resolveObjectName` | `serverUpload.objectKey` |
| `extra.normalizeLinkFn` | `url.link` |
| `extra` (open index signature) | removed: every option is typed |
| `defineRoutesBefore` | `extend.before` |
| `defineExtraRoutes` | `extend.after` |
| `presignPost({ keyPrefix })` | `presignPost({ object: { key } })`: a policy signs one key, and `formData` carries it |
| `StaticAssetUploadCommitService.commit({ commitToken })` | `commit({ token })` |

Three things are new rather than moved: entry `auth`, `serverUpload: false`, and `directUpload.validation`. The four bucket-management routes are now **off by default**.

## One declaration, before and after

```typescript
// Before
{
  assets: {
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
        expiresIn: { unit: 'minute', value: 10 },
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
import { DurationUnits, MultipartStorages } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { BaseMetaLinkModel, StaticAssetValidation } from '@venizia/ignis/static-asset';
import type {
  BaseMetaLinkRepository,
  TStaticAssetDefineExtraRoutes,
  TStaticAssetComponentOptions,
} from '@venizia/ignis/static-asset';
import { z } from '@hono/zod-openapi';

export const migrated = (opts: {
  storageHelper: BunS3Helper;
  metaLinkRepository: BaseMetaLinkRepository;
  secretKey: string;
  addHealthRoute: TStaticAssetDefineExtraRoutes;
  scanForViruses: (opts: { bucketName: string; key: string }) => Promise<string[]>;
}): TStaticAssetComponentOptions => ({
  assets: {
    basePath: '/assets',
    helper: opts.storageHelper,
    bucket: 'uploads',
    keyPrefix: 'tenant-a',
    auth: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    url: {
      isStrict: true,
      link: ({ object }) => `https://cdn.example.com/${object.key}`,
    },
    routes: { deleteObject: false },
    serverUpload: {
      maxBytes: 10 * 1024 * 1024,
      maxFiles: 5,
      maxFolderDepth: 3,
      spool: { storage: MultipartStorages.DISK, dir: './spool' },
    },
    directUpload: {
      secretKey: opts.secretKey,
      maxBytes: 100 * 1024 * 1024,
      expires: { upload: { unit: DurationUnits.MINUTE, value: 10 } },
      // onCommit is gone: the check that used to run there is the validation.
      validation: StaticAssetValidation.define({
        issueSchema: z.object({ message: z.string() }),
        handler: async ({ object }) => {
          const problems = await opts.scanForViruses({ bucketName: 'uploads', key: object.key });

          return { isValid: problems.length === 0, issues: problems.map((message) => ({ message })) };
        },
      }),
    },
    metaLink: { model: BaseMetaLinkModel, repository: opts.metaLinkRepository },
    extend: { after: opts.addHealthRoute },
  },
});
```

What changed besides names:

- `getBuckets` is no longer listed: leaving a bucket route out turns it off. Add `getBuckets: true` to keep it.
- `directUpload.authorize` is gone because `auth` already authenticates every route.
- `resolveObjectName: ({ defaultKey }) => defaultKey` did nothing, so `objectKey` is simply left out.
- `storage` is gone: the helper is an S3 helper, so MetaLink rows record `bun-s3`.

## Find and replace

Search a file at a time and read each hit: these move options between objects, so a blind replace misses the nesting.

| Search | Replace with |
|---|---|
| `controller: {` | lift its keys onto the entry |
| `{ enabled: false }` | `false` |
| `{ enabled: true }` | `true` |
| `useMetaLink: true,` | delete the line |
| `storage: StaticAssetStorageTypes.` | delete the line |
| `extra: {` | split into `serverUpload` and `url` |
| `resolveObjectName` / `normalizeNameFn` | `serverUpload.objectKey` |
| `normalizeLinkFn` | `url.link` |
| `defineRoutesBefore` | `extend.before` |
| `defineExtraRoutes` | `extend.after` |
| `expiresIn` (under `directUpload`) | `expires.upload` |
| `onCommit` | delete, and move the check into `validation.handler` |
| `commitToken:` (a service call) | `token:` |

## Earlier renames

The names of the component's exports changed in an earlier release - `StaticAssetComponentBindingKeys` to `StaticAssetBindingKeys`, `AssetControllerFactory.defineAssetController` to `StaticAssetControllerFactory.build`, the `@app/static-asset-component/...` key strings to `@app/static-asset/...`, and the rest. The [changelog](/changelogs/) lists each one with its replacement.

**Files:**

- [`packages/core-server/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/types.ts) - `TStaticAssetEntry`
