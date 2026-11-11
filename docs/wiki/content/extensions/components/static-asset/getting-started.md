---
title: Static Asset Component - Getting Started
description: Three complete declarations - public product images on S3, an Excel import with validation, and private reports on disk - each with the routes it exposes and who may call them.
---

# Getting Started

Pick the setup closest to yours, copy the declaration, then change the names. Each one is a complete `TStaticAssetComponentOptions` you register in `preConfigure()`.

| Setup | Files arrive by | Storage | Who reads |
|---|---|---|---|
| [A. Public product images](#a-public-product-images) | `serverUpload` | S3 | anyone |
| [B. An Excel import](#b-an-excel-import-with-validation) | `directUpload` + `validation` | S3 | signed-in users |
| [C. Private reports](#c-private-reports-on-disk) | `serverUpload` | disk | signed-in users |

Not sure which way files should arrive? Read [Two ways a file arrives](./#two-ways-a-file-arrives) first.

## Register the options

All three share this wiring. The key you give each entry (`productImages` below) names its controller and its [service keys](./direct-upload#use-from-a-service).

```ts
import { BaseApplication } from '@venizia/ignis';
import { StaticAssetComponent } from '@venizia/ignis/static-asset';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export abstract class Application extends BaseApplication {
  override preConfigure(): void {
    const options: TStaticAssetComponentOptions = {
      // one entry per bucket - see the three setups below
    };

    this.component(StaticAssetComponent, { options });
  }
}
```

An application that registers components through `configs.artifacts` binds the same object at `StaticAssetBindingKeys.STATIC_ASSET_OPTIONS` instead.

## Create the bucket

The component never creates the bucket, and no route does. Create it once, before the first request. On S3 that is your cloud console or your infrastructure code. On disk, a bucket is a folder under the helper's `basePath`.

```ts
import type { IStorageHelper } from '@venizia/ignis-helpers';

export const ensureBucket = async (opts: {
  helper: IStorageHelper;
  name: string;
}): Promise<void> => {
  const bucket = { name: opts.name };
  const isExisting = await opts.helper.hasBucket({ bucket });

  if (!isExisting) {
    await opts.helper.createBucket({ bucket });
  }
};
```

An upload to a bucket that does not exist answers `400` with `[upload] Bucket does not exist`.

## A. Public product images

Anyone may view an image. Only signed-in users change them. Every upload also writes a MetaLink row, so a product can point at its pictures.

```ts
import { Authentication } from '@venizia/ignis';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { BaseMetaLinkRepository, TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const buildProductImages = (opts: {
  storage: BunS3Helper;
  metaLinkRepository: BaseMetaLinkRepository;
}): TStaticAssetComponentOptions => ({
  productImages: {
    basePath: '/product-images',
    bucket: 'product-images',
    helper: opts.storage,
    auth: {
      authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      publicRead: { use: true },
    },
    serverUpload: { use: true, maxBytes: 5 * 1024 * 1024 },
    directUpload: { use: false },
    metaLink: { use: true, repository: opts.metaLinkRepository },
  },
});
```

| Route | Path | Who may call it |
|---|---|---|
| `getObjectByName` | `GET /product-images/objects/{objectName}` | anyone (`publicRead`) |
| `downloadObjectByName` | `GET /product-images/download/{objectName}` | anyone (`publicRead`) |
| `upload` | `POST /product-images/objects` | JWT |
| `listObjects` | `GET /product-images/objects` | JWT - listing is never public |
| `deleteObject` | `DELETE /product-images/objects/{objectName}` | JWT |
| `recreateMetaLink` | `PUT /product-images/meta-links/{objectName}` | JWT |

Continue with [Server upload](./server-upload).

## B. An Excel import with validation

A user uploads a workbook straight to S3. Your code reads it once, returns cell errors, and a valid file gets a `commitToken`. The server commits with that token; the browser never confirms.

```ts
import { Authentication } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { applicationEnvironment } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
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
  checkWorkbook: (opts: {
    key: string;
    size: number;
    stream: ReadableStream<Uint8Array>;
  }) => Promise<z.infer<typeof CellIssueSchema>[]>;
}): TStaticAssetComponentOptions => ({
  orderImport: {
    basePath: '/order-import',
    bucket: 'imports',
    keyPrefix: 'orders/',
    helper: opts.storage,
    auth: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    serverUpload: { use: false },
    metaLink: { use: false },
    routes: { uploadCommit: { use: false } },
    directUpload: {
      use: true,
      secretKey: applicationEnvironment.get<string>('APP_ENV_UPLOAD_SECRET'),
      maxBytes: 20 * 1024 * 1024,
      resolveOwner: ({ context }) => String(context.get(Authentication.CURRENT_USER).userId),
      validation: StaticAssetValidation.define({
        issueSchema: CellIssueSchema,
        handler: async ({ file }) => {
          const stream = await file.stream();
          const issues = await opts.checkWorkbook({ key: file.key, size: file.size, stream });

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

- There is no `POST /objects` (`serverUpload: { use: false }`) and no `upload-commit` (`routes.uploadCommit: { use: false }`). Your service commits with [`commitService.commit`](./direct-upload#use-from-a-service) once it accepts the file. Pass it the `commitToken` that `upload-validate` returned, not the one the policy issued. The other combinations are in [Who commits, and with which token](./direct-upload#who-commits-and-with-which-token).
- `directUpload.authorize` is left out because `auth` already requires a signed-in user.
- `keyPrefix` is required with `directUpload`. It keeps committed files in `orders/`, and keeps the pending files (under `pending/`) out of everything the routes serve. See [The pending prefix](./security#the-pending-prefix).

Continue with [Direct upload](./direct-upload).

## C. Private reports on disk

Reports are generated and stored for signed-in users only. Nothing is public, and a report is always a download.

```ts
import { Authentication } from '@venizia/ignis';
import { DiskHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const buildReports = (): TStaticAssetComponentOptions => ({
  reports: {
    basePath: '/reports',
    bucket: 'reports',
    keyPrefix: 'monthly/',
    helper: new DiskHelper({ basePath: './app_data' }),
    auth: { authenticate: { strategies: [Authentication.STRATEGY_JWT] } },
    serverUpload: { use: true, maxBytes: 50 * 1024 * 1024 },
    directUpload: { use: false },
    metaLink: { use: false },
    routes: { getObjectByName: { use: false } },
  },
});
```

| Route | Path | Who may call it |
|---|---|---|
| `downloadObjectByName` | `GET /reports/download/{objectName}` | JWT |
| `upload` | `POST /reports/objects` | JWT |
| `listObjects` | `GET /reports/objects` | JWT |
| `deleteObject` | `DELETE /reports/objects/{objectName}` | JWT |

- `routes.getObjectByName: { use: false }` removes inline viewing, so every read is an attachment.
- `keyPrefix` keeps the entry inside `monthly/` of the `reports` bucket.
- The whole upload body is held in memory while it is parsed, so keep `maxBytes` to what your process can hold.
- A `DiskHelper` cannot take `directUpload`: a signed POST policy is an S3 feature, and the types refuse it.

## Next

- [Server upload](./server-upload) and [Direct upload](./direct-upload) - the two ways a file arrives.
- [Security](./security) - what is open by default, and how to close it.
- [Configuration reference](./api) - every option.
