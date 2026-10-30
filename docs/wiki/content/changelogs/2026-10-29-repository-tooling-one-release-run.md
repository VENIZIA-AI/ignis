---
title: Repository Tooling - One Release Run for the Whole Package Chain
description: 'A release is one workflow run that publishes the plan of packages in dependency order, and a run that stopped is continued by sending the same plan. For people who release IGNIS.'
packages: []
---

# Changelog - 2026-10-29

## Repository tooling

<Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** This entry is for people who release IGNIS, not for people who install it. A release used to be one workflow run per package; it is now one run for the whole plan, and the dispatch no longer takes a package.

## What changed

- **One dispatch, one run.** `make release` plans the packages as before, prints the plan as a ready `--plan` value, and starts the workflow once. The workflow loops the packages in dependency order. The inputs `package`, `dependencies_from` and `chain_released` are gone; the workflow takes `plan`, `build_mode` and `issue`. Every dispatch names `--ref develop`.
- **The default mode is `prerelease`.** A dispatch that names no mode no longer publishes under `latest`.
- **Four jobs.** `plan` checks and orders the input; `test` runs the gates once per package of the plan, in parallel; `scripts` runs the repository scripts' tests once; `publish` needs all three, builds once, and is the only job that writes or holds `id-token`. No step interpolates a dispatch input into a shell command.
- **A tested loop.** `scripts/release/release-run.ts` releases each package: bump, pack, check the manifest and the checksum, `npm publish --provenance`, wait until the tarball answers 200, move the `highest` dist-tag only upward, then the release commit, the push and the tag `<package>-v<version>`. Git is written only after the package can be installed, so after any stop it equals the registry.
- **A stopped run is continued by sending the same plan.** `bun scripts/release/release.ts --plan <printed plan> --yes` skips a package already released, records one that is on npm without its commit or tag without publishing twice, and stops before publishing anything if the plan is stale. A package counts as released only at the exact version the plan would give it (`npm version <mode>` from the planned version); a higher version that is on npm and tagged, but that this plan did not produce, stops the run. A rejected push stops the run; nothing rebases any more.
- **27 guards.** `release-workflow.test.ts` removes each from a copy and expects the check to name it. The checksum and version guards are now tests of the loop, which `release-run.test.ts` runs against a fake registry, remote and runner.

## Who is affected

- **People who release.** The commands are the same (`make release-plan`, `make release ARGS="--mode patch --issue N --yes"`), but one run publishes everything, and `npm-release` has no reviewers, so a dispatch publishes without a pause. `--chain-released` is replaced by `--plan`.
- **Everyone who installs IGNIS.** No action needed. No published package changes because of this entry.
