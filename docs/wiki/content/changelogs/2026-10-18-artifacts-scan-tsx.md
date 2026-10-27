---
title: Auto Artifacts Register Classes in .tsx Files
description: 'The artifact scanner, the scan cache and the build plugin read .tsx files as well as .ts, so a decorated class in a .tsx file - a controller rendering JSX - is registered instead of silently left out.'
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## Auto artifacts register classes in .tsx files

<Badge type="danger" text="Bug Fix" />

**In one line.** A decorated class in a `.tsx` file is registered like one in a `.ts` file.

## What changed

- **The scanner reads `.tsx`.** `AutoArtifacts`, `ArtifactGroup.define`/`application`, `ignis-artifacts generate` and `IgnisArtifactsPlugin` all scanned `**/*.ts` only, so a controller that renders JSX was left out with no warning and its routes answered 404.
- **A tsc-built application maps `x.tsx` to `x.js`** in its compiled tree, as it does for `.ts`.
- **The scan cache covers `.tsx` files**, and its format version is bumped, so a cache written by an older release is rescanned once.

## Who is affected

- **Applications with decorated classes in `.tsx` files.** Remove any hand listing (`{ controllers: [ViewController] }`) that worked around it.
- **Everyone else.** One rescan on the first start after upgrading.

**Files:** [`packages/boot/src/generator/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/generator/common/constants.ts), [`packages/boot/src/bun/sources.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/sources.ts)
