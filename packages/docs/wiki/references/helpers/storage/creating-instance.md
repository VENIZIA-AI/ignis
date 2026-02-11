# Creating an Instance

## MemoryStorageHelper

`MemoryStorageHelper` is a simple in-memory key-value store for caching, temporary state, or passing data between loosely coupled parts of your application within a single process.

```typescript
import { MemoryStorageHelper } from '@venizia/ignis-helpers';

// Direct instantiation
const memoryStore = new MemoryStorageHelper();

// With custom scope for logging
const memoryStore = new MemoryStorageHelper({ scope: 'MyCache' });

// Using the factory method
const memoryStore = MemoryStorageHelper.newInstance<{ counter: number }>();
```

> [!NOTE]
> `MemoryStorageHelper` does **not** implement `IStorageHelper`. It is a standalone key-value store, not a bucket-based file storage helper.

## DiskHelper

`DiskHelper` provides local filesystem storage using a bucket-based directory structure. It implements the `IStorageHelper` interface, making it easy to switch between local and cloud storage. Extends `BaseHelper` for scoped logging.

```typescript
import { DiskHelper } from '@venizia/ignis-helpers';

const diskHelper = new DiskHelper({
  basePath: './app_data/storage',
});
```

::: details IDiskHelperOptions

```typescript
interface IDiskHelperOptions extends IStorageHelperOptions {
  basePath: string;  // Base directory for storage (resolved to absolute path)
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | -- | Base directory where buckets will be created. Resolved to absolute path internally. Created automatically if it does not exist |
| `scope` | `string` | `'DiskHelper'` | Logger scope name |
| `identifier` | `string` | `'DiskHelper'` | Helper identifier |
:::

**Directory Structure:**
```
app_data/storage/           <-- basePath
├── bucket-1/               <-- bucket (directory)
│   ├── file1.pdf           <-- object (file)
│   └── file2.jpg
├── bucket-2/
│   └── document.docx
└── user-uploads/
    ├── avatar.png
    └── resume.pdf
```

## MinioHelper

`MinioHelper` is a comprehensive client for interacting with MinIO or any S3-compatible object storage service. It implements the `IStorageHelper` interface. Extends `BaseHelper` for scoped logging.

```typescript
import { MinioHelper } from '@venizia/ignis-helpers';

const minioClient = new MinioHelper({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});
```

::: details IMinioHelperOptions

`IMinioHelperOptions` extends both `IStorageHelperOptions` and the minio `ClientOptions` type, so all [minio Client options](https://min.io/docs/minio/linux/developers/javascript/API.html) are accepted.

```typescript
interface IMinioHelperOptions extends IStorageHelperOptions, ClientOptions {}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endPoint` | `string` | -- | MinIO server hostname |
| `port` | `number` | -- | Server port |
| `useSSL` | `boolean` | -- | Enable HTTPS |
| `accessKey` | `string` | -- | Access key |
| `secretKey` | `string` | -- | Secret key |
| `scope` | `string` | `'MinioHelper'` | Logger scope name |
| `identifier` | `string` | `'MinioHelper'` | Helper identifier |
:::

> [!TIP]
> The underlying `minio.Client` is exposed as `minioClient.client` for direct access to any minio SDK method not covered by the `IStorageHelper` interface.
