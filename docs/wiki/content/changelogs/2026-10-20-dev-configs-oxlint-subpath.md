---
title: oxlint Config Without Loading ESLint
description: "@venizia/dev-configs/linters/oxlint loads only the oxlint presets, so every oxlint run starts about a second sooner."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-20

## oxlint config without loading ESLint

<Badge type="tip" text="Enhancement" />

**In one line.** Import `OxlintConfigs` from `@venizia/dev-configs/linters/oxlint` and an oxlint run no longer loads ESLint and its plugins first.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { OxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(OxlintConfigs.create({ lenientFallback: true }));
```

## What changed

- **New subpath `@venizia/dev-configs/linters/oxlint`.** It exports `oxlintConfigs`, `OxlintConfigs`, `IOxlintPresetOptions`, `BrowserOxlintConfigs` and `ReactOxlintConfigs`, and nothing that imports ESLint.
- **Why it is faster.** oxlint evaluates `.configs/oxlint.config.mts` on every run. `@venizia/dev-configs/linters` is one file that loads every linter module, including the ones that import ESLint, `typescript-eslint` and their plugins. That cost about 1.2 s per run, for a config that uses none of it. The new subpath loads in a few milliseconds.
- **The rules are the same.** `oxlint --print-config` prints identical output for both imports.
- **`@venizia/dev-configs/linters` is unchanged.** It still exports everything, including the three oxlint presets, so no existing import breaks. Inside the package, `ReactOxlintConfigs` moved to its own file, `react-oxlint.ts`, and `react.ts` is now `react-eslint.ts`, so each file is named for its tool.

## Who is affected

- **A project whose oxlint config imports `oxlintConfigs`, `OxlintConfigs`, `BrowserOxlintConfigs` or `ReactOxlintConfigs`.** Change the import path to `@venizia/dev-configs/linters/oxlint` to save the load time. Nothing else changes.
- **A project that also imports from `@venizia/dev-configs/linters` in its ESLint config.** Leave that import. `namingConventionConfigs`, `reactNamingConventionConfigs` and `houseConfigs` need ESLint and stay in `/linters`.
