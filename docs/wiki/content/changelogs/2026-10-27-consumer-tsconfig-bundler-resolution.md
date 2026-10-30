---
title: Consumers Resolve IGNIS Through Bundler Resolution - dev-configs tsconfig Change
description: "The dev-configs tsconfig presets move to module esnext and moduleResolution bundler, so a package whose type is unset typechecks against the ESM-only IGNIS packages."
packages: ['@venizia/dev-configs', '@venizia/ignis']
---

# Changelog - 2026-10-27

## Consumers resolve IGNIS through bundler resolution

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** The tsconfig presets of `@venizia/dev-configs` now use `module: esnext` and `moduleResolution: bundler`, so a backend package whose `package.json` has no `type` typechecks against IGNIS 0.4.4, which ships ES modules only. Ships in 0.4.4.

## What changed

- **`tsconfig.common.json` and `tsconfig.base.json`** set `module: "esnext"` and `moduleResolution: "bundler"`. Under the old `nodenext`, a consumer with `type` unset was CommonJS and saw two copies of every drizzle class, reporting `Types have separate declarations of a private property 'shouldInlineParams'` on each call that crossed the boundary. Setting `"type": "module"` is not a fix: `nodenext` then demands file extensions on every relative import.
- **`noUncheckedSideEffectImports: false`** in the same presets. TypeScript 6 fails `import 'dotenv-flow/config'` (TS2882) on a package without types.
- **`NetworkUtility` and `BaseApplication.static()`** import `hono/bun` statically, so IGNIS no longer loads a second, CommonJS copy of hono.

## Who is affected

Every app and library that extends `@venizia/dev-configs/tsconfig.common.json` or `tsconfig.base.json`: nothing to do, the presets carry the change.

- **A package that emits CommonJS with `tsc` from these presets** must set `"module": "nodenext"` and `"moduleResolution": "nodenext"` in its own tsconfig. Without that, the output switches from `require` to `import` syntax (a package that only typechecks, or that Bun runs as source, is not affected). `@venizia/dev-configs` itself pins `nodenext`.
- **A tsconfig that does not extend the presets** sets `"module": "esnext"` (or `"preserve"`) and `"moduleResolution": "bundler"`, and `"noUncheckedSideEffectImports": false` if it has side-effect imports of untyped packages.
- **Code that relied on Node16 resolution** gains: relative imports may drop the file extension, and package `exports` are matched with the `import` condition for every file.
- **Declaration emit under bundler resolution** can raise TS2883 for an exported value whose inferred type comes from a transitive dependency. Give that export an explicit type annotation.
- **`hono/context-storage` in your own code** must be a plain import, `import { contextStorage } from 'hono/context-storage'`. A `createRequire` or `hono/dist/cjs/...` path loads hono's CommonJS build, whose request store IGNIS never reads.
- **Tests that mock a `@venizia` package.** Prefer not to mock `@venizia/*` modules at all: the real ones are safe in unit tests. If you must, spread the real module and override only what you need, and never hand-write constants: `mock.module('@venizia/ignis', () => ({ ...realIgnis, Thing: Fake }))`. Bun rewrites the live bindings of an ES module, so a hand-written replacement of a constant is what IGNIS itself reads. 0.3 and 0.4.3 were CommonJS and copied their references at load time, which hid it.

## Details

These IGNIS loaders still call `require` for a peer that ships both a CommonJS and an ES module build. If your code imports the same peer, you hold two copies, so do not compare their classes with `instanceof`: `bullmq` (queue helper), `socket.io-client` (socket client helper), the `@connectrpc` peers (gRPC adapter). `ioredis`, `nodemailer`, `mailgun.js` and the SES client are CommonJS only and have one copy. Resolved in 0.4.5: see [ModuleUtility.load resolves the ES module copy, and preload registers it](./2026-10-28-module-load-es-copy-and-preload).
