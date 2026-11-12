---
title: Static Asset Component - Error Reference
description: Every error code and start-up refusal StaticAssetComponent and its storage helpers can raise, with the cause and the fix.
difficulty: intermediate
---

# Error Reference

Every error the static asset controller and storage helpers can raise, with cause and fix. Codes first, then the start-up refusals, then troubleshooting.

## Catalogued errors

These carry a machine code a client can branch on, alongside the human message. The code is the stable contract; the message text may be overridden at a throw site to name the offending value.

| Code | Status | When | What the client should do |
|------|--------|------|---------------------------|
| `core.static_asset.object_name_invalid` | `400` | `objectName` fails `isValidObjectKey()`; a policy `fileName` or a commit `destination` key is not valid | Fix the name. Do not retry as is. |
| `core.static_asset.bucket_name_invalid` | `400` | The entry's configured `bucket` fails `isValidBucketName()` | Nothing a client can fix: correct `bucket` on the entry. |
| `core.static_asset.file_empty` | `400` | A file is empty after parsing | Check the file has bytes before sending. |
| `core.static_asset.upload_too_large` | `413` | A file is over `serverUpload.maxBytes` (upload) or `directUpload.maxBytes` (policy request) | Send a smaller file. |
| `core.static_asset.upload_already_committed` | `409` | `commit` found an object at the destination | Read the link from `extra`, or ask for a new policy |
| `core.static_asset.upload_metadata_invalid` | `400` | A policy file's `metadata` is over 1024 bytes of JSON, or no `resolvers.metadata` reads it | Send less, or no, metadata. |
| `core.static_asset.upload_not_validated` | `422` | `validation` is on and `commit` got a token that `upload-validate` did not return, for example the one the policy issued | Call `upload-validate`, then commit with the `commitToken` it answers. |
| `core.static_asset.upload_changed` | `409` | The pending object was overwritten or removed after `upload-validate` | Upload again with a **new** policy, or call `upload-validate` again |
| `core.static_asset.upload_not_authorized` | `403` | `directUpload.authorize` returned `false` on `upload-policy`, `upload-validate` or `upload-commit` | Do not retry: the caller may not use direct upload. |
| `core.static_asset.invalid_commit_token` | `400` | The token is forged, malformed, in an old format, issued to a different owner, or issued for another bucket or scope | Ask for a new policy. The answer is the same for all four, on purpose. |
| `core.static_asset.expired_commit_token` | `400` | `expires.commit` has passed | Ask for a new policy and upload again. |
| `core.static_asset.object_key_out_of_scope` | `400` | A `serverUpload.objectKey` hook or a `resolvers.commit.destination` returned a key outside the `keyPrefix` | Server-side: build the key under the prefix. |
| `core.storage.object_not_found` | `404` | No object at the key, or the key is outside the `keyPrefix` | Treat as absent. |
| `core.storage.precondition_failed` | `412` | A helper read or copy named the content it expects and found other content | Re-read the object, or give up the operation |
| `core.storage.folder_path_invalid` | `400` | The upload's `folderPath` is empty after trimming slashes, or a segment is not valid | Send a real folder with valid segments, or omit the field. |
| `core.storage.folder_depth_exceeded` | `400` | The folder path is deeper than the entry's `maxFolderDepth` | Flatten the folders, or raise the limit. |

Details the table leaves out:

- `upload_already_committed`: the token was already committed, or another upload resolved to the same key. The body's `extra` is `{ object: { key }, link }` of that object, so a client whose first answer was lost reads the link there. Nothing was copied and no MetaLink row was written.
- `upload_changed`: raised by a `file.stream()` read and by the copy `commit` makes. It needs a pin: a missing pending object with an `issued` token (no pin) is `core.storage.object_not_found` instead. Nothing was copied or removed.
- `object_not_found`: also raised by a `copyObject` of a missing source, such as a `commit` with an `issued` token whose pending object is gone.
- `precondition_failed`: the read or copy named `ifMatch`, `versionId` or `sourceVersionId`. The static-asset component turns it into `upload_changed`; called directly on a helper, it reaches you as is.

The `core.static_asset.*` codes live on `StaticAssetErrors`; the `core.storage.*` codes live on `StorageErrors` in the helpers package, because the storage helper does the folder checks and the conditional reads. Both register with the shared key registry, so `messageCode` autocompletes.

A malformed JSON body, a `maxKeys` that is not a positive integer, or a `sequence` on `upload-commit` that is not an integer are the standard validation error (`422`). The route's schema reports them, and no catalogued code applies.

### The statuses of `upload-validate`

A valid token answers `200` **even when the file has problems**: the call worked, and the issues ride the body. A valid file also carries a `commitToken`. Your handler runs once per call, after the checks below. The `409` is the one answer that comes from the handler's own read:

| Status | Code | Cause |
|---|---|---|
| `422` | - | The body is malformed |
| `401` | - | Unauthenticated, per the entry's `auth` |
| `403` | `upload_not_authorized` | `directUpload.authorize` returned `false` |
| `400` | `invalid_commit_token` | A forged token, a different owner, or a key outside the `keyPrefix` |
| `400` | `expired_commit_token` | `expires.commit` has passed |
| `404` | `object_not_found` | No object is there |
| `409` | `upload_changed` | The object changed or was removed while the handler read it |

With `validation` off the route does not exist and answers `404`.

> [!NOTE]
> `core.request.body_too_large` (`413`) and `core.request.body_malformed` (`400`) are not static-asset codes - they live on the kernel's `RequestErrors`, alongside every other route. See [Middlewares Reference](/references/base/middlewares#body-limit-configs-middlewares-bodylimit).

## Start-up refusals

The types catch most wrong entries at compile time. The component checks the same rules again when it starts, for an entry the types do not reach (plain JavaScript, a cast, a custom helper). Each message starts with the entry's name in brackets and throws before any route is registered.

| Message (after the entry name) | Cause | Fix |
|---|---|---|
| `helper must be a BunS3Helper or a DiskHelper \| storageType: {value}` | The helper declares no `storageType`, or one other than `disk` or `bun-s3` | Use `DiskHelper` or `BunS3Helper`. A custom helper must declare `storageType` with a `StorageTypes` value. |
| `directUpload needs a BunS3Helper \| a POST policy is an S3 feature, and this helper is {type}` | `directUpload` is on with a `DiskHelper` | Use a `BunS3Helper`, or switch `directUpload` off. |
| `directUpload needs keyPrefix` | `directUpload` is on and the entry has no `keyPrefix` | Add `keyPrefix`: it keeps the pending prefix out of what the routes serve. |
| `directUpload needs resolvers.owner \| a token is signed for one owner, and the commit refuses any other` | `directUpload` is on and `resolvers.owner` is not a function | Add `resolvers: { owner }`. |
| `directUpload needs authorize or auth` | `directUpload` is on with no `directUpload.authorize`, and an `auth` that neither authenticates nor authorizes | Set `auth.authenticate` or `auth.authorize` on the entry, or give `directUpload` its own `authorize`. |
| `keyPrefix must be one or more valid key segments \| value: {value}` | `keyPrefix` is empty, or a segment fails `isValidSegment()` | Use a value like `tenant-a/`. |
| `directUpload.pendingPrefix must be one or more valid key segments, each followed by a slash \| value: '{value}'` | `pendingPrefix` is empty, does not end with `/`, or has an invalid segment | Use a value like `pending/`. |
| `directUpload.pendingPrefix and keyPrefix must not contain one another \| ...` | One of the two starts with the other, so a pending object would be readable through the entry's routes | Pick disjoint prefixes, for example `pending/` and `orders/`. |
| `directUpload.expires.commit is not a usable duration \| unit: {unit} \| value: {value}` | `expires.commit` is zero, negative or has an unknown unit | Give a positive `IDuration`. |

An empty options object is not an error: it produces zero controllers. See [Controller not registering](#controller-not-registering-no-routes-appear).

## Error conditions

| Message | Cause | Code | HTTP Status |
|---------|-------|------|-------------|
| `"Invalid object name or path"` | `objectName` fails `isValidObjectKey()` | `core.static_asset.object_name_invalid` | `400` |
| `"Invalid bucket name"` | The configured `bucket` fails `isValidBucketName()` | `core.static_asset.bucket_name_invalid` | `400` |
| `"Empty file content \| name: {originalName}"` | The uploaded file's buffer is empty after multipart parsing | `core.static_asset.file_empty` | `400` |
| `[upload] Invalid folder path \| depth: {n} \| max: {m}` | The folder path has more segments than `maxFolderDepth` allows | `core.storage.folder_depth_exceeded` | `400` |
| `[upload] Invalid folder path` | The folder path is empty after trimming slashes, or a segment fails `isValidSegment()` | `core.storage.folder_path_invalid` | `400` |
| `[getObject] Object not found \| bucket: {bucket} \| key: {key}` | No object at that bucket and key (also from `getObjectStream`, `getStat`, `removeObject`, `copyObject`) | `core.storage.object_not_found` | `404` |
| `Object not found \| key: {key}` | The key does not start with the `keyPrefix`, answered before any storage call | `core.storage.object_not_found` | `404` |
| `"Object key is outside the key prefix of this controller"` | A `serverUpload.objectKey` key falls outside the `keyPrefix` | `core.static_asset.object_key_out_of_scope` | `400` |
| `"The uploaded file changed after it was validated"` | The pending object was overwritten or removed after the pin | `core.static_asset.upload_changed` | `409` |
| `"The upload has not been validated"` | `validation` is on and `commit` got a token `upload-validate` did not return | `core.static_asset.upload_not_validated` | `422` |
| `"The object no longer matches what was expected"` | A conditional read or copy found other content than it asked for | `core.storage.precondition_failed` | `412` |
| `[upload] Bucket does not exist \| name: {bucket}` | `helper.upload()` found no matching bucket via `hasBucket()` | - | `400` (default) |
| `[upload] Invalid original file name` | The `originalName` fails validation (see below) | - | `400` (default) |
| `[upload] Invalid file size \| size: {size}` | A file's `size` is `undefined`, `null`, or negative | - | `400` (default) |
| `[upload] Invalid normalized object name \| name: {name}` | The key returned by the naming hook fails `isValidObjectKey()` | - | `400` (default) |

The key-prefix refusal learns a caller nothing about a key outside its scope. The precondition message also appears as `[getObjectStream] The object changed` and `[copyObject] The source changed`.

Invalid original file name: with no naming hook, the `originalName` becomes the key and must pass `isValidSegment()` (a single segment, no `/`). With `serverUpload.objectKey` set, `originalName` is metadata, checked by the looser `isValidOriginalName()` (not blank, at most 255 characters, no control character or lone surrogate).

> [!NOTE]
> Entries marked "default" pass no explicit `statusCode` to `getError()`. `ApplicationError` defaults `statusCode` to `400` in that case.

## Name validation rules

Object keys, which may include folder segments (for example `2026/uploads/report.pdf`), are validated with `isValidObjectKey()` - every segment runs through `isValidSegment()`. The configured bucket name is validated with `isValidBucketName()`, which is `isValidSegment()` applied to the name.

| Pattern | Example | Reason |
|---------|---------|--------|
| Path traversal | `../etc/passwd` | Contains `..`, `/`, or `\` |
| Hidden files | `.hidden` | Starts with `.` |
| Shell metacharacters | `file;rm -rf /` | Contains `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, or `#` |
| Control characters | `file\ninjected` | Contains `\n`, `\r`, or `\0` |
| Long names | 256+ bytes in UTF-8, for example 128 `é` | Exceeds the 255-byte limit |
| Empty names | `""`, `"  "` | Empty or whitespace-only |
| Trailing slash (key only) | `photos/a.png/`, `photos/` | `isValidObjectKey()` rejects a key that ends with `/` |
| Double slashes (key only) | `a//b.png` | `isValidObjectKey()` rejects empty segments |
| Excess folder depth (key only) | `a/b/c/d.png` with `maxFolderDepth: 2` | `folderDepth = segments.length - 1` exceeds the limit |
| Long keys (key only) | 1025+ bytes | Exceeds the 1024-byte (UTF-8) normalized-key limit |

## Troubleshooting

### "Invalid object name or path"

- **Cause:** the name fails the rules above.
- **Fix:** strip path separators, leading dots, shell metacharacters, and control characters. Keep each segment within 255 bytes in UTF-8 (1024 bytes for a full object path), and never end a key with `/`. Never send an empty or whitespace-only value.

### "Invalid folder path" (`core.storage.folder_*`)

- **Cause:** the upload's `folderPath` form field has more segments than the entry's `maxFolderDepth` allows (default `2`), is empty, or one segment fails `isValidSegment()`.
- **Fix:** flatten the folder structure, or raise the limit on the entry:

```ts
import { DiskHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetEntry } from '@venizia/ignis/static-asset';

export const entry: TStaticAssetEntry = {
  basePath: '/uploads',
  bucket: 'uploads',
  helper: new DiskHelper({ basePath: './app_data' }),
  maxFolderDepth: 4,
  serverUpload: { use: true },
  directUpload: { use: false },
  metaLink: { use: false },
};
```

### "Invalid upload labels"

- **Cause:** a label in the upload body has the wrong shape. The usual one is a `sequence` that is not an integer.
- **Fix:** send `sequence` as a whole number. Labels in the query string are ignored, so move them into the form fields.

### "Empty file content"

- **Cause:** the uploaded file's buffer is empty - the client sent a zero-byte file field.
- **Fix:** verify the `FormData` field actually carries file bytes before submitting. A zero-byte file is rejected - this is not a size-limit issue.

### `maxKeys` answers `422`

- **Cause:** `listObjects`'s `maxKeys` is not a positive integer, for example `maxKeys=abc` or `maxKeys=-1`.
- **Fix:** send a positive integer, or omit the parameter.

### A key that should exist answers "Object not found" (404)

- **Cause:** the entry has a `keyPrefix`, and the requested key does not start with it. The route answers exactly as it would for a real miss, before calling storage, so a caller learns nothing about a key it does not own.
- **Fix:** request the key with its full prefix, for example `tenant-a/photos/2026/f.jpg` on an entry scoped to `tenant-a/`.

### "Object key is outside the key prefix of this controller"

- **Cause:** the entry has a `keyPrefix`, and `serverUpload.objectKey` returned a key outside it. The component never rewrites the key into scope - the application may have recorded the out-of-scope key elsewhere.
- **Fix:** have the hook build keys under the prefix, or drop the `keyPrefix` if the hook already scopes keys on its own and the entry has no `directUpload`.

### "[upload] Invalid original file name" with the default key

- **Cause:** the entry has no `serverUpload.objectKey`, so the component names the key itself and the original name must stay one segment.
- **Fix:** rename the file (drop the `/`), or set `serverUpload.objectKey` to build the key yourself, which frees the original name to be metadata.

### "[upload] Bucket does not exist"

- **Cause:** the component never creates the bucket, and the entry's `bucket` was never created in the storage.
- **Fix:** create it once. See [Create the bucket](./getting-started#create-the-bucket).

### An entry throws at start-up

- **Cause:** a rule in [Start-up refusals](#start-up-refusals) broke. The message starts with the entry's name.
- **Fix:** follow the row for that message.

### Controller not registering / no routes appear

- **Cause:** `STATIC_ASSET_OPTIONS` was never bound, or was bound to `{}` - the component's default. `binding()` iterates the options object and produces zero controllers for an empty map, without throwing.
- **Fix:** bind a non-empty options object before `this.component(StaticAssetComponent)`:

```ts
import { DiskHelper } from '@venizia/ignis-helpers';
import { StaticAssetBindingKeys } from '@venizia/ignis/static-asset';
import type { TStaticAssetComponentOptions } from '@venizia/ignis/static-asset';

export const bindOptions = (opts: {
  bind: (key: string, value: TStaticAssetComponentOptions) => void;
}): void => {
  opts.bind(StaticAssetBindingKeys.STATIC_ASSET_OPTIONS, {
    uploads: {
      basePath: '/uploads',
      bucket: 'uploads',
      helper: new DiskHelper({ basePath: './app_data' }),
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
    },
  });
};
```

### A route is missing

- **Cause:** the route's feature is off, or its toggle is `{ use: false }`. `upload` needs `serverUpload`, the three upload routes need `directUpload`, `uploadValidate` needs `directUpload.validation`, and `recreateMetaLink` needs `metaLink`. A `routes` toggle cannot switch on a route whose feature is off.
- **Fix:** switch the feature on, and check `routes` for a `{ use: false }`. See the [route table](./api#routes).

### Files not uploading (`DiskHelper`)

- **Cause:** the process lacks filesystem permissions on `basePath`, or the disk is out of space. `DiskHelper`'s constructor already creates `basePath` if it does not exist, so a missing directory is rarely the issue.
- **Fix:** verify the process has read/write permissions to the target path and enough free space.

### Files not uploading (`BunS3Helper`)

- **Cause:** endpoint connectivity or authentication failure.
- **Fix:**
  - Confirm the endpoint is reachable from this process.
  - Verify `accessKey`/`secretKey` and that `region` matches the bucket.
  - Behind a private endpoint, set `endpoint.public` so signed URLs carry a host a browser can reach.

### Large file uploads failing or timing out

- **Cause:** a server upload holds the whole body in memory while it is parsed, so a large file costs that much memory per request.
- **Fix:** bound it with `serverUpload.maxBytes`, and move large files to [direct upload](./direct-upload), where the bytes never reach your process.

### `BunS3Helper` fails to construct or import

- **Cause:** running outside Bun. `BunS3Helper` imports `S3Client` from the `bun` builtin module, which only resolves under the Bun runtime.
- **Fix:** run the app under Bun.

## The size ceiling, and the token errors

`upload_too_large` is **one** code for both upload paths: over `serverUpload.maxBytes` on `POST {base}/objects`, and over `directUpload.maxBytes` when a policy is requested. A second code would have been the same condition wearing two names.

The ordinary route checks twice. The route's body limit is `maxFiles` files of `maxBytes` each plus their multipart framing, so a body over it is refused (`core.request.body_too_large`) without being read into memory. Then each parsed file is checked against its actual byte length, which is the authoritative one. The body limit is not a per-file check: two 3 MB files pass under a `maxBytes` of 5 MB.

`invalid_commit_token` and `expired_commit_token` are both `400` and neither is a `404`. A token issued to another owner answers `invalid_commit_token`, the same as a forged one. A caller learns only that the token is no good, never whether the key it names exists - the route is not a name prober, and a forged token fails before any storage call, so timing leaks nothing either.

## See also

- [Overview](./) - what the component does and which upload to choose
- [Getting started](./getting-started) - three complete declarations
- [Security](./security) - auth and the direct-upload safeguards
- [Configuration reference](./api) - every option, route and key
- [Migration](./migration) - the codes and options that moved
