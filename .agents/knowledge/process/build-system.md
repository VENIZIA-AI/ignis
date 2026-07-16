---
type: Playbook
title: Build system
description: How to build IGNIS packages with the Makefile, in the right order.
resource: Makefile
tags: [process, build]
---

## Steps

1. On a fresh clone or worktree, build before doing anything else. `dist/` is gitignored in every
   package, and every package's `exports` field points at `dist/` - `packages/core` importing
   `@venizia/ignis-helpers` resolves to `packages/helpers/dist/...`. Skip this and you get a wall
   of module-resolution errors that have nothing to do with your change.
2. To rebuild everything: `make build` (alias `make build-all`). This runs `core docs docs-mcp` -
   the `core` target pulls in the full dependency chain first, so this also rebuilds
   `dev-configs`, `inversion`, `helpers`, and `boot`.
3. To build one package plus its dependencies: `make <package>`, e.g. `make helpers` runs
   `dev-configs -> inversion -> helpers` in order (each target `depends on: ` the previous one in
   the Makefile). Chain: `dev-configs -> inversion -> helpers -> boot -> core`.
4. To build a single package without walking its dependency chain (they're already built):
   `cd packages/<name> && bun run rebuild`. `rebuild` = `clean` + `build`.
5. Each package's `build` script is `sh ./scripts/build.sh`. For `core` and `helpers` it runs
   `tsc --noEmit -p tsconfig.json` first (type-checks `src` AND `src/__tests__`), then emits
   production output only via `tsc -p tsconfig.build.json` (which excludes `__tests__`, `*.test.ts`,
   `*.spec.ts`), then `tsc-alias` to rewrite path aliases. `inversion`, `boot`, and `dev-configs`
   emit directly with `tsc -p tsconfig.json` (no separate pre-check pass); `inversion` and `boot`
   additionally build CJS and ESM outputs as two passes.
6. Every `build.sh` has `set -e` and every package's tsconfig inherits `noEmitOnError: true` from
   `packages/dev-configs/tsconfig/tsconfig.base.json`. A type error anywhere aborts the script
   immediately - `dist/` is left exactly as it was (stale, never partially overwritten) - and the
   closing `echo "DONE | Build completed successfully!"` never prints. Do not trust a scrollback
   that got truncated; if a build's success is in doubt, rerun `tsc --noEmit -p tsconfig.json`
   directly in the package and check its exit code.
7. Gotcha: for `core` and `helpers`, that first `tsc --noEmit` pass type-checks `src/__tests__/`
   too, even though those tests never ship in `dist`. A type error in a test file blocks the build
   of production code that never touches it.
8. `make lint` / `make lint-all` (packages only vs. packages + `examples/`) do not build anything -
   run them after a build, not instead of one.

## Related

- [Makefile targets](/reference/makefile-targets.md)
- [Testing](/process/testing.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
