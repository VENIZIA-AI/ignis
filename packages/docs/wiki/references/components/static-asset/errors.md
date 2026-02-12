# Static Asset -- Error Reference

> Name validation rules and troubleshooting guide for common issues.

## Name Validation

All bucket and object names go through `helper.isValidName()` before any storage operation. The validation blocks:

| Pattern | Example | Reason |
|---------|---------|--------|
| Path traversal | `../etc/passwd` | Contains `..`, `/`, or `\` |
| Hidden files | `.hidden` | Starts with `.` |
| Shell injection | `file;rm -rf /` | Contains `;`, `\|`, `&`, `$`, etc. |
| Header injection | `file\ninjected` | Contains `\n`, `\r`, or `\0` |
| Long names | 256+ chars | Exceeds 255 character limit |
| Empty names | `""`, `"  "` | Empty or whitespace-only |

Every endpoint that accepts `bucketName` validates it and returns HTTP 400 `"Invalid bucket name"` on failure. Every endpoint that accepts `objectName` validates it separately and returns HTTP 400 `"Invalid object name"` on failure.

## Troubleshooting

### "Invalid bucket/object name"

**Cause:** The name fails `isValidName()` validation. Names cannot contain `..`, `/`, `\`, shell special characters, or start with `.`. Names must be <= 255 characters and non-empty.

**Fix:** Ensure names follow these rules:
- No path separators (`..`, `/`, `\`)
- No leading dot (`.hidden`)
- No shell special characters (`;`, `|`, `&`, `$`, `` ` ``, `<`, `>`, `(`, `)`, `{`, `}`, `[`, `]`, `!`, `#`)
- No control characters (`\n`, `\r`, `\0`)
- 255 characters or fewer
- Not empty or whitespace-only

> [!NOTE]
> Every bucket-related endpoint (`GET`, `POST`, `DELETE` on `/buckets/:bucketName`) validates the bucket name and returns HTTP 400 with `"Invalid bucket name"` if validation fails. Object-related endpoints validate both bucket and object names.

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

## See Also

- [Setup & Configuration](./) - Quick Reference, Setup Steps, Configuration Options
- [Usage & Examples](./usage) - API Endpoints and Frontend Integration
- [API Reference](./api) - Controller Factory, Storage Interface, MetaLink Schema
