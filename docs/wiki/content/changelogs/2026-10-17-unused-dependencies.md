---
title: Dependencies No Package Imported Are Removed
description: "zod leaves inversion, kernel and core-server, reflect-metadata leaves connectors, and drizzle-kit and tsx leave core-server's dev dependencies - none of them was imported by the package that declared it."
packages:
  [
    '@venizia/ignis-inversion',
    '@venizia/ignis-kernel',
    '@venizia/ignis',
    '@venizia/ignis-connectors',
  ]
---

# Changelog - 2026-10-17

## Dependencies no package imported are removed

<Badge type="tip" text="Enhancement" />

**In one line.** Four packages stop declaring dependencies they never imported, so an install pulls less.

## What changed

- **`zod`** is no longer a dependency of `@venizia/ignis-inversion`, `@venizia/ignis-kernel` or `@venizia/ignis`. None of them imports it. The kernel uses zod only through `@hono/zod-openapi`, which declares it itself.
- **`reflect-metadata`** is no longer a dependency of `@venizia/ignis-connectors`. The package uses only the standard `Reflect` API.
- **`drizzle-kit` and `tsx`** are no longer development dependencies of `@venizia/ignis`. Nothing in the package used them.

## Who is affected

- **An application that imports `zod` or `reflect-metadata` without declaring it.** It used to get them through these packages and must now add them to its own `package.json`. Declare what you import.
- **Everyone else.** No action needed. Every published sub-path still loads from a clean install under bun and under Node (ESM and CommonJS).
