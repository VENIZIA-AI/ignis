---
type: Package
title: dev-configs
description: Centralized ESLint, Prettier, and TypeScript configuration consumed by every package in the IGNIS monorepo.
resource: packages/dev-configs
tags: [packages, dev-configs, tooling]
---

`@venizia/dev-configs` is the root of the IGNIS build dependency chain (`dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> core`) - it has no dependency on any other IGNIS package, and every other package depends on it for lint, format, and compiler settings. It ships a single ESM build.

## Exports

```typescript
import { eslintConfigs } from '@venizia/dev-configs';   // ESLint flat config
import { prettierConfigs } from '@venizia/dev-configs'; // Prettier config
```

TypeScript configs are consumed by path, not by import: `@venizia/dev-configs/tsconfig.base.json` and `@venizia/dev-configs/tsconfig.common.json` are package.json `exports` entries that map to the nested `tsconfig/` directory (the files are not at the package root). Every package's own `tsconfig.json` extends `tsconfig.common.json`, which in turn extends `tsconfig.base.json`.

## ESLint

Flat config format (ESLint v9+), built on `@minimaltech/eslint-node` plus `eslint-plugin-unicorn`. Notable rules: `@typescript-eslint/no-explicit-any` is deliberately off (pragmatic, matches the framework's general stance against fighting the type checker at the boundary), while `curly` and `unicorn/switch-case-braces` both require braces on every control structure.

## Prettier

`printWidth: 100`, `tabWidth: 2`, `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `arrowParens: "avoid"`, `bracketSpacing: true`.

## TypeScript - the critical setting

`tsconfig.base.json` sets `experimentalDecorators: true` and `emitDecoratorMetadata: true`. These two flags are not stylistic - they are load-bearing for the entire DI system. `@inject` and `@injectable` rely on `reflect-metadata` receiving constructor parameter type metadata that only `emitDecoratorMetadata` causes `tsc` to emit; without it, the DI container silently receives no parameter metadata at all; there is no compiler error, just an empty metadata array, and `@inject` stops working with no diagnostic pointing at the cause. `useDefineForClassFields: false` is required alongside them, since the default `true` setting breaks decorator-driven property initialization.

Other base settings worth knowing: `target: ES2024`, `module`/`moduleResolution: Node16`, `strict: true` with `noImplicitAny: false` (pragmatic strictness), and `noEmitOnError: true` - a single type error in a package's build empties its `dist/` rather than emitting best-effort output, which matters because `dist/` is gitignored.

`tsconfig.common.json` is the consumer-facing simplification: it extends `tsconfig.base.json` and switches `module`/`moduleResolution` to `nodenext`.

## Gotcha: changes here are monorepo-wide

Because every package extends these configs directly, a change to `tsconfig.base.json`, the ESLint flat config, or the Prettier config affects every package's build and lint output simultaneously. There is no per-package override mechanism beyond what each package's own `tsconfig.json`/`eslint.config.mjs` layers on top.

## Related

- [Build system](/process/build-system.md)
- [Coding style](/conventions/coding-style.md)
- [inversion](/packages/inversion.md)
- [Monorepo layout](/overview/monorepo-layout.md)
