---
title: dev-configs Gains no-leaked-render, Six More Accessibility Rules and a Shared Ignore List
description: "reactHouseConfigs bans cond && <X /> in JSX, both React presets run six more jsx-a11y rules, const-class-values is available, and the oxlint presets take an ignore list."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-18

## dev-configs gains no-leaked-render, six more accessibility rules and a shared ignore list

<Badge type="tip" text="Enhancement" />

**In one line.** A frontend project can delete its local copies of these lint rules and take them from `@venizia/dev-configs`.

## What changed

- **`NoLeakedRenderRule`** (`venizia/no-leaked-render`) is on in `reactHouseConfigs`. `{count && <X />}` draws `0` when `count` is `0`; write `count ? <X /> : null`. `eslint --fix` rewrites it. `disabled={a && b}` is a value, not a JSX child, and passes.
- **Six more `jsx-a11y` rules** in `ReactOxlintConfigs` and `ReactEslintConfigs`, as errors: `click-events-have-key-events`, `no-static-element-interactions`, `no-noninteractive-element-interactions`, `label-has-associated-control`, `heading-has-content`, `anchor-is-valid`. Both presets now run 15.
- **`ConstClassValuesRule`** (`venizia/const-class-values`): an exported type named `*State`, `*Status`, `*Stage`, `*Mode`, `*Kind` or `*Type` that is a union of string literals should be a const class plus `TConstValue`. No preset turns it on - three IGNIS types still match - so switch it on yourself: `[ConstClassValuesRule.NAME]: ConstClassValuesRule.build()`.
- **`ignore` on the oxlint presets, and `LintIgnore`.** oxlint cannot ignore a project path from `.configs/`, so `ReactOxlintConfigs.create({ ignore: ['src/gen/**'] })` turns every rule off for those paths. `LintIgnore.eslint({ patterns })` is the matching ESLint entry, and `LintIgnore.oxlint({ config, patterns })` wraps a config you finished yourself.

```typescript
// .configs/eslint.config.mjs
import { LintIgnore, reactHouseConfigs } from '@venizia/dev-configs/linters';
import { LINT_IGNORE } from './lint-ignore.mjs';

export default [LintIgnore.eslint({ patterns: LINT_IGNORE }), ...reactHouseConfigs];
```

## Who is affected

- **A React project on `reactHouseConfigs`.** `cond && <X />` now fails lint (`eslint --fix` repairs it), and an element with a click handler needs a keyboard handler or a real `button`.
- **A project that kept these rules in its own config.** Delete the local copies. Its `no-new-error` and `max-params-own` already match the shipped ones; the shipped `no-new-error` also catches a bare `Error('x')` call.
- **Everyone else.** Nothing new fails.

## Not changed

- **`consistent-type-imports` and decorated parameters.** oxlint 1.88 has no option to keep a decorated constructor parameter's class as a value import, so `--fix` still writes `import { type X }`. IGNIS does not inject by that parameter type, so the preset stays as it is. Code that reads `design:paramtypes` should check that import by hand.

**Files:** [`packages/dev-configs/src/linters/house/no-leaked-render.rule.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/dev-configs/src/linters/house/no-leaked-render.rule.ts), [`packages/dev-configs/src/linters/house/const-class-values.rule.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/dev-configs/src/linters/house/const-class-values.rule.ts), [`packages/dev-configs/src/linters/ignore.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/dev-configs/src/linters/ignore.ts), [`packages/dev-configs/src/linters/react.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/dev-configs/src/linters/react.ts)
