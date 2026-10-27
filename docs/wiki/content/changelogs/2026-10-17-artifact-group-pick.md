---
title: Slice an Artifact Group by Kind With ArtifactGroup.pick
description: "ArtifactGroup.pick({ group, kinds }) gives a run-mode splitter a group that carries only some kinds, resolved when artifacts are registered - AutoArtifacts and borrowed groups keep their run-mode gating."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-17

## Slice an artifact group by kind

<Badge type="tip" text="New Feature" />

**In one line.** An application that splits `configs.artifacts` by run mode can now slice `AutoArtifacts` or a borrowed group with `ArtifactGroup.pick` instead of reading its kinds.

## What changed

- **`ArtifactGroup.pick({ group, kinds })`** returns a group carrying only `kinds`. Its source is resolved when artifacts are registered, then filtered; a slice with no class is an empty index, not an error.
- **`ArtifactGroup.resolveContent({ group })`** returns a group's classes in the one order the kernel uses: inlined `content`, the group's own `resolve()`, the installed resolver.

## Who is affected

- **Applications that slice `configs.artifacts` by kind** (a worker without controllers, a migration run without services). Replace the kind read on a group with `ArtifactGroup.pick`; a group passed through untouched would otherwise register in every slice.
- **Everyone else.** No action needed.

**Files:** [`packages/kernel/src/base/applications/artifact-group.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/kernel/src/base/applications/artifact-group.ts)
