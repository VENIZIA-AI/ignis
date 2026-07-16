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
make core           # rebuilds dev-configs -> inversion -> helpers -> boot -> core
make boot           # rebuilds dev-configs -> inversion -> helpers -> boot
```

Each target depends on the previous package in the chain
(`dev-configs -> inversion -> helpers -> boot -> core`), so `make core` always builds its
dependencies first. Targets run `bun run --filter "@venizia/<name>" rebuild` (clean, then build).
To build one package alone: `cd packages/core && bun run rebuild`.

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
cd packages/core && bun test       # or packages/helpers, packages/inversion
cd packages/boot && bun test       # runs compiled output, see gotcha below
```

`core` and `helpers` have no `test` script - `bun test` runs directly against the `.ts` sources in
`src/__tests__/`. `boot` is the exception: its `test` script runs
`bun test dist/cjs/__tests__/**/*.test.js` with `pretest: bun run rebuild`, because `boot`'s
`build.sh` intentionally includes `__tests__` in its CJS/ESM output (`core`/`helpers` exclude
tests from `dist` via `tsconfig.build.json` and run them straight from `src`). `NODE_ENV=test`
loads each package's `.env.test` automatically.

## Lint and hooks

```bash
make lint          # lint packages/ only
make lint-all      # lint packages/ and examples/
make setup-hooks   # git config core.hooksPath .githooks
```

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
