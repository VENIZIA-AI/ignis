---
title: lodash Is Gone
description: "No IGNIS package depends on lodash any more; isEmpty and omit are available from @venizia/ignis-helpers/common."
packages: ['@venizia/ignis-helpers', '@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-17

## No IGNIS package depends on lodash

<Badge type="tip" text="Fix" />

**In one line.** Five lodash functions are replaced, which makes browser bundles smaller (`@venizia/ignis-helpers/core` 20.8 KB to 17.2 KB gzipped, `@venizia/ignis-kernel/metadata` 14.9 KB to 14.0 KB).

## What changed

- **`isEmpty` and `omit`.** They now live in `@venizia/ignis-inversion` and are re-exported from `@venizia/ignis-helpers/common`, so you can use them.
- **`get`, `set`, `round`.** Replaced where they were used, by plain indexing, plain assignment and a local round.
- **`isEmpty` is not `!value`.** `isEmpty({ value: {} })` is `true` where `!{}` is `false`. It agreed with lodash across 40 values.
- **`round`.** One deliberate difference: a result of negative zero is normalised to `0`.

## Who is affected

- **Nobody, at the API.** Same behaviour, same exports.
