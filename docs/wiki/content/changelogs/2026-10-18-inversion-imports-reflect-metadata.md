---
title: Decorators Work in a Split Chunk Without Importing reflect-metadata First
description: "Decorated code that a bundler evaluates before the package entry no longer fails with Reflect.getMetadata is not a function."
packages: ['@venizia/ignis-inversion']
---

# Changelog - 2026-10-18

## Decorators work in a split chunk without importing reflect-metadata first

<Badge type="info" text="Bug Fix" />

**In one line.** `@inject` and the other decorators no longer depend on the order a bundler evaluates modules in.

## What changed

- **`@venizia/ignis-inversion` imports `reflect-metadata` itself.** Vite 8 (Rolldown) can run a split chunk of decorated code before the package entry, which threw `Reflect.getMetadata is not a function`. That no longer happens.

## Who is affected

- **Applications built with Vite 8.** The `reflect-metadata-first` plugin workaround can go once this release is installed; keeping it does no harm.
- **Everyone else.** No action needed.
