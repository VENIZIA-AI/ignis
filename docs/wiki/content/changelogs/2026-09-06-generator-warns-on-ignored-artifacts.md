---
title: ignis-artifacts Warns When an --ignore Pattern Hides a Decorated Class
description: generate and check print one stderr line per decorated class that a user --ignore pattern excluded from the index. The default patterns for tests and generated files stay silent. Exit codes do not change.
---

# Changelog - 2026-09-06

## `--ignore` no longer drops an artifact in silence

<Badge type="tip" text="New Feature" />

**In one line.** A stale `--ignore` pattern used to remove decorated classes from the index without a word; `generate` and `check` now name each one on stderr.

```text
$ ignis-artifacts generate --root src --out src/_artifacts.ts --ignore 'components/**'
wrote src/_artifacts.ts | 41 artifact(s)
warning: CacheRedisComponent (component) in components/cache-redis.component.ts matches --ignore and is left out of the index
```

## The problem it solves

A package once excluded `components/**` because its components were registered by hand. After moving them to `@component()`, the pattern stayed behind in `build.sh`. The generator obeyed it, the application booted with zero components, and nothing failed: no compile error, no warning, only missing behaviour at runtime. Four packages in one consumer hit this.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `ArtifactScanner.scanWithReport()` | New: `{ artifacts, ignored }`; `ignored` holds decorated classes under a user pattern only | boot |
| `IScanReport` | New exported interface | boot |
| `generateArtifactIndex()` / `checkArtifactIndex()` | Return `ignored` beside their previous fields | boot |
| `ignis-artifacts generate` / `check` | One `warning:` line per hidden class on stderr; exit codes unchanged | boot |

- The default patterns (`**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**`) never produce a warning.
- A pattern that hides a class on purpose, such as controllers registered by cohort, keeps working; the line is information, not a failure.

## Who is affected

- **Packages with an `--ignore` flag.** Read the warning once after upgrading. A hidden class you meant to register: delete the pattern or move the file. A hidden class you meant to hide: nothing to do.
- **Everyone else.** No output changes.
