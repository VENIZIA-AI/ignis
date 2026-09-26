---
type: Playbook
title: Build system
description: How to build IGNIS packages with the Makefile, in the right order.
resource: Makefile
tags: [process, build]
---

## Steps

1. On a fresh clone or worktree, build before doing anything else. `dist/` is gitignored in every
   package, and every package's `exports` field points at `dist/` - `packages/core-server` importing
   `@venizia/ignis-helpers` resolves to `packages/helpers/dist/...`. Skip this and you get a wall
   of module-resolution errors that have nothing to do with your change.
2. To rebuild everything: `make build` (alias `make build-all`). This runs
   `core core-worker boot atlas docs surface-check symbols-check wiki-links-check
   wiki-anchors-check` - the `core`
   target pulls in the full dependency chain first, so this also rebuilds `dev-configs`,
   `inversion`, `helpers`, `filter`, and `kernel`.
3. To build one package plus its dependencies: `make <package>`, e.g. `make helpers` runs
   `dev-configs -> inversion -> helpers` in order (each Makefile target declares its dependencies
   as prerequisites). The chain is a DAG, not a line:
   `dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core`, with `boot` and
   `atlas` hanging off `helpers` and `core-worker` off `kernel` beside `connectors`, as leaves that
   `core` does not reach - only applications and agents consume them, which is why `make build-all`
   names all three explicitly. `filter` branches off `inversion` alone - it is isomorphic and
   deliberately does not sit after `helpers`. `kernel` needs both `helpers` and `filter`. This
   concept is the canonical copy of the chain - other concepts link here rather than restate it.
4. To build a single package without walking its dependency chain (they're already built):
   `cd packages/<name> && bun run rebuild`. `rebuild` is `sh ./scripts/rebuild.sh`:
   `tsc --noEmit -p tsconfig.json`, then `clean`, then `build`. The type-check comes first on
   purpose - see step 6.
5. Each package's `build` script is `sh ./scripts/build.sh`. Every package but `filter` and
   `dev-configs` runs `tsc --noEmit -p tsconfig.json` first (type-checks `src` AND `src/__tests__`),
   then emits production output only via `tsc -p tsconfig.build.json` (which excludes `__tests__`,
   `*.test.ts`, `*.spec.ts`), then `tsc-alias` to rewrite path aliases. Every ESM pass runs `tsc-alias` with
   `resolveFullPaths` (so `dist/esm` imports carry `.js` and load under Node's ESM loader) and then
   `bun ../../scripts/esm-marker.ts`, which writes `dist/esm/package.json` with `"type": "module"`
   and the package's `sideEffects` re-rooted - without it Node parses every file as CommonJS first
   (measured on `connectors/http`: 38.0 -> 30.7 ms). `filter` and `dev-configs`
   emit directly with `tsc -p tsconfig.json` (no separate pre-check pass). Most packages build CJS
   and ESM outputs as two passes; only `core`, `dev-configs`, and `atlas` emit a single pass. No
   package ships its tests in `dist` - they stay sources under `src/__tests__/` that `bun test` runs
   directly. A package that emits them into `dist` makes a bare `bun test` execute every test once
   per copy - `inversion` reported 111 for 37 tests until its `tsconfig.build.json` excluded them.
6. Every `build.sh` has `set -e` and every package's tsconfig inherits `noEmitOnError: true` from
   `packages/dev-configs/tsconfig/tsconfig.base.json`. A type error anywhere aborts the script
   immediately and the closing `echo "DONE | Build completed successfully!"` never prints.
   `rebuild.sh` type-checks *before* it runs `clean`, so a failure leaves the previous `dist/`
   intact instead of emptying it - that ordering is what closes the empty-`dist/` trap. Do not trust
   a scrollback that got truncated; if a build's success is in doubt, rerun
   `tsc --noEmit -p tsconfig.json` directly in the package and check its exit code.
7. Gotcha: the type-check pass covers `src/__tests__/` too, even though those tests never ship in
   `dist`. A type error in a test file blocks the build of production code that never touches it -
   via `rebuild.sh` for every package, and again inside `build.sh` for every package but `filter`
   and `dev-configs`.
8. `make purity` bundles every entry in `scripts/purity/manifest.ts` with
   `bun build --target=browser` and fails on node builtins or node globals (`process.`,
   `__dirname`, `__filename`, `createRequire`). Six packages claim a browser-pure surface:
   `inversion`, `filter`, `helpers` (`/core` and `/common` only), `kernel`, `core-worker` and
   `connectors` (engine-client rows waived in the manifest); `make purity-<package>` for the others
   prints a no-op. It reads `dist/`, so run it after a build, never instead of one. Run it on
   Bun >= 1.4.1: `connectors/postgres/supabase [import]` is pure on 1.4.1 and red on 1.4.0, and the
   release workflow installs `bun-version: latest`.
9. Two details keep that gate honest - do not "simplify" them away. It inspects the `--metafile`
   module graph instead of grepping the bundle for a `node:` prefix, because
   `bun build --target=browser` silently stubs unpolyfillable builtins to an empty object, exits 0,
   and leaves no specifier in the output; builtins are matched against `node:module`'s
   `builtinModules`, so a bare `fs` import is caught as well as `node:fs`. And it passes
   `--env=disable`, because Bun otherwise inlines `process.env.NODE_ENV` at compile time and erases
   the exact read the gate exists to catch.
10. `make lint` / `make lint-all` (packages only vs. packages + `examples/`) do not build anything -
    run them after a build, not instead of one.
11. Repository scripts under `scripts/` are TypeScript run by Bun with no build; `scripts/tsconfig.json`
    (bun types, bundler resolution, `noEmit`) is what the editor and `make lint-scripts` check - that
    target runs prettier and `tsc -p scripts/tsconfig.json` and is part of `make lint-all`.
    `make test-scripts` runs their unit tests (`scripts/__tests__`, positive and negative case per gate).
12. `make clean-install` packs every package and installs each one alone into an empty project
    under `tmpdir()`, with its required peers plus the peers `scripts/clean-install/manifest.ts`
    grants a sub-path. It does not build, and it refuses to start when its result could be wrong:
    - a package's newest `src/` file (outside `__tests__`) is newer than its newest `dist/` file -
      run `make build` first. The stamp is the whole `dist/`, not `index.js`, because the build is
      incremental and re-emits only the files a change reaches;
    - a `node_modules` sits in any ancestor of the gate root, or `NODE_PATH`, `~/.node_modules` or
      `~/.node_libraries` exists - any of them would satisfy a missing peer;
    - a non-private package has no claim - a config-only package such as `dev-configs` carries an
      explicit `configOnly` claim and gets no row;
    - a browser-claimed ESM entry (from `scripts/purity/manifest.ts`) matches no row, which would
      skip its browser build. The CJS entries never match by design.

    After each install it also checks every `@venizia/*` entry in the sandbox `bun.lock` resolves to
    the packed tarball, not the registry. One blind spot remains: a granted peer brings its own
    required peers (granting `@hono/zod-openapi` also installs `hono`), so the gate cannot see a
    leak of such a transitive peer into the entry it was granted to.

## The shared build lock

Several agent sessions share one working tree, and `make <pkg>` cleans `dist/` before it emits. Two
builds at once can leave a package half-built. Wrap every build, and every gate that builds, in one
machine-wide lock:

```bash
mkdir -p ~/.cache/ignis-verify && flock ~/.cache/ignis-verify/build.lock make <pkg>
```

Keep the `mkdir -p`. `flock` never creates the lock's folder: where `~/.cache/ignis-verify/` is
missing, it prints "cannot open lock file" and exits 66 without running the build. The same lock
wraps `make docs` and any other target that builds.

## Related

- [Makefile targets](/reference/makefile-targets.md)
- [Gotchas](/conventions/gotchas.md)
- [Testing](/process/testing.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
- [Framework roles](/process/framework-roles.md)
