---
title: Direct upload
description: Let the browser send bytes straight to storage. What to configure, what the browser does, and why each safeguard is there.
---

# Direct upload

Every upload today travels twice - browser to IGNIS, IGNIS to storage - and the backend holds the
whole file while it does. For a few megabytes that is the right model and this page is not for you.

For video, turn on `directUpload` and the bytes never touch your process.

```ts
application.component(StaticAssetComponent, {
  options: {
    assets: {
      controller: {
        name: 'AssetController',
        basePath: '/assets',
        bucket: 'uploads',              // required: a policy names one bucket
        directUpload: {
          authorize: ({ context }) => Boolean(context.get('currentUser')),
          secretKey: process.env.APP_ENV_UPLOAD_SECRET,
          maxBytes: 100 * 1024 * 1024,
        },
      },
      storage: StaticAssetStorageTypes.BUN_S3,
      helper: storageHelper,
    },
  },
});
```

Two routes appear. Leave `directUpload` out and neither exists.

## The three round trips

```
1. browser -> IGNIS   POST {base}/upload-policy   { files: [...] }
                   <- [{ postURL, formData, objectName, commitToken, expiresAt }]

2. browser -> STORAGE  multipart POST to postURL        (IGNIS sees no byte)

3. browser -> IGNIS   POST {base}/upload-commit   { commitToken }
                   <- the object at its final key, and its MetaLink row
```

The third trip is not ceremony. Storage tells your backend nothing, so without it there is no
MetaLink row and no way to attach the object to an order, a ticket or a user.

## The commit writes the row

The response carries `metaLink` exactly as an ordinary upload does, so a client reading an `id` and
a `link` off it needs no branch for which path the bytes took.

```
POST {base}/upload-commit?principalType=Product&principalId=42&variant=thumbnail
```

The three labels are the ones the ordinary upload takes. They ride the query and not the token: the
token is an HMAC over `{ bucket, key, expiresAt }` and deliberately carries no business fields.
Omit them and the row is still written, without the labels.

If the row fails the response is still **200**, with the reason as a code:

```json
{ "bucket": { "name": "uploads" }, "object": { "key": "..." }, "link": "...",
  "metaLink": { "error": "META_LINK_CREATE_FAILED" } }
```

By then the copy has happened and the pending object is gone - the object is committed. A 500 would
send the caller back with a token whose source no longer exists.

## What the browser does

```js
const [policy] = await fetch('/assets/upload-policy', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    files: [{ fileName: file.name, contentType: file.type, size: file.size }],
  }),
}).then(response => response.json());

const form = new FormData();
for (const [key, value] of Object.entries(policy.formData)) form.append(key, value);
form.append('key', policy.objectName);
form.append('file', file);                       // LAST, always

await fetch(policy.postURL, { method: 'POST', body: form });

await fetch('/assets/upload-commit', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ commitToken: policy.commitToken }),
});
```

> [!WARNING]
> `file` must be the last field. Storage reads the form in order and ignores everything after it.

A runnable page that performs all three and prints each request is at
[`/direct-upload-demo.html`](/direct-upload-demo.html) - open your browser's Network tab while it
runs and watch step 2 leave without touching the backend.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `authorize` | `({ context }) => ValueOrPromise<boolean>` | - | **Required.** Who may ask for a policy. |
| `secretKey` | `string` | - | Signs the commit token. Keep it out of the repository and out of the client. |
| `maxBytes` | `number` | - | The ceiling the policy carries as `content-length-range`. |
| `pendingPrefix` | `string` | `'pending/'` | Where a policy may write. The final key is never inside it. |
| `expiresIn` | `IDuration` | 15 minutes | How long a policy and its commit token stay good. |
| `onCommit` | `({ bucket, pendingObject, object }) => ValueOrPromise<void>` | - | Runs **before** the copy. |

## Why a policy and not a presigned PUT

A signed PUT binds each header to an **exact** value. `content-length: 2048` means exactly 2048
bytes; there is no way to say "at most 2 MB". The client would have to know the byte count before
asking, and every retry or re-encode would become an opaque 403.

A POST policy signs a document of conditions instead, and conditions are a small language:
`content-length-range` and `starts-with` say things equality cannot.

Worth knowing even if you never reach for it: a presigned PUT is also **reusable until it expires**
and **overwrites** an existing key. Anyone who intercepts one can replace the object.

## The safeguards, and what each is for

**A policy only authorizes `pending/<generated>`.** On commit, IGNIS copies server-side to the final
key. That key appears in **no policy**, so content cannot be replaced after the commit - the property
a presigned PUT cannot give you.

**The commit is claimed with a token, never with a key.** The token is an HMAC over
`{ bucket, key, expiresAt }`, verified **before any storage call**. So a caller cannot name an object
it was never granted, and the route is not a name prober - a forged token fails without a round trip,
so timing says nothing about what exists.

**The token carries no business fields.** Which order or tenant an upload belongs to is your
authorization, and a token IGNIS signs is the wrong place to keep it.

**`authorize` is required, not defaulted.** This route hands out a write credential; there is no safe
default for who may ask, so the type system makes you decide.

**`onCommit` runs before the copy.** A hook that throws leaves the object under the pending prefix
for a lifecycle rule to collect, rather than stranding it at the final key forever.

**Removing the temporary object is cleanup, not the commit.** If it fails the commit still succeeds
and logs a warning - failing the request would tell the caller their upload did not work when it did.

## Behind a private endpoint

`host` is inside every SigV4 signature, so the `postURL` your browser receives cannot be rewritten
afterwards. Give the helper both hosts:

```ts
new BunS3Helper({
  accessKey,
  secretKey,
  endpoint: {
    default: 'http://minio:9000',        // what this process talks to
    public: 'https://cdn.example.com',   // what the browser is handed
  },
});
```

## When step 2 answers 403

The policy is doing its job. In order of likelihood:

| Cause | Check |
|---|---|
| The bucket refuses cross-origin POST | your bucket's CORS rules - this one costs people an afternoon |
| The file is over `maxBytes` | the `content-length-range` condition |
| `key` does not start with the pending prefix | you changed `objectName` before posting |
| The policy expired | `expiresAt`, and `expiresIn` |

## Deliberately not built

Multipart and resumable upload. Malware scanning - `onCommit` is the seam, the scanner is yours. A
commit token carrying business fields.

**Files:**

- [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts) - `buildPostPolicy`
- [`packages/core-server/src/components/static-asset/common/commit-token.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/commit-token.ts) - `buildCommitToken`, `readCommitToken`
