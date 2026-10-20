---
title: Faster Source Starts and a Lazy Auto Module in Binaries
description: "A source start reuses the previous artifact scan and skips TypeScript, and importing @venizia/ignis-boot/auto in a binary no longer loads the application's classes at import time."
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## Faster source starts, and a lazy auto module in binaries

<Badge type="tip" text="Performance" /> <Badge type="info" text="Bug Fix" />

**In one line.** A second start from source skips the scan and never loads TypeScript, and a library can import `@venizia/ignis-boot/auto` at the top of a file without breaking a binary.

## What changed

- **The scan is cached.** The classes found under `src` are stored in `node_modules/.cache/ignis-artifacts/`, keyed on the size and modification time of every `.ts` file under `src`, the package manifest and the lockfile. The next start uses them without loading TypeScript (a real service measured 723 ms cold, 585 ms warm); any edit makes the next start scan again. A corrupt cache is ignored.
- **Importing the auto module loads nothing in a binary.** `IgnisArtifactsPlugin` used to replace `@venizia/ignis-boot/auto` with a static import of the inlined index, so importing it from a shared library evaluated every application class inside the library's half-loaded module graph - a binary could crash with `The superclass is not a constructor`. The index now loads when artifacts are registered.

## Who is affected

- **Applications that start from source.** Faster second starts; nothing to change. Add `node_modules/.cache` to anything that copies a package if you want a cold start measured.
- **Libraries that import `@venizia/ignis-boot/auto` for their applications.** A top-level import is now safe in binaries.

**Files:** [`packages/boot/src/bun/scan-cache.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/scan-cache.ts), [`packages/boot/src/bun/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/plugin.ts)
