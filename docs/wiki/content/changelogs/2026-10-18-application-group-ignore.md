---
title: ArtifactGroup.application Leaves Out Ignored Files
description: 'ArtifactGroup.application({ ignore }) leaves out the classes under globs relative to src - the patterns ignis-artifacts --ignore takes - so an application that generated its index with --ignore can drop the generated file.'
packages: ['@venizia/ignis-kernel', '@venizia/ignis-boot']
---

# Changelog - 2026-10-18

## ArtifactGroup.application leaves out ignored files

<Badge type="tip" text="Feature" />

**In one line.** `ArtifactGroup.application({ ignore: ['repositories/clickhouse/**'] })` registers every decorated class of the package except those under the patterns.

## What changed

- **`ignore` on `ArtifactGroup.application`.** Globs relative to the package `src`, the same patterns `ignis-artifacts generate --ignore` takes. They apply when the group is resolved from source and when `IgnisArtifactsPlugin` inlines it in a build; the plugin reads them from the call, so they must be string literals.
- **Where the auto import goes.** The guide now says to import `@venizia/ignis-boot/auto` in the application that uses it, not in a shared library: every `Bun.build` that includes the module needs the plugin.

## Who is affected

- **Applications that generated their index with `--ignore`.** They can move to `ArtifactGroup.application({ ignore })` and delete the generated file.
- **Everyone else.** No change.

**Files:** [`packages/kernel/src/base/applications/artifact-group.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/kernel/src/base/applications/artifact-group.ts), [`packages/boot/src/bun/sources.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/sources.ts), [`packages/boot/src/bun/plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/bun/plugin.ts)
