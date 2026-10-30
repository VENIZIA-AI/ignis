---
title: Dependencies No Package Imported Are Removed
description: "An install pulls less, because four packages stop declaring zod, reflect-metadata, drizzle-kit and tsx that they never imported."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel', '@venizia/ignis', '@venizia/ignis-connectors']
---

# Changelog - 2026-10-17

## Dependencies no package imported are removed

<Badge type="tip" text="Enhancement" />

**In one line.** Four packages stop declaring dependencies they never imported, so an install pulls less.

## What changed

- **`zod`** is no longer a dependency of `@venizia/ignis-inversion`, `@venizia/ignis-kernel` or `@venizia/ignis`.
- **`reflect-metadata`** is no longer a dependency of `@venizia/ignis-connectors`.
- **`drizzle-kit` and `tsx`** are no longer development dependencies of `@venizia/ignis`.

## Who is affected

- **An application that imports `zod` or `reflect-metadata` without declaring it.** It used to get them through these packages and must now add them to its own `package.json`.
- **Everyone else.** No action needed.
