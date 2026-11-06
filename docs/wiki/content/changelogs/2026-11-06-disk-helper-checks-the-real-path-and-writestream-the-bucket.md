---
title: The disk helper checks the real path of a target, and writeStream needs an existing bucket
description: "DiskHelper follows symbolic links before it reads, writes, stats or deletes, and refuses a target that leads outside the storage root. writeStream no longer creates a missing bucket."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The disk helper checks the real path of a target, and writeStream needs an existing bucket

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior change" />

**In one line.** `DiskHelper` kept a path inside the storage root by its text only. It now follows symbolic links and refuses a target that resolves outside the root, and `writeStream` refuses a bucket that does not exist, as `upload` does.

## What changed

- **Real-path containment.** `getObject`, `getObjectStream`, `getStat`, `removeObject` and `writeStream` resolve the real path of the target (for a write, of its nearest existing parent) and require it inside the real storage root. A link to a file or a directory outside the root, and a link whose own target is missing, answer `Invalid object name`.
- **Buckets.** A bucket directory that is a link leading outside the root is not a bucket: `hasBucket` answers `false`, `getBucket` answers `null`, `listObjects` is empty and `removeBucket` reports it as missing.
- **`writeStream` and the bucket.** A missing bucket is refused with `Bucket does not exist` and no directory is created. Create the bucket first with `createBucket`.
- **Ordinary paths are unchanged.** Links that stay inside the root keep working.

## Who is affected

- **Deployments whose storage root holds links to other disks or folders.** Mount the target as the root, or as a bucket directory under it; a link leading outside is refused.
- **Callers of `writeStream` that relied on the bucket being created.** Call `createBucket` first.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/disk/helper.ts` | helpers |
| `src/modules/storage/base.ts` | helpers |
