# Static Asset Component

The Static Asset Component provides file upload, download, and management capabilities through two specialized controllers: **MinIO Asset Controller** for cloud storage and **Static Resource Controller** for local filesystem storage.

## Overview

| Feature | Description |
|---------|-------------|
| **Component** | `StaticAssetComponent` |
| **Controllers** | `MinioAssetController`, `StaticResourceController` |
| **Purpose** | File upload/download management with MinIO or local filesystem |
| **Dependencies** | MinIO (optional), filesystem access |

## Installation & Setup

### Basic Configuration

```typescript
import { StaticAssetComponent } from '@venizia/ignis';
import { MinioHelper } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  override preConfigure(): ValueOrPromise<void> {
    // Configure Static Asset Component
    this.bind({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // Option 1: Enable MinIO-based asset storage
      minioAsset: {
        enable: true,
        minioHelper: new MinioHelper({
          endPoint: 'minio.example.com',
          port: 9000,
          useSSL: true,
          accessKey: 'YOUR_ACCESS_KEY',
          secretKey: 'YOUR_SECRET_KEY',
        }),
        options: {
          parseMultipartBody: {
            storage: 'memory', // or 'disk'
            uploadDir: './temp-uploads',
          },
        },
      },
      
      // Option 2: Enable local filesystem storage
      staticResource: {
        enable: true,
        resourceBasePath: './static-resources',
        options: {
          parseMultipartBody: {
            storage: 'disk',
            uploadDir: './temp-uploads',
          },
        },
      },
    });

    // Register the component
    this.component(StaticAssetComponent);
  }
}
```

## MinIO Asset Controller

Manages file storage using MinIO object storage (S3-compatible).

### Base Path
```
/static-assets
```

### API Endpoints

#### **Get All Buckets**

```http
GET /static-assets/buckets
```

Returns a list of all available buckets.

**Response:**
```typescript
[
  { name: 'my-bucket', creationDate: '2025-01-01T00:00:00.000Z' },
  // ...
]
```

---

#### **Get Bucket by Name**

```http
GET /static-assets/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Name of the bucket

**Response:**
```typescript
{ name: 'my-bucket', creationDate: '2025-01-01T00:00:00.000Z' }
```

---

#### **Create Bucket**

```http
POST /static-assets/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Name of the new bucket

**Response:**
```typescript
{ success: true }
```

---

#### **Delete Bucket**

```http
DELETE /static-assets/buckets/:bucketName
```

**Parameters:**
- `bucketName` (path): Name of the bucket to delete

**Response:**
```typescript
{ isDeleted: true }
```

---

#### **Upload Files to Bucket**

```http
POST /static-assets/buckets/:bucketName/upload
```

**Parameters:**
- `bucketName` (path): Target bucket name
- `folderPath` (query, optional): Folder path within bucket

**Request Body:**
- `multipart/form-data` with file fields

**Response:**
```typescript
[
  {
    objectName: 'folder/myfile.pdf',
    bucketName: 'my-bucket',
    link: '/static-assets/buckets/my-bucket/objects/folder%2Fmyfile.pdf',
  },
  // ...
]
```

**Example:**
```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

const response = await fetch('/static-assets/buckets/my-bucket/upload?folderPath=docs', {
  method: 'POST',
  body: formData,
});
```

---

#### **Get Object (Stream)**

```http
GET /static-assets/buckets/:bucketName/objects/:objectName
```

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name/path (URL-encoded)

**Response:**
- Streams file content with appropriate headers
- Content-Type: `application/octet-stream` (or from metadata)
- Content-Length: File size in bytes
- X-Content-Type-Options: `nosniff`

---

#### **Download Object**

```http
GET /static-assets/buckets/:bucketName/objects/:objectName/download
```

**Parameters:**
- `bucketName` (path): Bucket name
- `objectName` (path): Object name/path (URL-encoded)

**Response:**
- Streams file content with download headers
- Content-Disposition: `attachment; filename="..."`
- Triggers browser download dialog

**Example:**
```typescript
// Direct link for download
const downloadUrl = `/static-assets/buckets/my-bucket/objects/${encodeURIComponent('folder/file.pdf')}/download`;
```

---

## Static Resource Controller

Manages file storage using the local filesystem.

### Base Path
```
/static-resources
```

### API Endpoints

#### **Upload Files**

```http
POST /static-resources/upload
```

**Request Body:**
- `multipart/form-data` with file fields

**Response:**
```typescript
[
  { objectName: '20251211103045_mydocument.pdf' },
  // ...
]
```

**Notes:**
- Files are automatically renamed with timestamp prefix: `YYYYMMDDHHmmss_filename`
- Filenames are normalized (lowercase, spaces replaced with underscores)
- Files are stored in the configured `resourceBasePath` directory

**Example:**
```typescript
const formData = new FormData();
formData.append('file', fileBlob, 'My Document.pdf');

const response = await fetch('/static-resources/upload', {
  method: 'POST',
  body: formData,
});

// Response: [{ objectName: '20251211103045_my_document.pdf' }]
```

---

#### **Download File**

```http
GET /static-resources/:objectName
```

**Parameters:**
- `objectName` (path): Name of the file to download

**Response:**
- Streams file content with download headers
- Content-Disposition: `attachment; filename="..."`
- Content-Type: `application/octet-stream`
- Content-Length: File size in bytes

**Example:**
```typescript
// Download link
const downloadUrl = '/static-resources/20251211103045_my_document.pdf';
```

---

## Configuration Options

### `TStaticAssetsComponentOptions`

```typescript
type TStaticAssetsComponentOptions = {
  // MinIO-based storage
  minioAsset?: 
    | { enable: false }
    | {
        enable: true;
        minioHelper: MinioHelper;
        options: TMinioAssetOptions;
      };
  
  // Local filesystem storage
  staticResource?:
    | { enable: false }
    | {
        enable: true;
        resourceBasePath: string;
        options: TStaticResourceOptions;
      };
};
```

### `TMinioAssetOptions` / `TStaticResourceOptions`

```typescript
type TMinioAssetOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';  // Default: 'memory'
    uploadDir?: string;           // Default: './uploads'
  };
};
```

**Options:**
- `storage: 'memory'`: Files stored in memory as Buffer (suitable for small files)
- `storage: 'disk'`: Files temporarily written to disk during upload (better for large files)
- `uploadDir`: Temporary directory for disk-based uploads

---

## Usage Examples

### Example 1: MinIO Asset Upload with Folder Path

```typescript
import { BaseController, controller } from '@venizia/ignis';

@controller({ path: '/documents' })
export class DocumentController extends BaseController {
  async uploadDocument(ctx: Context) {
    const formData = new FormData();
    formData.append('file', fileBlob, 'report.pdf');
    
    const response = await fetch('/static-assets/buckets/documents/upload?folderPath=reports/2025', {
      method: 'POST',
      body: formData,
    });
    
    const uploaded = await response.json();
    console.log(uploaded);
    // [{ objectName: 'reports/2025/report.pdf', bucketName: 'documents', link: '...' }]
  }
}
```

### Example 2: Static Resource Upload

```typescript
async uploadToLocal(ctx: Context) {
  const formData = new FormData();
  formData.append('avatar', avatarFile, 'user_avatar.png');
  
  const response = await fetch('/static-resources/upload', {
    method: 'POST',
    body: formData,
  });
  
  const uploaded = await response.json();
  console.log(uploaded);
  // [{ objectName: '20251211120530_user_avatar.png' }]
  
  // File can be accessed at:
  const downloadLink = `/static-resources/${uploaded[0].objectName}`;
}
```

### Example 3: Direct Download Link Generation

```typescript
// MinIO asset
const minioDownloadLink = `/static-assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/download`;

// Static resource
const localDownloadLink = `/static-resources/${objectName}`;

// Use in HTML
<a href={minioDownloadLink} download>Download File</a>
```

---

## Security Considerations

### Content-Disposition Headers

Both controllers use the `createContentDispositionHeader` utility to generate secure, RFC-compliant headers:

- Sanitizes filenames to prevent path traversal attacks
- Removes dangerous characters
- Provides UTF-8 encoded filenames for international character support
- Includes both ASCII fallback and UTF-8 encoded versions for browser compatibility

### Best Practices

1. **Validate file types**: Implement middleware to check allowed MIME types
2. **Limit file sizes**: Configure max upload size in your web server or application
3. **Sanitize filenames**: The component automatically sanitizes filenames
4. **Access control**: Add authentication/authorization middleware to protect endpoints
5. **Storage limits**: Monitor disk space (Static Resource) or bucket quotas (MinIO)

---

## Troubleshooting

### Issue: Upload fails with "Directory not found"

**Solution**: Ensure the configured directory exists or the component has permission to create it.

```typescript
// Static Resource automatically creates directory
staticResource: {
  enable: true,
  resourceBasePath: './my-storage', // Will be created if missing
}
```

### Issue: MinIO connection error

**Solution**: Verify MinIO connection settings:

```typescript
minioHelper: new MinioHelper({
  endPoint: 'localhost',    // Check hostname
  port: 9000,               // Check port
  useSSL: false,            // Match your MinIO configuration
  accessKey: 'minioadmin',  // Verify credentials
  secretKey: 'minioadmin',
})
```

### Issue: Large file upload fails

**Solution**: Switch to disk-based storage:

```typescript
options: {
  parseMultipartBody: {
    storage: 'disk',        // Better for large files
    uploadDir: './uploads',
  },
}
```

---

## Related Documentation

- [MinIO Helper](../helpers/storage.md#minio-helper)
- [Request Utilities](../utilities/request.md) - `parseMultipartBody`, `createContentDispositionHeader`
- [Components Overview](./index.md)
- [Controllers](../base/controllers.md)
