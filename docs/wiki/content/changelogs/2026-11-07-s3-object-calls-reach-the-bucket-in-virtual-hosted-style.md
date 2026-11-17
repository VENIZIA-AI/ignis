---
title: S3 object calls reach the bucket in virtual-hosted style
description: "With virtualHostedStyle: true, BunS3Helper's upload, read, stat, delete and list calls now go to the bucket's own host instead of the bare endpoint."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-07

## S3 object calls reach the bucket in virtual-hosted style

<Badge type="info" text="Bug Fix" />

**In one line.** With `virtualHostedStyle: true`, `BunS3Helper` sent its object calls to the bare endpoint, with the bucket in neither the host nor the path. They go to the bucket's host now, like presigned URLs, `copyObject` and `removeObjects` already did.

## What changed

- **Object calls.** `upload`, `writeStream`, `getObject`, `getObjectStream`, `getStat`, `removeObject`, `listObjects` and `hasBucket` address the object as `https://{bucket}.{endpoint}/{key}` in virtual-hosted style. Before, the request was `PUT /k.png` on the endpoint host.
- **Bucket names.** A bucket that is not one lower-case DNS label is refused before any request in this style, as it already was for presigned URLs.
- **Path style is unchanged:** `{endpoint}/{bucket}/{key}`.

## Who is affected

Applications that set `virtualHostedStyle: true` (AWS S3 requires it for some regions and buckets). Nothing to change in code or configuration.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/bun-s3/helper.ts` | helpers |
