---
title: Static Asset Component - Error Reference
description: Every error condition StaticAssetComponent and its storage helpers can raise, plus fixes
difficulty: intermediate
---

# Error Reference

Every error condition the static asset controller and storage helpers can raise, with cause and fix.

## Error conditions

| Message | Cause | HTTP Status |
|---------|-------|-------------|
| `"Invalid bucket name"` | `bucketName` fails `isValidName()` | `400` |
| `"Invalid object name or path"` | `objectName` fails `isValidPath()` | `400` |
| `"Invalid folder path"` | Upload's `folderPath` query param is empty after trimming leading/trailing slashes | `400` |
| <code v-pre>"Folder path exceeds max depth of {n}"</code> | Upload's `folderPath` has more segments than `maxFolderDepth` (default `2`) | `400` |
| <code v-pre>"Invalid folder path segment: {segment}"</code> | One `folderPath` segment fails `isValidName()` | `400` |
| <code v-pre>"Empty file content \| name: {originalName}"</code> | The uploaded file's buffer is empty after multipart parsing (or after re-reading a disk-spooled file) | `400` |
| <code v-pre>"Invalid maxKeys \| Expected a positive integer \| value: {value}"</code> | `listObjects`'s `maxKeys` query param does not parse to a positive integer | `400` |
| <code v-pre>[upload] Bucket does not exist \| name: {bucket}</code> | `helper.upload()` found no matching bucket via `isBucketExists()` | `400` (default) |
| `[upload] Invalid original file name` | A file's `originalName` fails `isValidName()`, checked inside `helper.upload()` | `400` (default) |
| `[upload] Invalid folder path` | `helper.upload()`'s own `folderPath` depth/`isValidPath()` check failed | `400` (default) |
| <code v-pre>[upload] Invalid file size \| size: {size}</code> | A file's `size` is `undefined`, `null`, or negative | `400` (default) |
| <code v-pre>[upload] Invalid normalized object name \| name: {name}</code> | The name returned by `normalizeNameFn` fails `isValidPath()` | `400` (default) |
| `[createBucket] Invalid name to create bucket!` | `MinioHelper.createBucket()` called with a name failing `isValidName()` - only reachable calling the helper directly, the controller validates first | `400` (default) |
| <code v-pre>[parseMultipartBody] storage: {storage} \| Invalid storage type \| Valids: ['memory', 'disk']</code> | `extra.parseMultipartBody.storage` set to something other than `'memory'`/`'disk'` - a configuration error, not user input | `400` (default) |

> [!NOTE]
> Entries marked "default" pass no explicit `statusCode` to `getError()`; `ApplicationError` defaults `statusCode` to `400` in that case.

## Name validation rules

Bucket names are validated with `isValidName()` (single segment, no path separators). Object names, which may include folder segments (e.g. `2026/uploads/report.pdf`), are validated with `isValidPath()` - every segment still runs through `isValidName()`.

| Pattern | Example | Reason |
|---------|---------|--------|
| Path traversal | `../etc/passwd` | Contains `..`, `/`, or `\` |
| Hidden files | `.hidden` | Starts with `.` |
| Shell metacharacters | `file;rm -rf /` | Contains `;`, `\|`, `&`, `$`, `` ` ``, `<`, `>`, `{`, `}`, `[`, `]`, `!`, or `#` |
| Control characters | `file\ninjected` | Contains `\n`, `\r`, or `\0` |
| Long names | 256+ characters | Exceeds the 255-character limit |
| Empty names | `""`, `"  "` | Empty or whitespace-only |
| Double slashes (path only) | `a//b.png` | `isValidPath()` rejects empty segments |
| Excess folder depth (path only) | `a/b/c/d.png` with `maxFolderDepth: 2` | `folderDepth = segments.length - 1` exceeds the limit |
| Long paths (path only) | 1025+ characters | Exceeds the 1024-character normalized-path limit |

## Troubleshooting

### "Invalid bucket name" / "Invalid object name or path"

- **Cause:** the name fails the rules above.
- **Fix:** strip path separators, leading dots, shell metacharacters, and control characters; keep names under 255 characters (1024 for a full object path); never send an empty or whitespace-only value.

```typescript
// Wrong - contains a path separator, rejected by isValidName()
await fetch('/assets/buckets/user/uploads', { method: 'POST' });

// Right - one segment
await fetch('/assets/buckets/user-uploads', { method: 'POST' });
```

### "Folder path exceeds max depth" / "Invalid folder path segment"

- **Cause:** the upload's `folderPath` query parameter has more segments than `maxFolderDepth` allows (default `2`), or one segment fails `isValidName()`.
- **Fix:** flatten the folder structure, or raise the limit via `extra.maxFolderDepth` when registering the backend.

```typescript
{
  storage: StaticAssetStorageTypes.DISK,
  helper: new DiskHelper({ basePath: './uploads' }),
  extra: { maxFolderDepth: 4 },
}
```

### "Empty file content"

- **Cause:** the uploaded file's buffer is empty - either the client sent a zero-byte file field, or `parseMultipartBody` produced no readable content.
- **Fix:** verify the `FormData` field actually carries file bytes before submitting; a zero-byte file is rejected, this is not a size-limit issue.

### "Invalid maxKeys"

- **Cause:** `listObjects`'s `maxKeys` query string does not parse to a positive integer via `Number(maxKeys)` + `Number.isInteger()` - e.g. `maxKeys=abc` or `maxKeys=-1`.
- **Fix:** only send positive integer strings, or omit the parameter entirely.

```typescript
url.searchParams.set('maxKeys', '50'); // OK
// url.searchParams.set('maxKeys', 'all'); // 400
```

### "[upload] Bucket does not exist"

- **Cause:** `helper.upload()` checked `isBucketExists()` and found no match - the bucket was never created, or was deleted between requests.
- **Fix:** create the bucket first with `POST /buckets/:bucketName`, or check `GET /buckets/:bucketName` before uploading.

### Controller not registering / no routes appear

- **Cause:** `STATIC_ASSET_COMPONENT_OPTIONS` was never bound, or was bound to `{}` - the component's default. `binding()` iterates the options object and produces zero controllers for an empty map, without throwing.
- **Fix:** bind a non-empty options object before `this.component(StaticAssetComponent)`:

```typescript
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  [uniqueKey]: {
    controller: { name: 'AssetController', basePath: '/assets' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './uploads' }),
  },
});
this.component(StaticAssetComponent);
```

### Files not uploading (`DiskHelper`)

- **Cause:** the process lacks filesystem permissions on `basePath`, or the disk is out of space. `DiskHelper`'s constructor already creates `basePath` if it does not exist, so a missing directory is rarely the issue.
- **Fix:** verify the process has read/write permissions to the target path and enough free space.

### Files not uploading (`MinioHelper`)

- **Cause:** MinIO server connectivity or authentication failure.
- **Fix:**
  - Confirm the MinIO server is reachable at `endPoint`/`port`.
  - Verify `accessKey`/`secretKey`.
  - Check `useSSL` matches the server's actual TLS configuration.

### Large file uploads failing or timing out

- **Cause:** `parseMultipartBody: { storage: 'memory' }` (the default) buffers the entire file in process memory before writing it to the backend.
- **Fix:** switch to disk-based spooling:

```typescript
extra: {
  parseMultipartBody: { storage: 'disk', uploadDir: './tmp/uploads' },
}
```

### `BunS3Helper` fails to construct or import

- **Cause:** running on Node.js. `BunS3Helper` imports `S3Client` from the `bun` builtin module, which only resolves under the Bun runtime.
- **Fix:** use `MinioHelper` (also S3-compatible) on Node.js, or run the app under Bun.

## See also

- [Overview](./) - quick start, imports, and common configuration tasks
- [Usage & Examples](./usage) - task-oriented walkthroughs for every endpoint and MetaLink setup
- [Full Reference](./api) - controller factory, `IStorageHelper` interface, MetaLink schema, internals
