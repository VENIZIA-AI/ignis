---
title: Repository Tooling - Release Mode Check, Examples Gate, Temp Folders
description: "scripts/release/release.ts rejects an unknown --mode, make examples-check type-checks every example, tests and scripts keep their temp folders in .agents/local/tmp, and the repository adopts VULCAN 0.4.4. Nothing here changes a published package."
packages: []
---

# Changelog - 2026-10-26

## Repository tooling

<Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** This entry is for people who work in the IGNIS repository, not for people who install it. The release script now rejects a `--mode` it does not know, CI type-checks the examples, and a test run may no longer leave anything in the system temp folder.

## What changed

- **`--mode` is checked.** `bun scripts/release/release.ts --mode <mode>` passed any text to `npm version`. It now accepts the seven `npm version` modes (`patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, `prerelease`) and stops with `--mode must be one of ...` for anything else. The modes and the dist-tags (`latest`, `next`) are const classes in `scripts/release/release-constants.ts`.
- **`make examples-check` type-checks every example** against the built packages. A type a package forgot to export, or a signature that changed, breaks it. CI runs it after the build.
- **Temp folders stay in the repository.** `make` exports `TMPDIR` as the gitignored `.agents/local/tmp`, so every `os.tmpdir()` in a test or script lands there. `make tmp-leak-check` runs the suites and fails when the run added anything to the system temp or left anything in `.agents/local/tmp`; CI runs the same snapshot and verify around its test steps. The one sanctioned system-temp path is the `make clean-install` sandbox, which must sit outside the repository.
- **A bare `bun test` is covered too.** A `[test] preload` in the root and every package `bunfig.toml` sets `TMPDIR` before the tests run. `make` also exports `NODE_COMPILE_CACHE` as `.agents/local/cache/node-compile`, because Node would otherwise write its compile cache to the system temp. The test environment sets the logger folder to the absolute `app_data` of the package, so a child process started in another folder cannot create an `app_data` there.
- **`.gitignore` anchors `release/`.** The pattern `release/` hid `scripts/release/` from git. It is `/release/` now, and `scripts/release/` is tracked and formatted.
- **VULCAN 0.4.4.** The repository pins `@venizia/vulcan` 0.4.4. After you pull, run `make agent-setup` (`make vulcan-doctor` says when you need to).
- **The `devz lint` tests stub the tools** in the project's own `node_modules/.bin`, so they pass with an in-repository `TMPDIR`.

## Who is affected

- **People who run `release.ts` with `--mode`.** A typo such as `--mode pach` now stops the script before anything is dispatched. A valid mode behaves as before.
- **People who write tests or scripts in this repository.** Use `os.tmpdir()` or `mkdtemp`, never a literal `/tmp` path, and remove what you create; `make tmp-leak-check` names the offender.
- **Everyone who installs IGNIS.** No action needed. No published package changes.
