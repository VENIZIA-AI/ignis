---
title: dev-configs House Rules and Type-Only Imports
description: "Two house ESLint rules - at most 5 positional parameters, errors through getError - and consistent-type-imports in the base oxlint preset."
---

# Changelog - 2026-10-17

## dev-configs house rules and type-only imports

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Export `houseConfigs` from your ESLint config, and lint now fails on a function with more than 5 positional parameters, a `new Error`, and a value import of a type.

```typescript
// .configs/eslint.config.mjs
import { houseConfigs } from '@venizia/dev-configs/linters';

export default houseConfigs; // reactHouseConfigs in a React project
```

## What changed

- **`venizia/max-params-own`.** A function you write takes at most 5 positional parameters; beyond that, one options object. Not counted: a callback passed inline to a call or a JSX prop, a signature a declared type fixes, a constructor whose parameters are all `@inject`. A hook callback counts.
- **`venizia/no-new-error`.** Throw through `getError` (or an `ApplicationError`), never `new Error(...)`. Tests are exempt.
- **`typescript/consistent-type-imports` in the base oxlint preset.** A type is imported with `import type` / `import { type X }`. Under Bun, a value import of a type in a decorated class fails at load with `Export named 'X' not found`; now lint catches it. `oxlint --fix` rewrites them.
- **Builder options.** `PreferNullishCoalescingRule.build({ ignorePrimitives })` and `NoUnusedVarsRule.build({ argsIgnorePattern, ... })`.

## Who is affected

- **Every project on dev-configs.** Switch `namingConventionConfigs` to `houseConfigs` (or `reactNamingConventionConfigs` to `reactHouseConfigs`), run `oxlint --fix` once for the type imports, and replace each `new Error` with `getError`. A function over 5 parameters takes an options object.
- **A project that wants another limit.** Override the rule after the preset: `[MaxParamsOwnRule.NAME]: MaxParamsOwnRule.build({ max: 3 })`.
