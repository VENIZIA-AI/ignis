---
title: ignis-artifacts Warns When an --ignore Pattern Hides a Decorated Class
description: ignis-artifacts generate and check print one stderr line for each decorated class that an --ignore pattern leaves out of the index; exit codes do not change.
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-09-06

## `--ignore` no longer drops an artifact in silence

<Badge type="tip" text="New Feature" />

**In one line.** A stale `--ignore` pattern used to remove decorated classes from the index without a word; `generate` and `check` now name each one on stderr.

## What changed

- **One `warning:` line per hidden class** on stderr, from both `generate` and `check`. Exit codes do not change.
- **Default patterns stay silent.** `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts` and `**/generated/**` never warn.
- **A pattern that hides a class on purpose keeps working.** The line is information, not a failure.
- **API.** `ArtifactScanner.scanWithReport()` returns `{ artifacts, ignored }`. `generateArtifactIndex()` and `checkArtifactIndex()` return `ignored` beside their previous fields.

```text
$ ignis-artifacts generate --root src --out src/_artifacts.ts --ignore 'components/**'
wrote src/_artifacts.ts | 41 artifact(s)
warning: CacheRedisComponent (component) in components/cache-redis.component.ts matches --ignore and is left out of the index
```

## Who is affected

- **Packages with an `--ignore` flag.** Read the warning once after upgrading. A hidden class you meant to register: delete the pattern or move the file. A hidden class you meant to hide: nothing to do.
- **Everyone else.** No output changes.
