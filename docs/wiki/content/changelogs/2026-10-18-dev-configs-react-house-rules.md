---
title: dev-configs Gains no-leaked-render, Six More Accessibility Rules and a Shared Ignore List
description: "A frontend project can drop its local copies of these lint rules and take them from @venizia/dev-configs."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-18

## dev-configs gains no-leaked-render, six more accessibility rules and a shared ignore list

<Badge type="tip" text="Enhancement" />

**In one line.** A frontend project can delete its local copies of these lint rules and take them from `@venizia/dev-configs`.

## What changed

- **`NoLeakedRenderRule`** (`venizia/no-leaked-render`) is on in `reactHouseConfigs`. `{count && <X />}` draws `0` when `count` is `0`; write `count ? <X /> : null`. `eslint --fix` rewrites it.
- **Six more `jsx-a11y` rules** in `ReactOxlintConfigs` and `ReactEslintConfigs`, as errors: `click-events-have-key-events`, `no-static-element-interactions`, `no-noninteractive-element-interactions`, `label-has-associated-control`, `heading-has-content`, `anchor-is-valid`.
- **`ConstClassValuesRule`** (`venizia/const-class-values`): an exported type named `*State`, `*Status`, `*Stage`, `*Mode`, `*Kind` or `*Type` that is a union of string literals should be a const class plus `TConstValue`. No preset turns it on, so switch it on yourself: `[ConstClassValuesRule.NAME]: ConstClassValuesRule.build()`.
- **`ignore` on the oxlint presets, and `LintIgnore`.** `ReactOxlintConfigs.create({ ignore: ['src/gen/**'] })` turns every rule off for those paths. `LintIgnore.eslint({ patterns })` is the matching ESLint entry, and `LintIgnore.oxlint({ config, patterns })` wraps a config you finished yourself.

```typescript
// .configs/eslint.config.mjs
import { LintIgnore, reactHouseConfigs } from '@venizia/dev-configs/linters';
import { LINT_IGNORE } from './lint-ignore.mjs';

export default [LintIgnore.eslint({ patterns: LINT_IGNORE }), ...reactHouseConfigs];
```

## Who is affected

- **A React project on `reactHouseConfigs`.** `cond && <X />` now fails lint, and an element with a click handler needs a keyboard handler or a real `button`.
- **A project that kept these rules in its own config.** Delete the local copies. The shipped `no-new-error` also catches a bare `Error('x')` call.
- **Everyone else.** Nothing new fails.

## Details

- **`consistent-type-imports` and decorated parameters.** oxlint 1.88 has no option to keep a decorated constructor parameter's class as a value import, so `--fix` still writes `import { type X }`. Code that reads `design:paramtypes` should check that import by hand.
