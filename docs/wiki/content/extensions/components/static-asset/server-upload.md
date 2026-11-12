---
title: Static Asset Component - Server Upload
description: Upload files through your application - the multipart request, the serverUpload options, labels into MetaLink, and the response.
---

# Server Upload

With `serverUpload` the browser sends the file to your app, and your app writes it to storage. Switch it on with `{ use: true }`, or off with `{ use: false }`.

```ts
import { DiskHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const options: TStaticAssetComponentOptions = {
  documents: {
    basePath: '/documents',
    bucket: 'documents',
    helper: new DiskHelper({ basePath: './app_data' }),
    serverUpload: { use: true, maxBytes: 10 * 1024 * 1024, maxFiles: 5 },
    directUpload: { use: false },
    metaLink: { use: false },
  },
};
```

The route is `POST /documents/objects`.

> [!NOTE]
> The whole request body is parsed into memory before the first file is written. A file larger than your process can hold belongs in [direct upload](./direct-upload), where the bytes never reach your app. Set `maxBytes` to bound what one request can cost.

## The request

`multipart/form-data`. Send the files in `files` (repeat the field for several), and put the labels in form fields beside them. Labels are read from the body only: a label in the URL is ignored, because an identifier in a query string lands in every access log on the way.

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
| `folderPath` | Target folder under the entry's scope, for example `manuals/2026`. The storage helper checks it against the entry's [`maxFolderDepth`](./api#entry-options). |
| `principalType`, `principalId`, `variant`, `sequence` | Labels written to the MetaLink row. `sequence` is the display order within the principal, and must be an integer. All optional. |

A label that is not the right shape (a `sequence` of `first`, say) is the standard validation error (`422`), and nothing is written.

> [!WARNING]
> The labels are what the client says, not who the client is. A caller can send another user's `principalId`, and the row records it. Do not use them for authorization. When the owner or the labels must be trustworthy, use [direct upload](./direct-upload#resolvers): `resolvers.metadata` runs on your server and its result is signed into the token.

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

`link` is the URL of this controller's own object route, unless you set [`link`](./api#entry-options) on the entry. `metaLink` is present only when `metaLink` is switched on. If the row cannot be written the upload still answers `200` and the entry carries `metaLink: { "error": "META_LINK_CREATE_FAILED" }`: the bytes are stored, only the row is not.

## Options

`serverUpload` takes these beside `use`. All are optional.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `maxBytes` | `number` | no ceiling | Largest file. The route's body limit (`maxFiles` x `maxBytes` plus framing) is checked before the body is read, then each file. A body over the limit answers `413` `core.request.body_too_large`; a file over `maxBytes` answers `413` `core.static_asset.upload_too_large`. |
| `maxFiles` | `number` | `20` | Most file parts one request may carry. More answers `413` before anything is written. |
| `objectKey` | `({ bucket, file, defaultKey }) => string` | `<keyPrefix><folderPath>/<uuid>/<name>` | The one hook that decides the stored key. |

### Choose the stored key

`objectKey` receives the bucket, the file (`originalName`, `folderPath`, ...) and `defaultKey` - what the component would have written, scope included. Keep it, extend it, or ignore it.

```ts
import type { TStaticAssetObjectKeyResolver } from '@venizia/ignis/static-asset';

export const objectKey: TStaticAssetObjectKeyResolver = ({ file, defaultKey }) => {
  const year = new Date().getFullYear();

  return file.folderPath ? defaultKey : `${year}/${defaultKey}`;
};
```

Pass it as `serverUpload: { use: true, objectKey }`. Two rules hold for the default naming:

- It puts a random uuid folder right before the name: `<keyPrefix><folderPath>/<uuid>/<name>`, the shape the direct upload uses. Two uploads of one name never overwrite each other, the folder still groups its keys for listing, and a download still carries the plain name. The uuid folder does not count against `maxFolderDepth`.
- It lowercases the name and replaces spaces with `_`.
- With no `objectKey` hook, the original file name must be one path segment, with or without a `keyPrefix`: a `/` in it is refused with `[upload] Invalid original file name`. An `objectKey` hook lifts that rule, because the key is yours.

Under a `keyPrefix`, a key outside the scope is **refused, never rewritten** (`400 core.static_asset.object_key_out_of_scope`): the application may have recorded that key elsewhere. A hook that prepends a year to a scoped default would land outside the prefix and be refused.

## What is checked, in order

1. The multipart body is within the route's body limit, then parses with at most `maxFiles` files. (`413`)
2. The labels have the right shape. (`422`)
3. Every file is non-empty and within `maxBytes`. (`400`, `413`)
4. The storage helper checks the folder path and its depth. (`400`, `core.storage.folder_path_invalid` or `core.storage.folder_depth_exceeded`)
5. The key is valid and inside the `keyPrefix`. (`400`)
6. The storage writes the object, then the MetaLink row.

A request that fails at any step writes nothing.

## Turn it off

`serverUpload: { use: false }` removes `POST /objects`. Use it when files arrive by [direct upload](./direct-upload) only, or when your own code writes objects.

**Files:**

- [`packages/core-server/src/components/static-asset/controller/routes/upload.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/routes/upload.ts) - the upload route
- [`packages/core-server/src/components/static-asset/utilities/entry.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/utilities/entry.utility.ts) - the defaults
