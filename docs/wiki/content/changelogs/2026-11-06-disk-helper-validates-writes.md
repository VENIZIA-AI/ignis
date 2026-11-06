---
title: DiskHelper validates the bucket and the object key on every write
description: "writeStream, and every other write that reaches DiskHelper, now resolves the bucket and the key to a path inside the base directory and refuses one that leaves it, as reads and deletes already did."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## DiskHelper validates the bucket and the object key on every write

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** `DiskHelper.writeStream` joined the bucket and the key into a path without the checks that `getObject`, `getStat` and the delete operations apply. Every write now resolves to a path inside the base directory, or is refused.

## What changed

- **One path rule for every operation.** The write path uses the same validated resolution as the reads: the bucket name and the key must be valid, and the resolved path must stay under the bucket directory.
- **Folder depth.** `writeStream` applies the folder depth it is given (`maxFolderDepth`, the helper default when none), as `upload` and the S3 helper's `writeStream` do. A key nested deeper than the limit is refused where it was written before.
- **Who is affected by a refusal.** A key such as `../x`, an absolute key, or a bucket such as `../other` now fails with `Invalid object name` or `Invalid bucket name`. `upload` already validated its keys, so it behaves as before.

## Who is affected

- **Code that passes a bucket or key derived from a request to `writeStream`.** It is now refused when it would leave the base path.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/disk/helper.ts` | helpers |
