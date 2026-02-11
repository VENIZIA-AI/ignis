# Troubleshooting

### "Invalid bucket/object name"

**Cause:** The name fails `isValidName()` validation. Names cannot contain `..`, `/`, `\`, shell special characters, or start with `.`. Names must be <= 255 characters and non-empty.

**Fix:** Ensure names follow these rules:
- No path separators (`..`, `/`, `\`)
- No leading dot (`.hidden`)
- No shell special characters (`;`, `|`, `&`, `$`, `` ` ``, `<`, `>`, `(`, `)`, `{`, `}`, `[`, `]`, `!`, `#`)
- No control characters (`\n`, `\r`, `\0`)
- 255 characters or fewer
- Not empty or whitespace-only

### "Controller not registering"

**Cause:** Configuration key might be invalid or missing required fields.

**Fix:** Ensure each storage configuration has all required fields:

```typescript
{
  [uniqueKey]: {
    controller: { name, basePath, isStrict },
    storage: 'disk' | 'minio',
    helper: IStorageHelper,
    extra: {}
  }
}
```

### "Files not uploading (DiskHelper)"

**Cause:** The `basePath` directory does not exist or the process lacks filesystem permissions.

**Fix:** Ensure the `basePath` directory exists or can be created, and verify the process has read/write permissions to the target path.

### "Files not uploading (MinioHelper)"

**Cause:** MinIO server connectivity or authentication failure.

**Fix:**
- Verify MinIO server is running
- Check credentials (`accessKey`, `secretKey`)
- Verify network connectivity (`endPoint`, `port`)
- Check if `useSSL` matches your server configuration

### "Large file uploads failing"

**Cause:** Memory-based multipart parsing cannot handle the file size.

**Fix:** Switch to disk-based multipart parsing:

```typescript
extra: {
  parseMultipartBody: {
    storage: 'disk',
    uploadDir: './uploads',
  },
}
```
