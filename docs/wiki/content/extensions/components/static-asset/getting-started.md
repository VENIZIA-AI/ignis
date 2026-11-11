---
title: Static Asset Component - Getting Started
description: Three complete declarations - public product images, an Excel import with validation, and private reports on disk - each with the routes it exposes and who may call them.
---

# Getting Started

Pick the setup closest to yours, copy the declaration, then change the names. Each one is a complete `TStaticAssetComponentOptions` you register in `preConfigure()`.

| Setup | Files arrive by | Storage | Who reads |
|---|---|---|---|
| [A. Public product images](#a-public-product-images) | `serverUpload` | disk | anyone |
| [B. An Excel import](#b-an-excel-import-with-validation) | `directUpload` + `validation` | S3 | signed-in users |
| [C. Private reports](#c-private-reports-on-disk) | `serverUpload` | disk | signed-in users |

Not sure which way files should arrive? Read [Choosing a setup](./#two-ways-a-file-arrives) first.

## Register the options

All three share this wiring. The key you give each entry (`productImages` below) names its controller and its [service keys](./direct-upload#use-from-a-service).

```ts
import { BaseApplication } from '@venizia/ignis';
import { StaticAssetComponent } from '@venizia/ignis/static-asset';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export abstract class Application extends BaseApplication {
  override preConfigure(): void {
    const options: TStaticAssetComponentOptions = {
      // one entry per storage backend - see the three setups below
    };

    this.component(StaticAssetComponent, { options });
  }
}
```

An application that registers components through `configs.artifacts` binds the same object at `StaticAssetBindingKeys.STATIC_ASSET_OPTIONS` instead.

## A. Public product images

Anyone may view an image. Only signed-in users change them. Every upload also writes a MetaLink row, so a product can point at its pictures.

```ts
import { Authentication } from '@venizia/ignis';
import { DiskHelper } from '@venizia/ignis-helpers';
import { BaseMetaLinkModel } from '@venizia/ignis/static-asset';
import type { BaseMetaLinkRepository, TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const buildProductImages = (opts: {
  metaLinkRepository: BaseMetaLinkRepository;
}): TStaticAssetComponentOptions => ({
  productImages: {
    basePath: '/product-images',
    helper: new DiskHelper({ basePath: './app_data/product-images' }),
    auth: {
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      publicRead: true,
    },
    serverUpload: { maxBytes: 5 * 1024 * 1024 },
    metaLink: { model: BaseMetaLinkModel, repository: opts.metaLinkRepository },
  },
});
```

| Route | Path | Who may call it |
|---|---|---|
| `getObjectByName` | `GET /product-images/buckets/{bucketName}/objects/{objectName}` | anyone (`publicRead`) |
| `downloadObjectByName` | `GET /product-images/buckets/{bucketName}/download/{objectName}` | anyone (`publicRead`) |
| `upload` | `POST /product-images/buckets/{bucketName}/objects` | JWT |
| `listObjects` | `GET /product-images/buckets/{bucketName}/objects` | JWT - listing is never public |
| `deleteObject` | `DELETE /product-images/buckets/{bucketName}/objects/{objectName}` | JWT |
| `recreateMetaLink` | `PUT /product-images/buckets/{bucketName}/meta-links/{objectName}` | JWT |

The four bucket-management routes are off. Add `bucket: 'product-images'` to drop `/buckets/{bucketName}` from every path above. Continue with [Server upload](./server-upload).

## B. An Excel import with validation

A user uploads a workbook straight to S3. Your code reads it, returns cell errors, and only a valid file is committed. The server commits; the browser never confirms.

```ts
import { Authentication } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { StaticAssetValidation } from '@venizia/ignis/static-asset';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

const CellIssueSchema = z.object({
  sheet: z.string(),
  row: z.number().int(),
  column: z.string(),
  code: z.string(),
  message: z.string(),
});

export const buildOrderImport = (opts: {
  storage: BunS3Helper;
  checkWorkbook: (opts: { fileStream: NodeJS.ReadableStream }) => Promise<z.infer<typeof CellIssueSchema>[]>;
}): TStaticAssetComponentOptions => ({
  orderImport: {
    basePath: '/order-import',
    helper: opts.storage,
    bucket: 'imports',
    auth: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    serverUpload: false,
    routes: { uploadCommit: false },
    directUpload: {
      secretKey: applicationEnvironment.get<string>('APP_ENV_UPLOAD_SECRET'),
      maxBytes: 20 * 1024 * 1024,
      resolveOwner: ({ context }) => String(context.get(Authentication.CURRENT_USER).userId),
      validation: StaticAssetValidation.define({
        issueSchema: CellIssueSchema,
        handler: async ({ bucket, object, helper }) => {
          const fileStream = await helper.getObject({ bucket, object });
          const issues = await opts.checkWorkbook({ fileStream });

          return { isValid: issues.length === 0, issues };
        },
      }),
    },
  },
});
```

| Route | Path | Who may call it |
|---|---|---|
| `uploadPolicy` | `POST /order-import/upload-policy` | JWT |
| `uploadValidate` | `POST /order-import/upload-validate` | JWT |
| `getObjectByName`, `downloadObjectByName`, `listObjects`, `deleteObject` | under `/order-import/objects` and `/order-import/download` | JWT |

There is no `POST /objects` (`serverUpload: false`) and no `upload-commit` (`routes.uploadCommit: false`): your service commits with [`commitService.commit`](./direct-upload#use-from-a-service) once it accepts the file. `directUpload.authorize` is left out because `auth` already requires a signed-in user. Continue with [Direct upload](./direct-upload).

## C. Private reports on disk

Reports are generated and stored for signed-in users only. Nothing is public, and a report is always a download.

```ts
import { Authentication } from '@venizia/ignis';
import { DiskHelper, MultipartStorages } from '@venizia/ignis-helpers';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const buildReports = (): TStaticAssetComponentOptions => ({
  reports: {
    basePath: '/reports',
    helper: new DiskHelper({ basePath: './app_data/reports' }),
    bucket: 'reports',
    keyPrefix: 'monthly',
    auth: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    serverUpload: {
      maxBytes: 50 * 1024 * 1024,
      spool: { storage: MultipartStorages.DISK, dir: './app_data/spool' },
    },
    routes: { getObjectByName: false },
  },
});
```

| Route | Path | Who may call it |
|---|---|---|
| `downloadObjectByName` | `GET /reports/download/{objectName}` | JWT |
| `upload` | `POST /reports/objects` | JWT |
| `listObjects` | `GET /reports/objects` | JWT |
| `deleteObject` | `DELETE /reports/objects/{objectName}` | JWT |

`routes.getObjectByName: false` removes inline viewing, so every read is an attachment. `keyPrefix` keeps the entry inside `monthly/` of the shared `reports` bucket. `spool.dir` parks large bodies on disk while they are parsed instead of in memory. A `DiskHelper` cannot take `directUpload`: a signed POST policy is an S3 feature, and the types refuse it.

## Next

- [Server upload](./server-upload) and [Direct upload](./direct-upload) - the two ways a file arrives.
- [Security](./security) - what is open by default, and how to close it.
- [Configuration reference](./api) - every option.
