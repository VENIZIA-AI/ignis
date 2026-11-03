---
title: ignis-artifacts check Compares the Index Body, Not Its Header Line
description: ignis-artifacts check ignores the first line of the generated index, so changing CLI flags alone no longer reports the file as stale.
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-09-06

## `ignis-artifacts check` ignores the header line

<Badge type="warning" text="Behavior Change" />

**In one line.** `check` fails only when the artifact list or the import list would change; the first line, which records the command, is never a reason to fail.

## What changed

- **`checkArtifactIndex()`** compares everything below the first line. A missing file is still stale.
- **`generateArtifactIndex()`** is unchanged: it rewrites the file whenever any line differs, header included.

```bash
ignis-artifacts check --root src --out src/_artifacts.ts --ignore 'controllers/**'
```

## Who is affected

- **Anyone running `check` separately from `generate`.** A flag change alone no longer fails the gate. Run `generate` when you want the header to match.
- **Builds that run `generate` then `check`.** No visible change.
