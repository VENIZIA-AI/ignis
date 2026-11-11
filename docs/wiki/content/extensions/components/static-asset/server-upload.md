---
title: Static Asset Component - Server Upload
description: Upload files through your application - the multipart request, the serverUpload options, labels into MetaLink, and the response.
---

# Server Upload

With `serverUpload` the browser sends the file to your app, and your app writes it to storage. It is on by default; configure it, or set it to `false` to turn the route off.

```ts
import { DiskHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const options: TStaticAssetComponentOptions = {
  documents: {
    basePath: '/documents',
    bucket: 'documents',
    helper: new DiskHelper({ basePath: './app_data/documents' }),
    serverUpload: { maxBytes: 10 * 1024 * 1024, maxFiles: 5 },
  },
};
```

The route is `POST /documents/objects`. Without `bucket` it is `POST /documents/buckets/{bucketName}/objects`.

## The request

`multipart/form-data`. Send the files in `files` (repeat the field for several), and put the labels in form fields beside them, never in the URL: an identifier in a query string lands in every access log on the way, so the route refuses it.

```ts
export const uploadDocuments = async (opts: {
  files: File[];
  productId: string;
  token: string;
}): Promise<Response> => {
  const form = new FormData();

  for (const file of opts.files) {
    form.append('files', file);
  }

  form.append('principalType', 'Product');
  form.append('principalId', opts.productId);
  form.append('variant', 'manual');
  form.append('sequence', '0');
  form.append('folderPath', 'manuals/2026');

  return fetch('/documents/objects', {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.token}` },
    body: form,
  });
};
```

| Field | Meaning |
|---|---|
| `files` | The file or files to store. Required. |
| `folderPath` | Target folder under the bucket, for example `manuals/2026`. Counts against `maxFolderDepth`. |
| `principalType`, `principalId`, `variant`, `sequence` | Labels written to the MetaLink row. `sequence` is the display order within the principal. All optional. |

A label in the query string answers `400` with `core.static_asset.labels_in_query`.

## The response

One entry per file, in the order sent:

```json
[
  {
    "bucket": { "name": "documents" },
    "object": { "key": "manuals/2026/guide.pdf", "size": 48213, "contentType": "application/pdf" },
    "link": "/documents/objects/manuals%2F2026%2Fguide.pdf",
    "metaLink": { "data": { "id": "..." } }
  }
]
```

`link` is the URL of this controller's own object route, unless you set `url.link`. `metaLink` is present only when the entry has a `metaLink` table. If the row cannot be written the upload still answers `200` and the entry carries `metaLink: { "error": "META_LINK_CREATE_FAILED" }`: the bytes are stored, only the row is not.

## Options

`serverUpload` takes these. All are optional.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `maxBytes` | `number` | no ceiling | Largest file. Checked against `content-length` before the body is read, then per file. Over it answers `413` with `core.static_asset.upload_too_large`. |
| `maxFiles` | `number` | `20` | Most file parts one request may carry. More answers `413` before anything is written. |
| `maxFolderDepth` | `number` | `2` | Folder nesting allowed in `folderPath`, for every route of the entry. The `keyPrefix` folders do not count. |
| `spool` | `{ storage: 'memory' }` or `{ storage: 'disk'; dir: string }` | memory | Where the body waits while it is parsed. Use disk for large files. |
| `objectKey` | `({ bucket, file, defaultKey }) => string` | the default name | The one hook that decides the stored key. |

Use `MultipartStorages.MEMORY` and `MultipartStorages.DISK` from `@venizia/ignis-helpers` for the `storage` value.

### Park large bodies on disk

```ts
import { MultipartStorages } from '@venizia/ignis-helpers';
import type { TStaticAssetServerUpload } from '@venizia/ignis/static-asset';

export const serverUpload: TStaticAssetServerUpload = {
  maxBytes: 200 * 1024 * 1024,
  spool: { storage: MultipartStorages.DISK, dir: './app_data/spool' },
};
```

The spool files are removed after every request, a failed one included.

### Choose the stored key

`objectKey` receives the bucket, the file (`originalName`, `folderPath`, ...) and `defaultKey` - what the component would have written, scope included. Keep it, extend it, or ignore it.

```ts
import type { TStaticAssetServerUpload } from '@venizia/ignis/static-asset';

export const serverUpload: TStaticAssetServerUpload = {
  objectKey: ({ file, defaultKey }) => {
    const year = new Date().getFullYear();

    return file.folderPath ? defaultKey : `${year}/${defaultKey}`;
  },
};
```

Two rules hold for the default naming:

- It lowercases the name and replaces spaces with `_`.
- Under a `keyPrefix`, the original file name must be one path segment: a `/` in it is refused with `[upload] Invalid original file name`. An `objectKey` hook lifts that rule, because the key is yours.

Under a `keyPrefix`, a key outside the scope is **refused, never rewritten** (`400 core.static_asset.object_key_out_of_scope`): the application may have recorded that key elsewhere. A hook that prepends a year to a scoped default would land outside the prefix and be refused.

## What is checked, in order

1. The bucket name is valid. (`400`)
2. No label is in the query. (`400`)
3. The multipart body parses, and has at most `maxFiles` files. (`413`)
4. The folder path is valid and within `maxFolderDepth`. (`400`)
5. Every file is non-empty and within `maxBytes`. (`400`, `413`)
6. The key is valid and inside the `keyPrefix`. (`400`)
7. The storage writes the object, then the MetaLink row.

A request that fails at any step writes nothing and leaves no spool file.

## Turn it off

`serverUpload: false` removes `POST /objects`. Use it when files arrive by [direct upload](./direct-upload) only, or when your own code writes objects.

**Files:**

- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts) - the upload route
- [`packages/core-server/src/components/static-asset/utilities/entry.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/entry.utility.ts) - the defaults
