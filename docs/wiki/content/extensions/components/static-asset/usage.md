---
title: Static Asset Component - Usage & Examples
description: Task-oriented walkthroughs for buckets, uploads, downloads, MetaLink tracking, and frontend integration
difficulty: intermediate
---

# Usage & Examples

Task-oriented patterns for the endpoints `StaticAssetComponent` generates, plus the full MetaLink tracking setup. All examples assume a backend registered under `basePath: '/assets'` - see [Overview](./) for the binding.

## List and manage buckets

```
GET    /assets/buckets                 List all buckets
GET    /assets/buckets/:bucketName     Get one bucket (nullable)
POST   /assets/buckets/:bucketName     Create a bucket
DELETE /assets/buckets/:bucketName     Delete a bucket
```

```typescript
const buckets = await fetch('/assets/buckets').then(r => r.json());
// [{ name: 'user-uploads', creationDate: '2026-01-01T00:00:00.000Z' }]

await fetch('/assets/buckets/user-uploads', { method: 'POST' });
const { isDeleted } = await fetch('/assets/buckets/user-uploads', { method: 'DELETE' }).then(r => r.json());
```

Every `bucketName` is validated with `isValidBucketName()` - single segment, no `..`/`/`/`\`, no shell metacharacters, 255 characters or fewer. See [Error Reference](./errors) for the full rule set.

## Upload files

`POST /assets/buckets/:bucketName/objects` accepts `multipart/form-data`. `principalType`, `principalId`, `variant`, `sequence` and `folderPath` are optional **form fields** - an identifier in a URL lands in every access log on the way. A label in the query string is refused with `400 core.static_asset.labels_in_query`. The same path answers `GET` with a listing.

```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');
formData.append('principalType', 'user');
formData.append('principalId', '42');
formData.append('variant', 'original');
formData.append('folderPath', 'invoices/2026');

const response = await fetch('/assets/buckets/user-uploads/objects', {
  method: 'POST',
  body: formData,
});

const [result] = await response.json();
// {
//   bucket: { name: 'user-uploads' },
//   object: { key: 'invoices/2026/document.pdf', size: 20481, contentType: 'application/pdf' },
//   link: '/assets/buckets/user-uploads/objects/invoices%2F2026%2Fdocument.pdf',
// }
```

- **`folderPath` is validated separately from the filename.** Each segment must pass `isValidSegment()`. The segment count must stay within `maxFolderDepth` (default `2`). Both checks return `400` before the file is even parsed.
- **`principalId` is always stored as a string**, coerced with `String()` regardless of whether you send a number or a string.
- **With MetaLink enabled, the upload always succeeds - even if the tracking write fails.** `metaLink` is a union, so it carries one arm or the other, never both:

  | Outcome | `metaLink` |
  |---------|-----------------|
  | MetaLink write succeeded | <code v-pre>{ data: &lt;the created database record&gt; }</code> |
  | MetaLink write failed | <code v-pre>{ error: 'META_LINK_CREATE_FAILED' }</code> - a fixed code, never the driver's text |

## Stream or download an object

```typescript
const objectName = 'invoices/2026/document.pdf';

// Streams inline only when the KEY's type is renderable; anything else downloads
const streamUrl = `/assets/buckets/user-uploads/objects/${encodeURIComponent(objectName)}`;

// Forces a browser download dialog via Content-Disposition: attachment, always
const downloadUrl = `/assets/buckets/user-uploads/download/${encodeURIComponent(objectName)}`;
window.open(downloadUrl, '_blank');
```

Both routes validate `bucketName` with `isValidBucketName()` and `objectName` with `isValidObjectKey()`. Both then forward a fixed whitelist of metadata headers - `content-encoding`, `cache-control`, `etag`, `last-modified` - plus `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`.

> [!WARNING]
> `content-type` is not forwarded from storage metadata, and it is not taken from what the uploader declared either. The served type is derived from the object KEY, and anything outside the renderable allow-list is forced to `application/octet-stream` with `Content-Disposition: attachment`. A renderable type a client could choose is stored cross-site scripting on the API origin. See [Header sanitization](./api#header-sanitization) for the allow-list.

> [!TIP]
> `objectName` may embed folder segments, for example `invoices/2026/document.pdf`. Always pass the whole thing through `encodeURIComponent()`. Hono decodes it exactly once before the handler reads it - a second `decodeURIComponent()` on your end is wrong. It can corrupt names that contain a literal `%`.

## List objects in a bucket

```typescript
const url = new URL('/assets/buckets/user-uploads/objects', location.origin);
url.searchParams.set('prefix', 'invoices/2026/');
url.searchParams.set('recursive', 'true'); // only the literal string "true" enables recursion
url.searchParams.set('maxKeys', '50');

const objects = await fetch(url).then(r => r.json());
// [{ name: 'invoices/2026/document.pdf', size: 1024, lastModified: '...', etag: '...' }]
```

`maxKeys`, if provided, must parse to a positive integer (`Number(maxKeys)` checked with `Number.isInteger`) or the endpoint returns `400`.

## Delete an object

```typescript
const objectName = 'invoices/2026/document.pdf';

const { success } = await fetch(
  `/assets/buckets/user-uploads/objects/${encodeURIComponent(objectName)}`,
  { method: 'DELETE' },
).then(r => r.json());
```

> [!NOTE]
> When MetaLink is enabled, the database record deletion is **fire-and-forget**. The response returns as soon as the storage delete completes - it does not wait on the `deleteAll()` call. Deletion errors are logged but never fail the request.

## Sync a MetaLink record manually

`PUT /assets/buckets/:bucketName/meta-links/:objectName` is only registered when `useMetaLink: true`. It re-reads the file's current storage metadata via `helper.getStat()`, then refreshes every existing row for that object, or creates one if none exists.

```typescript
const objectName = 'invoices/2026/document.pdf';

const response = await fetch(
  `/assets/buckets/user-uploads/meta-links/${encodeURIComponent(objectName)}`,
  { method: 'PUT' },
);
const { success, action, count, metaLink, metaLinks } = await response.json();
// action: 'refreshed' when rows for the object existed, 'created' when none did
```

- **Refresh, not overwrite-one.** When rows exist for `(bucketName, objectName)`, every one of them is updated - `mimetype`, `size`, `etag`, and `isSynced: true` always - and each row keeps its own `storageType` and labels (`variant`, `principalType`, `principalId`, `sequence`). One product image attached to the product and to a variant syncs both rows in one call.
- **A `createMetaLink` hook keeps its own `link` and `metadata`.** With `metaLink.createMetaLink` configured, a refresh writes only `mimetype`, `size`, `etag`, `isSynced` - it leaves `link` and `metadata` untouched, because the hook already owns what those fields mean, and a recreate no longer erases an enrichment the hook wrote (dimensions, a placeholder, anything beyond what `getStat()` reports).
- **Without a hook, `metadata` merges per row, and `link` is rewritten.** One statement refreshes `link` plus the stat columns on every row; then one more statement per row merges that row's own `metadata` with the stat's - the stat's keys win, everything else the row had survives. A concurrent write to that row's `metadata` landing between the two statements is lost.
- **Create only when nothing was there to refresh.** The new row goes through the same `createMetaLink` hook an upload uses, so it gets your `storageType` and defaults, not the component's raw guess.
- **`count`** is how many rows were touched; **`metaLinks`** holds all of them; **`metaLink`** is kept for existing callers and is `metaLinks[0]`. `action` is `'refreshed'` or `'created'` - a real OpenAPI enum, not a free string.

Useful for backfilling MetaLink rows for files that already exist in storage, or after a database restore.

## Enable MetaLink tracking

MetaLink persists an upload's bucket, object name, link, mimetype, size, etag, storage type, principal, and variant to Postgres. `BaseMetaLinkModel` and `BaseMetaLinkRepository` cover the schema - you only write a repository subclass and the table.

**1. Repository.** `BaseMetaLinkModel` is used as-is - no model subclass needed:

```typescript
import { repository } from '@venizia/ignis';
import { BaseMetaLinkModel, BaseMetaLinkRepository } from '@venizia/ignis/static-asset';
import { PostgresDataSource } from '@/datasources';

@repository({ model: BaseMetaLinkModel, dataSource: PostgresDataSource })
export class MetaLinkRepository extends BaseMetaLinkRepository {}
```

**2. Table.** `BaseMetaLinkModel` sets `skipMigrate: true`, so create it manually:

```sql
CREATE TABLE "MetaLink" (
  id              TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bucket_name     TEXT NOT NULL,
  object_name     TEXT NOT NULL,
  link            TEXT NOT NULL,
  mimetype        TEXT NOT NULL,
  size            INTEGER NOT NULL,
  etag            TEXT,
  metadata        JSONB,
  storage_type    TEXT NOT NULL,
  is_synced       BOOLEAN NOT NULL DEFAULT false,
  variant         TEXT,
  sequence        INTEGER NOT NULL DEFAULT 0,
  principal_type  TEXT,
  principal_id    TEXT
);

CREATE INDEX "IDX_MetaLink_bucketName" ON "MetaLink"(bucket_name);
CREATE INDEX "IDX_MetaLink_objectName" ON "MetaLink"(object_name);
CREATE INDEX "IDX_MetaLink_storageType" ON "MetaLink"(storage_type);
CREATE INDEX "IDX_MetaLink_isSynced" ON "MetaLink"(is_synced);
CREATE INDEX "IDX_MetaLink_principal_sequence" ON "MetaLink"(principal_type, principal_id, sequence);
```

> [!IMPORTANT]
> The MetaLink type contract checks the **select row** only - the columns above, on whatever table you point `metaLink.model`/`metaLink.repository` at. A column you add of your own must be nullable or carry a default: the component's default insert writes exactly the columns above, so a NOT NULL column with no default passes the type check and then fails every insert the component makes without your own `createMetaLink` hook.

**3. Register the repository and wire it into the component options:**

```typescript
export class Application extends BaseApplication {
  preConfigure() {
    this.repository(MetaLinkRepository);

    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      uploads: {
        controller: { name: 'UploadsController', basePath: '/uploads' },
        storage: StaticAssetStorageTypes.BUN_S3,
        helper: new BunS3Helper({ /* ... */ }),
        useMetaLink: true,
        metaLink: {
          model: BaseMetaLinkModel,
          repository: this.get<MetaLinkRepository>({ key: 'repositories.MetaLinkRepository' }),
        },
      },
    });

    this.component(StaticAssetComponent);
  }
}
```

> [!TIP]
> Call `this.repository(MetaLinkRepository)` before `this.get({ key: 'repositories.MetaLinkRepository' })` - the binding has to exist in the container first.

### Upload straight from the browser

For video and other large files, `directUpload` lets the browser post the bytes to storage while IGNIS only signs the permission - see [Direct upload](./direct-upload).

### Your own MetaLink table

The MetaLink table belongs to your application, so it does not have to be the one IGNIS ships. Put it
under a Postgres schema of your own, or give it another name, and pass the table as the type
argument:

```typescript
const commerceSchema = pgSchema('commerce');

@model({ type: 'entity' })
export class MetaLinkModel extends BaseRelationalEntity<typeof MetaLinkModel.schema> {
  static override schema = commerceSchema.table('MetaLink', { /* the MetaLink columns */ });
}

this.bind<TStaticAssetsComponentOptions<typeof MetaLinkModel.schema>>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({ /* ... */ });
```

What the type checks is the ROW, never the table. A table whose row carries the MetaLink fields is
accepted whatever its name or Postgres schema, and a table missing one of those fields is still
refused before the code runs.

### Custom MetaLink creation

Provide `createMetaLink` on `TMetaLinkConfig` to fully replace the default insert - for example to add extra fields or run validation before persisting.

```typescript
metaLink: {
  model: BaseMetaLinkModel,
  repository: metaLinkRepository,
  createMetaLink: async ({ uploadResult, fileStat, query }) =>
    metaLinkRepository.create({
      data: {
        bucketName: uploadResult.bucket.name,
        objectName: uploadResult.object.key,
        link: uploadResult.link,
        mimetype: fileStat.metadata?.['mimetype'],
        size: fileStat.size,
        etag: fileStat.etag,
        storageType: 'bun-s3',
        isSynced: true,
        principalId: query.principalId ? String(query.principalId) : undefined,
        principalType: query.principalType,
        variant: query.variant,
        sequence: query.sequence,
      },
    }),
},
```

When `createMetaLink` is omitted, the component uses a default insert that covers every standard field.

### Query MetaLink records

```typescript
const userFiles = await metaLinkRepository.find({ filter: { where: { principalType: 'user', principalId: '42' } } });
const thumbnails = await metaLinkRepository.find({ filter: { where: { variant: 'thumbnail' } } });
const pdfs = await metaLinkRepository.find({ filter: { where: { mimetype: 'application/pdf' } } });
```

## Share one bucket between controllers

`controller.keyPrefix` scopes every key a controller touches, and `routes.<key>.enabled: false` drops a built-in route entirely. Together they let two controllers - or two tenants - share one bucket without seeing each other's keys. `keyPrefix` requires `controller.bucket`: without a configured bucket, the four bucket-management routes stay unscoped, so the controller throws at registration rather than isolating only part of its surface.

```typescript
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  tenantA: {
    controller: {
      name: 'TenantAAssets',
      basePath: '/tenant-a/assets',
      bucket: 'shared-uploads',
      keyPrefix: 'tenant-a',
      routes: {
        deleteObject: { enabled: false },
      },
    },
    storage: StaticAssetStorageTypes.BUN_S3,
    helper: bunS3Helper,
  },
  tenantB: {
    controller: {
      name: 'TenantBAssets',
      basePath: '/tenant-b/assets',
      bucket: 'shared-uploads',
      keyPrefix: 'tenant-b',
    },
    storage: StaticAssetStorageTypes.BUN_S3,
    helper: bunS3Helper,
  },
});
```

- `tenantA`'s routes only ever see keys under `tenant-a/` - a request for a `tenant-b/...` key answers `404`, the same as a real miss, and `listObjects` never returns a `tenant-b/` key even without a `prefix` query.
- An upload with no naming hook writes under `tenant-a/` automatically; a `resolveObjectName` or `extra.normalizeNameFn` that returns a key outside the prefix is refused, not rewritten.
- **With no naming hook, the original file name still has to be one segment.** A `keyPrefix` alone does not relax it: `document.pdf` is fine, `folder/document.pdf` is `400 [upload] Invalid original file name`, exactly as it would be without `tenantA`'s prefix at all. Set `resolveObjectName` or `extra.normalizeNameFn` to accept a name carrying `/`.
- `enabled: false` needs no `keyPrefix` - it works on any controller, to drop a route your application does not want exposed at all.
- `keyPrefix` needs `bucket` - the earlier example, and this one, both set it. Leaving `bucket` unset (bucket-in-URL mode) with `keyPrefix` set throws when the controller is defined: the four bucket-management routes cannot be scoped, so `keyPrefix` would isolate only part of the surface.

See [`controller.keyPrefix`](./api#controller-keyprefix) for the full per-route behavior.

## Frontend integration

```typescript
async function uploadFile(
  file: File,
  opts: { principalType?: string; principalId?: string; variant?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);

  const url = new URL('/assets/buckets/user-uploads/objects', location.origin);
  Object.entries(opts).forEach(([key, value]) => value && url.searchParams.set(key, value));

  const [result] = await fetch(url, { method: 'POST', body: formData }).then(r => r.json());
  return result.link;
}

function downloadFile(bucketName: string, objectName: string) {
  window.open(`/assets/buckets/${bucketName}/download/${encodeURIComponent(objectName)}`, '_blank');
}
```

## See also

- [Overview](./) - quick start, imports, and common configuration tasks
- [Full Reference](./api) - request/response schemas, `IStorageHelper` interface, header sanitization, internals
- [Error Reference](./errors) - name validation rules and troubleshooting
