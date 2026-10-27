---
title: dev-configs Warns on String-Literal Unions and Explicit Casts
description: 'houseConfigs and reactHouseConfigs now warn on a string-literal union in an exported declaration (venizia/const-class-values) and on an as X cast (consistent-type-assertions). Warnings only; tests are exempt.'
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-26

## dev-configs warns on string-literal unions and explicit casts

<Badge type="tip" text="Enhancement" /> <Badge type="info" text="Behavior Change" />

**In one line.** After updating `@venizia/dev-configs`, your ESLint run prints warnings for a string-literal union in an exported type and for an `as X` cast. They never fail the lint.

```text
warning  An enumerable string is a const class plus TConstValue<typeof X>, not a union of string literals  venizia/const-class-values
warning  Do not use any type assertions  @typescript-eslint/consistent-type-assertions
```

## What changed

- **`venizia/const-class-values` is on, at `warn`.** It used to be off and checked only exported types named `*State`, `*Status`, `*Stage`, `*Mode`, `*Kind` or `*Type`. It now checks every exported declaration: a type alias, an interface member, a generic constraint, a parameter or a return type. Fix a hit with a const class and `TConstValue`, like `RepositoryTypes`.
- **Key sets are skipped.** `Pick<T, 'a' | 'b'>`, `Omit`, `Extract`, `Exclude`, `Record` and mapped-type keys are not value domains, and a union with a non-string member is not either.
- **`@typescript-eslint/consistent-type-assertions` is on, at `warn`, with `assertionStyle: 'never'`.** `as X`, `as any` and `as unknown as X` warn. `as const` and `satisfies` do not.
- **Tests are exempt** from both rules, as `no-new-error` already is.
- **`ConstClassValuesRule.build({ namePattern })` is optional.** Without it the rule checks every exported declaration. Pass `namePattern` to keep the old narrow behavior.
- **The 5-parameter limit is unchanged.** `venizia/max-params-own` was already an error in both presets.

## Who is affected

Apps and libraries that lint with `houseConfigs` or `reactHouseConfigs`. Nothing fails. To stay quiet, turn a rule off after the preset:

```javascript
import { houseConfigs } from '@venizia/dev-configs/linters';

export default [
  ...houseConfigs,
  {
    rules: {
      'venizia/const-class-values': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
];
```

To make one a failure, set it to `'error'` the same way.
