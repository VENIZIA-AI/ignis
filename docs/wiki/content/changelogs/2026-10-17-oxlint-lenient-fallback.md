---
title: lenientFallback for the oxlint Presets
description: 'OxlintConfigs.create({ lenientFallback: true }) allows || on string and number operands; the default stays strict.'
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-17

## lenientFallback for the oxlint presets

<Badge type="tip" text="New Feature" />

**In one line.** If `''` and `0` fall back on purpose in your project, opt out of the strict `||` check in one line instead of overriding the rule by hand.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { OxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(OxlintConfigs.create({ lenientFallback: true }));
```

## What changed

- **`OxlintConfigs.create({ lenientFallback })`.** With `lenientFallback: true`, `prefer-nullish-coalescing` allows `||` where the left side is a string or a number, so `opts.name || 'guest'` and `opts.limit || 20` pass. It still flags `||` on objects and booleans.
- **The same option on the browser and React presets.** `BrowserOxlintConfigs.create()` and `ReactOxlintConfigs.create()` take it too.
- **The default is unchanged.** `oxlintConfigs` and `OxlintConfigs.create()` stay strict, because `||` also swallows a real `''` or `0`.

## Who is affected

- **A project that overrode the rule by hand.** If your config spreads `oxlintConfigs` and sets `PreferNullishCoalescingRule.build({ ignorePrimitives: { string: true, number: true } })`, replace both with `OxlintConfigs.create({ lenientFallback: true })`.
- **Everyone else.** Nothing changes.
