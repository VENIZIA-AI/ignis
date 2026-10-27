---
title: Auto Artifacts in Vite Builds
description: 'IgnisArtifactsVitePlugin brings AutoArtifacts to a frontend or Web Worker built with Vite: the class list is built into the bundle, class names survive minification, and no generated index or side-effect import list is needed.'
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## Auto artifacts in Vite builds

<Badge type="tip" text="Feature" />

**In one line.** `IgnisArtifactsVitePlugin.create()` in `vite.config.ts` makes `import AutoArtifacts from '@venizia/ignis-boot/auto'` work in a Vite-built frontend or Worker.

## What changed

- **`@venizia/ignis-boot/vite`.** The plugin serves `ignis:artifacts`, swaps the auto module for an eager import of it (a browser bundle is tree-shaken only when eager), and inlines `ArtifactGroup.define` / `application` calls - what `IgnisArtifactsPlugin` does for `Bun.build`.
- **Names survive minification, for the scanned classes only.** Binding keys are built from `Class.name`, so the plugin opens each scanned class with a static block that pins its name; the rest of the bundle minifies as usual (a bundle-wide `keepNames` cost about 100 KB on a measured frontend).
- **An import cycle is named.** An index entry that is not a class - what a cycle leaves when the module importing the index also defines a decorated class - stops registration with a message naming the cause, instead of a crash on `.name`.
- **Borrowed classes keep their names; a kit can define groups in the browser.** The plugin also scans the src of every package that defines a group, so classes borrowed from a shared kit are pinned like the application's own. `ArtifactGroup` is exported from `@venizia/ignis-kernel/metadata`, so a browser kit defines its groups without the root barrel and its server peers.
- **Adding a class needs a dev server restart.** The class list is built once, when `vite dev` starts; editing a class keeps hot reload.
- **Every decorated class keeps its name.** The pin covers every class with an IGNIS decorator in the application and its workspace dependencies, not only the scanned ones - a workspace library that defines no group still provides injection targets.
- **`Bun.build` pins names too.** `IgnisArtifactsPlugin` pins the scanned classes' names the same way, so a registered class that subclasses a same-name class (Bun's scope hoisting renames it `StockService2`) keeps its key. The binary guide now also says how `Bun.build` keeps `NODE_ENV` a runtime read (`define`, since `env: 'disable'` alone does not).
- **The scanner runs under Node.** It globs with `node:fs` instead of `Bun.Glob`, so the plugin works in a Vite process started by Node.

## Who is affected

- **Frontends that keep a generated index, a side-effect import list or hand-pinned binding keys.** Add the plugin, pass `AutoArtifacts` in `artifacts`, and delete them.
- **Everyone else.** No change.

**Files:** [`packages/boot/src/vite/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/vite/plugin.ts)
