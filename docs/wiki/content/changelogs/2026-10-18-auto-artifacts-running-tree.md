---
title: Auto Artifacts Register the Classes a tsc-Built Application Runs
description: 'An application that builds with tsc and runs dist now registers the very classes its code runs: the list comes from src, each class is loaded from dist.'
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## Auto artifacts load the running tree

<Badge type="info" text="Bug Fix" />

**In one line.** `AutoArtifacts`, `ArtifactGroup.define` and `ArtifactGroup.application` work for an application that runs its tsc `dist`, in development, in tests and in a binary.

## What changed

- **The registered class is the running class.** The scan still reads `src`, but each class is now loaded from the tree the application runs: `dist/services/a.service.js` for `src/services/a.service.ts`, CommonJS or ESM. Before, an application running `dist` registered a second copy of every class, loaded from `src` - module state, side effects and `instanceof` checks no longer matched the running code.
- **A stale build is an error.** A class in `src` with no compiled copy stops the start with an error asking for a rebuild.
- **Groups in a compiled tree.** A shared package consumed through its `dist` defines its groups there; they resolve the same way, and `IgnisArtifactsPlugin` inlines them in a binary, including tsc's CommonJS output.

## Who is affected

- **Applications that run `dist` with auto artifacts or groups.** Upgrade; nothing else to change. For a binary, add `IgnisArtifactsPlugin.create()` to the `Bun.build` plugins.
- **Applications that run `src`.** No change.

**Files:** [`packages/boot/src/bun/sources.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/sources.ts), [`packages/boot/src/bun/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/plugin.ts)
