# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `StaticAssetComponent` |
| **Helper** | [`DiskHelper`](/references/helpers/storage/), [`MinioHelper`](/references/helpers/storage/) |
| **Runtimes** | Both |

::: details Import Paths
```typescript
import {
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  DiskHelper,
  MinioHelper,
} from '@venizia/ignis';
import type {
  TStaticAssetsComponentOptions,
  TMetaLinkConfig,
  TStaticAssetExtraOptions,
} from '@venizia/ignis';
```
:::

## Key Features

| Feature | Description |
|---------|-------------|
| **Unified Storage Interface** | Single API for all storage types |
| **Multiple Storage Instances** | Configure multiple storage backends simultaneously |
| **Factory Pattern** | Dynamic controller generation per storage backend |
| **Built-in Security** | Comprehensive name validation, path traversal protection |
| **Database Tracking (MetaLink)** | Optional database-backed file tracking with metadata |
| **Flexible Configuration** | Environment-based, production-ready setup |
