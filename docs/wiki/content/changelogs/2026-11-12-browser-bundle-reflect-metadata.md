---
title: A browser that only throws an ApplicationError no longer ships reflect-metadata
description: "The @venizia/ignis-inversion entry stops importing reflect-metadata; the modules that call it import it themselves. A getError-only browser bundle drops from 16.3 KB to 4.1 KB."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel']
migration:
  - id: inversion-entry-reflect-metadata
    symbols: ['@venizia/ignis-inversion']
    upgrade:
      before: |
        // app entry of a browser bundle: Reflect.getMetadata was defined only because
        // importing @venizia/ignis-inversion loaded the polyfill
        import { getError } from '@venizia/ignis-inversion';

        const keys = Reflect.getMetadataKeys(target);
      after: |
        import 'reflect-metadata';
        import { getError } from '@venizia/ignis-inversion';

        const keys = Reflect.getMetadataKeys(target);
    downgrade:
      steps:
        - "Remove the import 'reflect-metadata' you added if you like; with the older version the package entry loads the polyfill again, and importing it twice is harmless."
    data: "None: no stored data, token or config changes."
---

# Changelog - 2026-11-12

## A browser that only throws an ApplicationError no longer ships reflect-metadata

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Importing `getError` from `@venizia/ignis-inversion` in a browser no longer pulls the 44 KB `reflect-metadata` polyfill.

## What changed

- **The package entry does not import `reflect-metadata`.** The registry and the kernel modules that call `Reflect.*Metadata` import it themselves, so decorated code still finds it before any decorator runs.
- **Measured** with a minimal Vite build of one `getError` call: 16.3 KB raw (5.3 KB gzip) before, 4.1 KB (1.8 KB gzip) after.

## Who is affected

- **Browser apps that import only errors or constants from `@venizia/ignis-inversion`.** The bundle shrinks; nothing to change.
- **Browser apps that call `Reflect.getMetadata` or another `Reflect.*Metadata` function themselves.** They relied on the package entry to load the polyfill, and a bundler that drops unused modules no longer keeps it. Import `reflect-metadata` once at your own entry.
- **Servers.** No change: a server loads the whole package, which loads the polyfill with the registry.

## Breaking changes

> [!WARNING]
> The `@venizia/ignis-inversion` entry no longer loads `reflect-metadata` by itself. An app that uses `Reflect.*Metadata` outside IGNIS's own decorators and registry must import it.

**After:** add `import 'reflect-metadata';` at the entry of the bundle, before the first use.
