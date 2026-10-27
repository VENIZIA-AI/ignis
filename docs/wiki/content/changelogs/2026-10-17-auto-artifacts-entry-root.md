---
title: Auto Artifacts Root at the Entry Module, and ArtifactGroup.application
description: "@venizia/ignis-boot/auto no longer depends on the working directory, and ArtifactGroup.application() gives each application in a multi-app process its own artifacts."
packages: ['@venizia/ignis-boot', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-17

## Auto artifacts root at the entry module

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="New Feature" />

**In one line.** Auto artifacts scan the package of the module you run, not the directory you ran it from, and a process that loads several applications gives each one `ArtifactGroup.application()`.

## What changed

- **The root is the entry module's package.** `@venizia/ignis-boot/auto` used `<working directory>/src`, so an IDE runner, `bun test` from a repository root, or a process started elsewhere failed with `ENOENT` at registration. It now uses the `src` beside the `package.json` of `Bun.main`; the working directory only when there is no entry file (`bun -e`). A missing `src` is a clear error naming the fix.
- **`ArtifactGroup.application()`** (`@venizia/ignis-kernel`, re-exported by `@venizia/ignis`) covers every decorated class of the package it is called from. `AutoArtifacts` is one module per process; `application()` is per call site, so several applications loaded into one process each register their own. `IgnisArtifactsPlugin` inlines it in a binary.

## Who is affected

- **Applications using `AutoArtifacts` started from another directory.** Upgrade; nothing else to change.
- **Harnesses or hosts that load several applications into one process.** Use `artifacts: [ArtifactGroup.application(), ...]` in each application instead of `AutoArtifacts`.

**Files:** [`packages/boot/src/bun/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/plugin.ts), [`packages/kernel/src/base/applications/artifact-group.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/kernel/src/base/applications/artifact-group.ts)
