---
title: Auto Artifacts in Vite Builds
description: "IgnisArtifactsVitePlugin brings AutoArtifacts to a frontend or Web Worker built with Vite: the class list is built into the bundle, class names survive minification, and no generated index or side-effect import list is needed."
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## Auto artifacts in Vite builds

<Badge type="tip" text="Feature" />

**In one line.** `IgnisArtifactsVitePlugin.create()` in `vite.config.ts` makes `import AutoArtifacts from '@venizia/ignis-boot/auto'` work in a Vite-built frontend or Worker.

## What changed

- **`@venizia/ignis-boot/vite`.** The plugin serves `ignis:artifacts`, swaps the auto module for an eager import of it (a browser bundle is tree-shaken only when eager), and inlines `ArtifactGroup.define` / `application` calls - what `IgnisArtifactsPlugin` does for `Bun.build`.
- **Names survive minification.** The plugin sets `output.keepNames`: binding keys are built from `Class.name`, so a renamed class would bind under the wrong key.
- **An import cycle is named.** An index entry that is not a class - what a cycle leaves when the module importing the index also defines a decorated class - stops registration with a message naming the cause, instead of a crash on `.name`.
- **The scanner runs under Node.** It globs with `node:fs` instead of `Bun.Glob`, so the plugin works in a Vite process started by Node.

## Who is affected

- **Frontends that keep a generated index, a side-effect import list or hand-pinned binding keys.** Add the plugin, pass `AutoArtifacts` in `artifacts`, and delete them.
- **Everyone else.** No change.

**Files:** [`packages/boot/src/vite/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/vite/plugin.ts)
