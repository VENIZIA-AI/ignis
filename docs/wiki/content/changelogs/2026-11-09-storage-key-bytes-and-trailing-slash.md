---
title: A storage key segment is limited to 255 bytes, and a key cannot end with a slash
description: "isValidSegment measures a name in UTF-8 bytes, and isValidObjectKey refuses a key that ends with a slash, so both are a 400 instead of a 500 or a silent collision."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-09

## A storage key segment is limited to 255 bytes, and a key cannot end with a slash

<Badge type="info" text="Bug Fix" />

**In one line.** A long non-ASCII name and a key ending with `/` are now refused as an invalid name (400), instead of failing later or overwriting another object.

## What changed

- **A segment is measured in bytes.** `isValidSegment` (and so `isValidObjectKey` and `isValidBucketName`) allows at most 255 bytes in UTF-8 per segment, not 255 characters. A file system limits a name in bytes, so a name of 128 `é` (128 characters, 256 bytes) used to pass the check. Inside a folder, `DiskHelper` then failed a write with a raw `ENAMETOOLONG` (a 500) and answered a read with a 404.
- **A key cannot end with `/`.** `isValidObjectKey` refuses `photos/a.png/` and a directory marker such as `photos/`. On disk, `photos/a.png/` was written as `photos/a.png`, so two different keys named the same file.

## Who is affected

- **Keys that end with `/`.** Every `DiskHelper` object call, every static-asset object route (`400 core.static_asset.object_name_invalid`), and `upload` and `writeStream` on `BunS3Helper` now refuse them with a 400. Drop the trailing slash.
- **Names longer than 255 bytes.** Refused with the same `400`. A name in a script that uses two or more bytes per character (Vietnamese with marks, Cyrillic, CJK, emoji) reaches the limit before 255 characters.
- **Listing.** A listing `prefix` ending with `/` and `controller.keyPrefix` are not object keys and keep working.
- **Everyone else.** No action needed.

## Details

- The length of a whole key (1024) and the length of an upload's `originalName` when it is metadata only (255) still count characters.

| File | Package |
|------|---------|
| `src/modules/storage/base.ts` | helpers |
