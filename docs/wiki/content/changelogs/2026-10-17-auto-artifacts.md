---
title: Auto Artifacts - No Generated Index on Bun, and Typed Groups From a Shared Package
description: "@venizia/ignis-boot/auto builds an application's artifact index in memory at start and at build time, and ArtifactGroup lets a shared package declare its domains once for applications to borrow by name."
packages: ['@venizia/ignis-boot', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-17

## Auto artifacts and artifact groups

<Badge type="tip" text="New Feature" />

**In one line.** On Bun, `configs.artifacts: AutoArtifacts` replaces the generated `_artifacts.ts`, its scripts and its freshness check, and a shared package declares one typed group per domain that applications borrow instead of importing every class.

## What changed

- **`@venizia/ignis-boot/auto`.** Its default export is the application's own index. From source, a Bun plugin scans `src` when artifacts are registered; a binary built with `IgnisArtifactsPlugin.create()` carries the list and never scans.
- **`IgnisArtifactsPlugin` (`@venizia/ignis-boot/bun`).** The plugin for `Bun.build`. A build without it fails with `Could not resolve: "ignis:artifacts"` instead of shipping a binary with missing classes.
- **`ArtifactGroup.define({ folder })`** (`@venizia/ignis-kernel`, re-exported by `@venizia/ignis`). A shared package declares a group per domain, once; its content is every decorated class under that directory, found by the plugin. Applications borrow groups by importing them - typed, so a typo is a compile error.
- **`TArtifactIndexInput` accepts a group.** A group's kind fields are typed `never` and reading one throws.
- **The scanner follows re-exports** (`followReexports`), so a decorator re-exported by a framework or a kit counts with no flag, and **reports every decorated class it leaves out** (`skipped`, with the reason).
- **`SOURCE_MODULES` accepts the kernel's sub-paths** (`@venizia/ignis-kernel/metadata`), which the CLI also benefits from.

## Who is affected

- **Applications on Bun that use a generated index.** Optional. Replace `GeneratedArtifacts` with `AutoArtifacts`, add `IgnisArtifactsPlugin.create()` to the binary build, delete `_artifacts.ts` and its `generate`/`check` scripts.
- **Monorepos that hand-list classes borrowed from a shared package.** Optional. Declare `ArtifactGroup.define({ folder })` per domain in the shared package and borrow the groups. Single classes from another domain stay listed explicitly.
- **Code that walks `configs.artifacts` and reads the kinds of each entry.** Pass an entry with `isArtifactGroup: true` through untouched; reading its kinds throws.
- **Node applications.** No change: `ignis-artifacts generate` stays.

## Details

```typescript
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { CategoryRepository, InventoryArtifacts } from '@acme/core';

export const configs: IApplicationConfigs = {
  artifacts: [AutoArtifacts, InventoryArtifacts, { repositories: [CategoryRepository] }],
};
```

- A dependency is never scanned wholesale: an application gets only what it names.
- Checked against a monorepo of 18 backend services and 3 frontends: the auto scan found exactly the classes of every committed index (backend) and of every hand-written import list (frontend), in about 1.5 s for all 18 services.

**Files:** [`packages/boot/src/bun/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/plugin.ts), [`packages/boot/src/bun/auto.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/auto.ts), [`packages/kernel/src/base/applications/artifact-group.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/kernel/src/base/applications/artifact-group.ts)
