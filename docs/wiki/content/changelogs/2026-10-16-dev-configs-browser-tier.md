---
title: dev-configs Gains a Browser Tier
description: "@venizia/dev-configs 0.4.0 adds lint, format and tsconfig presets for browser code without React, and the React preset now builds on them."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-16

## dev-configs gains a browser tier

<Badge type="tip" text="New Feature" />

**In one line.** `@venizia/dev-configs` **0.4.0** adds presets for browser code that does not use React. The React preset now builds on them.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { BrowserOxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(BrowserOxlintConfigs.create());
```

## What changed

- **`BrowserOxlintConfigs.create()`.** This preset is `oxlintConfigs` plus the `crypto.randomUUID` ban. The method is `undefined` on a plain-http origin. Until now, only the React preset carried the ban.
- **`browserOxfmtConfigs`.** This preset is `oxfmtConfigs` with `arrowParens: 'always'` (`(x) => x`) and `bracketSameLine: true`. `bracketSameLine` keeps the closing `>` of a JSX element on its last attribute line.
- **`tsconfig.browser.json` and `tsconfig.react.json`.** These configs are for a library that a bundler builds. They set `moduleResolution: bundler`, add the `DOM` lib, and set `types: []`, so no Bun types reach `dist`. The React config also sets `jsx: react-jsx`.
- **`ReactOxlintConfigs` builds on `BrowserOxlintConfigs`.** The rules are the same. The `crypto.randomUUID` ban now also covers `.mjs` and `.cjs` files.

| Tool | Backend | Browser | React |
|---|---|---|---|
| oxlint | `oxlintConfigs` | `BrowserOxlintConfigs.create()` | `ReactOxlintConfigs.create()` |
| oxfmt | `oxfmtConfigs` | `browserOxfmtConfigs` | `browserOxfmtConfigs` |
| ESLint | `namingConventionConfigs` | `namingConventionConfigs` | `reactNamingConventionConfigs` |
| tsconfig | `tsconfig.common.json` | `tsconfig.browser.json` | `tsconfig.react.json` |

## Who is affected

- **Backend projects.** Nothing changes. The backend presets are untouched. No action needed.
- **A browser or React project that copies these overrides by hand.** Switch to the new exports and delete the copies. A sample swap:

```typescript
// Before
export default defineConfig({ ...oxfmtConfigs, arrowParens: 'always', bracketSameLine: true });

// After
export default defineConfig(browserOxfmtConfigs);
```
