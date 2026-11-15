---
title: ParseUtility.toNumber reads a number or refuses, and the env-get codemod can use it
description: "ParseUtility.toNumber answers undefined for an unset value, the number for a decimal string and throws otherwise; devz codemod env-get --numbers rewrites get<number>(key) reads to it."
packages: ['@venizia/ignis-helpers', '@venizia/dev-configs']
---

# Changelog - 2026-11-15

## ParseUtility.toNumber reads a number or refuses

<Badge type="tip" text="New Feature" />

**In one line.** `ParseUtility.toNumber({ input })` is the strict read for a number that comes from a string, and `devz codemod env-get --numbers` moves your `get<number>(key)` reads onto it.

## What changed

- **`ParseUtility.toNumber({ input })`** answers `undefined` for an unset or blank value, so a `defaultValue` applies; the number for a decimal numeric string (whitespace around it, a sign, a fraction and an exponent are fine: `' 12 '`, `'-5'`, `'.5'`, `'1e3'`); and **throws** `[toNumber] ... is not a number` for anything else (`'abc'`, `'12px'`, `'0x10'`, `'1,000'`, `'Infinity'`, `'NaN'`, a boolean, an object). `ParseUtility.toInt` answers `0` for garbage and `Number` answers `NaN`; this one never lets a bad value through.
- **`devz codemod env-get --numbers`** (opt-in) rewrites `get<number>(key)` and `get<number>(key, { defaultValue })` to `get(key, { transform: (raw) => ParseUtility.toNumber({ input: raw }), defaultValue })` and adds `ParseUtility` to the import. Every rewrite is listed. A call it cannot rewrite safely is left and listed as manual: options held in a variable, a `defaultValue` that is not a number, or a `ParseUtility` name the file already uses for something else.

```typescript
const port = applicationEnvironment.get('APP_ENV_PORT', {
  transform: (raw) => ParseUtility.toNumber({ input: raw }),
  defaultValue: 3000,
});
```

## Who is affected

- **Apps that read a number with `get<number>(...)`.** The old call returned the environment string typed as a number. After the rewrite the value is a real number, an unset variable still answers `undefined` or the default, and a non-numeric value throws at the read instead of flowing on as a string. Check each place that compared the value with a string or concatenated it.
- **Everyone else.** No action needed.
