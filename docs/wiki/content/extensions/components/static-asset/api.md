---
title: Static Asset Component - Configuration Reference
description: Every option of a static-asset entry with its type, default and meaning, the full route table, the binding keys and services, and the storage helpers and endpoints behind them.
difficulty: intermediate
---

# Static Asset Component Reference

Every option, route, binding key and mechanism of `StaticAssetComponent`. For walkthroughs, see [Getting started](./getting-started), [Server upload](./server-upload) and [Direct upload](./direct-upload).

**Files:**

- [`packages/core-server/src/components/static-asset/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/component.ts)
- [`packages/core-server/src/components/static-asset/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/types.ts)
- [`packages/core-server/src/components/static-asset/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/constants.ts)
- [`packages/core-server/src/components/static-asset/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/keys.ts)
- [`packages/core-server/src/components/static-asset/common/validation.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/validation.ts)
- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts)
- [`packages/core-server/src/components/static-asset/controller/routes/table.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/routes/table.ts) - the route table
- [`packages/core-server/src/components/static-asset/services/policy.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/services/policy.service.ts)
- [`packages/core-server/src/components/static-asset/services/commitment.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/services/commitment.service.ts)
- [`packages/core-server/src/components/static-asset/utilities/entry.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/entry.utility.ts) - the defaults and cross-checks
- [`packages/core-server/src/components/static-asset/utilities/toggle.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/toggle.utility.ts) - reading a toggle
- [`packages/core-server/src/components/static-asset/utilities/key-scope.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/key-scope.utility.ts) - `keyPrefix`
- [`packages/core-server/src/components/static-asset/utilities/meta-link.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/meta-link.utility.ts) - `StaticAssetMetaLinkUtility.createRow`, `StaticAssetMetaLinkUtility.refreshRows`
- [`packages/core-server/src/components/static-asset/utilities/route-options.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/route-options.utility.ts) - `readRoute`, the `maxBytes` route guard
- [`packages/core-server/src/components/static-asset/utilities/ingest.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/ingest.utility.ts)
- [`packages/core-server/src/components/static-asset/common/errors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/errors.ts)
- [`packages/core-server/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/models/base.model.ts)
- [`packages/core-server/src/components/static-asset/repositories/base.repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/repositories/base.repository.ts)
- [`packages/helpers/src/modules/storage/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/base.ts)
- [`packages/helpers/src/modules/storage/disk/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/disk/helper.ts)
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts)
- [`packages/helpers/src/utilities/request.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/request.utility.ts)

## Quick reference

| Item | Value |
|------|-------|
| Package | `@venizia/ignis` (core component) + `@venizia/ignis-helpers` (storage helpers) |
| Component class | `StaticAssetComponent` |
| Import subpath | `@venizia/ignis/static-asset` - not on the root barrel |
| Storage helpers | `DiskHelper`, `BunS3Helper` (`@venizia/ignis-helpers/bun-s3`); a MinIO server is reached through `BunS3Helper` |
| Runtimes | Both - `BunS3Helper` specifically requires Bun (imports Bun's native `S3Client`) |
| Optional feature | MetaLink - Postgres-backed upload tracking via `BaseMetaLinkModel`/`BaseMetaLinkRepository` |

## Import paths

```ts
import {
  BaseMetaLinkModel,
  BaseMetaLinkRepository,
  StaticAssetBindingKeys,
  StaticAssetComponent,
  StaticAssetControllerFactory,
  StaticAssetErrors,
  StaticAssetIngestUtility,
  StaticAssetValidation,
} from '@venizia/ignis/static-asset';
import type {
  IStaticAssetValidation,
  StaticAssetUploadCommitService,
  StaticAssetUploadPolicyService,
  TMetaLinkConfig,
  TStaticAssetComponentOptions,
  TStaticAssetDirectUploadOptions,
  TStaticAssetEntry,
  TStaticAssetObjectKeyResolver,
  TStaticAssetRoutes,
  TStaticAssetServerUploadOptions,
  TStaticAssetUploadLabels,
  TToggle,
} from '@venizia/ignis/static-asset';

// Helpers - main entry + storage-backend subpaths
import { DiskHelper, StorageErrors, StorageTypes } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
```

## Toggles

Every switch of an entry has one shape, `TToggle<Options>`:

```typescript
type TToggle<Options extends object = Record<never, never>> =
  | { use: false }
  | ({ use: true } & Options);
```

`{ use: false }` is the whole off state, so an option is never read from a feature that is off. `serverUpload`, `directUpload`, `metaLink` and `directUpload.validation` are required: leave one out and the entry does not compile. `routes`, `auth.publicRead` and `extend` are optional, and absent means the default.

## Entry options

`TStaticAssetComponentOptions` is a record: each key is an entry, and each entry builds one controller. `Schema` defaults to the MetaLink table IGNIS ships and widens to any table whose row carries the same fields.

| Option | Type | Default | Required | Meaning |
|---|---|---|---|---|
| `basePath` | `string` | - | yes | Where the controller is mounted. A missing leading slash is added. |
| `bucket` | `string` or `() => string \| Promise<string>` | - | yes | The one bucket every route uses. It never appears in a URL. The function form is read per request, so an environment variable can be read lazily. The component does not create it. |
| `helper` | `BunS3Helper` or `DiskHelper` | - | yes | The storage. It declares its own `storageType`, which MetaLink rows record. A `DiskHelper` cannot take `directUpload`. |
| `serverUpload` | `TToggle` | - | yes | Upload through the app. See [Server upload](./server-upload#options). |
| `directUpload` | `TToggle` | - | yes | Upload straight to S3. Needs a `BunS3Helper` and a `keyPrefix`. See [Direct upload](./direct-upload#options). |
| `metaLink` | `TToggle` | - | yes | `{ use: true, repository }`: every upload writes a row. |
| `name` | `string` | derived from the entry key | no | The controller's name. `staticAsset` and `static-asset` both become `StaticAssetController`; a key already ending in `Controller` keeps it. |
| `keyPrefix` | `string` | every key in the bucket | with `directUpload` | The folder of the bucket the entry owns. See [`keyPrefix`](#keyprefix). |
| `rawObjectPath` | `boolean` | `false` | no | `true` serves a raw nested object path (`/objects/photos/2024/f.jpg`); the percent-encoded form keeps working. |
| `maxFolderDepth` | `number` | `2` | no | Folders a key may nest below the `keyPrefix`, for every route of the entry: reads and deletes too, so it holds for keys that arrive by direct upload or ingest. |
| `link` | `({ bucket, object }) => string` | the controller's own object route | no | The link stored and returned for an object. |
| `auth` | object | none: every route open | no | Authentication and authorization of every built-in route. |
| `routes` | record | see [Routes](#routes) | no | Turn routes off, or override them. |
| `extend` | object | none | no | Routes of your own on the generated controller. |

The types enforce two pairings: `directUpload` needs a `BunS3Helper`, and `directUpload` needs a `keyPrefix`. The component refuses the same combinations at start-up for callers the types do not reach. See [Start-up refusals](./errors#start-up-refusals).

### URL shapes

The bucket never appears in a URL. `rawObjectPath` decides how the object name looks.

| `rawObjectPath` | The object route |
|---|---|
| `false` (default) | `/assets/objects/photos%2F2024%2Ff.jpg` |
| `true` | `/assets/objects/photos/2024/f.jpg` |

`rawObjectPath` turns the object segment into the `{objectName}{.+}` catch-all; every validation still runs on the joined path, the entry's `maxFolderDepth` included. Paths are strict: `/path` and `/path/` are different routes.

### `auth`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `authenticate` | `{ strategies, mode }` or `{ skip: true }` | none | Authentication of every built-in route. |
| `authorize` | an authorization spec, a list, or `{ skip: true }` | none | Authorization of every built-in route. |
| `publicRead` | `TToggle` | `{ use: false }` | `{ use: true }` leaves `getObjectByName` and `downloadObjectByName` unauthenticated. `listObjects` stays guarded. |

A route's own `authenticate` or `authorize` replaces the entry's for that route. See [Security](./security#authentication-and-authorization).

### `routes`

A record keyed by [route key](#routes). Each value is a toggle:

| Value | Meaning |
|---|---|
| `{ use: false }` | The route is not registered. |
| `{ use: true, ...overrides }` | The route is registered with these overrides. |

A key left out is on as built, when its feature is on. A toggle cannot switch on a route whose feature is off. An override takes any Hono route-config field except `method`, `request` and `responses` (typically `path`, `middleware`, `tags`, `summary`, `description`), and `authenticate` / `authorize`, which replace the entry's `auth` for that route.

### `serverUpload`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `maxBytes` | `number` | no ceiling | Largest file. Over it answers `413`. |
| `maxFiles` | `number` | `20` | Most file parts per request. |
| `objectKey` | `({ bucket, file, defaultKey }) => string` | the default naming | The one hook that decides the stored key. |

See [Server upload](./server-upload).

### `directUpload`

| Option | Type | Default | Required | Meaning |
|---|---|---|---|---|
| `secretKey` | `string` | - | yes | Signs the commit token. |
| `maxBytes` | `number` | - | yes | The `content-length-range` ceiling of a policy. |
| `validation` | `TToggle` | - | yes | `{ use: false }`, or `StaticAssetValidation.define({ issueSchema, handler })`; registers `upload-validate`. The handler is `({ file, owner })` with `file` a `StaticAssetPinnedFile`. On, `commit` takes only the validated token: see [Who commits, and with which token](./direct-upload#who-commits-and-with-which-token). |
| `authorize` | `({ context }) => ValueOrPromise<boolean>` | the entry's `auth` | only without `auth` | Who may use direct upload. |
| `resolvers` | `{ owner, metadata?, commit?: { destination? } }` | - | yes | `owner({ context })`: who an upload belongs to, signed into the token (required). `metadata({ context, file })`: per file, signed into the token. `commit.destination({ owner, metadata, file, defaultKey })`: the final key. See [Resolvers](./direct-upload#resolvers). |
| `maxFiles` | `number` | `20` | no | Most files one policy request may name. |
| `pendingPrefix` | `string` | `'pending/'` | no | Where a policy may write. Disjoint from `keyPrefix`. See [The pending prefix](./security#the-pending-prefix). |
| `expires.upload` | `IDuration` | 15 minutes | no | The policy's lifetime. |
| `expires.commit` | `IDuration` | `expires.upload` | no | The commit token's lifetime. |

See [Direct upload](./direct-upload#options).

### `metaLink`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `repository` | `DefaultCRUDRepository<Schema>` or a resolver | - | The repository that writes rows. Required with `use: true`. |
| `createMetaLink` | `({ uploadResult, fileStat, labels }) => ValueOrPromise<{ count, data }>` | a default insert of every standard field | Replaces the insert. |

See [`TMetaLinkConfig`](#tmetalinkconfig) and the [MetaLink SQL schema](#metalink-sql-schema).

### `extend`

| Option | Type | Meaning |
|---|---|---|
| `before` | `({ controller, helper, basePath }) => void` | Registers routes BEFORE every built-in one, so a literal path wins over the `rawObjectPath` catch-all. |
| `after` | `({ controller, helper, basePath }) => void` | Registers routes after every built-in one; a built-in route wins a path collision with yours. |

Both share one shape. Registration order is the only difference, and Hono matches in registration order. `basePath` is the mount path with exactly one leading slash.

```ts
import { z } from '@hono/zod-openapi';
import { OpenApiResponses } from '@venizia/ignis';
import type { TStaticAssetEntry } from '@venizia/ignis/static-asset';

export const extend: TStaticAssetEntry['extend'] = {
  after: ({ controller, helper }) => {
    controller.defineRoute({
      configs: {
        method: 'get',
        path: '/health',
        responses: OpenApiResponses.jsonResponse({ schema: z.object({ isReady: z.boolean() }) }),
      },
      handler: async (context) => {
        const isReady = await helper.hasBucket({ bucket: { name: 'assets' } });

        return context.json({ isReady }, 200);
      },
    });
  },
};
```

### `keyPrefix`

Splits one shared bucket between entries. `directUpload` requires it. `StaticAssetKeyScopeUtility.normalizePrefix` normalizes the value to exactly one trailing slash (`'tenant-a'`, `'/tenant-a'` and `'tenant-a/'` all become `'tenant-a/'`, so `tenant-a` never also owns `tenant-ab/`), and every segment must pass `isValidSegment()` or the entry refuses to start.

| Route | A key outside the prefix |
|---|---|
| `getObjectByName`, `downloadObjectByName`, `deleteObject`, `recreateMetaLink` | `404 core.storage.object_not_found`, after the 400 name check, before any storage call - the code a real miss answers, so a caller learns nothing about a key it does not own |
| `listObjects` | A caller `prefix` wider than the scope is narrowed to it; one disjoint from it returns `[]` without calling storage |
| `upload` | The component's own default name is placed inside the prefix. An `objectKey` key outside it is refused with `400 core.static_asset.object_key_out_of_scope` - never rewritten, because the application may have recorded that key elsewhere |
| `uploadPolicy`, `uploadValidate`, `uploadCommit` | The pending key becomes `pendingPrefix + keyPrefix`, so the committed key lands inside the scope. The token's scope is re-checked, for a token another entry signed with the same secret |

The entry's `maxFolderDepth` counts folders below the prefix: key validation uses `maxFolderDepth` plus the prefix depth. Without that addition, a two-segment prefix plus a direct-upload key `<uuid>/<name>` would exceed the default depth of `2` and every read would answer `400`.

## Routes

Every built-in route, mounted under the entry's `basePath`. The bucket is the entry's own and never appears in a path. A route exists only when its feature is on and its `routes` toggle is not `{ use: false }`.

| Key | Method | Path | Registered when | Auth |
|---|---|---|---|---|
| `upload` | `POST` | `/objects` | `serverUpload` is on | the entry's `auth` |
| `listObjects` | `GET` | `/objects` | always | the entry's `auth`, never public |
| `getObjectByName` | `GET` | `/objects/{objectName}` | always | the entry's `auth`; open with `publicRead` |
| `downloadObjectByName` | `GET` | `/download/{objectName}` | always | the entry's `auth`; open with `publicRead` |
| `deleteObject` | `DELETE` | `/objects/{objectName}` | always | the entry's `auth` |
| `recreateMetaLink` | `PUT` | `/meta-links/{objectName}` | `metaLink` is on | the entry's `auth` |
| `uploadPolicy` | `POST` | `/upload-policy` | `directUpload` is on | the entry's `auth`, then `directUpload.authorize` |
| `uploadValidate` | `POST` | `/upload-validate` | `directUpload.validation` is on | the entry's `auth`, then `directUpload.authorize` |
| `uploadCommit` | `POST` | `/upload-commit` | `directUpload` is on | the entry's `auth`, then `directUpload.authorize` |

With `routes.uploadCommit: { use: false }` the commit route does not exist and your code commits through the service. See [Who commits, and with which token](./direct-upload#who-commits-and-with-which-token).

`upload` and `listObjects` share `/objects` and differ by method. A route's `authenticate` and `authorize` replace the entry's `auth` for it. `getObjectByName` and `downloadObjectByName` both honour a `Range` header.

## Binding keys and services

```typescript
class StaticAssetBindingKeys {
  static readonly STATIC_ASSET_OPTIONS = '@app/static-asset/options';
  static policyService(opts: { name: string }): string; // '@app/static-asset/policy-service/<name>'
  static commitService(opts: { name: string }): string; // '@app/static-asset/commit-service/<name>'
}
```

| Key | Resolves to |
|---|---|
| `STATIC_ASSET_OPTIONS` | The options object an application registering through `configs.artifacts` binds. `component(StaticAssetComponent, { options })` passes it directly and wins over the key. |
| `policyService({ name })` | `StaticAssetUploadPolicyService`, for an entry with `directUpload` on. |
| `commitService({ name })` | `StaticAssetUploadCommitService`, for the same entry. |

`name` is the entry's key in the options object, not the controller name. The component binds both services and hands the **same instances** to the controller, so a service you inject and the routes share them. `StaticAssetComponent`'s constructor binds an empty `{}` default for `STATIC_ASSET_OPTIONS`: an empty object produces zero controllers, no error. Bind your options in `preConfigure()` before `this.component(StaticAssetComponent)`.

| Service | Method | Does |
|---|---|---|
| `StaticAssetUploadPolicyService` | `issuePolicies({ files, owner })` | One signed policy per file; `files[].metadata` is signed. Refuses a `fileName` that is not one valid key segment. Does not call `authorize`. |
| `StaticAssetUploadCommitService` | `verify({ token, owner })` | Signature, expiry, owner, bucket, pending scope; answers `{ bucket, object, owner, metadata }`; no storage call. |
| | `validate({ token, owner })` | `verify`, pin the content, run `validation` once. A valid file answers `{ isValid, issues, commitToken }`. |
| | `commit({ token, owner, labels? })` | `verify`, conditional copy of the pinned content to the final key, remove pending, MetaLink row. Answers `{ bucket, object, owner, metadata, link, metaLink? }`. Refuses a destination that holds an object (`409`). Never runs `validation`; with it on, needs the validated token. |

## Validation and the pin

```typescript
interface IStaticAssetValidation<IssueSchema extends z.ZodType> {
  issueSchema: IssueSchema;
  handler: (opts: {
    file: StaticAssetPinnedFile;
    owner?: string;
  }) => ValueOrPromise<IStaticAssetValidationResult<z.infer<IssueSchema>>>;
}

interface IStaticAssetValidateResult<Issue> extends IStaticAssetValidationResult<Issue> {
  commitToken?: string; // present only when isValid is true
}

interface IStaticAssetPin {
  etag: string;
  versionId?: string; // only when the storage reports a real version
}

class StaticAssetTokenStages {
  static readonly ISSUED = 'issued'; // from upload-policy
  static readonly VALIDATED = 'validated'; // from upload-validate, carries the pin
}
```

`StaticAssetPinnedFile` has `key`, `size` and `stream({ range? })`. Its static `pinOf({ stat, scope })` builds the pin from a stat and `conditionOf({ pin })` turns a pin into the `{ ifMatch?, versionId? }` a read or copy sends. See [Direct upload](./direct-upload#validation) and [Security](./security#the-pin-binds-the-token-to-the-content).

| Error | Status | Raised when |
|---|---|---|
| `core.static_asset.upload_not_validated` | `422` | `validation` is on and `commit` got a token that is not validated. |
| `core.static_asset.upload_changed` | `409` | A pinned read or the commit copy finds content other than the pin, or finds no object. |

## Storage types

A helper declares the backend it writes to, so a caller never tells one apart with `instanceof`. `StorageTypes` comes from `@venizia/ignis-helpers`:

```typescript
class StorageTypes {
  static readonly DISK = 'disk';
  static readonly BUN_S3 = 'bun-s3';
}

type TStorageType = TConstValue<typeof StorageTypes>;
// 'disk' | 'bun-s3'
```

| Type | Constant | Helper | Requires |
|------|----------|--------|----------|
| `'disk'` | `StorageTypes.DISK` | `DiskHelper` | Local filesystem write access |
| `'bun-s3'` | `StorageTypes.BUN_S3` | `BunS3Helper` | Bun runtime (imports Bun's native `S3Client`) |

The entry reads `helper.storageType`, and MetaLink rows record it. `IStorageHelper.storageType` is optional, so a custom helper may leave it out, but an entry refuses to start with a helper that declares neither value.

> [!NOTE]
> MinIO is not a storage type of its own. Use `BunS3Helper` and point `endpoint.default` at the MinIO server (path-style addressing is the default): it reaches MinIO over the same S3 API, and adds presigned URLs, object tagging and byte ranges.

## Storage helpers

### `IStorageHelper` interface

Every backend implements this contract; `BaseStorageHelper` (abstract) implements the shared parts (`isValidSegment`, `isValidBucketName`, `isValidObjectKey`, `upload`, `getObjectStream`, `writeStream`, `getMimeType`, `getMediaType`) and leaves the rest abstract.

Every method takes one options object with nested refs: `IBucketRef` is `{ name }`, `IObjectRef` is `{ key }`, and `IObjectLocation` is `{ bucket, object }`.

```typescript
interface IStorageHelper {
  readonly storageType?: TStorageType;

  isValidSegment(opts: { segment: string }): boolean;
  isValidBucketName(opts: { bucket: IBucketRef }): boolean;
  isValidObjectKey(opts: { object: IObjectRef; maxDepth?: number }): boolean;

  hasBucket(opts: { bucket: IBucketRef }): Promise<boolean>;
  getBuckets(): Promise<IBucketInfo[]>;
  getBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  createBucket(opts: { bucket: IBucketRef }): Promise<IBucketInfo | null>;
  removeBucket(opts: { bucket: IBucketRef }): Promise<boolean>;

  getObject(opts: IObjectLocation & { options?: any }): Promise<Readable>;
  getObjectStream(
    opts: IObjectLocation & { range?: { start: number; end?: number } } & IStorageReadCondition,
  ): Promise<ReadableStream<Uint8Array>>;
  getStat(opts: IObjectLocation): Promise<IFileStat>;
  listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;

  upload(opts: {
    bucket: IBucketRef;
    files: IUploadFile[];
    maxFolderDepth?: number;
    maxKeyDepth?: number;
    normalizeNameFn?: (opts: { file: TUploadNaming }) => string;
    normalizeLinkFn?: (opts: IObjectLocation) => string;
  }): Promise<IUploadResult[]>;

  writeStream(
    opts: IObjectLocation & {
      source: ReadableStream<Uint8Array> | Blob | Response | Request;
      contentType?: string;
      maxFolderDepth?: number;
    },
  ): Promise<void>;

  copyObject(opts: {
    bucket: IBucketRef;
    source: IObjectRef;
    destination: IObjectRef;
    ifMatch?: string;
    sourceVersionId?: string;
  }): Promise<void>;

  removeObject(opts: IObjectLocation): Promise<void>;
  removeObjects(opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void>;

  presignPut(
    opts: IObjectLocation & {
      expiresIn?: IDuration;
      tagging?: Record<string, string>;
      contentLength?: number;
      contentType?: string;
    },
  ): Promise<string>;
  presignGet(
    opts: IObjectLocation & {
      expiresIn?: IDuration;
      responseContentType?: string;
      responseContentDisposition?: string;
    },
  ): Promise<string>;

  getObjectTags(opts: IObjectLocation): Promise<Record<string, string>>;
  replaceObjectTags(opts: IObjectLocation & { tags: Record<string, string> }): Promise<void>;

  getMediaType(opts: { mimeType: string }): string;
  getMimeType(opts: { filename: string }): string;
}
```

```
IStorageHelper (interface)
    |
BaseStorageHelper (abstract - implements the validators, upload, the stream methods and the type lookups)
    |
    +-- DiskHelper    (local filesystem)
    +-- BunS3Helper   (Bun-native S3, Bun only)
```

`IStorageReadCondition` is `{ ifMatch?: string; versionId?: string }`. A read or copy that names the content it expects fails with `StorageErrors.PRECONDITION_FAILED` (`core.storage.precondition_failed`, `412`) when it finds other content:

| Option | On | Meaning |
|---|---|---|
| `ifMatch` | `getObjectStream`, `copyObject` | Read or copy only if the object still has this ETag. |
| `versionId` | `getObjectStream` | Read this exact version. |
| `sourceVersionId` | `copyObject` | Copy this exact version of the source. |

`BunS3Helper.getStat` is a signed `HEAD`. It reports `etag` (quoted, as S3 sends it) and `versionId`, which is absent for an object with no real version: `StorageUtility.realVersionId` reads a missing value, an empty one and the literal `null` as no version. `DiskHelper` has neither ETag nor versions, so it refuses a conditional `getObjectStream` with an error instead of reading unpinned.

`expiresIn` is an `IDuration` (`{ unit, value }`), not seconds. `presignPut`, `presignGet`, `getObjectTags` and `replaceObjectTags` throw on `DiskHelper`; only `BunS3Helper` implements them. See the [Storage full reference](/extensions/helpers/storage/api#presign-and-object-tagging).

### Supporting types

```typescript
interface IUploadFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  encoding?: string;
  folderPath?: string;
  [key: string | symbol]: any;
}

interface IBucketRef {
  name: string;
}

interface IObjectRef {
  key: string;
}

interface IObjectLocation {
  bucket: IBucketRef;
  object: IObjectRef;
}

type TUploadNaming = Pick<IUploadFile, 'originalName' | 'folderPath'>;

interface IUploadResult {
  bucket: IBucketRef;
  object: IObjectRef & { size: number; contentType: string };
  link: string;
  metaLink?: { data: any } | { error: string };
}

interface IFileStat {
  size: number;
  metadata: IObjectMetadata;
  lastModified?: Date;
  etag?: string;
  versionId?: string;
}

interface IBucketInfo {
  name: string;
  creationDate: Date;
}

interface IObjectInfo {
  name?: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  prefix?: string;
}

interface IListObjectsOptions {
  bucket: IBucketRef;
  prefix?: string;
  useRecursive?: boolean;
  maxKeys?: number;
}
```

`metaLink` is a union, so an upload result carries either the created record or a failure code - never both, and never `null`.

### Name and key validation (`BaseStorageHelper`)

`isValidSegment({ segment })` rejects any of the following, in order. `isValidBucketName({ bucket })` is this check applied to `bucket.name`.

| Check | Rejects |
|-------|---------|
| Type | Non-string input |
| Empty | Empty string |
| Path traversal | `..`, `/`, or `\` |
| Hidden file | A leading `.` |
| Shell metacharacters | `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, `#` |
| Control characters | `\n`, `\r`, `\0` |
| Length | Over 255 bytes in UTF-8 (128 `é` is 128 characters but 256 bytes) |
| Whitespace-only | Empty after trimming |

`isValidObjectKey({ object, maxDepth })` runs these checks, in order:

| Step | Behavior |
|------|----------|
| Trailing slash | Rejects a key that ends with `/` |
| Normalize | Trims a leading slash |
| Empty check | Rejects if the result is empty |
| Double slashes | Rejects empty segments, for example `a//b` |
| Folder depth | `folderDepth = segments.length - 1`; rejects if it exceeds `maxDepth` (default `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH = 2`) |
| Segment names | Every segment must pass `isValidSegment()` |
| Key length | Rejects a normalized length over 1024 UTF-8 bytes |

> [!NOTE]
> Every step but the trailing-slash check lives on `protected isValidKeyPath({ path, maxDepth })`, which `isValidObjectKey` and `upload`'s `folderPath` check both call. It is protected, so `isValidObjectKey` is the only way in from outside the class.

### `DiskHelper`

```typescript
interface IDiskHelperOptions {
  basePath: string;    // Base directory for storage
  scope?: string;      // Logger scope, default: 'DiskHelper'
  identifier?: string; // Helper identifier, default: 'DiskHelper'
}
```

Creates `basePath` with `fs.mkdirSync({ recursive: true })` in the constructor if it does not already exist. Buckets map to subdirectories; objects map to files inside them.

```typescript
const diskHelper = new DiskHelper({ basePath: './app_data/storage' });
```

### `BunS3Helper`

```typescript
interface IBunS3HelperOptions {
  accessKey: string;
  secretKey: string;
  endpoint: { default: string; public?: string };
  region?: string;               // Default: 'us-east-1'
  sessionToken?: string;
  virtualHostedStyle?: boolean;  // Default: false
  partSize?: number;             // Multipart part size in bytes; Bun's default when omitted
  queueSize?: number;            // Parts in flight; Bun's default when omitted
  retry?: number;                // Retries per failed part; Bun's default when omitted
  scope?: string;
  identifier?: string;
}
```

Wraps Bun's native `S3Client`, imported from the `bun` builtin module. That module only resolves under the Bun runtime. This is why `BunS3Helper` is exported from the separate `@venizia/ignis-helpers/bun-s3` subpath, not the main entry point.

```typescript
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

const bunS3Helper = new BunS3Helper({
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  endpoint: { default: 'https://s3.us-east-1.amazonaws.com' },
});
```

> [!IMPORTANT]
> Set `endpoint.public` when the application reaches S3 over an internal address. `host` is inside every SigV4 signature, so a URL signed against the internal endpoint cannot be rewritten to a public one afterwards - the signature breaks. `endpoint.default` stays the host this process talks to.

To use a MinIO server, point `endpoint.default` at it (`'http://localhost:9000'`) and keep `virtualHostedStyle` at its default `false`. MinIO speaks the same S3 API, so no separate helper or driver is needed.

## Controller factory

`StaticAssetControllerFactory.build({ key, entry, policyService?, commitService? })` builds one controller class per call. It resolves the entry itself, so `entry` is the object you wrote. `key` names the controller when the entry has no `name`; `policyService` and `commitService` are required for an entry with `directUpload` on, and `StaticAssetComponent` passes the ones it bound.

1. Resolves the entry once (`StaticAssetEntryUtility.resolve`): reads every toggle, applies the defaults, derives the name and the link, and makes every cross-check.
2. Creates a class extending `BaseRestController`, decorated `@controller({ path: basePath })`, and renames it to the resolved name so logs and DI bindings show it.
3. Calls `extend.before` first, so a literal path of yours can win over the catch-all `rawObjectPath` registers.
4. Binds every route in `binding()` with `this.bindRoute({ configs }).to({ handler })`, spread-merging each base definition with the route's overrides and its resolved auth.
5. Registers each route only where [Routes](#routes) says it is registered: the route's feature is on, and its toggle is not `{ use: false }`.
6. Calls `extend.after` last.
7. `StaticAssetComponent.binding()` registers the resulting class with `this.application.controller(...)`.

```
StaticAssetComponent.binding()
    | for each entry
StaticAssetEntryUtility.resolve({ key, entry })      defaults, name, link, cross-checks
StaticAssetEntryUtility.buildDirectUploadServices    the pair bound under the service keys
StaticAssetControllerFactory.build({ key, entry, policyService, commitService })
    | creates
@controller({ path: basePath })
class GeneratedStaticAssetController extends BaseRestController { ... }
    | registered via
this.application.controller(GeneratedStaticAssetController)
```

### `MultipartBodySchema`

The Zod schema validating the `upload` request body. The labels are optional form fields; they are parsed by the same schema as the labels of `upload-commit`.

```typescript
const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: { type: 'string', format: 'binary' },
  }),
  principalType: z.string().optional(),
  principalId: z.coerce.string().optional(),
  variant: z.string().optional(),
  sequence: z.coerce.number().int().optional(),
  folderPath: z.string().optional(),
});
```

### Where `maxBytes` runs

`serverUpload.maxBytes`'s `content-length` check is route middleware, built by `StaticAssetRouteOptionsUtility.appendLengthGuard`
and appended AFTER your own `routes.upload` `middleware` - so an application check of its own (for
example inventory `REQUEST_TOO_LARGE`) still answers first. It runs before the route's body
validator and before the handler.

It moved out of the handler because `@hono/zod-openapi`'s form validator reads the whole multipart
body before any handler runs - a `content-length` check inside the handler saw a body already fully
read, so it saved no memory. The per-file `buffer.length` check (step 3 below) stays in the handler:
a multipart envelope is larger than the files inside it, and only the parsed file's actual length is
authoritative.

> [!WARNING]
> `serverUpload.maxBytes` bounds a **declared** `content-length` early. The upload route also carries its own
> body limit (`BodyLimits.route`): `maxFiles` files of `maxBytes` each plus their multipart framing
> (4 KiB per file and 64 KiB for the other parts), so a chunked request that omits the header is
> counted too, and the 5 MiB default limit stands aside for it (see
> [Body limit](/references/base/middlewares#body-limit-configs-middlewares-bodylimit)). Without
> `serverUpload.maxBytes` the upload route is held to that default. Raise `configs.server.maxRequestBodySize`
> above the route's limit, or Bun's own limit answers first.

### Upload validation order

1. The `content-length` guard runs as route middleware, before the body is read. Over `maxBytes` answers `413`.
2. `multipart/form-data` is parsed via `RequestUtility.parseMultipartBody()`, wholly into memory. More than `maxFiles` files answers `413` before anything is written.
3. The labels are parsed by one schema. A label of the wrong shape is the standard validation error (`422`), answered before the handler runs. Each file is checked non-empty (`400 "Empty file content | name: {originalName}"`) and its `buffer.length` against `maxBytes`, the authoritative size check - see [Where `maxBytes` runs](#where-maxbytes-runs).
4. `helper.upload()` runs the storage-helper-level checks below, the folder path and its depth included. Under a `keyPrefix`, a key outside the scope is refused there too, with `400 core.static_asset.object_key_out_of_scope` - see [`keyPrefix`](#keyprefix).
5. Each stored object gets its MetaLink row, when `metaLink` is on.

The handler no longer checks the folder itself: the storage helper does, so the check is the same for every caller of `helper.upload()`.

### Storage-helper-level upload checks (`BaseStorageHelper.upload`)

These run inside `helper.upload()`, separate from the controller checks above. They are reachable even when a caller uses the storage helper directly. Every key is resolved and validated before the first file is written, so one bad file in a batch stores nothing:

| Check | Error message | Status and code |
|-------|----------------|-----------------|
| Bucket does not exist (`hasBucket()` false) | <code v-pre>[upload] Bucket does not exist \| name: {bucket}</code> | `400` |
| No naming hook (no `serverUpload.objectKey`, no `keyPrefix`): `originalName` fails `isValidSegment()`, because it becomes the key | `[upload] Invalid original file name` | `400` |
| A naming hook is set: `originalName` is metadata only, and fails `isValidOriginalName()` - not blank, at most 255 characters, no control character or lone surrogate | `[upload] Invalid original file name` | `400` |
| `folderPath` segment count exceeds `maxFolderDepth` | <code v-pre>[upload] Invalid folder path \| depth: {n} \| max: {m}</code> | `400` `core.storage.folder_depth_exceeded` |
| `folderPath` fails the path rule for any other reason | `[upload] Invalid folder path` | `400` `core.storage.folder_path_invalid` |
| `size` is `undefined`, `null`, or negative | <code v-pre>[upload] Invalid file size \| size: {size}</code> | `400` |
| Normalized key (post naming hook) fails `isValidObjectKey()` | <code v-pre>[upload] Invalid normalized object name \| name: {name}</code> | `400` |

> [!NOTE]
> The static-asset controller passes a naming hook to `helper.upload()` whenever `serverUpload.objectKey` or a `keyPrefix` is configured - then `originalName` is metadata at the storage-helper layer, not the key, and names like `Báo cáo.pdf` pass.
>
> **One exception, at the controller layer:** a `keyPrefix` with no `serverUpload.objectKey` - the component's own default naming under a scope - still refuses a `/` in the original name with `400 [upload] Invalid original file name`, exactly as without a scope. An `objectKey` hook lifts it.

`getError()` defaults `statusCode` to `400` when the caller does not pass one explicitly, so the messages without a code also resolve to `400`.

## Header sanitization

```typescript
StaticAssetHeaders.ALLOWED = [
  HTTP.Headers.CONTENT_ENCODING,
  HTTP.Headers.CACHE_CONTROL,
  HTTP.Headers.ETAG,
  HTTP.Headers.LAST_MODIFIED,
] as const;
```

These correspond to `'content-encoding'`, `'cache-control'`, `'etag'` and `'last-modified'`.

When streaming a file - both <code v-pre>objects/{objectName}</code> and <code v-pre>download/{objectName}</code> - the controller copies only these keys from the storage metadata onto the response. Every other metadata header is dropped. Each forwarded value is sanitized with `String(value).replace(/[\r\n]/g, '')` before being set, to prevent HTTP header injection.

> [!WARNING]
> `content-type` is **not** on the list, and the served type is never taken from storage metadata or from what the uploader declared. It is derived from the object KEY by `StaticAssetControllerFactory.resolveServedContentType`, because a renderable type that a client chose is stored cross-site scripting on the API origin, and `nosniff` cannot stop a type the server itself declared.

### Served content type

```typescript
static resolveServedContentType(opts: {
  helper: IStorageHelper;
  object: IObjectRef;
}): { contentType: string; isRenderable: boolean };
```

`StaticAssetControllerFactory.resolveServedContentType` runs `helper.getMimeType({ filename: object.key })` and checks the answer against `StaticAssetContentTypes.RENDERABLE`:

| Outcome | `contentType` | `isRenderable` | Response |
|---|---|---|---|
| The key's type is in `StaticAssetContentTypes.RENDERABLE` | That type | `true` | Streamed inline |
| Anything else, including an unknown extension | `'application/octet-stream'` | `false` | `Content-Disposition: attachment` |

`StaticAssetContentTypes.RENDERABLE` holds `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, `image/bmp`, `image/x-icon`, `video/mp4`, `video/webm`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `application/pdf`, `text/plain` and `text/csv`. `image/svg+xml` is deliberately absent, because SVG carries script.

The function is exported, so a hand-written route makes the same decision rather than reinventing it.

All streaming responses also set:

```http
X-Content-Type-Options: nosniff
Content-Security-Policy: sandbox
Content-Type: <StaticAssetControllerFactory.resolveServedContentType, from the object key>
Content-Length: <bytes in the response body>
Content-Disposition: attachment; filename="..."   (always on download; on objects when the type is not renderable)
Accept-Ranges: bytes                              (objects route, advertised unconditionally)
Content-Range: bytes {start}-{end}/{size}         (objects route, on a 206 Partial Content)
```

`Content-Security-Policy: sandbox` is set even for a renderable type, so an unforeseen renderable type still cannot reach this origin.

## Object name decoding

Hono percent-decodes a path param before the handler reads it. The controller therefore never runs a second `decodeURIComponent()` on an object name:

- `report_100%.pdf` is a legal object name. Its link is `.../objects/report_100%25.pdf`. Hono hands the handler back `report_100%.pdf`. A second decode would hit the invalid escape `%.p` and throw - the object would become permanently unfetchable and undeletable.
- An object named `a%2Fb.png` would decode twice into `a/b.png` - a different object than the one requested.

`isValidBucketName()`/`isValidObjectKey()` still run on the singly-decoded value, so a traversal payload is rejected exactly as before.

## `StaticAssetIngestUtility`

`StaticAssetIngestUtility.fromUrl()` fetches a remote URL and stores what comes back, without the body passing through this process. It is on the `@venizia/ignis/static-asset` barrel and works against any `IStorageHelper` - no controller involved.

```typescript
class StaticAssetIngestUtility {
  static fromUrl(opts: IStaticAssetIngestFromUrlOptions): Promise<IStaticAssetIngestFromUrlResult>;
}

interface IStaticAssetIngestFromUrlResult {
  upload: IUploadResult;
  stat: IFileStat;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `helper` | `IStorageHelper` | - | Where the object lands. |
| `url` | `string` | - | The remote URL to fetch. |
| `bucket` | `IBucketRef` | - | The target bucket. |
| `normalizeLinkFn` | `(opts: { bucket: IBucketRef; object: IObjectRef }) => string` | - | **Required.** Where the object is served from. An empty return throws. |
| `resolveKey` | `(opts: { url: URL; contentType: string }) => string` | The URL's last path segment | Decides the stored key. |
| `folderPath` | `string` | `undefined` | Prefixed onto the derived key. Ignored when `resolveKey` is set. |
| `policy` | `IUrlSafetyPolicy` | https only, no private address, 3 hops, 10s, 10 MB | Passed to `UrlIngest.fetchGuarded`. |
| `maxFolderDepth` | `number` | `BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH` (`2`) | The same depth rule the upload route applies. |

```typescript
const { upload, stat } = await StaticAssetIngestUtility.fromUrl({
  helper,
  url: 'https://cdn.example.com/logo.png',
  bucket: { name: 'uploads' },
  normalizeLinkFn: ({ object }) => `/assets/objects/${encodeURIComponent(object.key)}`,
});
```

- **The URL is guarded.** `UrlIngest.fetchGuarded` enforces the scheme allow-list, checks every resolved address, walks redirects by hand with a per-hop re-check, and applies a timeout.
- **The body is capped twice.** A declared `content-length` over `policy.maxBytes` is refused before the write starts, with `UrlSafetyErrors.URL_REFUSED`. A body that lies or omits the header is cut off mid-flight by `UrlIngest.capStream`.
- **The content type comes from the stored key**, never from what the remote host claimed - the same rule the asset routes apply, and for the same reason.
- **It writes no meta link.** The columns an application attaches to an object come from its own domain, so the row stays yours. `stat` is returned because `getStat` already ran, so writing that row costs nothing extra.

> [!WARNING]
> Without `resolveKey`, the key comes from the remote URL's last path segment - named by whoever supplied the URL. Pass `resolveKey` whenever the URL is not your own. Validation bounds what that name can do; it does not make the name yours.

## `TMetaLinkConfig`

```typescript
type TMetaLinkConfig<Schema extends TMetaLinkCompatibleSchema = TMetaLinkSchema> = {
  repository: TValueOrAsyncResolver<DefaultCRUDRepository<Schema>>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    labels: TStaticAssetUploadLabels;
  }) => ValueOrPromise<{ count: number; data: TTableObject<Schema> }>;
};

type TStaticAssetUploadLabels = {
  principalType?: string;
  principalId?: string;
  variant?: string;
  sequence?: number;
};
```

The entry's `metaLink` is `TToggle<TMetaLinkConfig<Schema>>`. There is no `model`: the repository already carries it.

Both classes come from the separate `@venizia/ignis-connectors` package, imported here from its `@venizia/ignis-connectors/postgres` subpath.

| Name | Where it lives | What it is |
|---|---|---|
| `BaseRelationalEntity` | `packages/connectors/src/relational/core/models/base.ts` | The engine-neutral entity base. `BasePostgresEntity` is an alias re-export of it. |
| `DefaultCRUDRepository` | `packages/connectors/src/relational/postgres/repositories/core/default.ts` | The Postgres binding of `DefaultRelationalRepository`, not an alias of it. This is the type `repository` must satisfy. |
| `DefaultRelationalRepository` | `packages/connectors/src/relational/core/repositories/core/default.ts` | The engine-neutral base each engine subclasses. |

## MetaLink SQL schema

**Table:** `MetaLink`

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key |
| `created_at` | TIMESTAMPTZ | No | `NOW()` | Row creation time |
| `modified_at` | TIMESTAMPTZ | No | `NOW()` | Row last-update time |
| `bucket_name` | TEXT | No | - | Storage bucket name |
| `object_name` | TEXT | No | - | File object name (may include folder segments) |
| `link` | TEXT | No | - | Access URL to the file |
| `mimetype` | TEXT | No | - | File MIME type |
| `size` | INTEGER | No | - | File size in bytes |
| `etag` | TEXT | Yes | - | Entity tag for versioning |
| `metadata` | JSONB | Yes | - | Additional file metadata |
| `storage_type` | TEXT | No | - | `'disk'` or `'bun-s3'` |
| `is_synced` | BOOLEAN | No | `false` | Set `true` on every upload and every meta-links sync |
| `variant` | TEXT | Yes | - | Upload variant tag (for example `'thumbnail'`, `'original'`) |
| `sequence` | INTEGER | No | `0` | Display order within one principal. Defaults to `0` so legacy rows tie, and `ORDER BY sequence, createdAt` reproduces the order they already had |
| `principal_type` | TEXT | Yes | - | Associated principal type |
| `principal_id` | TEXT | Yes | - | Associated principal ID, always stored as a string |

**Indexes:** `bucket_name`, `object_name`, `storage_type`, `is_synced`, and a composite index on `(principal_type, principal_id, sequence)` for ordering within one principal.

`@model({ migration: { use: false } })` on `BaseMetaLinkModel` marks it for migration tooling that reads the registry to skip. IGNIS generates no migrations, so the table comes from you: either export `BaseMetaLinkModel.schema` from the schema file your `drizzle-kit` reads (as `examples/vert/src/migration-schema.ts` does), or create it by hand, once, per database.

### MetaLink lifecycle

- **On upload:**
  - Creates one MetaLink row per uploaded file, after fetching fresh stats via `helper.getStat()`.
  - Uses `metaLink.createMetaLink()` when provided, otherwise a default insert that covers every standard field.
  - `principalType`, `principalId`, `variant` and `sequence` come from the upload's **form fields** - an identifier in a URL lands in every access log on the way. A label in the query string is ignored. `upload-commit` takes the same four in its JSON body; it takes no `folderPath`, because the object key was fixed when the policy was issued. One schema parses the labels on both paths: a `sequence` that is not an integer is the standard validation error (`422`) on both paths. `PUT .../meta-links/{objectName}` takes no labels and creates its row without any.
  - If the insert throws, the upload still succeeds. The file's response entry gets <code v-pre>metaLink: { error: 'META_LINK_CREATE_FAILED' }</code> - a fixed code, never the driver's text - and the real error is logged in full. This handler returns `200`, so it bypasses the error middleware that strips `detail`/`table`/`constraint`; returning a code is what keeps raw constraint names off the wire.
- **On delete:**
  - The storage delete happens first and is awaited. An object that is already gone is not an error: the delete is idempotent.
  - The MetaLink row delete (`deleteBy({ where: { bucketName, objectName } })`) is awaited too, so a retry removes a row the first attempt left behind.
  - The HTTP response returns after both.
- **On sync (`PUT meta-links/:objectName`, `recreateMetaLink`):** refreshes first, creates only if nothing was there to refresh. `MetaLinkRecreateActions` names the two outcomes: `'refreshed'` and `'created'`, and the OpenAPI document types `action` as that literal enum, not a bare `string`.

  | Step | What runs | Rows touched |
  |------|-----------|--------------|
  | Refresh, `metaLink.createMetaLink` configured | One `repository.updateBy({ data: { mimetype, size, etag, isSynced: true }, where: { bucketName, objectName } })` - `link` and `metadata` are left alone, because the hook owns them | Every row for that `(bucketName, objectName)` pair |
  | Refresh, no hook | The same `updateBy`, plus `link` in the same statement; then one `updateById` **per row**, `{ metadata: { ...row.metadata, ...fileStat.metadata } }` - the stat's keys win, the row's other keys survive. Skipped entirely when the stat carries no metadata | Every row for that `(bucketName, objectName)` pair |
  | Create | Only when the refresh updated `0` rows: `StaticAssetMetaLinkUtility.createRow` - the same builder `upload` and `upload-commit` use, so `metaLink.createMetaLink` runs when provided, with a fresh `getStat()` result | One row, with no principal and no labels |

  Rows per pair are deliberately not unique, and a refresh keeps each row's own `storageType` and labels (`variant`, `principalType`, `principalId`, `sequence`) either way.

  The response is <code v-pre>{ success: true, action: 'refreshed' \| 'created', count, metaLink, metaLinks }</code>. `count` is the number of rows touched; `metaLinks` holds all of them; `metaLink` is kept for existing callers and is `metaLinks[0]`.

  Refresh-then-create is not atomic: two concurrent calls on an object with no existing row can both create one. Rows per pair are deliberately not unique, so the table allows it.

  > [!WARNING]
  > Without a hook, the `metadata` merge is a read-then-write per row: the `updateBy`'s own `RETURNING` supplies the "read", and each row's `updateById` is a separate statement after it. An application write to that row's `metadata` landing between the two is overwritten by the merge.

## Component lifecycle

1. `binding()` reads `STATIC_ASSET_OPTIONS` from the DI container, unless options were passed directly.
2. For each entry, resolves it (`StaticAssetEntryUtility.resolve`) and, for an entry with `directUpload` on, builds and binds the two services (`StaticAssetEntryUtility.buildDirectUploadServices`).
3. Calls `StaticAssetControllerFactory.build()` and registers the result with `this.application.controller()`.
4. Logs the entry key, its mount path, and whether direct upload and MetaLink are on.

An entry that breaks a rule the types cannot catch throws at this point, naming the entry. See [Start-up refusals](./errors#start-up-refusals).

## See also

- [Overview](./) - what the component does and which upload to choose
- [Getting started](./getting-started) - three complete declarations
- [Security](./security) - auth, publicRead and the direct-upload safeguards
- [Migration](./migration) - every old option and its new form
- [Error Reference](./errors) - every code and what to do about it
