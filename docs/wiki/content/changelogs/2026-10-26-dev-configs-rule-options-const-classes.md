---
title: dev-configs Rule Options Are Const Classes
description: "The severity and mode options of the dev-configs rule builders - RuleSeverities, EqeqeqModes, UnusedVarsScopes, UnusedArgsModes and SwitchCaseBracesModes - are const classes with SCHEME_SET and isValid. The values and defaults are unchanged."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-26

## dev-configs rule options are const classes

<Badge type="tip" text="Enhancement" />

**In one line.** The options of the rule builders (`EqeqeqRule.build`, `NoUnusedVarsRule.build`, `SwitchCaseBracesRule.build`) were unions of string literals. They are const classes now, like `RepositoryTypes`. The values and the defaults are the same, so existing configs keep working.

| Option | Const class | Type | Values |
|---|---|---|---|
| `severity` of every builder | `RuleSeverities` | `TRuleSeverity` | `off`, `warn`, `error` |
| `EqeqeqRule.build({ mode })` | `EqeqeqModes` | `TEqeqeqMode` | `always`, `smart` |
| `NoUnusedVarsRule.build({ vars })` | `UnusedVarsScopes` | `TUnusedVarsScope` | `all`, `local` |
| `NoUnusedVarsRule.build({ args })` | `UnusedArgsModes` | `TUnusedArgsMode` | `all`, `after-used`, `none` |
| `SwitchCaseBracesRule.build({ mode })` | `SwitchCaseBracesModes` | `TSwitchCaseBracesMode` | `always`, `avoid` |

## What changed

- **Each class has `SCHEME_SET` and `isValid(value)`.**
- **The literal still works.** `EqeqeqRule.build({ mode: 'always' })` and `{ severity: 'warn' }` compile as before.
- **`TConstValue<T>` is exported** from the rules entry: the string values of a const class, the same shape the other packages use.

## Who is affected

Nobody has to change code.
