# API Endpoints

The component dynamically generates REST endpoints for each configured storage backend. All backends expose the same API structure under their configured `basePath`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{basePath}/buckets` | List all buckets |
| `GET` | `/{basePath}/buckets/:bucketName` | Get bucket by name |
| `POST` | `/{basePath}/buckets/:bucketName` | Create a bucket |
| `DELETE` | `/{basePath}/buckets/:bucketName` | Delete a bucket |
| `POST` | `/{basePath}/buckets/:bucketName/upload` | Upload files |
| `GET` | `/{basePath}/buckets/:bucketName/objects` | List objects |
| `GET` | `/{basePath}/buckets/:bucketName/objects/:objectName` | Stream file |
| `GET` | `/{basePath}/buckets/:bucketName/objects/:objectName/download` | Download file |
| `DELETE` | `/{basePath}/buckets/:bucketName/objects/:objectName` | Delete object |
| `PUT` | `/{basePath}/buckets/:bucketName/objects/:objectName/meta-links` | Sync MetaLink (MetaLink only) |

::: details GET /{basePath}/buckets
**Response `200`:**
```json
[
  { "name": "my-bucket", "creationDate": "2025-01-01T00:00:00.000Z" }
]
```
:::

::: details GET /{basePath}/buckets/:bucketName
**Parameters:**
- `bucketName` (path): Bucket name

**Validation:** Bucket name validated with `isValidName()`. Returns 400 if invalid.

**Response `200`:**
```json
{ "name": "my-bucket", "creationDate": "2025-01-01T00:00:00.000Z" }
```
:::

::: details POST /{basePath}/buckets/:bucketName
**Parameters:**
- `bucketName` (path): Name of the new bucket

**Response `200`:**
```json
{ "name": "my-bucket", "creationDate": "2025-12-13T00:00:00.000Z" }
```
:::

::: details DELETE /{basePath}/buckets/:bucketName
**Parameters:**
- `bucketName` (path): Bucket to delete

**Response `200`:**
```json
{ "success": true }
```
:::

::: details POST /{basePath}/buckets/:bucketName/upload
**Request Body:** `multipart/form-data` with file fields. Each file can optionally include `folderPath` for organization.

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
      "createdAt": "2025-12-15T03:00:00.000Z",
      "modifiedAt": "2025-12-15T03:00:00.000Z"
    }
  }
]
```

**Example:**
```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

const response = await fetch('/assets/buckets/uploads/upload', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log(result[0].metaLink); // Database record (if MetaLink enabled)
```
:::

::: details GET /{basePath}/buckets/:bucketName/objects
**Parameters:**
- `bucketName` (path): Bucket name

**Query Parameters:**
- `prefix` (optional): Filter by prefix
- `recursive` (optional, boolean): Recursive listing
- `maxKeys` (optional, number): Maximum objects to return

**Response `200`:**
```json
[
  {
    "name": "file1.pdf",
    "size": 1024,
    "lastModified": "2025-12-13T00:00:00.000Z",
    "etag": "abc123"
  }
]
```
:::

::: details GET /{basePath}/buckets/:bucketName/objects/:objectName
**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:** Both bucket and object names validated. Returns 400 if either is invalid.

**Response:**
- Streams file content with appropriate headers
- `Content-Type`: From metadata or `application/octet-stream`
- `Content-Length`: File size in bytes
- `X-Content-Type-Options`: `nosniff`
:::

::: details GET /{basePath}/buckets/:bucketName/objects/:objectName/download
**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Response:**
- Streams file with download headers
- `Content-Disposition`: `attachment; filename="..."`
- Triggers browser download dialog

**Example:**
```typescript
const downloadUrl = `/assets/buckets/uploads/objects/${encodeURIComponent('document.pdf')}/download`;
window.open(downloadUrl, '_blank');
```
:::

::: details DELETE /{basePath}/buckets/:bucketName/objects/:objectName
**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object to delete (URL-encoded)

**Validation:** Both bucket and object names validated. Returns 400 if either is invalid.

**Behavior:**
- Deletes file from storage
- If MetaLink enabled, also deletes database record
- MetaLink deletion errors are logged but don't fail the request

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
// MetaLink record deleted from database (if enabled)
```
:::

::: details PUT /{basePath}/buckets/:bucketName/objects/:objectName/meta-links
**Availability:** Only available when `useMetaLink: true`.

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name (URL-encoded)

**Validation:** Both bucket and object names validated. Returns 400 if either is invalid.

**Behavior:**
- Fetches current file metadata from storage
- If MetaLink exists: Updates with latest metadata
- If MetaLink doesn't exist: Creates new MetaLink record
- Sets `isSynced: true` to mark as synchronized

**Use Cases:**
- Manually sync files that exist in storage but not in database
- Update MetaLink metadata after file changes
- Rebuild MetaLink records after database restore
- Bulk synchronization operations

**Response `200` (MetaLink created):**
```json
{
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
  "createdAt": "2025-12-15T03:00:00.000Z",
  "modifiedAt": "2025-12-15T03:00:00.000Z"
}
```

**Response `200` (MetaLink updated):**
```json
{
  "id": "existing-uuid",
  "bucketName": "user-uploads",
  "objectName": "document.pdf",
  "link": "/assets/buckets/user-uploads/objects/document.pdf",
  "mimetype": "application/pdf",
  "size": 1048576,
  "etag": "abc123updated",
  "metadata": {},
  "storageType": "minio",
  "isSynced": true,
  "createdAt": "2025-12-15T02:00:00.000Z",
  "modifiedAt": "2025-12-15T03:00:00.000Z"
}
```

**Example:**
```typescript
// Sync a single file
const bucketName = 'user-uploads';
const objectName = 'document.pdf';

const response = await fetch(
  `/assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/meta-links`,
  { method: 'PUT' }
);

const metaLink = await response.json();
console.log('Synced:', metaLink.isSynced); // true

// Bulk sync example: sync all files in storage
const objects = await fetch(`/assets/buckets/${bucketName}/objects`).then(r => r.json());

for (const obj of objects) {
  await fetch(
    `/assets/buckets/${bucketName}/objects/${encodeURIComponent(obj.name)}/meta-links`,
    { method: 'PUT' }
  );
}
```
:::

## Frontend Integration

```typescript
// Upload file
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/assets/buckets/user-uploads/upload', {
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
async function listFiles(bucketName: string, prefix?: string) {
  const url = new URL(`/assets/buckets/${bucketName}/objects`, window.location.origin);
  if (prefix) url.searchParams.append('prefix', prefix);

  const response = await fetch(url);
  return await response.json();
}
```
