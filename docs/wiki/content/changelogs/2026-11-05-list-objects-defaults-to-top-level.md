---
title: listObjects on Bun S3 lists the top level by default
description: "BunS3Helper.listObjects now defaults useRecursive to false, as DiskHelper and the docs always said. Pass useRecursive true to list the whole tree."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-05

## listObjects on Bun S3 lists the top level by default

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `BunS3Helper.listObjects` no longer lists the whole bucket tree when you leave out `useRecursive`: both storage helpers now return only the top level, so the same call gives the same answer on disk and on S3.

## What changed

- **One default.** `useRecursive` defaults to `false` on `BunS3Helper` and on `DiskHelper`. `IListObjectsOptions` already documented `false`; only the Bun S3 helper did otherwise (`true`).
- **What `false` means on S3.** The call sends `delimiter: '/'`, so keys below the first folder level are not returned. `true` sends no delimiter and lists everything under `prefix`.

## Who is affected

- **Code that calls `BunS3Helper.listObjects` without `useRecursive` and expects every key under the prefix.** It now gets the top level only. Pass `useRecursive: true` to keep the old listing.
- **Code that already passes `useRecursive`, and code that uses `DiskHelper`.** No action needed.
- **The static-asset list route.** No action needed: it passes `useRecursive` from its `recursive` query parameter.

## Breaking changes

> [!WARNING]
> A `BunS3Helper.listObjects` call with no `useRecursive` returns fewer objects than before.

**Before:**

```typescript
// Every key under the prefix, at any depth
const objects = await storage.listObjects({ bucket: { name: 'uploads' }, prefix: 'photos/' });
```

**After:**

```typescript
// The top level only; ask for the tree explicitly
const objects = await storage.listObjects({
  bucket: { name: 'uploads' },
  prefix: 'photos/',
  useRecursive: true,
});
```

## Details

- The same default is now tested on both helpers, with a fake S3 client for the Bun S3 side.
- The storage helper reference lists `false` for both helpers in its parameter table and in its comparison table.

| File | Package |
|------|---------|
| `src/modules/storage/bun-s3/helper.ts` | helpers |
