---
title: A Browser Can Upload Straight To Storage
description: directUpload signs a POST policy so the bytes never pass through IGNIS. The commit is claimed with a signed token, not a key, and the final key is never inside any policy.
---

# Changelog - 2026-09-14

## A browser can upload straight to storage

<Badge type="tip" text="Feature" />

**In one line.** Configure `controller.directUpload` and two routes appear: one signs a policy, one
commits what the browser posted.

```
POST {base}/upload-policy   { files: [{ fileName, contentType, size }] }
                         -> [{ postURL, formData, objectName, commitToken, expiresAt }]

POST {base}/upload-commit   { commitToken } -> the object at its final key
```

The backend never holds the file. Today every upload travels twice - browser to IGNIS, IGNIS to
storage - and concurrent uploaders multiply memory, which is what `parseMultipartBody.storage`
exists to manage. For a few megabytes that is the right model and still the default. This is for
video.

## Why a policy and not a presigned PUT

A signed PUT binds each header to an **exact** value. `content-length: 2048` means exactly 2048
bytes; there is no way to express "at most 2 MB". The client has to know the byte count before it
asks, so every retry or re-encode becomes an opaque 403.

A POST policy carries `content-length-range`, so a ceiling is expressible at all. That is the whole
reason for the shape.

## The commit is claimed with a token, never with a key

The policy response carries an HMAC over `{ bucket, key, expiresAt }`, and `upload-commit` verifies
it **before any storage call**.

A caller therefore has no way to name an object it was never granted a policy for, and the route is
not a name prober - a forged token fails without a round trip, so timing says nothing about what
exists.

**The token carries no business fields.** Which order or tenant an upload belongs to is yours, and a
token IGNIS signs is the wrong place to put your authorization.

## Two keys, and the final one is never in a policy

A policy only ever authorizes `pending/<generated>`. On commit, IGNIS copies server-side to the final
key - the bytes never pass through this process - and then removes the temporary object.

So the final key **never appears in any policy**, which means content cannot be replaced after the
commit. A presigned PUT cannot give you that: it is reusable until it expires and it overwrites.

Removing the temporary object is cleanup, not the commit. If it fails, the commit still succeeds and
logs a warning - a lifecycle rule on the pending prefix collects the leftover, and failing the
request would tell the caller their upload did not work when it did.

`onCommit` runs **before** the copy, so a hook that throws leaves the object under the pending prefix
rather than stranding it at the final key.

## `authorize` is required, not defaulted

```ts
directUpload: {
  authorize: ({ context }) => Boolean(context.get('currentUser')),
  secretKey: process.env.APP_ENV_UPLOAD_SECRET,
  maxBytes: 100 * 1024 * 1024,
}
```

This route hands out a write credential. There is no safe default for who may ask, so the type system
makes you decide. `controller.bucket` must be configured too - a policy names one bucket, and a
bucket in the URL is a bucket the caller chooses.

## Deliberately not built

Multipart and resumable upload. Malware scanning - `onCommit` is the seam, the scanner is yours. A
commit token carrying business fields.

## Who is affected

**You do not configure `directUpload`.** Nothing. Neither route is registered, and the
upload-through-the-backend path is unchanged.

**Files:**

- [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts) - `buildPostPolicy`
- [`packages/core-server/src/components/static-asset/common/commit-token.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/common/commit-token.ts) - `buildCommitToken`, `readCommitToken`
- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts) - both handlers
