---
title: Static Asset Component - Error Reference
description: Every error condition StaticAssetComponent and its storage helpers can raise, plus fixes
difficulty: intermediate
---

# Error Reference

Every error condition the static asset controller and storage helpers can raise, with cause and fix.

## Catalogued errors

These carry a machine code a client can branch on, alongside the human message. The code is the stable contract; the message text may be overridden at a throw site to name the offending value.

| Code | Status | When | What the client should do |
|------|--------|------|---------------------------|
| `core.static_asset.bucket_name_invalid` | `400` | `bucketName` fails `isValidBucketName()` | Send one valid segment. Do not retry as is. |
| `core.static_asset.object_name_invalid` | `400` | `objectName` fails `isValidObjectKey()` | Fix the name. Do not retry as is. |
| `core.static_asset.folder_path_invalid` | `400` | The upload's `folderPath` is empty after trimming slashes | Send a real folder or omit the field. |
| `core.static_asset.folder_segment_invalid` | `400` | One `folderPath` segment fails `isValidSegment()` | Rename the segment. |
| `core.static_asset.folder_depth_exceeded` | `400` | `folderPath` is deeper than `serverUpload.maxFolderDepth` | Flatten the folders, or raise the limit. |
| `core.static_asset.file_empty` | `400` | A file is empty after parsing | Check the file has bytes before sending. |
| `core.static_asset.max_keys_invalid` | `400` | `listObjects`'s `maxKeys` is not a positive integer | Send a positive integer or omit it. |
| `core.static_asset.upload_too_large` | `413` | A file is over `serverUpload.maxBytes` (upload) or `directUpload.maxBytes` (policy request) | Send a smaller file. |
| `core.static_asset.upload_invalid` | `422` | `commit` ran your `validation` and the file is invalid | Call `upload-validate` with the same token to read the issues, fix the file, upload again with a **new** policy. |
| `core.static_asset.upload_not_authorized` | `403` | `directUpload.authorize` returned `false` on `upload-policy`, `upload-validate` or `upload-commit` | Do not retry: the caller may not use direct upload. |
| `core.static_asset.invalid_commit_token` | `400` | The token is forged, malformed, in an old format, or issued to a different owner | Ask for a new policy. The answer is the same for all four, on purpose. |
| `core.static_asset.expired_commit_token` | `400` | `expires.commit` has passed | Ask for a new policy and upload again. |
| `core.static_asset.labels_in_query` | `400` | A label (`principalType`, `principalId`, `variant`, `sequence`, `folderPath`) is in the query string | Move the labels into the request body. |
| `core.static_asset.object_key_out_of_scope` | `400` | An `objectKey` hook returned a key outside the `keyPrefix` | Server-side: build the key under the prefix. |
| `core.storage.object_not_found` | `404` | No object at the key, or the key is outside the `keyPrefix` | Treat as absent. |

The `core.static_asset.*` codes live on `StaticAssetErrors`; `core.storage.object_not_found` lives on `StorageErrors` in the helpers package. Both register with the shared key registry, so `messageCode` autocompletes.

### The statuses of `upload-validate`

A valid token answers `200` `{ isValid, issues }` **even when the file has problems**: the call worked, and the issues ride the body. Your handler runs only then. Everything else answers before it:

| Status | Code | Cause |
|---|---|---|
| `422` | - | The body is malformed |
| `401` | - | Unauthenticated, per the entry's `auth` |
| `403` | `upload_not_authorized` | `directUpload.authorize` returned `false` |
| `400` | `invalid_commit_token` | A forged token or a different owner |
| `400` | `expired_commit_token` | `expires.commit` has passed |
| `404` | `object_not_found` | The key is outside the `keyPrefix` |

With no `validation` configured the route does not exist and answers `404`.

> [!NOTE]
> `core.request.body_too_large` (`413`) and `core.request.body_malformed` (`400`) are not static-asset codes - they live on the kernel's `RequestErrors`, alongside every other route. See [Middlewares Reference](/references/base/middlewares#body-limit-configs-middlewares-bodylimit).

## Error conditions

| Message | Cause | Code | HTTP Status |
|---------|-------|------|-------------|
| `"Invalid bucket name"` | `bucketName` fails `isValidBucketName()` | `core.static_asset.bucket_name_invalid` | `400` |
| `"Invalid object name or path"` | `objectName` fails `isValidObjectKey()` | `core.static_asset.object_name_invalid` | `400` |
| `"Invalid folder path"` | Upload's `folderPath` form field is empty after trimming leading/trailing slashes | `core.static_asset.folder_path_invalid` | `400` |
| <code v-pre>"Folder path exceeds max depth of {n}"</code> | Upload's `folderPath` has more segments than `serverUpload.maxFolderDepth` (default `2`) | `core.static_asset.folder_depth_exceeded` | `400` |
| <code v-pre>"Invalid folder path segment: {segment}"</code> | One `folderPath` segment fails `isValidSegment()` | `core.static_asset.folder_segment_invalid` | `400` |
| <code v-pre>"Empty file content \| name: {originalName}"</code> | The uploaded file's buffer is empty after multipart parsing (or after re-reading a disk-spooled file) | `core.static_asset.file_empty` | `400` |
| <code v-pre>"Invalid maxKeys \| Expected a positive integer \| value: {value}"</code> | `listObjects`'s `maxKeys` query param does not parse to a positive integer | `core.static_asset.max_keys_invalid` | `400` |
| <code v-pre>[getObject] Object not found \| bucket: {bucket} \| key: {key}</code> (also `[getObjectStream]`, `[getStat]`, `[removeObject]`) | No object at that bucket and key. `DiskHelper` throws it directly; `BunS3Helper` maps the backend's own failure onto it through `asStorageError` | `core.storage.object_not_found` | `404` |
| <code v-pre>Object not found \| key: {key}</code> | The key does not start with the `keyPrefix` - answered before any storage call, so a caller learns nothing about a key outside its scope | `core.storage.object_not_found` | `404` |
| `"Object key is outside the key prefix of this controller"` | A `serverUpload.objectKey` key falls outside the `keyPrefix` | `core.static_asset.object_key_out_of_scope` | `400` |
| <code v-pre>[upload] Bucket does not exist \| name: {bucket}</code> | `helper.upload()` found no matching bucket via `hasBucket()` | - | `400` (default) |
| `[upload] Invalid original file name` | With no naming hook, a file's `originalName` becomes the key and fails `isValidSegment()` (single segment: no `/`). The static-asset controller with `serverUpload.objectKey` set relaxes this - `originalName` is then metadata, checked by the looser `isValidOriginalName()` (not blank, at most 255 characters, no control character or lone surrogate). **One exception:** a `keyPrefix` with no `serverUpload.objectKey` (the component's own default naming under a scope) keeps the strict, single-segment rule - a `keyPrefix` alone does not relax it | - | `400` (default) |
| <code v-pre>[upload] Invalid folder path \| depth: {n} \| max: {m}</code> | `helper.upload()`'s own check found more `folderPath` segments than `maxFolderDepth` allows | - | `400` (default) |
| `[upload] Invalid folder path` | `helper.upload()`'s own path check failed for any other reason | - | `400` (default) |
| <code v-pre>[upload] Invalid file size \| size: {size}</code> | A file's `size` is `undefined`, `null`, or negative | - | `400` (default) |
| <code v-pre>[upload] Invalid normalized object name \| name: {name}</code> | The key returned by the naming hook fails `isValidObjectKey()` | - | `400` (default) |
| `[createBucket] Invalid name to create bucket!` | `createBucket()` called with a name failing `isValidBucketName()` - only reachable calling a helper directly, the controller validates first | - | `400` (default) |
| <code v-pre>[createBucket] Bucket already exists \| name: {name}</code> | `DiskHelper.createBucket()` called with a name that already exists on disk. `BunS3Helper` throws whatever the S3 endpoint returns for the same case instead | - | `400` (default) |
| `[removeBucket] Invalid name to remove bucket!` | `removeBucket()` called with a name failing `isValidBucketName()` - only reachable calling a helper directly | - | `400` (default) |
| <code v-pre>[removeBucket] Bucket does not exist \| name: {name}</code> | `DiskHelper.removeBucket()` - no directory at that bucket name | - | `400` (default) |
| <code v-pre>[removeBucket] Bucket is not empty \| name: {name}</code> | `DiskHelper.removeBucket()` - the bucket directory still has files in it | - | `400` (default) |
| <code v-pre>[parseMultipartBody] storage: {storage} \| Invalid storage type \| Valids: ['memory', 'disk']</code> | `serverUpload.spool.storage` set to something other than `'memory'`/`'disk'` - a configuration error, not user input | - | `400` (default) |

> [!NOTE]
> Entries marked "default" pass no explicit `statusCode` to `getError()`. `ApplicationError` defaults `statusCode` to `400` in that case.

## Name validation rules

Bucket names are validated with `isValidBucketName()`, which is `isValidSegment()` applied to `bucket.name` (single segment, no path separators). Object keys, which may include folder segments (for example `2026/uploads/report.pdf`), are validated with `isValidObjectKey()` - every segment still runs through `isValidSegment()`.

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

### "Invalid bucket name" / "Invalid object name or path"

- **Cause:** the name fails the rules above.
- **Fix:** strip path separators, leading dots, shell metacharacters, and control characters. Keep each name within 255 bytes in UTF-8 (1024 bytes for a full object path), and never end a key with `/`. Never send an empty or whitespace-only value.

```typescript
// Wrong - contains a path separator, rejected by isValidBucketName()
await fetch('/assets/buckets/user/uploads', { method: 'POST' });

// Right - one segment
await fetch('/assets/buckets/user-uploads', { method: 'POST' });
```

### "Folder path exceeds max depth" / "Invalid folder path segment"

- **Cause:** the upload's `folderPath` form field has more segments than `serverUpload.maxFolderDepth` allows (default `2`), or one segment fails `isValidSegment()`.
- **Fix:** flatten the folder structure, or raise the limit via `serverUpload.maxFolderDepth` on the entry.

```ts
import { DiskHelper } from '@venizia/ignis-helpers';
import type { TStaticAssetEntry } from '@venizia/ignis/static-asset';

export const entry: TStaticAssetEntry = {
  basePath: '/uploads',
  helper: new DiskHelper({ basePath: './uploads' }),
  serverUpload: { maxFolderDepth: 4 },
};
```

### "Empty file content"

- **Cause:** the uploaded file's buffer is empty - either the client sent a zero-byte file field, or `RequestUtility.parseMultipartBody` produced no readable content.
- **Fix:** verify the `FormData` field actually carries file bytes before submitting. A zero-byte file is rejected - this is not a size-limit issue.

### "Invalid maxKeys"

- **Cause:** `listObjects`'s `maxKeys` query string does not parse to a positive integer via `Number(maxKeys)` + `Number.isInteger()` - for example `maxKeys=abc` or `maxKeys=-1`.
- **Fix:** only send positive integer strings, or omit the parameter entirely.

```typescript
url.searchParams.set('maxKeys', '50'); // OK
// url.searchParams.set('maxKeys', 'all'); // 400
```

### A key that should exist answers "Object not found" (404)

- **Cause:** the entry has a `keyPrefix`, and the requested key does not start with it. The route answers exactly as it would for a real miss, before calling storage, so a caller learns nothing about a key it does not own.
- **Fix:** request the key with its full prefix, for example `tenant-a/photos/2026/f.jpg` on a controller scoped to `tenant-a`.

### "Object key is outside the key prefix of this controller"

- **Cause:** the entry has a `keyPrefix`, and `serverUpload.objectKey` returned a key outside it. The component never rewrites the key into scope - the application may have recorded the out-of-scope key elsewhere.
- **Fix:** have the hook build keys under the prefix, or drop the `keyPrefix` if the hook already scopes keys on its own.

### "[upload] Invalid original file name" under a `keyPrefix`

- **Cause:** the entry has a `keyPrefix` and no `serverUpload.objectKey` - the component's own default naming under a scope. That path keeps the strict, single-segment rule a name has without any scope; `keyPrefix` alone does not relax it.
- **Fix:** rename the file (drop the `/`), or set `serverUpload.objectKey` to build the key yourself, which frees the original name to be metadata.

### "keyPrefix needs bucket" / "directUpload needs bucket"

- **Cause:** the entry sets `keyPrefix` or `directUpload` without a `bucket` (bucket-in-URL mode). Without a configured bucket the bucket routes cannot be scoped, and a policy would name a bucket the caller chooses. The types refuse it; this is the start-up guard for a caller the types do not reach.
- **Fix:** add `bucket` to the entry.

### "directUpload needs authorize or auth"

- **Cause:** the entry has `directUpload`, no `directUpload.authorize`, and an `auth` that neither authenticates nor authorizes (or no `auth` at all). A route that hands out a write credential has no safe default for who may call it.
- **Fix:** set `auth.authenticate` or `auth.authorize` on the entry, or give `directUpload` its own `authorize`.

### "[upload] Bucket does not exist"

- **Cause:** `helper.upload()` checked `hasBucket()` and found no match - the bucket was never created, or was deleted between requests.
- **Fix:** create the bucket first with `POST /buckets/:bucketName`, or check `GET /buckets/:bucketName` before uploading.

### "Bucket already exists"

- **Cause:** `POST /buckets/:bucketName` was called for a bucket that already exists. `createBucket()` throws rather than returning `null` - it does not silently succeed on a duplicate.
- **Fix:** check `GET /buckets/:bucketName` first, or treat the throw as "already there" and continue.

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
      helper: new DiskHelper({ basePath: './uploads' }),
    },
  });
};
```

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

- **Cause:** `serverUpload.spool` unset (memory, the default) buffers the entire file in process memory before writing it to the backend.
- **Fix:** switch to disk-based spooling:

```ts
import { MultipartStorages } from '@venizia/ignis-helpers';
import type { TStaticAssetServerUpload } from '@venizia/ignis/static-asset';

export const serverUpload: TStaticAssetServerUpload = {
  spool: { storage: MultipartStorages.DISK, dir: './tmp/uploads' },
};
```

### `BunS3Helper` fails to construct or import

- **Cause:** running outside Bun. `BunS3Helper` imports `S3Client` from the `bun` builtin module, which only resolves under the Bun runtime.
- **Fix:** run the app under Bun, or use `DiskHelper` outside it.

## The size ceiling, and the token errors

`upload_too_large` is **one** code for both upload paths: over `serverUpload.maxBytes` on
`POST {base}/objects`, and over `directUpload.maxBytes` when a policy is requested. A second code
would have been the same condition wearing two names.

The ordinary route checks twice. The request's `content-length` is read before the body is spooled,
so an oversized upload is refused without first landing on disk; then each parsed file is checked
against its actual byte length, which is the authoritative one - a multipart envelope is larger than
the files inside it, and a declared length is whatever the client declared.

`invalid_commit_token` and `expired_commit_token` are both `400` and neither is a `404`. A token issued to another owner answers `invalid_commit_token`, the same as a forged one. A caller
learns only that the token is no good, never whether the key it names exists - the route is not a
name prober, and a forged token fails before any storage call, so timing leaks nothing either.

## See also

- [Overview](./) - what the component does and which upload to choose
- [Getting started](./getting-started) - three complete declarations
- [Security](./security) - auth and the direct-upload safeguards
- [Configuration reference](./api) - every option, route and key
