---
title: The disk helper treats only a regular file as an object
description: "getObject, getObjectStream, getStat and removeObject answer not found for a directory under an object path."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The disk helper treats only a regular file as an object

<Badge type="info" text="Bug Fix" />

**In one line.** `DiskHelper` answered as if a directory were an object. It reports `Object not found` now.

## What changed

- **Regular files only.** `getObject`, `getObjectStream`, `getStat` and `removeObject` require a regular file at the path. A folder, or anything else that is not a file, reads as not found, and nothing is opened or removed.
- **Listing is unchanged.** It already listed files only.

## Who is affected

Nobody needs to act.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/disk/helper.ts` | helpers |
