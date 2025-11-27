# Storage Helpers

The Storage helpers in Ignis provide solutions for both in-memory and external object storage.

## `MemoryStorageHelper`

The `MemoryStorageHelper` is a simple, singleton-based in-memory key-value store. It's useful for caching, storing temporary application state, or passing data between loosely coupled parts of your application within a single process.

### Getting the Singleton Instance

```typescript
import { MemoryStorageHelper } from '@vez/ignis';

const memoryStore = MemoryStorageHelper.getInstance();
```

### Usage

```typescript
// Set a value
memoryStore.set('my-key', { a: 1, b: 2 });

// Get a value
const value = memoryStore.get<{ a: number; b: number }>('my-key');
// => { a: 1, b: 2 }

// Check if a key exists
const hasKey = memoryStore.isBound('my-key');
// => true

// Get all keys
const allKeys = memoryStore.keys();
// => ['my-key']

// Clear the storage
memoryStore.clear();
```

## `MinioHelper`

The `MinioHelper` is a comprehensive client for interacting with MinIO or any S3-compatible object storage service.

### Creating a MinIO Client

```typescript
import { MinioHelper } from '@vez/ignis';

const minioClient = new MinioHelper({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});
```

### Bucket Operations

```typescript
// Create a bucket if it doesn't exist
const bucketName = 'my-bucket';
const bucketExists = await minioClient.isBucketExists({ name: bucketName });
if (!bucketExists) {
  await minioClient.createBucket({ name: bucketName });
}
```

### Object Operations

#### Uploading a File

The `upload` method takes an array of file objects, typically from a multipart form data request.

```typescript
// Assuming `files` is an array of IUploadFile objects from a request
const uploadResult = await minioClient.upload({
  bucket: 'my-bucket',
  files: files,
});
// => [{ bucket: 'my-bucket', fileName: '...', link: '...' }]
```

#### Getting an Object

The `getFile` method returns a `Readable` stream for an object.

```typescript
const fileStream = await minioClient.getFile({
  bucket: 'my-bucket',
  name: 'my-file.txt',
});

fileStream.pipe(process.stdout);
```

#### Removing Objects

```typescript
// Remove a single object
await minioClient.removeObject({ bucket: 'my-bucket', name: 'my-file.txt' });

// Remove multiple objects
await minioClient.removeObjects({ bucket: 'my-bucket', names: ['file1.txt', 'file2.txt'] });
```
