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

Every `bucketName` is validated with `isValidName()` - single segment, no `..`/`/`/`\`, no shell metacharacters, 255 characters or fewer. See [Error Reference](./errors) for the full rule set.

## Upload files

`POST /assets/buckets/:bucketName/upload` accepts `multipart/form-data`, plus optional `principalType`, `principalId`, `variant`, and `folderPath` query parameters.

```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

const response = await fetch(
  '/assets/buckets/user-uploads/upload?principalType=user&principalId=42&variant=original&folderPath=invoices/2026',
  { method: 'POST', body: formData },
);

const [result] = await response.json();
// { bucketName: 'user-uploads', objectName: 'invoices/2026/document.pdf', link: '/assets/buckets/user-uploads/objects/invoices%2F2026%2Fdocument.pdf' }
```

- **`folderPath` is validated separately from the filename.** Each segment must pass `isValidName()`, and the segment count must not exceed `maxFolderDepth` (default `2`) - both return `400` before the file is even parsed.
- **`principalId` is always stored as a string**, coerced with `String()` regardless of whether you send a number or a string.
- With MetaLink enabled, the response also carries `metaLink` (the created database record) or, if that write failed, `metaLink: null` plus a `metaLinkError` string - **the upload itself still succeeds either way**.

## Stream or download an object

```typescript
const objectName = 'invoices/2026/document.pdf';

// Inline stream - Content-Type comes from storage metadata, falls back to application/octet-stream
const streamUrl = `/assets/buckets/user-uploads/objects/${encodeURIComponent(objectName)}`;

// Forces a browser download dialog via Content-Disposition: attachment
const downloadUrl = `/assets/buckets/user-uploads/download/${encodeURIComponent(objectName)}`;
window.open(downloadUrl, '_blank');
```

Both routes validate `bucketName` with `isValidName()` and `objectName` with `isValidPath()`, then forward a fixed whitelist of metadata headers (`content-type`, `content-encoding`, `cache-control`, `etag`, `last-modified`) plus `X-Content-Type-Options: nosniff`. See [Header Sanitization](./api#header-sanitization) for the full list and why it exists.

> [!TIP]
> `objectName` may embed folder segments (`invoices/2026/document.pdf`) - always pass the whole thing through `encodeURIComponent()`. Hono decodes it exactly once before the handler reads it, so a second `decodeURIComponent()` on your end is wrong and can corrupt names containing a literal `%`.

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
> When MetaLink is enabled, the database record deletion is **fire-and-forget** - the response returns as soon as the storage delete completes, without waiting on the `deleteAll()` call. Deletion errors are logged but never fail the request.

## Sync a MetaLink record manually

`PUT /assets/buckets/:bucketName/meta-links/:objectName` is only registered when `useMetaLink: true`. It re-reads the file's current storage metadata via `helper.getStat()` and creates or updates the matching MetaLink row.

```typescript
const objectName = 'invoices/2026/document.pdf';

const response = await fetch(
  `/assets/buckets/user-uploads/meta-links/${encodeURIComponent(objectName)}`,
  { method: 'PUT' },
);
const { success, metaLink } = await response.json();
```

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
  principal_type  TEXT,
  principal_id    TEXT
);

CREATE INDEX "IDX_MetaLink_bucketName" ON "MetaLink"(bucket_name);
CREATE INDEX "IDX_MetaLink_objectName" ON "MetaLink"(object_name);
CREATE INDEX "IDX_MetaLink_storageType" ON "MetaLink"(storage_type);
CREATE INDEX "IDX_MetaLink_isSynced" ON "MetaLink"(is_synced);
```

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
        storage: StaticAssetStorageTypes.MINIO,
        helper: new MinioHelper({ /* ... */ }),
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

### Custom MetaLink creation

Provide `createMetaLink` on `TMetaLinkConfig` to fully replace the default insert - e.g. to add extra fields or run validation before persisting.

```typescript
metaLink: {
  model: BaseMetaLinkModel,
  repository: metaLinkRepository,
  createMetaLink: async ({ uploadResult, fileStat, query }) =>
    metaLinkRepository.create({
      data: {
        bucketName: uploadResult.bucketName,
        objectName: uploadResult.objectName,
        link: uploadResult.link,
        mimetype: fileStat.metadata?.['mimetype'],
        size: fileStat.size,
        etag: fileStat.etag,
        storageType: 'minio',
        isSynced: true,
        principalId: query.principalId ? String(query.principalId) : undefined,
        principalType: query.principalType,
        variant: query.variant,
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

## Frontend integration

```typescript
async function uploadFile(
  file: File,
  opts: { principalType?: string; principalId?: string; variant?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);

  const url = new URL('/assets/buckets/user-uploads/upload', location.origin);
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
