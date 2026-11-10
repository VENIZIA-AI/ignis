---
title: Static Asset - Configurable File Tokens, Presigned PUT Uploads, Settle and a Proxy
description: AssetCommitToken becomes configurable (codec, owner, expiry, checks), a presigned PUT upload service, a settle service and services bindable without a route are added, and the static-asset controller can proxy presigned storage URLs
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-10

## Static asset component

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="danger" text="Breaking" />

**In one line.** A service can now sign and verify file tokens in a format of its own, prepare presigned PUT uploads, settle them and bind all of that without serving an asset route, and the controller can proxy presigned storage URLs.

## What changed

- **`AssetCommitToken` is configurable.** A new `new AssetCommitToken({ ... })` takes a `codec`, `expiresAtOf`, `ownerOf`, `validate`, `errors` and `now`, and has `sign`, `verify` and `verifyMany`. `verify` checks the signature, the owner, the expiry and your check, in that order, and a token that is not the caller's is never reported as expired. The static `AssetCommitToken.build` and `AssetCommitToken.read` are unchanged.
- **`AssetTokenCodecs.signedJson` and `IAssetTokenCodec`.** The default format, and the interface to write a format of your own.
- **`AssetPresignService`** checks the files a client announces (extensions, size, count), decides the key (`resolvePath` returns the folder, `''` by default), signs a PUT URL that pins size, content type and tags, and signs a token that names the object.
- **`AssetSettleService`** keeps an upload by replacing its tags; every key is tried and the first failure is thrown afterwards.
- **`AssetServicesComponent` and `AssetServiceBindingKeys`** bind the token, presign and settle instances by name, with no route.
- **`controller.proxy`** (`enable`, `upstreamEndpoint`, `path`, `allowedPathPrefixes`, `forwardRequestHeaders`, `cors`, `timeoutMs`) registers a proxy for presigned storage URLs.
- **`controller.proxy.errorResponse`** `({ reason, request }) => Response | undefined` answers the proxy's own failures (`PATH_REFUSED`, `UPSTREAM_FAILED`) instead of the JSON error, so an application whose browser cannot use a `core.static_asset.*` code can answer a plain `404` / `502`. Returning `undefined` keeps the default.
- **`directUpload` is now a presigned PUT, and the routes changed.** `POST {base}/upload-policy` and `POST {base}/upload-commit` are **removed**; `POST {base}/upload-presign` replaces them and answers `[{ preSignUrl, fileKeyToken, key }]`. `directUpload` takes `authorize` and a `presign` (`AssetPresignService`, or any object with its `presign` method, `TAssetPresigner`), with optional `request` (`schema`, `toInput`) and `response` (`schema`, `map`); `secretKey`, `maxBytes`, `pendingPrefix`, `expiresIn` and `onCommit` are gone, and so are `routes.uploadPolicy` / `routes.uploadCommit` (use `routes.uploadPresign`). There is no commit route: the application settles the object itself with `AssetSettleService` (a commit route would only duplicate that), so the MetaLink row is no longer written by a direct upload. `controller.keyPrefix` together with `directUpload` now throws at registration, because the key comes from the presign service.
- **New error codes.** `core.static_asset.presign_extension_not_allowed`, `presign_file_size_invalid`, `proxy_path_refused`, `proxy_upstream_failed`.

## Who is affected

- **Applications that use `directUpload`.** Action needed: switch the client to `upload-presign` and a PUT, build an `AssetPresignService`, and settle the object where the owning record is saved. `AssetCommitToken.build/read` are unchanged.
- **Applications that enable `controller.proxy`.** The proxy route has no authentication; the storage signature is the authentication. Read the [warning](/extensions/components/static-asset/presign-and-proxy#the-proxy) first.

## Details

- A presigned PUT has no size range, unlike a POST policy; verify the size again where the token is read.
- `DEFAULT_PENDING_PREFIX` and `TUploadPolicyRequest` are removed. The `upload-policy` / `upload-commit` demo page is removed.
- See [Presigned Uploads, File Tokens and the Proxy](/extensions/components/static-asset/presign-and-proxy).
