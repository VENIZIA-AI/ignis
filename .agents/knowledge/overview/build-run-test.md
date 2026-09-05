---
type: Overview
title: Build, run, and test
description: How to actually build, run, and test IGNIS packages, and the gotchas that aren't derivable from reading the code.
resource: Makefile
tags: [overview, build, test, bun]
---

## Build

```bash
make build          # alias: make build-all - rebuilds every package in dependency order
make core           # rebuilds dev-configs -> inversion -> {filter, helpers} -> kernel -> core
make boot           # rebuilds dev-configs -> inversion -> helpers -> boot
```

The dependency graph is a DAG, not a single line. `filter` hangs off `inversion` alone - it is
isomorphic and deliberately does not sit after `helpers`. `kernel` sits beside `boot` rather than
after it, on `helpers` plus `filter`, so it never picks up boot's node-only discovery. `core`
depends on both `boot` and `kernel`, so `make core` builds every package above.

Each target builds its dependencies first, running `bun run --filter "@venizia/<name>" rebuild` -
type-check, then clean, then build. The type-check runs *before* `clean` on purpose: `build.sh`
type-checks `__tests__` too, so ordering it first stops a broken test from wiping `dist/` and
leaving an empty directory behind. To build one package alone:
`cd packages/core-server && bun run rebuild`.

## Run

```bash
cd examples/vert
cp .env.example .env.development   # edit with real PostgreSQL credentials
bun install
bun run migrate:dev                # push schema to database
bun run server:dev                 # start dev server
```

## Test

```bash
cd packages/core-server && bun test       # or packages/helpers, packages/inversion
cd packages/boot && bun test       # runs compiled output, see gotcha below
```

`core` and `helpers` have no `test` script - `bun test` runs directly against the `.ts` sources in
`src/__tests__/`. `boot` is the exception: its `test` script runs
`bun test dist/cjs/__tests__/**/*.test.js` with `pretest: bun run rebuild`, because `boot`'s
`build.sh` intentionally includes `__tests__` in its CJS/ESM output (`core`/`helpers` exclude
tests from `dist` via `tsconfig.build.json` and run them straight from `src`). `NODE_ENV=test`
loads each package's `.env.test` automatically.

`filter` and `kernel` carry no tests of their own - they are covered indirectly through `core`.

## Lint and hooks

```bash
make lint             # lint packages/ only
make lint-all         # lint packages/ and examples/
make purity           # bundle every entry claimed browser-pure, fail on node builtins or globals
make purity-<package> # one package: inversion, filter, helpers, kernel
make setup-hooks      # git config core.hooksPath .githooks
```

`purity` probes the built `dist/`, so build the package first; the packages with no browser-pure
entry claimed (`dev-configs`, `boot`, `core`, `docs-mcp`) have a target that just skips.

`.githooks/pre-commit` runs **only** `make lint-all` - nothing else. Purity is a CI gate, run per
package by the release workflow, so a green commit says nothing about it.

## Gotchas that aren't obvious from reading the code

- **Bun only** - never `npm`, `yarn`, or `pnpm`. The workspace, `rebuild`/`clean` scripts, and test
  runner all assume Bun.
- **A fresh clone or worktree has no `dist/`** - gitignored in every package, and every package's
  `main`/`exports` points at `dist/`. `core` importing `@venizia/ignis-helpers` resolves to
  `packages/helpers/dist/...`, so skipping the build makes `bun test` in any downstream package
  fail with a wall of module-resolution errors unrelated to your change. Build in dependency order
  first (`make build`, or at least everything upstream of the package you're touching).
- **`noEmitOnError: true` is set repo-wide**, and every `build.sh` runs under `set -e` - a type
  error anywhere aborts the build immediately and `dist` is left exactly as it was, stale rather
  than partially overwritten. For `core`/`helpers`, `build.sh` type-checks the whole `tsconfig.json`
  (including `src/__tests__/`) before the emit-only pass that excludes tests, so a broken test file
  blocks a build of code that never touches it. If a build seems like it should have succeeded, run
  `tsc --noEmit -p tsconfig.json` in the package directly and check its exit code.

## Related

- [Build system](/process/build-system.md)
- [Makefile targets](/reference/makefile-targets.md)
- [Monorepo layout](/overview/monorepo-layout.md)
- [Testing conventions](/conventions/testing-conventions.md)
