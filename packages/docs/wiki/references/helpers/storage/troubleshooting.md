# Troubleshooting

### Bucket already exists error on `createBucket()`

**Cause:** Both `DiskHelper` and `MinioHelper` throw an error if you call `createBucket()` on a bucket that already exists.

**Fix:** Always check first:

```typescript
const exists = await storage.isBucketExists({ name: 'my-bucket' });
if (!exists) {
  await storage.createBucket({ name: 'my-bucket' });
}
```

### File upload fails with "Invalid original file name"

**Cause:** The `upload()` method validates all file names through `isValidName()` before writing. Common causes:

- Filename contains path separators (`/`, `\`) -- flatten or use `folderPath` instead
- Filename starts with a dot (`.gitignore`, `.env`) -- rename before upload
- Filename contains shell-special characters (`;`, `|`, `&`, `$`, etc.)

**Fix:** Use `normalizeNameFn` to sanitize before validation:

```typescript
const result = await storage.upload({
  bucket: 'my-bucket',
  files: files,
  normalizeNameFn: ({ originalName }) => {
    return originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  },
});
```

### DiskHelper `removeBucket()` fails with "Bucket is not empty"

**Cause:** `DiskHelper.removeBucket()` requires the bucket directory to be empty.

**Fix:** Remove all objects first:

```typescript
const objects = await diskHelper.listObjects({ bucket: 'my-bucket', useRecursive: true });
if (objects.length > 0) {
  await diskHelper.removeObjects({
    bucket: 'my-bucket',
    names: objects.map(o => o.name!),
  });
}
await diskHelper.removeBucket({ name: 'my-bucket' });
```

### MinioHelper connection errors

**Cause:** Network or configuration issue between your application and the MinIO server.

**Checklist:**
- The MinIO server is running and reachable at the configured `endPoint` and `port`
- `useSSL` matches your server's TLS configuration
- `accessKey` and `secretKey` are correct
- Network/firewall rules allow the connection

Access the underlying minio client for debugging:

```typescript
// Direct client access for advanced operations
const buckets = await minioClient.client.listBuckets();
```
