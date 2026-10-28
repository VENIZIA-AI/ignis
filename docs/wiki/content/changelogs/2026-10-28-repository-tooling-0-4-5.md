---
title: Repository Tooling - A Guarded Release Workflow, a Tarball Wait, a Published Atlas Index
description: 'The release workflow has a token-less test job, publishes only from develop and works on the dispatched commit; the release driver waits for approvals and for every tarball; IGNIS publishes the signed atlas index of each commit; the wiki gates come from VULCAN 0.4.6. For people who work in the repository.'
packages: []
---

# Changelog - 2026-10-28

## Repository tooling

<Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** This entry is for people who release IGNIS or read it through atlas, not for people who install it. The release workflow tests before it publishes and refuses any ref but `develop`, the release driver reports done only when every tarball can be downloaded, and every commit of `develop` has a signed atlas index. Ships in 0.4.5.

## What changed

- **The release workflow is split in two jobs.** `test` has read-only permissions and no secret: it builds, runs the checks and the package's unit tests (`make test-<package>`), and runs the preset smoke. `release` needs it, runs only from `develop`, and is the only job that can write. Both check out the dispatched commit, never a branch name, and the run name carries it. The old "sync develop" step is gone.
- **Inputs are pinned.** Bun is an exact version, the actions are pinned by full commit with the tag in a comment, and the preset smoke runs the VULCAN version the repository declares in `devDependencies` instead of `latest` (`scripts/preset/preset-smoke.ts` has the same default).
- **A test holds those rules.** `scripts/release/__tests__/release-workflow.test.ts` removes each of the 19 guards from a copy of the workflow, one at a time, and expects the check to name it. It is listed in `scripts/checks/controls.json`.
- **The release publishes through npm trusted publishing, with no stored token.** The `release` job names the `npm-release` environment (its reviewers approve each run; the driver keeps waiting), holds `id-token: write` and nothing else does, installs an exact Node and an exact npm and asserts it, packs the tarball once with `bun pm pack`, records its sha256, and publishes that file with `npm publish --provenance`. The dist-tag steps use the same identity. No step reads a secret, and the guards fail the workflow test if one does, if `bun publish` returns, or if the packed tarball and the published one could differ. `@venizia/ignis-connectors` gains the `repository` field every other package has, which provenance needs; a test keeps all nine matching this repository. Each package needs a trusted publisher entry on npmjs.com before its release (see the knowledge page `process/release-publish.md`).
- **The release driver waits.** A run that waits for an approval is waited for with no time limit, and the driver says so once. After the last package it waits until the tarball of every released version answers 200 (HEAD requests, up to 15 minutes each, in parallel), because the registry lists a version minutes before its file can be downloaded; the 0.4.4 release saw that window.
- **IGNIS publishes its atlas index.** `.github/workflows/atlas-index.yml` builds the signed index of each commit of `main` and `develop` and of tags with VULCAN's action (pinned by commit) and attaches it to the release `atlas-index`. A project that declares IGNIS as an atlas source downloads and verifies it instead of building it, and builds locally on any miss. The public half of the key is `atlas.index.keys` in `.configs/vulcan.config.mts`. A release tag gets no pair from this workflow: the release workflow pushes with the Actions token, and GitHub starts no workflow from such a push; the next push to `develop` covers the head.
- **VULCAN 0.4.6.** The repository pins `@venizia/vulcan` 0.4.6; after you pull, run `make agent-setup` (`make vulcan-doctor` says when you need to). The wiki link and anchor gates (`make wiki-links-check`, `make wiki-anchors-check`) are VULCAN's now and `scripts/wiki/` is gone.
- **The tests got faster and smaller.** The event-bus tests run on a fake clock (the kernel suite goes from 17 s to 0.4 s), two flaky tests no longer depend on wall-clock time or process-wide memory, and 22 duplicate cases are removed, each with a named surviving test that goes red under the same break. The method and its result are in the knowledge page `process/trimming-tests.md`.
- **Test temp folders.** The presets pass `--preload @venizia/dev-configs/testing/tmpdir-preload` in their `test` script; see the [testing export](/changelogs/2026-10-27-dev-configs-testing-spawn-tmpdir).

## Who is affected

- **People who release.** `make release` takes the same arguments. The nine trusted publisher entries must exist on npmjs.com first, and each run waits for the environment's approval. A dispatch from any other ref runs the test job and skips the release job. A run can wait for an approval, and the driver keeps waiting.
- **Projects that declare IGNIS as an atlas source.** They download the prebuilt index; no action.
- **People who work in the repository.** Run `make agent-setup` after you pull.
- **Everyone who installs IGNIS.** No action needed. No published package changes because of this entry.
