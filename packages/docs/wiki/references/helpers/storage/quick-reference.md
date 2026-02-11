# Quick Reference

| Helper | Type | Implements | Use Case |
|--------|------|------------|----------|
| **MemoryStorageHelper** | In-memory key-value | - | Caching, temporary state, single-process data |
| **DiskHelper** | Local filesystem | `IStorageHelper` | Local file storage, development, small-scale apps |
| **MinioHelper** | S3-compatible storage | `IStorageHelper` | Cloud storage, production, scalable file management |

## MemoryStorageHelper Methods

| Method | Purpose |
|--------|---------|
| `set(key, value)` | Store value |
| `get<R>(key)` | Retrieve typed value |
| `isBound(key)` | Check if key exists |
| `keys()` | Get all keys |
| `clear()` | Clear all data |
| `getContainer()` | Get the underlying container object |
| `static newInstance<T>()` | Factory method to create a new instance |

## IStorageHelper Operations

All storage helpers implementing `IStorageHelper` provide these operations:

| Operation | Methods |
|-----------|---------|
| **Validation** | `isValidName()`, `getMimeType()` |
| **Bucket** | `isBucketExists()`, `getBuckets()`, `getBucket()`, `createBucket()`, `removeBucket()` |
| **Upload** | `upload({ bucket, files, normalizeNameFn, normalizeLinkFn })` |
| **Download** | `getFile({ bucket, name })`, `getStat({ bucket, name })` |
| **Delete** | `removeObject()`, `removeObjects()` |
| **List** | `listObjects({ bucket, prefix, useRecursive, maxKeys })` |
| **Utility** | `getFileType({ mimeType })` |

## DiskHelper vs MinioHelper

| Feature | DiskHelper | MinioHelper |
|---------|------------|-------------|
| **Storage Type** | Local filesystem | S3-compatible cloud |
| **Interface** | `IStorageHelper` | `IStorageHelper` |
| **Default link prefix** | `/static-resources/` | `/static-assets/` |
| **Scalability** | Limited to single server | Horizontally scalable |
| **Setup Complexity** | Simple (just a directory) | Requires MinIO server |
| **Performance** | Fast (local disk I/O) | Network-dependent |
| **Backup** | Manual filesystem backup | Built-in replication |
| **Cost** | Disk space only | Server + storage costs |
| **Version support** | No | Yes (`versionId` in `getStat`) |
| **SSE options** | No | Yes (in `getFile`) |
| **Use Case** | Development, small apps | Production, large scale |

::: details Import Paths
```typescript
// Storage helpers
import { MemoryStorageHelper, DiskHelper, MinioHelper } from '@venizia/ignis-helpers';

// Types
import type {
  IStorageHelper,
  IStorageHelperOptions,
  IDiskHelperOptions,
  IMinioHelperOptions,
  IUploadFile,
  IUploadResult,
  IFileStat,
  IBucketInfo,
  IObjectInfo,
  IListObjectsOptions,
} from '@venizia/ignis-helpers';
```
:::
