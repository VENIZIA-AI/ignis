---
title: Restate the Decorator Options - Bun Ignores a Package tsconfig extends
description: 'Bun skips a tsconfig extends that names a package, so the dev-configs decorator options never reach bun run or bun test. Restate two options in your own tsconfig.'
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-16

## Restate the decorator options in your own tsconfig

<Badge type="info" text="Bug Fix" />

**In one line.** Bun ignores `"extends": "@venizia/dev-configs/tsconfig.common.json"`, so every `tsconfig.json` that Bun runs must restate two options itself.

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

## What changed

- **The docs say it precisely.** Bun 1.4.2 skips an `extends` that names a package, even one level deep. Bun then compiles TC39 decorators: `@inject` on a constructor parameter is dropped with no error, and class fields get define semantics instead of the assign semantics of the `tsc` build.
- **The trap is silent.** `tsc` follows the whole chain, so typecheck and build stay green. Only `bun run` and `bun test` diverge.
- **Every IGNIS package and example now restates both options.** The published `dist` is byte-identical. The test suites now run the same class-field semantics as the code they ship.

| `extends`                                        | What Bun compiles         |
| ------------------------------------------------ | ------------------------- |
| `@venizia/dev-configs/tsconfig.common.json`      | TC39 decorators - wrong   |
| `@venizia/dev-configs/tsconfig.base.json`        | TC39 decorators - wrong   |
| the options restated in your own `tsconfig.json` | legacy decorators - right |

## Who is affected

- **An application or package that Bun runs and whose `tsconfig.json` only extends dev-configs.** Add `"experimentalDecorators": true` and `"useDefineForClassFields": false` to its `compilerOptions`.
- **A project that already restates `experimentalDecorators`.** Add `useDefineForClassFields: false` so its tests run the class-field semantics it ships.
- **`emitDecoratorMetadata`.** Restate it only if your code reads `design:*` metadata. Under Bun it turns an interface-typed constructor parameter into a runtime import that fails with `Export named 'X' not found`, so import such names with `import type`. `tsc --noEmit --isolatedModules` reports most of them as TS1272; loading each package's `src/index.ts` under Bun finds the rest.
