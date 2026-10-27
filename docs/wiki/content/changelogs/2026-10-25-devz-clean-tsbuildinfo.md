---
title: devz clean Removes tsbuildinfo Files
description: "devz clean now also deletes the top-level *.tsbuildinfo file that an incremental type-check leaves next to tsconfig.json."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-25

## devz clean removes tsbuildinfo files

<Badge type="info" text="Bug Fix" />

**In one line.** `devz clean` deletes `*.tsbuildinfo` files in the project root, so a clean project has no leftover type-check cache.

## What changed

- **`devz clean` removes `*.tsbuildinfo`.** The shared base tsconfig sets `incremental: true`, so a type-check that emits nothing writes `<tsconfig name>.tsbuildinfo` next to `tsconfig.json`. `clean` used to remove only `dist` and `node_modules/.cache`.
- **Nothing else moves.** Only files directly in the project root are removed. A `.tsbuildinfo` inside `dist` already went with `dist`, and `.eslintcache` is not produced by `devz lint` (it caches under `node_modules/.cache/eslint`).

## Who is affected

- **Projects with a `clean` script that runs `devz clean`.** No action needed.
- **Projects that kept a hand-written `rm -f *.tsbuildinfo` next to it.** You can drop that line.
