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

### Complete Setup Example

Here's a real-world example from the Vert application showing how to set up both MinIO and local filesystem storage:

```typescript
import {
  applicationEnvironment,
  BaseApplication,
  int,
  MinioHelper,
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  TStaticAssetsComponentOptions,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  override preConfigure(): ValueOrPromise<void> {
    // Configure Static Asset Component with both MinIO and local storage
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // MinIO cloud storage for scalable file management
      minioAsset: {
        enable: true,
        minioHelper: new MinioHelper({
          endPoint: applicationEnvironment.get('APP_ENV_MINIO_HOST'),
          port: int(applicationEnvironment.get('APP_ENV_MINIO_API_PORT')),
          accessKey: applicationEnvironment.get('APP_ENV_MINIO_ACCESS_KEY'),
          secretKey: applicationEnvironment.get('APP_ENV_MINIO_SECRET_KEY'),
          useSSL: false,
        }),
        options: {
          parseMultipartBody: {
            storage: 'memory', // Use memory for smaller files
          },
        },
      },
      // Local filesystem storage for quick access files
      staticResource: {
        enable: true,
        resourceBasePath: './app_data/resources',
        options: {
          parseMultipartBody: {
            storage: 'memory', // Use memory for smaller files
          },
        },
      },
    });

    // Register the component
    this.component(StaticAssetComponent);
  }
}
```

### Environment Variables

Add these to your `.env` file:

```bash
# MinIO Configuration
APP_ENV_MINIO_HOST=localhost
APP_ENV_MINIO_API_PORT=9000
APP_ENV_MINIO_ACCESS_KEY=minioadmin
APP_ENV_MINIO_SECRET_KEY=minioadmin
```

### Environment Keys Configuration

Define the environment keys in your application:

```typescript
// src/common/environments.ts
import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  // MinIO Configuration Keys
  static readonly APP_ENV_MINIO_HOST = 'APP_ENV_MINIO_HOST';
  static readonly APP_ENV_MINIO_API_PORT = 'APP_ENV_MINIO_API_PORT';
  static readonly APP_ENV_MINIO_ACCESS_KEY = 'APP_ENV_MINIO_ACCESS_KEY';
  static readonly APP_ENV_MINIO_SECRET_KEY = 'APP_ENV_MINIO_SECRET_KEY';
}
```

### Quick Start Options

**Option 1: MinIO Only**
```typescript
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  minioAsset: {
    enable: true,
    minioHelper: new MinioHelper({ /* ... */ }),
    options: { parseMultipartBody: { storage: 'memory' } },
  },
  staticResource: { enable: false },
});
this.component(StaticAssetComponent);
```

**Option 2: Local Filesystem Only**
```typescript
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  minioAsset: { enable: false },
  staticResource: {
    enable: true,
    resourceBasePath: './uploads',
    options: { parseMultipartBody: { storage: 'disk' } },
  },
});
this.component(StaticAssetComponent);
```

**Option 3: Both (Recommended for Production)**
```typescript
// Use MinIO for user uploads and local filesystem for temporary/cache files
this.bind({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  minioAsset: { enable: true, /* ... */ },
  staticResource: { enable: true, /* ... */ },
});
this.component(StaticAssetComponent);
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

**Error Responses:**
- `400 Bad Request`: Path traversal detected in objectName
- `404 Not Found`: File does not exist

**Example:**
```typescript
// Download link
const downloadUrl = '/static-resources/20251211103045_my_document.pdf';
```

**Security:**
- Automatic path traversal protection
- Validates that requested file is within the configured base path
- Returns error if attempting to access files outside allowed directory

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

### Example 4: Production Setup with Environment Variables

This example shows the complete setup from the Vert application, demonstrating best practices for production deployment:

```typescript
// src/application.ts
import {
  applicationEnvironment,
  BaseApplication,
  int,
  MinioHelper,
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  TStaticAssetsComponentOptions,
} from '@venizia/ignis';
import { EnvironmentKeys } from './common/environments';

export class Application extends BaseApplication {
  override preConfigure(): ValueOrPromise<void> {
    // ... other component configurations

    // Configure Static Asset Component
    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // MinIO for cloud storage (user uploads, documents, media)
      minioAsset: {
        enable: true,
        minioHelper: new MinioHelper({
          endPoint: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_HOST),
          port: int(applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_API_PORT)),
          accessKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_ACCESS_KEY),
          secretKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_SECRET_KEY),
          useSSL: false, // Set to true in production with proper SSL setup
        }),
        options: {
          parseMultipartBody: {
            storage: 'memory', // Memory storage for files under ~100MB
          },
        },
      },
      // Local filesystem for temporary files and caching
      staticResource: {
        enable: true,
        resourceBasePath: './app_data/resources',
        options: {
          parseMultipartBody: {
            storage: 'memory', // Memory storage for small files
          },
        },
      },
    });

    // Register the component
    this.component(StaticAssetComponent);
  }
}
```

**Environment Configuration (`src/common/environments.ts`):**

```typescript
import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  // MinIO Configuration
  static readonly APP_ENV_MINIO_HOST = 'APP_ENV_MINIO_HOST';
  static readonly APP_ENV_MINIO_API_PORT = 'APP_ENV_MINIO_API_PORT';
  static readonly APP_ENV_MINIO_ACCESS_KEY = 'APP_ENV_MINIO_ACCESS_KEY';
  static readonly APP_ENV_MINIO_SECRET_KEY = 'APP_ENV_MINIO_SECRET_KEY';
}
```

**Environment File (`.env`):**

```bash
# Application Settings
APP_ENV_APPLICATION_NAME=Vert
APP_ENV_APPLICATION_PORT=3000

# MinIO Configuration
APP_ENV_MINIO_HOST=localhost           # Use actual hostname in production
APP_ENV_MINIO_API_PORT=9000
APP_ENV_MINIO_ACCESS_KEY=minioadmin    # Use secure credentials in production
APP_ENV_MINIO_SECRET_KEY=minioadmin    # Use secure credentials in production
```

**Docker Compose (for development):**

```yaml
version: '3.8'
services:
  minio:
    image: minio/minio:latest
    container_name: minio
    ports:
      - "9000:9000"   # API port
      - "9001:9001"   # Console port
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  minio_data:
```

**Using the Endpoints:**

```typescript
// Upload to MinIO
const uploadToMinIO = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/static-assets/buckets/user-uploads/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  console.log('Uploaded to MinIO:', result);
  // [{ objectName: 'file.pdf', bucketName: 'user-uploads', link: '/static-assets/...' }]
};

// Upload to local filesystem
const uploadToLocal = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/static-resources/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  console.log('Uploaded to local:', result);
  // [{ objectName: '20251212091230_file.pdf' }]
};

// Download from MinIO
const downloadFromMinIO = (bucketName: string, objectName: string) => {
  const url = `/static-assets/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}/download`;
  window.open(url, '_blank');
};

// Download from local
const downloadFromLocal = (objectName: string) => {
  const url = `/static-resources/${objectName}`;
  window.open(url, '_blank');
};
```

---

## Security Considerations

### Built-in Security Features

The Static Asset Component includes multiple layers of security protection:

#### 1. Path Traversal Protection

**Static Resource Controller:**
- Validates all file paths to prevent directory traversal attacks
- Uses `path.resolve()` to normalize paths before comparison
- Rejects requests attempting to access files outside the configured base directory
- Returns `400 Bad Request` for malicious path patterns (e.g., `../../etc/passwd`)

```typescript
// Example: These requests are automatically blocked
GET /static-resources/../../../etc/passwd    // ❌ Blocked
GET /static-resources/./../../config.json    // ❌ Blocked
```

#### 2. Filename Sanitization

**Upload Processing:**
- Automatically applies `path.basename()` to extract just the filename
- Removes path components from uploaded filenames
- Normalizes filenames (lowercase, spaces to underscores)
- Adds timestamp prefix to prevent filename collisions

```typescript
// Original: "../../malicious/file.txt"
// Saved as: "20251211103045_file.txt" ✅
```

#### 3. Content-Disposition Headers

Both controllers use the `createContentDispositionHeader` utility to generate secure, RFC-compliant headers:

- Sanitizes filenames to prevent injection attacks
- Removes leading dots (prevents hidden file creation)
- Removes consecutive dots and ".." patterns
- Provides UTF-8 encoded filenames for international character support
- Includes both ASCII fallback and UTF-8 encoded versions for browser compatibility

### Best Practices

1. **Validate file types**: Implement middleware to check allowed MIME types
   ```typescript
   // Example middleware
   const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
   if (!allowedTypes.includes(file.mimetype)) {
     throw new Error('File type not allowed');
   }
   ```

2. **Limit file sizes**: Configure max upload size in your web server or application
   ```typescript
   options: {
     parseMultipartBody: {
       storage: 'disk',
       uploadDir: './uploads',
       limits: { fileSize: 10 * 1024 * 1024 } // 10MB
     }
   }
   ```

3. **Access control**: Add authentication/authorization middleware to protect endpoints
   ```typescript
   @controller({ path: '/static-resources' })
   export class StaticResourceController extends BaseController {
     // Add auth middleware to routes
   }
   ```

4. **Storage limits**: Monitor disk space (Static Resource) or bucket quotas (MinIO)

5. **Input validation**: Always validate user-provided filenames and paths
   - Never trust client-provided filenames
   - Use server-side filename generation (timestamp-based)
   - Validate objectName parameters against expected patterns

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
