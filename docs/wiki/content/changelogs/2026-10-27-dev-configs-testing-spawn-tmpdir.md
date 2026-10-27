---
title: dev-configs Testing Export Adds spawnSyncBounded and a Repo-Tmp Preload
description: "@venizia/dev-configs/testing exports spawnSyncBounded and useRepoTmp, and @venizia/dev-configs/testing/tmpdir-preload keeps a bare bun test's temp folders inside the repository. IGNIS drops its five copies of the spawn helper."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-27

## dev-configs testing export adds spawnSyncBounded and a repo-tmp preload

<Badge type="tip" text="Enhancement" />

**In one line.** Test helpers that IGNIS copied into five packages and VULCAN into four now live in `@venizia/dev-configs/testing`. Ships in 0.4.4.

## What changed

- **`spawnSyncBounded({ cmd, timeout? })`.** `Bun.spawnSync` with a bound: it kills the child with SIGKILL after `timeout` (default 120 000 ms) and throws `[spawnSyncBounded] did not exit within N ms, killed | cmd: ...`. A sync spawn blocks the worker thread, so bun's own test timeout cannot stop a stuck child.
- **`useRepoTmp({ root? })`** points `TMPDIR` at `<repository>/.agents/local/tmp/tests` (the repository is the nearest folder with a `.git`), makes an empty `.git` marker there, sets `GIT_CEILING_DIRECTORIES`, and makes `Bun.spawn` and `Bun.spawnSync` pass the new environment to children. It does nothing when `TMPDIR` is already inside that folder.
- **`@venizia/dev-configs/testing/tmpdir-preload`** calls it. Pass it as `--preload @venizia/dev-configs/testing/tmpdir-preload` in the `test` script or make target of each package, and a bare `bun test` keeps its temp folders in the repository, as `make test` does. No new file is needed. Bun reads only the `bunfig.toml` of the folder it runs in, so `[test] preload = ["@venizia/dev-configs/testing/tmpdir-preload"]` in the repository root applies when the tests run from the root (`bun test <package>`), not to `bun test` run inside a workspace package; a `bunfig.toml` with that line in each package is an alternative to the flag. From 0.4.5 the `ignis` app and lib presets pass the flag in their `test` script.
- IGNIS imports `spawnSyncBounded` from the package; its five copies are deleted and the suites keep their test counts.

## Who is affected

Nobody has to change anything. A repository with its own copy of the helper can delete it and import the export.
