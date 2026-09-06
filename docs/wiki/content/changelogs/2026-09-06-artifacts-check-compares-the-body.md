---
title: ignis-artifacts check Compares the Index Body, Not Its Header Line
description: checkArtifactIndex now ignores the first line of the generated index, so a change of CLI flags alone never reports the file as stale; only a different import list or artifact list does. generate still rewrites the header.
---

# Changelog - 2026-09-06

## `ignis-artifacts check` ignores the header line

<Badge type="warning" text="Behavior Change" />

**In one line.** `check` fails only when the artifact list or the import list would change; the first line, which records the command, is never a reason to fail.

```bash
ignis-artifacts check --root src --out src/_artifacts.ts --ignore 'controllers/**'
```

## The problem it solves

Since the header started printing the real `--root`, `--out`, `--ignore` and `--export`, a whole-file comparison made `check` red after any flag change, even when the generated body was byte-identical. A package that moved `--ignore` from `build.sh` to `package.json` saw a stale report with nothing to regenerate.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `checkArtifactIndex()` | Compares everything below the first line; a missing file is still stale | boot |
| `generateArtifactIndex()` | Unchanged: rewrites the file whenever any line differs, header included | boot |

## Who is affected

- **Everyone running `check` separately from `generate`.** A flag change alone no longer fails the gate; run `generate` when you want the header to match.
- **Builds that run `generate` then `check`.** No visible change.
