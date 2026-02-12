# Static Asset -- Usage & Examples

> API endpoint specifications, request/response details, and frontend integration examples.

## API Endpoints

The component dynamically generates REST endpoints for each configured storage backend. All backends expose the same API structure under their configured `basePath`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | <code v-pre>/{basePath}/buckets</code> | List all buckets |
| `GET` | <code v-pre>/{basePath}/buckets/:bucketName</code> | Get bucket by name |
| `POST` | <code v-pre>/{basePath}/buckets/:bucketName</code> | Create a bucket |
| `DELETE` | <code v-pre>/{basePath}/buckets/:bucketName</code> | Delete a bucket |
| `POST` | <code v-pre>/{basePath}/buckets/:bucketName/upload</code> | Upload files |
| `GET` | <code v-pre>/{basePath}/buckets/:bucketName/objects</code> | List objects |
| `GET` | <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName</code> | Stream file |
| `GET` | <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName/download</code> | Download file |
| `DELETE` | <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName</code> | Delete object |
| `PUT` | <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName/meta-links</code> | Sync MetaLink (MetaLink only) |

#### GET <code v-pre>/{basePath}/buckets</code>
**Response `200`:**
```json
[
  { "name": "my-bucket", "creationDate": "2025-01-01T00:00:00.000Z" }
]
```

#### GET <code v-pre>/{basePath}/buckets/:bucketName</code>
**Parameters:**
- `bucketName` (path): Bucket name

**Validation:** Bucket name validated with `isValidName()`. Returns 400 `"Invalid bucket name"` if invalid.

**Response `200`:**
```json
{ "name": "my-bucket", "creationDate": "2025-01-01T00:00:00.000Z" }
```

Returns `null` when the bucket does not exist. The response schema is nullable.

#### POST <code v-pre>/{basePath}/buckets/:bucketName</code>
**Parameters:**
- `bucketName` (path): Name of the new bucket

**Validation:** Bucket name validated with `isValidName()`. Returns 400 `"Invalid bucket name"` if invalid.

**Response `200`:**
```json
{ "name": "my-bucket", "creationDate": "2025-12-13T00:00:00.000Z" }
```

Returns `null` if bucket creation fails (e.g., already exists). The response schema is nullable.

#### DELETE <code v-pre>/{basePath}/buckets/:bucketName</code>
**Parameters:**
- `bucketName` (path): Bucket to delete

**Validation:** Bucket name validated with `isValidName()`. Returns 400 `"Invalid bucket name"` if invalid.

**Response `200`:**
```json
{ "isDeleted": true }
```

The `isDeleted` field is a boolean indicating whether the bucket was successfully removed from storage.

#### POST <code v-pre>/{basePath}/buckets/:bucketName/upload</code>
**Parameters:**
- `bucketName` (path): Target bucket name

**Query Parameters:**
- `principalType` (optional, string): Type of the principal to associate with the uploaded files (e.g., `"user"`, `"service"`)
- `principalId` (optional, string or number): ID of the principal. Always coerced to a string via `String()` before storage regardless of input type

**Validation:** Bucket name validated with `isValidName()`. Returns 400 `"Invalid bucket name"` if invalid.

**Request Body:** `multipart/form-data` with file fields. The request body is parsed using the `MultipartBodySchema` Zod schema:

```typescript
const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]),
});
```

This accepts either a single `File` or an array of `File` objects. Each file can optionally include `folderPath` for organization.

**Response `200` (without MetaLink):**
```json
[
  {
    "bucketName": "my-bucket",
    "objectName": "file.pdf",
    "link": "/assets/buckets/my-bucket/objects/file.pdf"
  }
]
```

**Response `200` (with MetaLink enabled):**
```json
[
  {
    "bucketName": "my-bucket",
    "objectName": "file.pdf",
    "link": "/assets/buckets/my-bucket/objects/file.pdf",
    "metaLink": {
      "id": "uuid",
      "bucketName": "my-bucket",
      "objectName": "file.pdf",
      "link": "/assets/buckets/my-bucket/objects/file.pdf",
      "mimetype": "application/pdf",
      "size": 1024,
      "etag": "abc123",
      "metadata": {},
      "storageType": "minio",
      "isSynced": true,
      "principalType": "user",
      "principalId": "42",
      "createdAt": "2025-12-15T03:00:00.000Z",
      "modifiedAt": "2025-12-15T03:00:00.000Z"
    }
  }
]
```

**Response `200` (with MetaLink enabled, MetaLink creation failed):**
```json
[
  {
    "bucketName": "my-bucket",
    "objectName": "file.pdf",
    "link": "/assets/buckets/my-bucket/objects/file.pdf",
    "metaLink": null,
    "metaLinkError": "Database connection failed"
  }
]
```

When MetaLink creation fails, the upload itself still succeeds. The response includes `metaLink: null` and a `metaLinkError` string describing the failure. The error is also logged via the controller's scoped logger.

**Example:**
```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

// Upload with principal association
const response = await fetch(
  '/assets/buckets/uploads/upload?principalType=user&principalId=123',
  { method: 'POST', body: formData },
);

const result = await response.json();
console.log(result[0].metaLink); // Database record (if MetaLink enabled)
```

#### GET <code v-pre>/{basePath}/buckets/:bucketName/objects</code>
**Parameters:**
- `bucketName` (path): Bucket name

**Validation:** Bucket name validated with `isValidName()`. Returns 400 `"Invalid bucket name"` if invalid.

**Query Parameters:**
- `prefix` (optional, string): Filter objects by prefix (e.g., `"folder/"`)
- `recursive` (optional, string): Recursive listing. Parsed via strict string comparison `=== 'true'` -- only the exact string `"true"` enables recursion; any other truthy value (e.g., `"1"`, `"yes"`) does not
- `maxKeys` (optional, string): Maximum number of objects to return. Parsed as integer via `parseInt(value, 10)`

**Response `200`:**
```json
[
  {
    "name": "file1.pdf",
    "size": 1024,
    "lastModified": "2025-12-13T00:00:00.000Z",
    "etag": "abc123",
    "prefix": "folder/"
  }
]
```

All fields in the `IObjectInfo` response are optional. The `prefix` field is present when listing non-recursively and the object is a directory prefix. When listing individual files, `name`, `size`, `lastModified`, and `etag` are typically populated.

#### GET <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName</code>
**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:** Both bucket and object names validated with `isValidName()`. Returns 400 `"Invalid bucket name"` or `"Invalid object name"` respectively if either is invalid.

**Response:**
- Streams file content with appropriate headers
- `Content-Type`: From storage metadata or `application/octet-stream` as fallback
- `Content-Length`: File size in bytes
- `X-Content-Type-Options`: `nosniff`
- Additional whitelisted headers forwarded from storage metadata (see [Header Sanitization](./api#header-sanitization))

#### GET <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName/download</code>
**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:** Both bucket and object names validated with `isValidName()`. Returns 400 `"Invalid bucket name"` or `"Invalid object name"` respectively if either is invalid.

**Response:**
- Streams file with download headers
- `Content-Disposition`: `attachment; filename="..."` (generated via `createContentDispositionHeader()`)
- `Content-Type`: From storage metadata or `application/octet-stream` as fallback
- `Content-Length`: File size in bytes
- `X-Content-Type-Options`: `nosniff`
- Additional whitelisted headers forwarded from storage metadata (see [Header Sanitization](./api#header-sanitization))
- Triggers browser download dialog

**Example:**
```typescript
const downloadUrl = `/assets/buckets/uploads/objects/${encodeURIComponent('document.pdf')}/download`;
window.open(downloadUrl, '_blank');
```

#### DELETE <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName</code>
**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object to delete (URL-encoded)

**Validation:** Both bucket and object names validated with `isValidName()`. Returns 400 `"Invalid bucket name"` or `"Invalid object name"` respectively if either is invalid.

**Behavior:**
- Deletes file from storage
- If MetaLink enabled, the MetaLink database record deletion is **fire-and-forget** -- the HTTP response returns immediately after the storage delete completes, without awaiting the database deletion
- MetaLink deletion errors are logged but do not fail the request
- MetaLink deletion uses `deleteAll({ where: { bucketName, objectName } })` to remove all matching records

**Response `200`:**
```json
{ "success": true }
```

**Example:**
```typescript
const bucketName = 'user-uploads';
const objectName = 'document.pdf';

await fetch(`/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}`, {
  method: 'DELETE',
});
// File deleted from storage
// MetaLink record deletion initiated (if enabled) but may complete after response
```

#### PUT <code v-pre>/{basePath}/buckets/:bucketName/objects/:objectName/meta-links</code>
**Availability:** Only registered when `useMetaLink: true`.

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:** Both bucket and object names validated with `isValidName()`. Returns 400 `"Invalid bucket name"` or `"Invalid object name"` respectively if either is invalid.

**Behavior:**
- Fetches current file metadata from storage via `helper.getStat()`
- Generates the file link using `normalizeLinkFn` (or the default link format <code v-pre>{basePath}/buckets/{bucket}/objects/{encodedName}</code>)
- If MetaLink exists (matched by `bucketName` + `objectName`): Updates with latest metadata via `updateById()`, then refetches via `findById()`
- If MetaLink doesn't exist: Creates new MetaLink record via `create()`
- Always sets `isSynced: true` to mark as synchronized

**Use Cases:**
- Manually sync files that exist in storage but not in database
- Update MetaLink metadata after file changes
- Rebuild MetaLink records after database restore
- Bulk synchronization operations

**Response `200` (MetaLink created or updated):**
```json
{
  "success": true,
  "metaLink": {
    "id": "uuid",
    "bucketName": "user-uploads",
    "objectName": "document.pdf",
    "link": "/assets/buckets/user-uploads/objects/document.pdf",
    "mimetype": "application/pdf",
    "size": 1048576,
    "etag": "abc123",
    "metadata": {},
    "storageType": "minio",
    "isSynced": true,
    "principalType": null,
    "principalId": null,
    "createdAt": "2025-12-15T03:00:00.000Z",
    "modifiedAt": "2025-12-15T03:00:00.000Z"
  }
}
```

The response always wraps the MetaLink in a `{ success: boolean, metaLink: ... }` envelope. Both create and update flows return the same shape.

**Example:**
```typescript
// Sync a single file
const bucketName = 'user-uploads';
const objectName = 'document.pdf';

const response = await fetch(
  `/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/meta-links`,
  { method: 'PUT' }
);

const result = await response.json();
console.log('Success:', result.success);       // true
console.log('Synced:', result.metaLink.isSynced); // true

// Bulk sync example: sync all files in storage
const objects = await fetch(`/assets/buckets/${bucketName}/objects`).then(r => r.json());

for (const obj of objects) {
  await fetch(
    `/assets/buckets/${bucketName}/objects/${encodeURIComponent(obj.name)}/meta-links`,
    { method: 'PUT' }
  );
}
```

## Frontend Integration

```typescript
// Upload file with principal association
async function uploadFile(file: File, principalType?: string, principalId?: string) {
  const formData = new FormData();
  formData.append('file', file);

  const url = new URL('/assets/buckets/user-uploads/upload', window.location.origin);
  if (principalType) url.searchParams.append('principalType', principalType);
  if (principalId) url.searchParams.append('principalId', principalId);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  return result[0].link;
}

// Download file
function downloadFile(bucketName: string, objectName: string) {
  const url = `/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/download`;
  window.open(url, '_blank');
}

// List files in bucket
async function listFiles(bucketName: string, prefix?: string, recursive?: boolean) {
  const url = new URL(`/assets/buckets/${bucketName}/objects`, window.location.origin);
  if (prefix) url.searchParams.append('prefix', prefix);
  if (recursive) url.searchParams.append('recursive', 'true');

  const response = await fetch(url);
  return await response.json();
}
```

## See Also

- [Setup & Configuration](./) - Quick Reference, Setup Steps, Configuration Options
- [API Reference](./api) - Controller Factory, Storage Interface, MetaLink Schema
- [Error Reference](./errors) - Name Validation and Troubleshooting
