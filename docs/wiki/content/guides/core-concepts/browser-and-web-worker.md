---
title: Using IGNIS in a Browser or Web Worker
description: Which IGNIS entries run in a browser or Web Worker, a minimal Vite config that needs no Node polyfill, and how to find the import that drags in Node builtins
difficulty: intermediate
---

# Using IGNIS in a Browser or Web Worker

The `@venizia/ignis-*` packages bundle for a browser and a Web Worker with plain `vite build`, no polyfill plugin. The one thing that breaks it is an import of the helpers root. This guide shows the safe imports, a minimal config, and how to find the import that leaks Node.

A worker entry built from the worker and kernel packages builds to about 680 kB with the config below (Vite 8, 0.4.1 packages) and contains no `node:*` import and no crypto algorithm. The main-thread entry builds to about 25 kB.

## What runs in a browser

| Package | Safe in a browser or worker |
|---|---|
| `@venizia/ignis-inversion` | Root |
| `@venizia/ignis-filter` | Root and `/schemas` |
| `@venizia/ignis-kernel` | Root, `/metadata`, `/repository` |
| `@venizia/ignis-worker` | Root (`WorkerApplication`, `BffFetchBridge`, `SharedBffTransport`) |
| `@venizia/ignis-connectors` | Everything except the engine clients (a database driver opens a socket) |
| `@venizia/ignis-helpers` | `/core`, `/common`, `/uuid`, `/temporal`, `/socket-io/client` only |

The CI purity gate bundles each of these entries for a browser and fails on a Node builtin. Two entries are never safe:

- `@venizia/ignis-helpers` (the root). It is the server toolbox and reaches 14 Node builtins: `node:crypto`, `node:fs`, `node:net`, `node:tls`, `node:zlib` and more.
- `@venizia/ignis` (the server umbrella package).

Use `/core` for `BaseHelper`, `getError` and the logger contract. Use `/common` for the value utilities. Use `/uuid` for UUID v4, v5 and v7, which do not call `node:crypto`.

## A minimal setup

Install the packages and the peers your entry reaches:

```bash
bun add @venizia/ignis-worker @venizia/ignis-kernel @venizia/ignis-inversion @venizia/ignis-filter reflect-metadata hono @hono/zod-openapi
```

The worker entry imports only the worker and kernel packages:

```typescript
// src/worker.ts
import {
  BffFetchBridge,
  type IBffTransport,
  SharedBffTransport,
  WorkerApplication,
} from '@venizia/ignis-worker';
import type { IApplicationInfo } from '@venizia/ignis-kernel';

export { BffFetchBridge, SharedBffTransport, WorkerApplication };
export type { IApplicationInfo, IBffTransport };
```

The main-thread entry imports the inversion and filter packages:

```typescript
// src/main.ts
import { ApplicationError, getError, inject, type TClass } from '@venizia/ignis-inversion';
import type { TFilter } from '@venizia/ignis-filter';

export { ApplicationError, getError, inject };
export type { TClass, TFilter };
```

The Vite config needs no plugin:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    lib: { entry: 'src/worker.ts', formats: ['es'], fileName: 'worker' },
  },
});
```

Run `vite build`. Point `lib.entry` at `src/main.ts` for the main-thread entry. Neither entry produces a `node:` import.

> [!NOTE] Install `BffFetchBridge` before the application boots
> `BffFetchBridge.install({ transport, basePath })` answers the page's global `fetch` for requests under its `basePath` and returns the uninstall function. A request sent before it is installed leaves the page and 404s against whatever serves it. The old function `installBffFetch` stays exported as a deprecated alias until 0.5.

## When `define: { global: 'globalThis' }` helps

`reflect-metadata` is a dependency of the inversion, helpers, kernel and worker packages. It picks its root object with `typeof globalThis === "object" ? globalThis : typeof global === "object" ? global : ...`. It tests `globalThis` first, so a browser never reaches `global`, and it needs no `define`.

Add the `define` only when another dependency reads a bare `global`. It is harmless:

```typescript
export default defineConfig({
  define: { global: 'globalThis' },
});
```

Do not add `vite-plugin-node-polyfills` to hide the symptom. It ships `crypto-browserify` and its dependency tree into your bundle, and it hides the import that caused it.

## Find the import that leaks Node

The symptom is a Vite warning like this:

```text
Module "node:crypto" has been externalized for browser compatibility, imported by ".../ignis-helpers/dist/esm/modules/storage/disk/helper.js"
```

The path names the first file, not who asked for it. Work back from there:

1. Search your sources for the helpers root: `rg "from '@venizia/ignis-helpers'" -g '!node_modules'`. Replace each hit with `/core`, `/common` or `/uuid`.
2. Search your installed packages for the same import: `rg -l "from '@venizia/ignis-helpers'" node_modules/<your-scope>`. A package that imports the root pulls Node into every bundle that uses it.
3. Fail the build on the warning, so a leak cannot return: `vite build 2>&1 | rg "externalized for browser compatibility" && exit 1`.

No published IGNIS or ARDOR package imports the helpers root. `@venizia/ignis-kernel` and `@venizia/ignis-worker` import `/core` and `/common`, and `@venizia/ardor-kernel` imports `/core` and `/uuid`.

## What to avoid

| Avoid | Use instead |
|---|---|
| `import { ... } from '@venizia/ignis-helpers'` | `/core`, `/common`, `/uuid`, `/temporal`, `/socket-io/client` |
| `import { ... } from '@venizia/ignis'` | The kernel, inversion, filter and worker packages |
| `Hash`, AES, RSA or ECDH from the helpers root | A WebCrypto call in your own code (the IGNIS crypto classes are synchronous and need `node:crypto`) |
| `vite-plugin-node-polyfills` | Fix the import |

IGNIS has no WebCrypto crypto helpers yet. The classes in `@venizia/ignis-helpers` are synchronous and Buffer-based, and WebCrypto is asynchronous, so they cannot share one interface.

## What was checked

The bundle sizes and the absence of `node:*` imports come from a `vite build` (Vite 8.3.5) of the entries and config above, copied from this page, against the published 0.4.1 packages. The page was not run in a browser, and the bundle was built without PGlite or Drizzle.
