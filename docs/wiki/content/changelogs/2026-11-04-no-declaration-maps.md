---
title: Published packages no longer ship .d.ts.map files
description: "The nine @venizia packages stop publishing declaration maps, which pointed at a src folder the tarball does not contain; the .js.map files stay."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-filter', '@venizia/ignis-helpers', '@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-boot', '@venizia/ignis-worker', '@venizia/dev-configs']
---

# Changelog - 2026-11-04

## Published packages no longer ship .d.ts.map files

<Badge type="tip" text="Enhancement" />

**In one line.** Installs are about 7% smaller (about 910 KB unpacked across the nine packages) because the `.d.ts.map` files are no longer in the tarballs; nothing you import changes.

## What changed

- **No `.d.ts.map` in the tarballs.** Each package's `files` list now excludes them. They pointed at the repository's `src/` folder, which the tarball does not contain, so an editor could not follow them.
- **`.js.map` files stay.** Stack traces in framework code keep their original lines.

## Who is affected

- **Everyone.** No action needed. Types, exports and runtime behaviour are the same.
