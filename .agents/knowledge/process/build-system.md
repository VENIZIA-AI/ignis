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
2. To rebuild everything: `make build` (alias `make build-all`). This runs `core docs docs-mcp` -
   the `core` target pulls in the full dependency chain first, so this also rebuilds
   `dev-configs`, `inversion`, `helpers`, `boot`, `filter`, and `kernel`.
3. To build one package plus its dependencies: `make <package>`, e.g. `make helpers` runs
   `dev-configs -> inversion -> helpers` in order (each Makefile target declares its dependencies
   as prerequisites). The chain is a DAG, not a line:
   `dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> core`. `filter` branches off
   `inversion` alone - it is isomorphic and deliberately does not sit after `helpers`. `kernel`
   needs both `helpers` and `filter`, and sits beside `boot` rather than after it, so it never
   depends on boot's node-only glob discovery. This concept is the canonical copy of the chain -
   other concepts link here rather than restate it.
4. To build a single package without walking its dependency chain (they're already built):
   `cd packages/<name> && bun run rebuild`. `rebuild` is `sh ./scripts/rebuild.sh`:
   `tsc --noEmit -p tsconfig.json`, then `clean`, then `build`. The type-check comes first on
   purpose - see step 6.
5. Each package's `build` script is `sh ./scripts/build.sh`. For `core`, `helpers`, and `kernel` it
   runs `tsc --noEmit -p tsconfig.json` first (type-checks `src` AND `src/__tests__`), then emits
   production output only via `tsc -p tsconfig.build.json` (which excludes `__tests__`, `*.test.ts`,
   `*.spec.ts`), then `tsc-alias` to rewrite path aliases. `inversion`, `filter`, `boot`, and
   `dev-configs` emit directly with `tsc -p tsconfig.json` (no separate pre-check pass);
   `inversion`, `filter`, and `boot` additionally build CJS and ESM outputs as two passes. `boot`
   compiles its `__tests__` into `dist` on purpose - its test runner executes the compiled tests.
6. Every `build.sh` has `set -e` and every package's tsconfig inherits `noEmitOnError: true` from
   `packages/dev-configs/tsconfig/tsconfig.base.json`. A type error anywhere aborts the script
   immediately and the closing `echo "DONE | Build completed successfully!"` never prints.
   `rebuild.sh` type-checks *before* it runs `clean`, so a failure leaves the previous `dist/`
   intact instead of emptying it - that ordering is what closes the empty-`dist/` trap. Do not trust
   a scrollback that got truncated; if a build's success is in doubt, rerun
   `tsc --noEmit -p tsconfig.json` directly in the package and check its exit code.
7. Gotcha: the type-check pass covers `src/__tests__/` too, even though those tests never ship in
   `dist` for most packages. A type error in a test file blocks the build of production code that
   never touches it - via `rebuild.sh` for every package, and again inside `build.sh` for `core`,
   `helpers`, and `kernel`.
8. `make purity` bundles every entry in `scripts/purity/manifest.ts` with
   `bun build --target=browser` and fails on node builtins or node globals (`process.`,
   `__dirname`, `__filename`, `createRequire`). Only `inversion` (ESM and CJS), `filter` (ESM and
   CJS), `helpers` (`/core` and `/common`), and `kernel` claim a browser-pure entry;
   `make purity-<package>` for the others prints a no-op. It reads `dist/`, so run it after a build,
   never instead of one.
9. Two details keep that gate honest - do not "simplify" them away. It inspects the `--metafile`
   module graph instead of grepping the bundle for a `node:` prefix, because
   `bun build --target=browser` silently stubs unpolyfillable builtins to an empty object, exits 0,
   and leaves no specifier in the output; builtins are matched against `node:module`'s
   `builtinModules`, so a bare `fs` import is caught as well as `node:fs`. And it passes
   `--env=disable`, because Bun otherwise inlines `process.env.NODE_ENV` at compile time and erases
   the exact read the gate exists to catch.
10. `make lint` / `make lint-all` (packages only vs. packages + `examples/`) do not build anything -
    run them after a build, not instead of one.

## Related

- [Makefile targets](/reference/makefile-targets.md)
- [Gotchas](/conventions/gotchas.md)
- [Testing](/process/testing.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
