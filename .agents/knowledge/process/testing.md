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
   (`inversion`, `helpers`, `boot`, `kernel`, `connectors`, `core-worker`, `core-server`)
   or `make test-all`. The targets are the one home of the test flags - `BUN_TEST_FLAGS`,
   default `--parallel`, which implies `--isolate`: a fresh global and module registry per file, and
   the servers and timers a file left open are closed between files. CI calls the same targets, so a
   suite that is green for you is green there under the same command. `bun test` discovers
   `*.test.ts` under `src/__tests__/` and runs the TypeScript sources directly - no compile step
   for the tests themselves. A bare `cd packages/<name> && bun test` still works, without the
   isolation. `filter` has no suite.
3. Every package runs the same command: `$(TEST_ENV) bun test ./src`. `TEST_ENV` in
   `make/test.mk` sets `NODE_ENV=test` and points log output at `./app_data/` (gitignored).
4. No `.env.test` is committed; a bare `bun test` logs to the default folder.
5. Gotcha: `helpers` and `core` build with `noEmitOnError: true` and a `bun check -p
   tsconfig.json` pass that includes `src/__tests__/` (see [build system](/process/build-system.md)).
   One broken test file's type error blocks the ENTIRE package build. `make rebuild` runs that
   type-check BEFORE `clean`, so a failure leaves `dist/` stale, never emptied - the next `bun test`
   silently runs sibling packages against the PREVIOUS build instead of the code you just changed.
   `dist/` is gitignored, so nothing in the working tree hints that the build never landed.
6. `make lint` / `make lint-all` are separate from testing - they run oxlint, ESLint (naming convention only) and `bun fmt`, not
   `bun test`. The pre-commit hook (`.githooks/pre-commit`) runs `make lint-all`, and nothing else.
   `make purity` / `make purity-<package>` is not a `bun test` run either - it is a standalone Bun
   script (`devz check purity`, from `@venizia/dev-configs`) that bundles each manifest entry with `bun build
   --target=browser` and inspects the metafile, so it reads `dist/` and needs a build first. CI runs
   it right after the lint step - but CI itself is `workflow_dispatch` only now, so nothing runs it
   on a push or a pull request, and no hook does either. Running the purity gate and the test suite before
   committing is on you.
7. A test never writes outside the repository. The root `Makefile` exports `TMPDIR` as the gitignored
   `.agents/local/tmp`, so `os.tmpdir()` and `mkdtemp` land there under every `make` target; remove
   what the test makes in `afterEach`/`afterAll`. Never write a literal `/tmp/...` path. A bare
   `bun test` outside `make` is covered too: a `[test] preload` in the root and every package
   `bunfig.toml` loads `scripts/test-setup/tmpdir.ts`, which sets `TMPDIR` (and `NODE_COMPILE_CACHE`,
   which Node would otherwise write to the system temp; `make` exports it as `.agents/local/cache/node-compile`).
   `make tmp-leak-check` runs
   `test-all` and `test-scripts` between a snapshot and a verify (`scripts/checks/tmp-leak/`) and fails
   when the run added anything to the system temp or left anything in `.agents/local/tmp`; only names
   the current user created after the snapshot count. The one sanctioned system-temp path is the
   clean-install gate's `ignis-clean-install-*` sandbox (a sandbox below the repository would resolve
   the repository `node_modules`): it is removed in a `finally`, and the gate lists it as allowed
   rather than ignoring it (`TmpLeak.ALLOWED_SYSTEM_PATHS`).
8. An application's boot is proved without datasource connections, a socket or a secrets provider by `assertApplicationBoots` from
   `@venizia/ignis/testing` (`packages/core-server/src/testing/assert-application-boots.ts`). It wraps
   `registerDynamicBindings` and `getBootSequence` on one instance, skips the `configure()` of datasources
   (and of the components in `skipComponents`) and the two secrets steps, never calls `start()`, rethrows
   boot's own error, and after boot runs `assertBindingsResolve` from `@venizia/ignis-inversion` over services and
   repositories (`skipBindings` leaves some out; the kernel's own step is off for the run). Components run for real (their `binding()` registers what the check resolves), so one that needs Redis,
   Kafka or S3 is named in `skipComponents`. It adds a duplicate-route check of its own, because
   boot has none. The `ignis` preset generates `src/boot.test.ts` with it; the smoke gate runs that test.

## Related

- [Build system](/process/build-system.md)
- [Trimming tests](/process/trimming-tests.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
