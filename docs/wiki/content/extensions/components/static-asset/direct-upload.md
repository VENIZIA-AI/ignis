---
title: Direct upload
description: Let the browser PUT bytes straight to storage. One route signs the permission; what to configure, what the browser does, and why each safeguard is there.
---

# Direct upload

Every upload through `POST {base}/objects` travels twice - browser to IGNIS, IGNIS to storage - and the
backend holds the whole file while it does. For a few megabytes that is the right model and this page
is not for you.

For video and other large files, set `controller.directUpload`: the browser PUTs the bytes to a signed
URL and your process never sees them.

> [!NOTE]
> **Changed on 2026-11-10.** Direct upload used to be a POST policy plus a commit route
> (`upload-policy`, `upload-commit`). Both routes are gone: the route is now `POST {base}/upload-presign`
> and the upload is a **presigned PUT**. There is no commit route - the application keeps the object
> by [settling](./presign-and-proxy#settling) it once the record that owns it is saved.
> See the [changelog](/changelogs/2026-11-10-static-asset-presigned-uploads-tokens-and-proxy).

```ts
application.component(StaticAssetComponent, {
  options: {
    assets: {
      controller: {
        name: 'AssetController',
        basePath: '/assets',
        bucket: 'uploads',              // required: a presign names one bucket
        directUpload: {
          authorize: ({ context }) => {
            const user = context.get('currentUser');

            return user ? { tenantId: user.tenantId } : false;
          },
          presign: AssetPresignService.build({ /* see Presigned Uploads */ }),
        },
      },
      storage: StaticAssetStorageTypes.BUN_S3,
      helper: storageHelper,
    },
  },
});
```

One route appears, `POST {base}/upload-presign` (`routes.uploadPresign` in `controller.routes`,
overridable, with its own `enabled` switch). Leave `directUpload` out and it does not exist.

The route is a thin layer over [`AssetPresignService`](./presign-and-proxy): authorize, map the request
into files and a context, presign, map the answer. Extensions, size ceiling, file count, the key, the
token, the signed headers and the URL rewrite are all configured on the presign service.

## The round trips

```
1. browser -> IGNIS    POST {base}/upload-presign   { files: [{ fileName, contentType?, size }] }
                    <- [{ preSignUrl, fileKeyToken, key }]

2. browser -> STORAGE  PUT preSignUrl                  (IGNIS sees no byte; the body is exactly `size` bytes)

3. browser -> YOUR API  (any route) { fileKeyToken }   -> your service verifies the token and settles the object
```

Step 3 is yours. Storage tells your backend nothing, so the token the browser hands back is how a record
(an order, a ticket, a user) names the file. Verify it with `AssetCommitToken.verify` and keep the object
with `AssetSettleService.settle`; an object nobody settles is left to the storage's lifecycle rule.

## What the browser does

```js
const [file] = await fetch('/assets/upload-presign', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    files: [{ fileName: input.name, contentType: input.type, size: input.size }],
  }),
}).then(response => response.json());

await fetch(file.preSignUrl, {
  method: 'PUT',
  headers: { 'content-type': 'application/octet-stream', 'x-amz-tagging': 'temp=true' },
  body: input,
});

// then send file.fileKeyToken to the API that owns the record
```

The headers the URL signs must be sent exactly as signed (see `signedContentType` and `tagging` on the
presign service); storage answers 403 otherwise.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `authorize` | `({ context }) => ValueOrPromise<TContext \| false \| null \| undefined>` | - | **Required.** Who may ask, and as whom. A falsy answer is `403` `core.static_asset.upload_not_authorized` and the storage is not touched. The context reaches `request.toInput`, `resolvePath` and `response.map`. |
| `presign` | `AssetPresignService` (or any object with its `presign` method) | - | **Required.** Prepares the uploads. An object of your own can wrap the service to answer its refusals in the application's own error codes. |
| `request` | `{ schema, toInput }` | body `{ files: [{ fileName, contentType?, size }] }` | How the body becomes files and a context. `schema` is published in the OpenAPI document; `toInput` may throw the application's own error to refuse. |
| `response` | `{ schema, map }` | `[{ preSignUrl, fileKeyToken, key }]` | How the results become the response body. |

`controller.keyPrefix` does **not** combine with `directUpload`: the key comes from the presign service,
so registering a controller with both throws rather than leave a scope that silently does not apply.

## The safeguards, and what each is for

**`authorize` is required, not defaulted.** This route hands out a write credential; there is no safe
default for who may ask, so the type system makes you decide.

**The key is the server's.** The presign service decides the folder and a generated name; the client
only announces names and sizes.

**The URL pins what the client announced.** Size, content type and tags are signed: the holder cannot
upload more, another type or other tags. A presigned PUT has no size *range*, unlike a POST policy, and
it is reusable until it expires - verify the size again where the token is read.

**The token carries no business fields.** Which order or tenant an upload belongs to is your
authorization, and a token IGNIS signs is the wrong place to keep it.

## Behind a private endpoint

`host` is inside every SigV4 signature, so the URL your browser receives cannot be rewritten
afterwards. Give the helper both hosts (`endpoint.default` for this process, `endpoint.public` for the
browser), or sign for the storage and rewrite with `rewriteUrl` to a [proxy](./presign-and-proxy#the-proxy).

## When step 2 answers 403

| Cause | Check |
|---|---|
| A signed header is missing or different | `content-type`, `content-length` and `x-amz-tagging` must be the signed values |
| The body is not exactly `size` bytes | the size announced in step 1 |
| The bucket refuses cross-origin PUT | your bucket's (or the proxy's `cors`) rules |
| The URL expired | `expiresIn` on the presign service |

**Files:**

- [`packages/core-server/src/components/static-asset/service/presign.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/service/presign.ts) - `AssetPresignService`
- [`packages/core-server/src/components/static-asset/common/commit-token.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/commit-token.ts) - `AssetCommitToken`
