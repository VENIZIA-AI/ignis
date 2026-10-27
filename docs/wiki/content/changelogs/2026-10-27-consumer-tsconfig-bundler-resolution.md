---
title: Consumers Resolve IGNIS Through Bundler Resolution - dev-configs tsconfig Change
description: "tsconfig.common.json and tsconfig.base.json move to module esnext and moduleResolution bundler, with noUncheckedSideEffectImports off, so a package whose type is unset typechecks against the ESM-only IGNIS packages. Also: guidance for hono context-storage, test preloads and dual-package loaders."
packages: ['@venizia/dev-configs', '@venizia/ignis']
---

# Changelog - 2026-10-27

## Consumers resolve IGNIS through bundler resolution

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** The tsconfig presets of `@venizia/dev-configs` now use `module: esnext` and `moduleResolution: bundler`, so a backend package whose `package.json` has no `type` typechecks against IGNIS 0.4.4, which ships ES modules only. Ships in 0.4.4.

## What went wrong

IGNIS 0.4.4 packages are ES modules. Under `nodenext` (the old preset) a consumer package with `type` unset is CommonJS, so its `import 'drizzle-orm'` resolves drizzle's CommonJS types (`index.d.cts`), while IGNIS's own types resolve the ES module types (`index.d.ts`). TypeScript sees two declarations of every drizzle class and reports `Types have separate declarations of a private property 'shouldInlineParams'` on each call that crosses the boundary (a `sql` template passed to a connector, a `PgTable` passed to a repository). Setting `"type": "module"` is not a fix: under `nodenext` it also demands file extensions on every relative import.

## What changed

- **`tsconfig.common.json` and `tsconfig.base.json`** set `module: "esnext"` and `moduleResolution: "bundler"`. Bundler resolution reads every import through the `import` condition, so both sides see one copy of each package.
- **`noUncheckedSideEffectImports: false`** in the same presets. TypeScript 6 checks `import 'x'` and fails on a package without types (`import 'dotenv-flow/config'` is TS2882).
- **`NetworkUtility` and `BaseApplication.static()`** import `hono/bun` statically instead of calling `require('hono/bun')`, so IGNIS no longer loads a second, CommonJS copy of hono.

## Who is affected

Every app and library that extends `@venizia/dev-configs/tsconfig.common.json` or `tsconfig.base.json`: nothing to do, the presets carry the change.

- **A package that emits CommonJS with `tsc` from these presets** must set `"module": "nodenext"` and `"moduleResolution": "nodenext"` in its own tsconfig. The presets now use `module: esnext` and `moduleResolution: bundler`, so without that line the output switches from `require` to `import` syntax (a package that only typechecks, or that Bun runs as source, is not affected). `@venizia/dev-configs` itself pins `nodenext`, because Node loads its lint presets.
- **A tsconfig that does not extend the presets** sets `"module": "esnext"` (or `"preserve"`) and `"moduleResolution": "bundler"`, and `"noUncheckedSideEffectImports": false` if it has side-effect imports of untyped packages.
- **Code that relied on Node16 resolution** gains: relative imports may drop the file extension, and package `exports` are matched with the `import` condition for every file.
- **`hono/context-storage` in your own code** must be a plain import, `import { contextStorage } from 'hono/context-storage'`. A `createRequire` or `hono/dist/cjs/...` path loads hono's CommonJS build, whose request store is a second one that IGNIS never reads.
- **Tests that mock a `@venizia` package.** Prefer not to mock `@venizia/*` modules at all: the real ones are safe in unit tests (BANA removed its mocks of `@venizia/ignis` and `@venizia/ignis-helpers` and its identity suite passes, 533 of 533). If you must, spread the real module and override only what you need, and never hand-write constants: `mock.module('@venizia/ignis', () => ({ ...realIgnis, Thing: Fake }))`. Bun rewrites the live bindings of an ES module, so a hand-written replacement of a constant (a `CasbinRuleVariants` with other keys) is now what IGNIS itself reads. 0.3 and 0.4.3 were CommonJS and copied their references at load time, which hid it.

## Known dual-copy hazards

These IGNIS loaders still call `require` for a peer that ships both a CommonJS and an ES module build. If your code imports the same peer, you hold two copies, so do not compare their classes with `instanceof`: `bullmq` (queue helper), `socket.io-client` (socket client helper), the `@connectrpc` peers (gRPC adapter). `ioredis`, `nodemailer`, `mailgun.js` and the SES client are CommonJS only and have one copy. Converting these loaders is planned for the next release.
