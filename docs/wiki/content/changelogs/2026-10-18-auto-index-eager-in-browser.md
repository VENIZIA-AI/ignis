---
title: The Browser Auto Index Is Tree-Shaken Again
description: 'A browser build imports the auto artifact index eagerly again, which brings a frontend bundle back to its size; server builds stay lazy. IgnisArtifactsPlugin.create({ lazyIndex }) chooses explicitly.'
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## The browser auto index is tree-shaken again

<Badge type="tip" text="Performance" />

**In one line.** A frontend bundle that uses `@venizia/ignis-boot/auto` is back to its size: a browser build imports the index eagerly, a server build keeps loading it on the first resolve.

## What changed

- **`lazyIndex` on `IgnisArtifactsPlugin.create`.** The lazy index from the previous release keeps a server binary safe when a shared library imports the auto module, but Bun does not tree-shake a lazily loaded module graph: a measured frontend bundle doubled (50 KB to 100 KB minified). The default is now lazy for a server target and eager for `target: 'browser'`; pass `lazyIndex` to choose.

## Who is affected

- **Frontends built with the plugin.** Smaller bundles again; nothing to change. Import the auto module from the application's own module, not from a shared library.
- **Server binaries.** No change.

**Files:** [`packages/boot/src/bun/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/plugin.ts)
