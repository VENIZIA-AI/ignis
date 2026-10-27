---
title: Decorators Work in a Split Chunk Without Importing reflect-metadata First
description: 'The inversion registry imports reflect-metadata itself, so decorated code that a bundler evaluates before the package entry no longer fails with Reflect.getMetadata is not a function.'
packages: ['@venizia/ignis-inversion']
---

# Changelog - 2026-10-18

## Decorators work in a split chunk without importing reflect-metadata first

<Badge type="info" text="Bug Fix" />

**In one line.** `@inject` and the other decorators no longer depend on the order a bundler evaluates modules in.

## What changed

- **The registry imports `reflect-metadata`.** The only module in `@venizia/ignis-inversion` that calls `Reflect.*Metadata` is the metadata registry, and it now starts with `import 'reflect-metadata'`. Before, the import lived only in the package entry; Vite 8 (Rolldown) can run a split chunk of decorated code before that entry (vitejs/vite#21866), which threw `Reflect.getMetadata is not a function`.
- **Same package, same builds.** `reflect-metadata` was already a dependency, and the CommonJS and ESM builds both carry the import.

## Who is affected

- **Applications built with Vite 8.** The `reflect-metadata-first` plugin workaround can go once this release is installed; keeping it does no harm.
- **Everyone else.** No action needed.

**Files:** [`packages/inversion/src/modules/registry/registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/inversion/src/modules/registry/registry.ts)
