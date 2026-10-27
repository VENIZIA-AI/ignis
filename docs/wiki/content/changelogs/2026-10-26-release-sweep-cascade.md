---
title: The Release Sweep Includes Every Dependent
description: 'make release without package names now releases each changed package and every package that depends on one, so exactly pinned internal dependencies never leave a duplicate copy behind.'
packages: []
---

# Changelog - 2026-10-26

## The release sweep includes every dependent

<Badge type="info" text="Bug Fix" />

**In one line.** `make release` (or `bun scripts/release/release.ts`) with no package names used to release only packages with source changes. It now also releases every package that depends on one of them.

## Why

The published manifests pin internal dependencies exactly: `@venizia/ignis-worker@0.4.1` needs kernel, helpers and inversion at exactly `0.4.1`. A sweep that bumped `helpers` and `kernel` but not `ignis-worker` and `ignis-boot` left those two pinned to the old versions, and a consumer installed two copies of the core packages. The default plan for 0.4.2 showed five packages; the right set was all nine.

## What changed

- **The plan follows dependencies.** A package with no source change is added when it ships a changed package as a dependency or peer dependency, transitively. `devDependencies` do not count. The plan line says why: `(no source change: depends on @venizia/ignis-kernel, pinned exactly)`.
- **Naming packages is unchanged.** `release.ts kernel connectors` releases the first named package and everything after it in the chain.

## Who is affected

Maintainers who release IGNIS. Read the `--dry-run` plan as before; it may list more packages than it used to.
