---
type: Architecture
title: Object storage and the three upload paths
description: How IGNIS signs for S3, why a POST policy is not a presigned PUT, and which of the three upload paths a case belongs to.
resource: packages/helpers/src/modules/storage
tags: [architecture, storage, s3, upload, signing, security]
---

<!-- okf:generated:contents start -->
**Contents**

- [What a signature actually covers](#what-a-signature-actually-covers)
- [The three paths](#the-three-paths)
- [Direct upload is a presigned PUT, signed by one route](#direct-upload-is-a-presigned-put-signed-by-one-route)
- [Storage endpoint audiences {#storage-endpoint-audiences}](#storage-endpoint-audiences-storage-endpoint-audiences)
- [Serving is where the XSS lives](#serving-is-where-the-xss-lives)
- [Tokens, presigned PUT, settle and the proxy](#tokens-presigned-put-settle-and-the-proxy)
- [Deliberately not built](#deliberately-not-built)
<!-- okf:generated:contents end -->

S3 has no session. Every request carries its own SigV4 signature, and the server holds the secret
key that makes one. A browser must never hold that key, so every browser-facing feature here is a way
to hand out a **narrow, expiring permission** instead of the key.

## What a signature actually covers

SigV4 does not sign the request. It signs a canonical DESCRIPTION of the request: method, path,
query, a named list of headers, and the payload hash. One rule follows, and everything below is a
consequence of it:

> What is inside the description is **locked** - change one character and the signature breaks.
> What is outside is **free** - S3 does not check it.

There is no middle. HMAC answers *identical* or *different*, never *within range*. A limit therefore
cannot be expressed by signing a request; it has to be expressed by signing something that carries a
grammar.

`host` is inside the description. A URL signed against an internal name cannot be rewritten to a
public one afterwards, which is why `IBunS3HelperOptions.endpoint` is `{ default, public? }` rather
than one value patched at the edge - see [[storage-endpoint-audiences]] below.

## The three paths

| | Who sends the bytes | Who holds the key | What is signed |
|---|---|---|---|
| **Through the backend** | the backend | the backend | each request the backend makes |
| **Presigned PUT** | the browser | the backend | one URL |
| **POST policy** | the browser | the backend | a document of CONDITIONS |

### Through the backend - the default, and right for most cases

`POST {base}/objects`. The backend holds the whole file, so bandwidth is paid twice and concurrent
uploaders multiply memory - which is what `RequestUtility.parseMultipartBody({ storage: 'memory' | 'disk' })` manages.

It buys the one thing the other two cannot: the backend sees every byte, so it can check magic bytes,
scan, or re-encode. For a few megabytes this is the correct model and needs nothing else.

### Presigned PUT - a sharp tool, and the wrong default

Locked: method, object key, host, expiry. Free: **size, content type, and the number of times it is
used**.

Three consequences, all bad for a browser form:

1. **Size cannot be bounded.** Signing `content-length` locks it to an EXACT byte count, so the
   client must know the size in advance and every retry or re-encode becomes an opaque 403. The
   choice is no limit at all, or one exact number.
2. **Reusable.** AWS is explicit: presigned URLs are bearer tokens, valid until they expire.
3. **Overwriting.** An existing key is replaced.

A write credential that is reusable, unrevokable and overwriting, for one key. IGNIS ships
`presignPut`, and the static-asset component deliberately does not use it for uploads.

It does take `tagging`, `contentLength` and `contentType`, all SIGNED and sent back unchanged by the client. A tag
merely sent is a tag S3 ignores, so a step gated on reading it back fails silently; signed, it exists
the moment the object does. `contentLength` stays an exact number, not a ceiling - the equality limit
above, not an oversight. `contentType` closes the same hole on the RECEIVING side that
`AssetControllerFactory.resolveServedContentType` closes on the serving side: unsigned, the uploader picks the stored type. Built as a query-signed SigV4 URL, because `S3Client.presign` takes a method
and an expiry and nothing else.

### POST policy - the storage helper still signs it, no route uses it

The signature covers a POLICY DOCUMENT rather than a request, and conditions are a small language:

```json
{ "expiration": "...", "conditions": [
  { "bucket": "uploads" },
  ["starts-with", "$key", "pending/"],
  ["content-length-range", 0, 104857600],
  { "Content-Type": "video/mp4" }
]}
```

`starts-with` and `content-length-range` are the whole reason for the shape. Signing a request can
only compare for equality; signing conditions can express a prefix and a range.

Two traps, both recorded in the code:

- **Every field the browser posts must ALSO be a condition**, or S3 refuses the form it just signed.
- **`file` must be the last field.** S3 reads the form in order and ignores anything after it.

## Direct upload is a presigned PUT, signed by one route

`controller.directUpload` registers `POST {base}/upload-presign` (`routes.uploadPresign`). Absent, the route
does not exist. It was a POST policy plus `upload-commit` until 2026-11-10; both routes are removed.

1. The browser asks for URLs. IGNIS runs `authorize` (a falsy answer is a 403 and nothing is signed), maps the
   body to files and a context (`request.toInput`, default `{ files: [{ fileName, contentType?, size }] }`), and
   `AssetPresignService.presign` checks them, decides the key and signs a PUT URL plus a file token.
2. The browser PUTs the bytes straight to storage (or to the proxy). No byte passes through IGNIS.
3. The application - not IGNIS - verifies the token (`AssetCommitToken.verify`) and settles the object
   (`AssetSettleService`) where the record that owns it is saved. There is NO commit route: it would only
   duplicate `AssetSettleService`, and a direct upload no longer writes a MetaLink row.

`directUpload` needs `controller.bucket` and does not combine with `controller.keyPrefix` (the key comes from the
presign service's `resolvePath`; both together throw at registration).

### A MetaLink row is one (object, owner) pairing

Not one object, so `(bucketName, objectName)` is indexed and deliberately NOT unique. Counted on a
production-shaped table: of 1038 objects with more than one row, 1027 were one image attached to a
product and to each of its variants.

`sequence` orders the rows WITHIN one principal, and the caller supplies it - the component never
derives one, because reading `max(sequence)` and writing `max + 1` is the same non-atomic shape as
`recreate-metalink` below. It defaults to 0, so `ORDER BY sequence, createdAt` reproduces the order
legacy rows already had; drop the tiebreak and they come back arbitrary.

`recreate-metalink` refreshes, then creates. `updateBy` over `(bucketName, objectName)` rewrites
stored-object facts on EVERY row of the pair, and keeps each row's own labels and `storageType`; the
earlier `findOne` + `updateById` touched only the first row found and overwrote its `storageType`
with the controller's own backend. What a refresh writes depends on `metaLink.createMetaLink`: with
one configured, ONE `updateBy` writes only `mimetype`, `size`, `etag`, `isSynced` - the hook owns
`link` and `metadata` on that row (an enrichment such as a consumer's inventory width/height/placeholder
survives a recreate); without one, that same `updateBy` also writes `link`, and then ONE `updateById`
PER ROW merges `metadata: { ...row.metadata, ...fileStat.metadata }` (the stat's keys win, skipped
entirely when the stat carries none) - fed from the first statement's own `RETURNING`, not a second
read, because `find` applies `DEFAULT_LIMIT` (10) and would silently refresh only part of a larger
pair. That merge is a read-then-write: a concurrent write to a row's `metadata` landing between the
two statements is lost. Only when the refresh counts zero rows does it create one, through
`AssetMetaLink.createRow` - the same builder `upload` uses, so `createMetaLink` and the entry's `storage`
apply. The response carries `MetaLinkRecreateActions.REFRESHED`/`.CREATED` (a real
`z.enum(...)` in the OpenAPI document, not `string`), `count`, and every touched row as `metaLinks`
(`metaLink` stays `metaLinks[0]`, for existing callers). The two steps are still not atomic: two
concurrent calls on an object with no existing row can both create. Without a unique index two
concurrent transactions both read "no row" and both insert - `FOR UPDATE` locks nothing that does not
exist, `ON CONFLICT` needs the index the data forbids. Closing it takes `pg_advisory_xact_lock`:
Postgres-only, and the application's.

### Security properties of the presign route, each with its reason

| Property | Why |
|---|---|
| `authorize` is a REQUIRED property | a route that hands out a write credential has no safe default |
| The key is decided by the presign service | the client announces names and sizes, never a key it could collide with |
| The URL signs size, content type and tags | the holder cannot upload more, another type or other tags |
| The token carries no business fields | which order or tenant an upload belongs to is the application's authorization, not something the framework signs |

A presigned PUT has no size range and is reusable until it expires, so the size is verified again where the token is read.

## Storage endpoint audiences {#storage-endpoint-audiences}

`endpoint.default` is the host this process talks to; `endpoint.public` is the host a browser is
handed, and falls back to `default`.

| Goes to `default` | Goes to `public` |
|---|---|
| the `S3Client`, every bucket operation, `copyObject`, object tagging | `presignGet`, `presignPut`, `presignPost` |

Each call site states which through `S3Audiences.SERVER` / `S3Audiences.BROWSER`. An earlier shape
used the public host for everything, which worked by accident and hairpinned server traffic out
through the edge.

## Serving is where the XSS lives

The served content type is derived from the object KEY through an allow-list, never from what the
uploader declared or what a backend reports. `image/svg+xml` is excluded on purpose - an SVG runs
JavaScript. Anything outside the list is served as `application/octet-stream` with
`Content-Disposition: attachment`, plus `nosniff` and `Content-Security-Policy: sandbox`.

Serving assets from a separate domain is the structural defence, and the one IGNIS cannot impose.

The extension table knows the common office formats (xlsx, xls, docx, doc, pptx, ppt, odt, ods), but
none of them is renderable, so they still serve as `application/octet-stream` plus `attachment` -
only the MetaLink `mimetype` fallback, `DiskHelper.getStat`, `writeStream`'s default type, and
`AssetIngest` change. `text/csv` and `text/plain` ARE on the renderable list and serve inline under
`sandbox`.

## Tokens, presigned PUT, settle and the proxy

Four blocks sit beside the routes of `StaticAssetComponent`, in `packages/core-server/src/components/static-asset/`, and
each is usable from a service that serves no asset route. IGNIS holds neutral defaults; the folder, the payload, the format,
the tags and the extensions are options.

| Block | Where | Notes |
|---|---|---|
| `AssetCommitToken` | `common/commit-token.ts` | the class behind the file tokens, made configurable: `codec` (`IAssetTokenCodec`, default `AssetTokenCodecs.signedJson`), `expiresAtOf`, `ownerOf`, `validate`, `errors`, `now`. Static `build`/`read` keep their signatures. Signs with `Hash.hmac`, compares with `Hash.equals` |
| `AssetPresignService` | `service/presign.ts` | checks the announced files, `resolvePath` decides the folder, `presignPut` signs size, type and tags, the token names the object |
| `AssetSettleService` | `service/settle.ts` | `replaceObjectTags` over every key, first failure thrown after all were tried |
| `AssetServicesComponent` | `service/component.ts` | binds the instances by name under `AssetServiceBindingKeys.token/presign/settle`; no route |
| `AssetPresignProxy` | `proxy/proxy.ts` | registered by the controller when `controller.proxy.enable`; no authentication, the storage signature is the authentication; `proxy.errorResponse({ reason, request })` lets the application answer `PATH_REFUSED` / `UPSTREAM_FAILED` with its own `Response` (e.g. plain 404 / 502) |

Constraints that are easy to break:

- Reading a token checks the signature, the owner, the expiry and `validate`, in that order. A failure of the first two is
  `INVALID_COMMIT_TOKEN` whatever else is wrong, so a token that is not the caller's is never reported as expired.
- A token with a payload other than `ICommitTokenPayload` must be given its own `codec` and `expiresAtOf` (the options
  type requires them): the default codec accepts only the commit payload and answers invalid for anything else.
- A presigned PUT signs `content-length`, `content-type` and the tags but has no size range, unlike a POST policy: the
  announced size is the client's word until the storage enforces the signed length.
- The proxy resolves dot segments (the URL parser does) BEFORE it checks `allowedPathPrefixes`, never forwards a header
  outside `forwardRequestHeaders`, drops `set-cookie` and answers a dead storage with 502 and no endpoint in the body. With
  neither `controller.bucket` nor prefixes, registration throws: an open proxy is not a default.

## Deliberately not built

Multipart and resumable upload. Malware scanning - the settle step in the application is the seam, the scanner belongs to the
application. A commit token carrying business fields.

Related: [[component-model]], [[error-handling-flow]].
