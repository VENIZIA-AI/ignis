---
title: oxlint Config Without Loading ESLint
description: "Importing from @venizia/dev-configs/linters/oxlint loads only the oxlint presets, so every oxlint run starts about a second sooner."
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

- **New subpath `@venizia/dev-configs/linters/oxlint`.** It exports `oxlintConfigs`, `OxlintConfigs`, `IOxlintPresetOptions`, `BrowserOxlintConfigs`, `ReactOxlintConfigs`, `LintIgnore` and the rule classes (`EqeqeqRule`, `NoRestrictedImportsRule`, `NoRestrictedPropertiesRule`, `NoUnusedVarsRule`, `PreferNullishCoalescingRule`, `SwitchCaseBracesRule`, `NamingConventionRule`) with their types.
- **Faster start.** Loading `@venizia/dev-configs/linters` cost about 1 s per oxlint run. The new subpath loads in a few milliseconds.
- **The rules are the same.** `oxlint --print-config` prints identical output for both imports.
- **`@venizia/dev-configs/linters` is unchanged.** It still exports everything, so no existing import breaks.

## Who is affected

- **A project whose oxlint config imports from `@venizia/dev-configs/linters`.** Change that import to `@venizia/dev-configs/linters/oxlint` to save the load time.
- **A project that also imports from `@venizia/dev-configs/linters` in its ESLint config.** Leave that import. `namingConventionConfigs`, `reactNamingConventionConfigs` and `houseConfigs` need ESLint and stay in `/linters`.
