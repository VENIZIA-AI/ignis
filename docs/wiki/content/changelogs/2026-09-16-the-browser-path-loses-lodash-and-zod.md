---
title: The Browser Path Loses lodash, and utilities Loses zod
description: "inversion drops lodash for two hand-written functions, and the OpenAPI schema builders leave utilities/. kernel/metadata goes from 20 KB gzipped to 13.9 KB."
---

# Changelog - 2026-09-16

## `@venizia/ignis-kernel/metadata`: 20 KB → 13.9 KB gzipped

<Badge type="tip" text="Fix" />

Two changes, same target: what a browser-side consumer pays for.

## `inversion` no longer depends on lodash

It used exactly two functions - `omit` in `app-error.ts`, `isEmpty` in the binding constants - for
24 KB of bundle. Both are now in `common/utilities.ts`, and `lodash` is out of the package manifest
so it cannot drift back in unnoticed.

The replacements were checked against lodash on the shapes actually passed, not assumed equivalent:
`isEmpty` is only ever called on a `string`, where it agrees with `!value` on every case including
`null` and `undefined`; `omit` is only ever called with a flat key list, never a nested path.

## `utilities/` no longer carries zod

`jsx.utility.ts` and `schema.utility.ts` were OpenAPI schema builders sitting in a barrel whose name
promised nothing of the sort. `z.object()` and `z.string()` run at module load, so every bundle that
touched `utilities/` carried the whole of zod.

They are `base/controllers/common/html-response.ts` and `.../schema-builders.ts` now, beside the
REST surface they belong to. Both are re-exported from the same barrels, so no import path changes.

## Guarded

`browser-weight.test.ts` now covers three entries - `Container`, `./metadata`, and `utilities/` -
and fails on zod reaching any of them. zod is browser-**pure**, so the purity gate never had an
opinion; weight and reachability need their own measurement.

## Who is affected

**You bundle IGNIS for a browser.** Smaller, with no change to what you import.

**Everyone else.** Nothing - same exports, same behaviour.

**Files:**

- [`packages/inversion/src/common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/utilities.ts) - `omit`
- [`packages/kernel/src/utilities/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/utilities/index.ts)
