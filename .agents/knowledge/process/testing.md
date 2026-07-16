---
type: Playbook
title: Testing
description: How to run IGNIS package tests with the Bun test runner.
resource: packages/core/src/__tests__
tags: [process, test, bun]
---

## Steps

1. Build first. Every package's tests import from sibling packages via their published `exports`
   (`dist/`), so an unbuilt dependency produces hundreds of module-resolution failures that look
   like test failures but are not. Run `make build` or at least build everything upstream of the
   package you're testing (see [build system](/process/build-system.md)).
2. `core`, `helpers`, and `inversion` have no `test` script in `package.json`. Run tests directly:
   `cd packages/core && bun test` (or `packages/helpers`, `packages/inversion`). `bun test`
   discovers `*.test.ts` under `src/__tests__/` and runs the TypeScript sources directly - no
   compile step needed for the tests themselves.
3. `boot` is the exception. Its `package.json` defines `"test": "NODE_ENV=test bun test
   --env-file=.env.test dist/cjs/__tests__/{**/**,**}/*.test.js"` with `"pretest": "bun run
   rebuild"`. Running `cd packages/boot && bun test` first rebuilds the package, then runs the
   *compiled* `.js` tests out of `dist/cjs/__tests__/`, not the `.ts` sources. `boot`'s `build.sh`
   intentionally includes `__tests__` in its CJS/ESM output for exactly this reason (unlike
   `core`/`helpers`, whose `tsconfig.build.json` excludes tests from what ships).
4. Set `NODE_ENV=test` (or use `--env-file=.env.test`, as `boot` does) so each package's
   `.env.test` loads - it points log/audit output at `./app_data/` (gitignored) instead of the
   package root.
5. Gotcha: `helpers` and `core` build with `noEmitOnError: true` and a `tsc --noEmit -p
   tsconfig.json` pass that includes `src/__tests__/` (see [build system](/process/build-system.md)).
   One broken test file's type error blocks the ENTIRE package build, which empties or stales
   `dist/` (gitignored, so it's easy to not notice) and makes the NEXT `bun test` run fail with
   confusing import errors that look unrelated to the actual broken test.
6. `make lint` / `make lint-all` are separate from testing - they run ESLint and Prettier, not
   `bun test`. The pre-commit hook runs lint, not tests; running tests before committing is on you.

## Related

- [Build system](/process/build-system.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
