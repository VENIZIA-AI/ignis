---
title: A browser that only throws an ApplicationError no longer ships reflect-metadata
description: "The @venizia/ignis-inversion entry stops importing reflect-metadata; the modules that call it import it themselves. A getError-only browser bundle drops from 16.3 KB to 4.1 KB."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-11-12

## A browser that only throws an ApplicationError no longer ships reflect-metadata

<Badge type="tip" text="Enhancement" />

**In one line.** Importing `getError` from `@venizia/ignis-inversion` in a browser no longer pulls the 44 KB `reflect-metadata` polyfill.

## What changed

- **The package entry does not import `reflect-metadata`.** The registry and the kernel modules that call `Reflect.*Metadata` import it themselves, so decorated code still finds it before any decorator runs.
- **Measured** with a minimal Vite build of one `getError` call: 16.3 KB raw (5.3 KB gzip) before, 4.1 KB (1.8 KB gzip) after.

## Who is affected

- **Browser apps that import only errors or constants from `@venizia/ignis-inversion`.** The bundle shrinks; nothing to change.
- **Servers.** No change: a server loads the whole package, which loads the polyfill with the registry.
