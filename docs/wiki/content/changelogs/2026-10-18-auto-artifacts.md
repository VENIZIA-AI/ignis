---
title: Auto Artifacts - No Generated Index, Typed Groups, and Vite Builds
description: "AutoArtifacts builds an application's artifact index in memory on Bun and in Vite, ArtifactGroup lets a shared package declare its domains once, and the auto index works from the entry module, tsc dist, .tsx files and the browser."
packages: ['@venizia/ignis-boot', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-18

## Auto artifacts and artifact groups

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="tip" text="Performance" /> <Badge type="info" text="Bug Fix" /> <Badge type="danger" text="Bug Fix" />

**In one line.** `configs.artifacts: AutoArtifacts` replaces the generated `_artifacts.ts`, its scripts and its freshness check, on Bun and in Vite builds, and a shared package declares one typed group per domain that applications borrow instead of importing every class.

```typescript
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { CategoryRepository, InventoryArtifacts } from '@acme/core';

export const configs: IApplicationConfigs = {
  artifacts: [AutoArtifacts, InventoryArtifacts, { repositories: [CategoryRepository] }],
};
```

## What changed

- **`@venizia/ignis-boot/auto`.** Its default export is the application's own index. From source, a Bun plugin scans `src` when artifacts are registered. A binary built with `IgnisArtifactsPlugin.create()` (from `@venizia/ignis-boot/bun`) carries the list and never scans. A `Bun.build` without the plugin fails with `Could not resolve: "ignis:artifacts"` instead of shipping a binary with missing classes. Import the auto module in the application that uses it, not in a shared library.
- **`ArtifactGroup.define({ folder })`** (`@venizia/ignis-kernel`, re-exported by `@venizia/ignis`). A shared package declares a group per domain, once; its content is every decorated class under that directory. Applications borrow groups by importing them, typed, so a typo is a compile error. A dependency is never scanned wholesale. `TArtifactIndexInput` accepts a group; a group's kind fields are typed `never` and reading one throws.
- **`ArtifactGroup.application()`** covers every decorated class of the package it is called from, per call site, so several applications loaded into one process each register their own. `AutoArtifacts` is one module per process. `ArtifactGroup.application({ ignore: ['repositories/clickhouse/**'] })` leaves out classes under globs relative to the package `src`, the patterns `ignis-artifacts generate --ignore` takes. In a build the plugin reads them from the call, so they must be string literals.
- **`ArtifactGroup.pick({ group, kinds })`** returns a group carrying only `kinds`, so a run-mode splitter (a worker without controllers, a migration run without services) can slice `AutoArtifacts` or a borrowed group. `ArtifactGroup.resolveContent({ group })` returns a group's classes in the order the kernel uses.
- **`--source-module <specifier>`** on `ignis-artifacts generate` and `check` (repeatable) indexes classes whose stereotype decorators come from a package that re-exports them, such as a frontend framework built on the kernel. A specifier is matched whole. `check` needs the same set as `generate`. The generated header and the stale hint print the full `generate` command. Programmatic: `sourceModules?: string[]` on `IGenerateOptions` and the scanner. The scanner also follows re-exports (`followReexports`), reports every decorated class it leaves out (`skipped`, with the reason), and `SOURCE_MODULES` accepts the kernel's sub-paths (`@venizia/ignis-kernel/metadata`).
- **Vite.** `IgnisArtifactsVitePlugin.create()` in `vite.config.ts` (from `@venizia/ignis-boot/vite`) makes `import AutoArtifacts from '@venizia/ignis-boot/auto'` work in a Vite-built frontend or Worker. Class names survive minification for every class with an IGNIS decorator in the application and its workspace dependencies, because binding keys are built from `Class.name`; the rest of the bundle minifies as usual. `IgnisArtifactsPlugin` pins names the same way, so a registered class that subclasses a same-name class keeps its key. `ArtifactGroup` is exported from `@venizia/ignis-kernel/metadata`, so a browser kit defines its groups without the root barrel. The scanner runs under Node. Adding a class needs a dev server restart; editing a class keeps hot reload.
- **An import cycle is named.** An index entry that is not a class stops registration with a message naming the cause, instead of a crash on `.name`.
- **The entry module sets the root.** The root is the `src` beside the `package.json` of `Bun.main`, not the working directory, so an IDE runner or `bun test` from a repository root no longer fails with `ENOENT`. With no entry file (`bun -e`) the working directory is used. A missing `src` is a clear error naming the fix.
- **`.tsx` files are scanned.** A decorated class in a `.tsx` file (a controller rendering JSX) used to be left out with no warning, and its routes answered 404. This covers `AutoArtifacts`, the groups, `ignis-artifacts generate` and the plugin. A tsc-built application maps `x.tsx` to `x.js`.
- **A tsc-built application registers the classes it runs.** The scan reads `src`, but each class is loaded from the tree the application runs (`dist/services/a.service.js` for `src/services/a.service.ts`, CommonJS or ESM), so module state and `instanceof` match the running code. A class in `src` with no compiled copy stops the start with an error asking for a rebuild. Groups in a compiled shared package resolve the same way, and the plugin inlines them in a binary.
- **Faster source starts.** The scan is cached in `node_modules/.cache/ignis-artifacts/`, keyed on the size and modification time of every `.ts` file under `src`, the package manifest and the lockfile. The next start skips the scan and TypeScript; any edit makes the next start scan again, and a corrupt cache is ignored. The cache covers `.tsx` files, so a cache from an older release is rescanned once.
- **The auto module is safe in binaries and small in the browser.** In a server binary, importing the auto module no longer evaluates the application's classes at import time (this could crash with `The superclass is not a constructor`); the index loads when artifacts are registered. A browser build imports the index eagerly, which Bun can tree-shake. `IgnisArtifactsPlugin.create({ lazyIndex })` chooses explicitly: the default is lazy for a server target and eager for `target: 'browser'`.
- **Browser builds work.** `@venizia/ignis-boot/auto` no longer loads the `@venizia/ignis-helpers` root (which reaches `node:net`) in a browser path; it takes `getError` from `@venizia/ignis-inversion`, which `@venizia/ignis-boot` now declares as a dependency. The build error `Browser polyfill for module "node:net" doesn't have a matching export named "connect"` is gone.

## Who is affected

- **Applications on Bun that use a generated index.** Optional. Replace `GeneratedArtifacts` with `AutoArtifacts`, add `IgnisArtifactsPlugin.create()` to the binary build, and delete `_artifacts.ts` and its `generate` and `check` scripts. An application that generated its index with `--ignore` can move to `ArtifactGroup.application({ ignore })`.
- **Frontends that keep a generated index, a side-effect import list or hand-pinned binding keys.** Add `IgnisArtifactsVitePlugin.create()`, pass `AutoArtifacts` in `artifacts`, and delete them.
- **Monorepos that hand-list classes borrowed from a shared package.** Optional. Declare `ArtifactGroup.define({ folder })` per domain and borrow the groups. Single classes from another domain stay listed explicitly.
- **Code that walks `configs.artifacts` and reads the kinds of each entry.** Pass an entry with `isArtifactGroup: true` through untouched, or slice it with `ArtifactGroup.pick`; reading its kinds throws, and a group passed through untouched registers in every slice.
- **Harnesses or hosts that load several applications into one process.** Use `artifacts: [ArtifactGroup.application(), ...]` in each application instead of `AutoArtifacts`.
- **Applications whose decorators come from another package.** Pass that package with `--source-module` to both `generate` and `check`, and drop any hand-written side-effect imports.
- **Applications with decorated classes in `.tsx` files.** Remove any hand listing (`{ controllers: [ViewController] }`) that worked around it.
- **Node applications.** No change: `ignis-artifacts generate` stays.

## Details

```json
{
  "scripts": {
    "generate:artifacts": "ignis-artifacts generate --root src --out src/_artifacts.ts --source-module @acme/frontend --source-module @acme/frontend-kernel",
    "check:artifacts": "ignis-artifacts check --root src --out src/_artifacts.ts --source-module @acme/frontend --source-module @acme/frontend-kernel"
  }
}
```

- `--source-module @acme/frontend` does not match `@acme/frontend-kernel`. Without the flag, the default stays `@venizia/ignis` and `@venizia/ignis-kernel`.
- For a binary, `Bun.build` keeps `NODE_ENV` a runtime read with `define`; `env: 'disable'` alone does not.
