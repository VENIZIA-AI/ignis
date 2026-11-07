---
title: The strict oxlint preset allows || as an empty-string fallback
description: "prefer-nullish-coalescing in oxlintConfigs now allows || on a string, so value?.trim() || fallback passes. Objects and numbers still report."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-08

## The strict oxlint preset allows || as an empty-string fallback

<Badge type="tip" text="Enhancement" />

**In one line.** `oxlintConfigs` no longer reports `||` on a string, so `value?.trim() || fallback` passes without turning the rule off.

## What changed

- **Strings.** `prefer-nullish-coalescing` now runs with `ignorePrimitives: { string: true }`. `name?.trim() || 'guest'` and an env value that is `''` are an intentional fallback, and `??` would keep the `''`.
- **Everything else still reports.** `||` on an object, a number, a boolean or a bigint is flagged as before.
- **`lenientFallback`.** `OxlintConfigs.create({ lenientFallback: true })` still adds number to the allowed set, so `limit || 20` passes. `BrowserOxlintConfigs` and `ReactOxlintConfigs` follow the base.

## Who is affected

- **A project on `oxlintConfigs`, `OxlintConfigs.create()`, `BrowserOxlintConfigs` or `ReactOxlintConfigs`.** The rule reports fewer sites; no action needed. A project that turned the rule off package by package only to allow string fallbacks can turn it back on.
- **A project on `eslintConfigs`.** No change: that preset keeps the rule as it was.

## Details

```typescript
declare const name: string | undefined;
declare const limit: number | undefined;

const label = name?.trim() || 'guest'; // before: reported, now: allowed
const size = limit || 20; // still reported, unless lenientFallback is on
```

| File | Package |
|------|---------|
| `src/linters/oxlint.ts` | dev-configs |
