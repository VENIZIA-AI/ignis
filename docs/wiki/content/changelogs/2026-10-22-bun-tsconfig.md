---
title: tsconfig Follows Bun, and the App Compile Type-Checks
description: "The shared tsconfig adds isolatedModules, moduleDetection force and noImplicitReturns, and BunCompiler.compile({ check }) stops on a type error."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-22

## tsconfig follows Bun, and the app compile type-checks

<Badge type="tip" text="Enhancement" />

**In one line.** Bun's recommended settings where dual CJS+ESM allows; a binary is never built from code that fails its types.

| Where | Change |
|---|---|
| `tsconfig.base.json` | `isolatedModules: true`, `moduleDetection: "force"`, `noImplicitReturns: true`; `ignoreDeprecations` removed |
| `tsconfig.browser.json` | `verbatimModuleSyntax: true` |
| App and lib presets | `noEmit: true` |
| `BunCompiler.compile` | `check?: boolean`; the app preset's `compile.ts` sets `check: true` |

```typescript
await BunCompiler.compile({ entrypoint: './src/index.ts', check: true });
// error TS2322: Type 'string' is not assignable to type 'number'. -> no binary
```

## Not taken

- `verbatimModuleSyntax` and `module: "Preserve"` for the framework packages: their CommonJS build fails under both.
- `noUncheckedIndexedAccess` everywhere: it stays on only where the code is clean.

## Who is affected

A function with a path that returns nothing now fails `noImplicitReturns`. A `const enum` read across files fails `isolatedModules`. Fix the code; the presets already pass.
