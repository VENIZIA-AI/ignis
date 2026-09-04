---
type: Playbook
title: Testing
description: How to run IGNIS package tests with the Bun test runner.
resource: packages/core-server/src/__tests__
tags: [process, test, bun]
---

## Steps

1. Build first. Every package's tests import from sibling packages via their published `exports`
   (`dist/`), so an unbuilt dependency produces hundreds of module-resolution failures that look
   like test failures but are not. Run `make build` or at least build everything upstream of the
   package you're testing (see [build system](/process/build-system.md)).
2. Run a suite through its make target from the repository root: `make test-<package>`
   (`inversion`, `helpers`, `boot`, `kernel`, `connectors`, `core-worker`, `core-server`) or
   `make test-all`. The targets are the one home of the test flags - `BUN_TEST_FLAGS`, default
   `--parallel`, which implies `--isolate`: a fresh global and module registry per file, and the
   servers and timers a file left open are closed between files. CI calls the same targets, so a
   suite that is green for you is green there under the same command. `bun test` discovers
   `*.test.ts` under `src/__tests__/` and runs the TypeScript sources directly - no compile step
   for the tests themselves. A bare `cd packages/<name> && bun test` still works, without the
   isolation. `filter` has no suite.
3. `boot` is the exception: its `package.json` defines `"test": "NODE_ENV=test bun test
   --env-file=.env.test"`, and `make test-boot` runs `bun run test` so that script stays the single
   owner of boot's environment (`bun run` appends the flags to it). Its tests are sources under
   `src/__tests__/` like every other package.
4. Set `NODE_ENV=test` (or use `--env-file=.env.test`, as `boot` does) so each package's
   `.env.test` loads - it points log/audit output at `./app_data/` (gitignored) instead of the
   package root.
5. Gotcha: `helpers` and `core` build with `noEmitOnError: true` and a `tsc --noEmit -p
   tsconfig.json` pass that includes `src/__tests__/` (see [build system](/process/build-system.md)).
   One broken test file's type error blocks the ENTIRE package build. `rebuild.sh` runs that
   type-check BEFORE `clean`, so a failure leaves `dist/` stale, never emptied - the next `bun test`
   silently runs sibling packages against the PREVIOUS build instead of the code you just changed.
   `dist/` is gitignored, so nothing in the working tree hints that the build never landed.
6. `make lint` / `make lint-all` are separate from testing - they run ESLint and Prettier, not
   `bun test`. The pre-commit hook (`.githooks/pre-commit`) runs `make lint-all` and nothing else.
   `make purity` / `make purity-<package>` is not a `bun test` run either - it is a standalone Bun
   script (`scripts/purity/cli.ts`) that bundles each manifest entry with `bun build
   --target=browser` and inspects the metafile, so it reads `dist/` and needs a build first. CI runs
   it right after the lint step - but CI itself is `workflow_dispatch` only now, so nothing runs it
   on a push or a pull request, and no hook does either. Running the purity gate and the test suite before
   committing is on you.

## Related

- [Build system](/process/build-system.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
