---
title: A validated upload is pinned, and commit takes the token validate returns
description: "upload-validate now pins the exact content it read and answers the token commit needs, so a file cannot be swapped between the check and the copy. The validation handler gets a pinned file."
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-11-11

## A validated upload is pinned, and commit takes the token validate returns

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="Security" />

**In one line.** A file could be overwritten between your validation and the commit copy. Validation now pins the content it read, and commit copies only that content.

## What changed

- **Validate answers a token.** A valid file gets `{ isValid: true, issues: [], commitToken }`. The token is bound to the exact content the handler read and keeps the expiry of the token you sent. An invalid file gets no token.
- **Commit takes that token.** With `validation` on, commit with the policy's token is refused `422` `core.static_asset.upload_not_validated`. Commit no longer runs the handler.
- **A pinned file.** The handler takes `{ file, owner }`. `file` has `key`, `size`, `etag`, `contentType` and `stream({ range? })`, and every read is for the pinned content.
- **The pin.** The exact version id when the bucket has real versions, else the ETag. A read or the commit copy that finds other content, or no object, fails `409` `core.static_asset.upload_changed`, and nothing is copied. No extra object is created.
- **Helpers.** `getObjectStream` takes `ifMatch` and `versionId`. `copyObject` takes `ifMatch` and `sourceVersionId`. `BunS3Helper.getStat` reports `versionId`. A failed condition throws `core.storage.precondition_failed` (`412`). `copyObject` of a missing source throws `core.storage.object_not_found` (`404`). `DiskHelper` refuses a conditional read.
- **New errors.** `core.static_asset.upload_changed` (`409`), `core.static_asset.upload_not_validated` (`422`), `core.storage.precondition_failed` (`412`).
- **Removed error.** `core.static_asset.upload_invalid` is gone. Commit no longer runs the handler, so nothing raises it. An invalid file answers `200` `{ isValid: false, issues }` on `upload-validate`.
- **Who commits.** The [direct upload page](/extensions/components/static-asset/direct-upload#who-commits-and-with-which-token) now lists the four combinations of `validation` and `routes.uploadCommit`, with the token commit takes in each.

## Who is affected

- **Apps with a `validation.handler`.** Change the handler arguments. Compilation fails until you do.
- **Clients of `upload-commit` with `validation` on.** Send the `commitToken` from the validate answer. Until then commit answers `422`.
- **Tokens issued before the upgrade.** They lack the new fields and answer `400` `invalid_commit_token`. Users upload again.
- **Apps that use validation as a malware gate.** Enable bucket versioning, and add a lifecycle rule that expires noncurrent versions and delete markers under the pending prefix. Without versioning the pin is the ETag, an MD5 for a plain upload.
- **Everyone else.** With `validation` off nothing changes: commit takes the policy's token.

## Breaking changes

> [!WARNING]
> The handler no longer receives `helper`, `bucket` or `object`, `upload-commit` no longer accepts the policy's token when `validation` is on, and the error code `core.static_asset.upload_invalid` is removed. A client that branched on it now branches on `upload_not_validated` (commit with the wrong token) or on `isValid: false` from `upload-validate`.

**Before:**

```typescript
handler: async ({ bucket, object, owner, helper }) => {
  const fileStream = await helper.getObject({ bucket, object });
  const issues = await checkWorkbook({ fileStream, owner });

  return { isValid: issues.length === 0, issues };
},
```

**After:**

```typescript
handler: async ({ file, owner }) => {
  const stream = await file.stream();
  const issues = await checkWorkbook({ stream, owner });

  return { isValid: issues.length === 0, issues };
},
```

`file.stream()` returns a web `ReadableStream`. In the browser or your service, take `commitToken` from the validate answer and send it to `upload-commit`.

See [Direct upload](/extensions/components/static-asset/direct-upload#validation), [the pin](/extensions/components/static-asset/security#the-pin-binds-the-token-to-the-content) and the [migration notes](/extensions/components/static-asset/migration#the-validation-handler).
