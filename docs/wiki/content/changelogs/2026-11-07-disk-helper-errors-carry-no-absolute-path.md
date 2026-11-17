---
title: Disk helper errors carry no absolute path
description: "A link loop is refused as an invalid object name, and any other failure to resolve the real path of a target names its error code, not the server path."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-07

## Disk helper errors carry no absolute path

<Badge type="info" text="Bug Fix" />

**In one line.** When `DiskHelper` could not resolve the real path of a target (a link loop, a directory it may not search), it passed Node's error on, and that message holds the absolute path of the storage root on the server. It names the error code only now.

## What changed

- **Link loops.** A name that leads into a link loop (`ELOOP`), or a path the system refuses as too long (`ENAMETOOLONG`), answers `Invalid object name`, like a link that leads outside the root.
- **Other failures.** Any other failure to resolve the real path (`EACCES`, a storage root that disappeared) answers a 500 `Cannot resolve the real path of a storage target | code: EACCES`. The full error, path included, stays in the server log.

## Who is affected

Nobody needs to act. Code that matched the old Node message text must match the new one.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/disk/helper.ts` | helpers |
