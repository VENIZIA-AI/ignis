---
title: Static Asset Component - Usage & Examples
description: Read, list, delete and track objects - streaming and downloads, MetaLink tracking and sharing one bucket between entries. Uploads have their own pages.
---

# Usage & Examples

Task-oriented patterns for the routes `StaticAssetComponent` generates once a file is stored: reading, listing, deleting and tracking it. To put files in, see [Server upload](./server-upload) and [Direct upload](./direct-upload). All examples assume an entry mounted at `basePath: '/assets'` on one bucket: see [Getting started](./getting-started).

## Stream or download an object

```ts
export const objectUrls = (opts: { objectName: string }) => {
  const encodedName = encodeURIComponent(opts.objectName);

  return {
    // Streams inline only when the KEY's type is renderable; anything else downloads
    stream: `/assets/objects/${encodedName}`,
    // Forces a browser download dialog via Content-Disposition: attachment, always
    download: `/assets/download/${encodedName}`,
  };
};
```

Both routes validate `objectName` with `isValidObjectKey()`, send `ETag` and `Last-Modified` from the storage stat, and honour a `Range` header, so a browser can seek in a video or resume a download.

A request with a matching `If-None-Match` (weak comparison, or `*`), or with no `If-None-Match` and an `If-Modified-Since` that is not older than the object, answers `304` from the stat alone: the object is not read. The routes set no `Cache-Control`; add one in your own middleware if you want browsers to skip the request entirely. For a route of your own, `StaticAssetServe.applyValidators({ ctx, stat })` sets the same two headers and returns `true` when a `304` is due:

```ts
const stat = await helper.getStat({ bucket, object });

if (StaticAssetServe.applyValidators({ ctx, stat })) {
  return new Response(null, {
    headers: ctx.res.headers,
    status: HTTP.ResultCodes.RS_3.NotModified,
  });
}
```

> [!WARNING]
> `content-type` is not taken from storage metadata, and it is not taken from what the uploader declared either. The served type is derived from the object KEY, and anything outside the renderable allow list is forced to a download. See [Security](./security#served-content).

> [!TIP]
> `objectName` may embed folder segments, for example `invoices/2026/document.pdf`. Always pass the whole thing through `encodeURIComponent()`. Hono decodes it exactly once before the handler reads it - a second `decodeURIComponent` throws on `report_100%.pdf`. Or set `rawObjectPath: true` on the entry to serve `/assets/objects/invoices/2026/document.pdf` as written.

Who may read is the entry's [`auth`](./security#authentication-and-authorization): with `publicRead` these two routes need no token, which is how a browser shows an image.

## List objects

```ts
export const listInvoices = async (): Promise<unknown> => {
  const url = new URL('/assets/objects', 'https://api.example.com');

  url.searchParams.set('prefix', 'invoices/2026/');
  url.searchParams.set('recursive', 'true'); // only the literal string "true" enables recursion
  url.searchParams.set('maxKeys', '50');

  const response = await fetch(url);

  // [{ name: 'invoices/2026/document.pdf', size: 1024, lastModified: '...', etag: '...' }]
  return response.json();
};
```

`maxKeys`, if provided, must be a positive integer. Anything else is the standard `422` validation error.

## Delete an object

```ts
export const deleteInvoice = async (): Promise<boolean> => {
  const objectName = 'invoices/2026/document.pdf';

  const response = await fetch(`/assets/objects/${encodeURIComponent(objectName)}`, {
    method: 'DELETE',
  });
  const { success } = (await response.json()) as { success: boolean };

  return success;
};
```

Deleting is idempotent: an object that is already gone answers `200` too. With `metaLink` on, the row is removed after the object, and the response waits for it.

## Sync a MetaLink record manually

`PUT /assets/meta-links/:objectName` is only registered when `metaLink` is switched on. It re-reads the file's current storage metadata via `helper.getStat()`, then refreshes every existing row for that object, or creates one if none exists.

```ts
export const syncMetaLink = async (): Promise<string> => {
  const objectName = 'invoices/2026/document.pdf';

  const response = await fetch(`/assets/meta-links/${encodeURIComponent(objectName)}`, {
    method: 'PUT',
  });
  const { action } = (await response.json()) as { action: 'refreshed' | 'created' };

  // 'refreshed' when rows for the object existed, 'created' when none did
  return action;
};
```

- **Refresh, not overwrite-one.** When rows exist for `(bucketName, objectName)`, every one of them is updated - `mimetype`, `size`, `etag`, and `isSynced: true` always - and each row keeps its own `storageType` and labels (`variant`, `principalType`, `principalId`, `sequence`). One product image attached to the product and to a variant syncs both rows in one call.
- **A `createMetaLink` hook keeps its own `link` and `metadata`.** With `metaLink.createMetaLink` configured, a refresh writes only `mimetype`, `size`, `etag`, `isSynced` - it leaves `link` and `metadata` untouched, because the hook already owns what those fields mean, and a recreate no longer erases an enrichment the hook wrote (dimensions, a placeholder, anything beyond what `getStat()` reports).
- **Without a hook, `metadata` merges per row, and `link` is rewritten.** One statement refreshes `link` plus the stat columns on every row; then one more statement per row merges that row's own `metadata` with the stat's - the stat's keys win, everything else the row had survives. A concurrent write to that row's `metadata` landing between the two statements is lost.
- **Create only when nothing was there to refresh.** The new row goes through the same `createMetaLink` hook an upload uses, so it gets your `storageType` and defaults, not the component's raw guess.
- **`count`** is how many rows were touched; **`metaLinks`** holds all of them; **`metaLink`** is kept for existing callers and is `metaLinks[0]`. `action` is `'refreshed'` or `'created'` - a real OpenAPI enum, not a free string.

Useful for backfilling MetaLink rows for files that already exist in storage, or after a database restore.

## Enable MetaLink tracking

MetaLink persists an upload's bucket, object name, link, mimetype, size, etag, storage type, principal, and variant to Postgres. `BaseMetaLinkModel` and `BaseMetaLinkRepository` cover the schema - you only write a repository subclass that binds them to your datasource. Switch `metaLink` on and every upload writes a row; switch it off and nothing is recorded.

**1. Repository.** `BaseMetaLinkModel` is used as-is - no model subclass needed:

```ts
import { repository } from '@venizia/ignis';
import { BaseMetaLinkModel, BaseMetaLinkRepository } from '@venizia/ignis/static-asset';
import { PostgresDataSource } from '@/datasources';

@repository({ model: BaseMetaLinkModel, dataSource: PostgresDataSource })
export class MetaLinkRepository extends BaseMetaLinkRepository {}
```

**2. Table.** IGNIS generates no migrations, and `BaseMetaLinkModel` is marked `migration: { use: false }` for tooling that reads the registry. Either export its schema from the file your `drizzle-kit` reads (`export const metaLinkTable = BaseMetaLinkModel.schema;`, as `examples/vert/src/migration-schema.ts` does) and generate the migration, or create the table by hand:

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
> The MetaLink type contract checks the **select row** only - the columns above, on whatever table the `metaLink.repository` writes to. A column you add of your own must be nullable or carry a default: the component's default insert writes exactly the columns above, so a NOT NULL column with no default passes the type check and then fails every insert the component makes without your own `createMetaLink` hook.

**3. Register the repository and switch `metaLink` on:**

```ts
import { BaseApplication } from '@venizia/ignis';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { StaticAssetComponent, type TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';
import { MetaLinkRepository } from '@/repositories/meta-link.repository';

export abstract class Application extends BaseApplication {
  override preConfigure(): void {
    this.repository(MetaLinkRepository);

    const options: TStaticAssetComponentOptions = {
      uploads: {
        basePath: '/uploads',
        bucket: 'uploads',
        helper: new BunS3Helper({
          accessKey: 'access-key',
          secretKey: 'secret-key',
          endpoint: { default: 'http://minio:9000' },
        }),
        serverUpload: { use: true },
        directUpload: { use: false },
        metaLink: {
          use: true,
          repository: this.get<MetaLinkRepository>({ key: 'repositories.MetaLinkRepository' }),
        },
      },
    };

    this.component(StaticAssetComponent, { options });
  }
}
```

> [!TIP]
> Call `this.repository(MetaLinkRepository)` before `this.get({ key: 'repositories.MetaLinkRepository' })` - the binding has to exist in the container first.

### Your own MetaLink table

The MetaLink table belongs to your application, so it does not have to be the one IGNIS ships. Put it under a Postgres schema of your own, or give it another name, and pass the table as the type argument:

```typescript
import { pgSchema } from 'drizzle-orm/pg-core';
import { BaseRelationalEntity } from '@venizia/ignis-connectors/postgres';
import { model } from '@venizia/ignis';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

const commerceSchema = pgSchema('commerce');

@model()
export class MetaLinkModel extends BaseRelationalEntity<typeof MetaLinkModel.schema> {
  static override schema = commerceSchema.table('MetaLink', { /* the MetaLink columns */ });
}

export type TCommerceOptions = TStaticAssetComponentOptions<typeof MetaLinkModel.schema>;
```

What the type checks is the ROW, never the table. A table whose row carries the MetaLink fields is accepted whatever its name or Postgres schema, and a table missing one of those fields is still refused before the code runs.

### Custom MetaLink creation

Provide `createMetaLink` on the entry's `metaLink` to fully replace the default insert - for example to add extra fields or run validation before persisting.

```ts
import { StorageTypes } from '@venizia/ignis-helpers';
import type { BaseMetaLinkRepository, TMetaLinkConfig } from '@venizia/ignis/static-asset';

export const buildMetaLink = (opts: {
  repository: BaseMetaLinkRepository;
}): { use: true } & TMetaLinkConfig => ({
  use: true,
  repository: opts.repository,
  createMetaLink: ({ uploadResult, fileStat, labels }) =>
    opts.repository.create({
      data: {
        bucketName: uploadResult.bucket.name,
        objectName: uploadResult.object.key,
        link: uploadResult.link,
        mimetype: fileStat.metadata?.mimetype ?? uploadResult.object.contentType,
        size: fileStat.size,
        etag: fileStat.etag,
        storageType: StorageTypes.BUN_S3,
        isSynced: true,
        principalId: labels.principalId,
        principalType: labels.principalType,
        variant: labels.variant,
        sequence: labels.sequence,
      },
    }),
});
```

When `createMetaLink` is omitted, the component uses a default insert that covers every standard field.

### Query MetaLink records

```ts
import type { BaseMetaLinkRepository } from '@venizia/ignis/static-asset';

export const findFiles = async (opts: { repository: BaseMetaLinkRepository }) => {
  const userFiles = await opts.repository.find({
    filter: { where: { principalType: 'user', principalId: '42' } },
  });
  const thumbnails = await opts.repository.find({ filter: { where: { variant: 'thumbnail' } } });
  const pdfs = await opts.repository.find({ filter: { where: { mimetype: 'application/pdf' } } });

  return { userFiles, thumbnails, pdfs };
};
```

## Share one bucket between entries

`keyPrefix` scopes every key an entry touches, and a route set to `{ use: false }` drops it entirely. Together they let two entries - or two tenants - share one bucket without seeing each other.

```ts
import { Authentication } from '@venizia/ignis';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const buildTenants = (opts: { storage: BunS3Helper }): TStaticAssetComponentOptions => {
  const auth = { authenticate: { strategies: [Authentication.STRATEGY_JWT] } };

  return {
    tenantA: {
      basePath: '/tenant-a/assets',
      helper: opts.storage,
      bucket: 'shared-uploads',
      keyPrefix: 'tenant-a',
      auth,
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      routes: { deleteObject: { use: false } },
    },
    tenantB: {
      basePath: '/tenant-b/assets',
      helper: opts.storage,
      bucket: 'shared-uploads',
      keyPrefix: 'tenant-b',
      auth,
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
    },
  };
};
```

- `tenantA`'s routes only ever see keys under `tenant-a/` - a request for a `tenant-b/...` key answers `404`, the same as a real miss, and `listObjects` never returns a `tenant-b/` key even without a `prefix` query.
- An upload with no `objectKey` writes under `tenant-a/` automatically; an `objectKey` that returns a key outside the prefix is refused, not rewritten.
- **With no `objectKey`, the original file name still has to be one segment.** A `keyPrefix` alone does not relax it: `document.pdf` is fine, `folder/document.pdf` is `400 [upload] Invalid original file name`.
- `routes.<key>: { use: false }` needs no `keyPrefix` - it works on any entry, to drop a route your application does not want exposed at all.
- Two entries on one bucket may both use `directUpload`: each needs its own `keyPrefix`, and they can share the `pending/` prefix, because each entry's pending files sit under its own `keyPrefix`. See [The pending prefix](./security#the-pending-prefix).

See [`keyPrefix`](./api#keyprefix) for the full per-route behavior.

## Frontend integration

```ts
export const downloadUrl = (opts: { objectName: string }): string => {
  return `/assets/download/${encodeURIComponent(opts.objectName)}`;
};

// In the browser: window.open(downloadUrl({ objectName }), '_blank');
```

To send a file, see [Server upload](./server-upload#the-request) and [Direct upload](./direct-upload#the-browser-step-by-step).

## See also

- [Overview](./) - what the component does and which upload to choose
- [Security](./security) - auth, publicRead and served content
- [Configuration reference](./api) - request/response schemas, `IStorageHelper` interface, header sanitization, internals
- [Error Reference](./errors) - name validation rules and troubleshooting
