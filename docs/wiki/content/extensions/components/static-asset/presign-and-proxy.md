---
title: Static Asset Component - Presigned Uploads, File Tokens and the Proxy
description: Prepare presigned PUT uploads, sign and verify the file tokens a client hands back, settle uploads by retagging, bind all three into a service that serves no asset route, and put a proxy in front of presigned storage URLs
difficulty: intermediate
---

# Presigned Uploads, File Tokens and the Proxy

Besides the routes of [`StaticAssetComponent`](./), the `@venizia/ignis/static-asset` entry has building blocks a service can use **without serving any asset route**: a file token, a presigned PUT upload, a settle step, and a proxy for presigned URLs. Everything particular to an application (the folder, the payload of the token, the format, the tags, the extensions) is an option; IGNIS holds neutral defaults.

| Block | Does |
| --- | --- |
| `AssetCommitToken` | signs and verifies the token a client hands back to name a file; the same class the `directUpload` commit route uses |
| `AssetPresignService` | checks what a client announces, decides the key, signs a PUT URL and a token |
| `AssetSettleService` | keeps an upload by replacing its tags |
| `AssetServicesComponent` | binds the three by name into the container, with no route |
| `controller.proxy` | forwards presigned storage requests when the storage is not reachable by the browser |

## In one example

```typescript
import {
  AssetCommitToken,
  AssetPresignService,
  AssetSettleService,
  AssetTokenCodecs,
} from '@venizia/ignis/static-asset';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

interface IFilePayload {
  key: string;
  size: number;
  ownerId?: string;
  expiresAt: number;
}

const helper = new BunS3Helper({
  endpoint: { default: 'http://localhost:9000' },
  accessKey: 'access-key',
  secretKey: 'secret-key',
});

const token = new AssetCommitToken<IFilePayload>({
  secretKey: 'a-long-random-secret',
  codec: AssetTokenCodecs.signedJson<IFilePayload>({
    isPayload: (value): value is IFilePayload =>
      typeof value === 'object' && value !== null && 'key' in value && 'expiresAt' in value,
  }),
  expiresAtOf: ({ payload }) => payload.expiresAt,
  ownerOf: ({ payload }) => payload.ownerId,
});

const presign = AssetPresignService.build<IFilePayload, { tenantId: string }>({
  helper,
  bucket: 'uploads',
  token,
  allowedExtensions: ['.png', '.jpg', '.xlsx'],
  maxBytes: 10 * 1024 * 1024,
  resolvePath: ({ context }) => `tenants/${context.tenantId}`,
  buildPayload: ({ key, file, issuedAt, ownerId }) => ({
    key,
    size: file.size,
    ownerId,
    expiresAt: issuedAt + 60 * 60 * 1000,
  }),
  tagging: { pending: 'true' },
  signedContentType: 'application/octet-stream',
});

const settle = AssetSettleService.build({ helper, bucket: 'uploads', tags: { pending: 'false' } });

// 1. The client announces its files and gets one URL and one token for each.
const [prepared] = await presign.presign({
  files: [{ fileName: 'menu.xlsx', contentType: 'application/octet-stream', size: 2048 }],
  context: { tenantId: 't1' },
  ownerId: 'user-1',
});

// 2. The client PUTs the bytes to prepared.preSignUrl, then names the file with prepared.fileKeyToken.
// 3. The server reads the token (it must be the same user's), then keeps the upload.
const file = token.verify({ token: prepared?.fileKeyToken ?? '', ownerId: 'user-1' });
await settle.settle({ keys: [file.key] });
```

## File tokens

`AssetCommitToken` is the class behind the file tokens of `directUpload`. Its static `build` and `read` keep their signatures, and a token with the default payload (`{ bucket, key, expiresAt }`) is written and read as before. An instance adds what a service with a token of its own needs:

- **`codec`** is the format. `AssetTokenCodecs.signedJson({ isPayload })` is the default: `base64url(JSON) + '.' + base64url(HMAC-SHA256)`, compared in constant time through `Hash.equals`. An application that must keep a token format already in the wild passes a codec of its own with `encode` and `decode` (`decode` answers `null` for anything it cannot trust).
- **`expiresAtOf`** reads when the token stops being good, so the expiry can be `issuedAt + ttl` as well as a field.
- **`ownerOf`** binds a token to the user it was issued for: `verify({ token, ownerId })` refuses another owner, a missing `ownerId` and a token with no owner.
- **`validate`** checks the payload of a token that is genuine, owned and alive (an extension, a size). Throw your own error.
- **`errors`** replaces `INVALID_COMMIT_TOKEN` and `EXPIRED_COMMIT_TOKEN`.

`verify` checks the signature, then the owner, then the expiry, then `validate`. Whatever fails the first two is `INVALID`, so an expired token of someone else is not reported as expired. `verifyMany` reads a list and throws on the first token that fails. A secret that is empty is refused when the instance is built.

A payload other than the default needs its own `codec` and `expiresAtOf`; the types require them.

## Presigned uploads

`AssetPresignService.presign({ files, context, ownerId })` returns `{ preSignUrl, fileKeyToken, key }` for each file, and signs nothing unless every file passes:

| Option | Decides |
| --- | --- |
| `allowedExtensions`, `maxBytes`, `maxFiles` | what may be announced; the extension is read from the name in lower case |
| `resolvePath({ file, extension, context })` | the folder of the key, from the context you pass to `presign`; `''` (the default) is the root. IGNIS never takes it from the client |
| `resolveName({ file, extension })` | the stored name; default is a v4 uuid plus the extension |
| `buildPayload(...)` | the payload of the token of one file |
| `tagging`, `signedContentType`, `expiresIn` | what the URL pins; see below |
| `rewriteUrl({ url })` | rewrites the URL after it is signed, e.g. to send the browser through the proxy |
| `maxFolderDepth` | the deepest folder nesting `isValidObjectKey` accepts; a tenant path is often deeper than the helper's default |
| `errors` | the definitions thrown, by name |

The signed URL pins the size (`content-length`), the content type and the tags: the holder cannot change them. That is less than a POST policy gives. A presigned PUT has no size range, so what was announced is what is allowed, and the announced size is the client's word until the storage enforces the signed length. Verify the size again where the token is read (`validate`). `signedContentType` signs a type of your choice, so the holder cannot choose the stored type; without it the announced type is signed. Use the `directUpload` routes when a size range matters more than keeping a PUT flow.

A key that does not pass `isValidObjectKey` (a `..` segment, a folder deeper than `maxFolderDepth`) is refused with `core.static_asset.object_name_invalid`.

## Settling

The object is written straight to its final key with a pending tag. `AssetSettleService.settle({ keys, tags? })` replaces the tags with the configured ones, merged with `tags` of the call. Every key is tried, and the first failure is thrown afterwards, so one bad object does not leave the others pending. An object that is never settled keeps the pending tag, which is what a lifecycle rule collects. Uploads that wait under a pending prefix and are copied into place are what the `directUpload` routes do.

## Binding without a route

`AssetServicesComponent` binds the instances you built into the container by name, so a service that only verifies a token or settles an upload injects them:

```typescript
import {
  AssetServiceBindingKeys,
  AssetServicesComponent,
  type TAssetServicesComponentOptions,
} from '@venizia/ignis/static-asset';
import { BaseApplication } from '@venizia/ignis';
import { AssetCommitToken, AssetSettleService } from '@venizia/ignis/static-asset';

declare const token: AssetCommitToken;
declare const settle: AssetSettleService;

export class Application extends BaseApplication {
  preConfigure() {
    this.component<AssetServicesComponent, TAssetServicesComponentOptions>(AssetServicesComponent, {
      options: { attachments: { token, settle } },
    });
  }
}

export const tokenKey = AssetServiceBindingKeys.token({ name: 'attachments' });
// @inject({ key: tokenKey }) in the service that needs it
```

An entry that gives none of `token`, `presign` and `settle` is refused.

## The proxy

Set `controller.proxy` on an entry and the component registers `PUT` and `GET` on `{basePath}{path}/<storage path>` (and `OPTIONS` when `cors` is set). Use it when the browser cannot reach the storage endpoint: sign the URL for the storage, rewrite it to the proxy with `rewriteUrl`, and the proxy forwards the request.

```typescript
import { StaticAssetStorageTypes, type TStaticAssetsComponentOptions } from '@venizia/ignis/static-asset';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';

export const options: TStaticAssetsComponentOptions = {
  files: {
    controller: {
      name: 'FileController',
      basePath: '/files',
      bucket: 'uploads',
      proxy: {
        enable: true,
        upstreamEndpoint: 'http://minio.internal:9000',
        path: '/upload',
        cors: { allowOrigin: 'https://app.example.com' },
      },
    },
    storage: StaticAssetStorageTypes.BUN_S3,
    helper: new BunS3Helper({
      endpoint: { default: 'http://minio.internal:9000' },
      accessKey: 'access-key',
      secretKey: 'secret-key',
    }),
  },
};
```

| Option | Decides |
| --- | --- |
| `enable` | the flag; `false` registers nothing |
| `upstreamEndpoint` | where requests are forwarded, read per request |
| `path` | the route path under the base path (default `/proxy`) |
| `allowedPathPrefixes` | the storage paths a request may reach; default `/{bucket}/` of `controller.bucket`; with neither, registering the controller throws |
| `forwardRequestHeaders` | the request headers passed on (default `content-type`, `content-length`, `x-amz-tagging`); every other header is dropped |
| `cors` | `allowOrigin`, `allowHeaders`, `exposeHeaders`; absent, no CORS header is set |
| `timeoutMs` | gives up on the storage (default 10 minutes) |
| `errorResponse({ reason, request })` | answers the proxy's own failures (`reason` is `PATH_REFUSED` or `UPSTREAM_FAILED`) with a `Response` of the application's choosing, e.g. a plain `404` / `502` for a browser that cannot read a JSON code; return `undefined` to keep the default error answer. The `Response` carries no CORS header of its own |

> [!WARNING]
> The proxy route carries **no authentication**. The storage signature in the URL is the authentication, and the proxy forwards the request untouched, so a request the storage refuses is refused there. What the proxy limits is where it forwards (dot segments are resolved before the prefix check, so `..` cannot climb out of the bucket) and which headers it passes on. A response `set-cookie` is never handed to the browser, and a storage that does not answer is a 502 that names nothing of the endpoint. Treat the proxy as part of the storage's attack surface: keep `allowedPathPrefixes` as narrow as the bucket, and do not enable it for a storage the browser can already reach.

## Related

- [Setup and configuration](./)
- [Direct upload](./direct-upload)
- [Error reference](./errors)
