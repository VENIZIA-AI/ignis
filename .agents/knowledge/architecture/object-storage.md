---
type: Architecture
title: Object storage and the three upload paths
description: How IGNIS signs for S3, why a POST policy is not a presigned PUT, and which of the three upload paths a case belongs to.
resource: packages/helpers/src/modules/storage
tags: [architecture, storage, s3, upload, signing, security]
---

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
uploaders multiply memory - which is what `parseMultipartBody.storage: 'memory' | 'disk'` manages.

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
`resolveServedContentType` closes on the serving side: unsigned, the uploader picks the stored type. Built as a query-signed SigV4 URL, because `S3Client.presign` takes a method
and an expiry and nothing else.

### POST policy - what `directUpload` uses

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

## Direct upload, and why it is three round trips

`controller.directUpload` registers `POST {base}/upload-policy` and `POST {base}/upload-commit`.
Absent, neither route exists.

1. The browser asks for a policy. IGNIS runs `authorize`, refuses a size over `maxBytes` **before
   signing anything**, generates `pending/<keyPrefix><uuid>/<name>` (the scope rides inside the
   pending key, so the commit - which strips `pendingPrefix` - lands inside `controller.keyPrefix`
   too), and signs both the policy and a commit token.
2. The browser posts the form straight to storage. No byte passes through IGNIS.
3. The browser presents the commit token. IGNIS verifies it, runs `onCommit`, copies server-side to
   the final key, removes the temporary object, and writes the MetaLink row.

The third trip exists because S3 tells the backend nothing. Without it there is no MetaLink row and
no way to attach the object to anything.

Both paths write that row through ONE builder, `createMetaLinkRow`. They diverged once and the
symptom was a client rendering an empty state with no error. The labels
`principalType`/`principalId`/`variant` reach the commit as QUERY, because the token carries no
business fields. A failed row is `metaLink: { error: 'META_LINK_CREATE_FAILED' }` inside a 200 - the
object IS committed by then, and a 500 would send the caller back with a token whose source is gone.

### A MetaLink row is one (object, owner) pairing

Not one object, so `(bucketName, objectName)` is indexed and deliberately NOT unique. Counted on a
production-shaped table: of 1038 objects with more than one row, 1027 were one image attached to a
product and to each of its variants.

`sequence` orders the rows WITHIN one principal, and the caller supplies it - the component never
derives one, because reading `max(sequence)` and writing `max + 1` is the same non-atomic shape as
`recreate-metalink` below. It defaults to 0, so `ORDER BY sequence, createdAt` reproduces the order
legacy rows already had; drop the tiebreak and they come back arbitrary.

`recreate-metalink` refreshes, then creates. `updateAll` over `(bucketName, objectName)` rewrites
stored-object facts on EVERY row of the pair, and keeps each row's own labels and `storageType`; the
earlier `findOne` + `updateById` touched only the first row found and overwrote its `storageType`
with the controller's own backend. What a refresh writes depends on `metaLink.createMetaLink`: with
one configured, ONE `updateAll` writes only `mimetype`, `size`, `etag`, `isSynced` - the hook owns
`link` and `metadata` on that row (an enrichment such as BANA inventory's width/height/placeholder
survives a recreate); without one, that same `updateAll` also writes `link`, and then ONE `updateById`
PER ROW merges `metadata: { ...row.metadata, ...fileStat.metadata }` (the stat's keys win, skipped
entirely when the stat carries none) - fed from the first statement's own `RETURNING`, not a second
read, because `find` applies `DEFAULT_LIMIT` (10) and would silently refresh only part of a larger
pair. That merge is a read-then-write: a concurrent write to a row's `metadata` landing between the
two statements is lost. Only when the refresh counts zero rows does it create one, through
`createMetaLinkRow` - the same builder `upload` uses, so `createMetaLink` and the entry's `storage`
apply. The response carries `MetaLinkRecreateActions.REFRESHED`/`.CREATED` (a real
`z.enum(...)` in the OpenAPI document, not `string`), `count`, and every touched row as `metaLinks`
(`metaLink` stays `metaLinks[0]`, for existing callers). The two steps are still not atomic: two
concurrent calls on an object with no existing row can both create. Without a unique index two
concurrent transactions both read "no row" and both insert - `FOR UPDATE` locks nothing that does not
exist, `ON CONFLICT` needs the index the data forbids. Closing it takes `pg_advisory_xact_lock`:
Postgres-only, and the application's.

### Four security properties, each with its reason

| Property | Why |
|---|---|
| A policy authorizes only `pending/<generated>` | the final key is in NO policy, so content cannot be replaced after the commit |
| The commit is claimed with an HMAC over `{bucket, key, expiresAt}`, verified BEFORE any storage call | naming someone else's object is impossible, and a forged token fails without a round trip, so timing leaks nothing |
| The token carries no business fields | which order or tenant an upload belongs to is the application's authorization, not something the framework signs |
| `authorize` is a REQUIRED property | a route that hands out a write credential has no safe default |

`onCommit` runs BEFORE the copy: a hook that throws leaves the object under the pending prefix for a
lifecycle rule, rather than stranding it at the final key. Removing the temporary object is CLEANUP,
not the commit - it is best-effort and logs, because failing the request would tell the caller their
upload did not work when it did.

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

## Deliberately not built

Multipart and resumable upload. Malware scanning - `onCommit` is the seam, the scanner belongs to the
application. A commit token carrying business fields.

Related: [[component-model]], [[error-handling-flow]].
