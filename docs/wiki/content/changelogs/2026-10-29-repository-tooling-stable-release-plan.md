---
title: Repository Tooling - Planning a Stable Release from main
description: 'The release scripts know two kinds of release: a prerelease from develop and a stable from main, each with its own scope, branch and npm dist-tag. For people who release IGNIS.'
packages: []
---

# Changelog - 2026-10-29

## Repository tooling

<Badge type="tip" text="Enhancement" />

**In one line.** This entry is for people who release IGNIS, not for people who install it. The release scripts now plan a stable release (`patch`, `minor`, `major`) from `main`; the workflow that publishes one comes in the next change.

## What changed

- **The mode decides the kind.** `prerelease`, `prepatch`, `preminor` and `premajor` release from `develop` under `next`. `patch`, `minor` and `major` release from `main` under `latest`. `release.ts` names `--ref develop` or `--ref main` accordingly.
- **A stable has a fixed scope.** A `patch` promotes every package that has a prerelease part; a `minor` or a `major` moves all nine packages, and only when they share one MAJOR.MINOR. Packages are not named. The plan job works the scope out again from the commit and refuses a plan that is not the mode's.
- **Targets are printed first.** `release.ts` (and the plan job's step summary) list each package with the version now, the version it will get and its dist-tag, so the version a stable gives is read before anything runs (`0.4.0-3` plus `minor` gives `0.4.0`).
- **The dist-tag follows the version.** A version with a prerelease part is published under `next`, any other under `latest`.
- **The loop pushes to the branch of its kind** and stops before publishing if `npm version` gives another version than the plan expects. A stable run also refuses a packed manifest that depends on a prerelease.
- **Stricter continuation.** A re-sent plan counts a package as released only at the exact version it would give it, not at any higher version on npm.

## Who is affected

- **People who release.** `make release ARGS="--mode patch --dry-run"` shows the stable plan. A stable cannot be dispatched yet: the workflow still publishes from `develop` only.
- **Everyone who installs IGNIS.** No action needed. No published package changes because of this entry.
