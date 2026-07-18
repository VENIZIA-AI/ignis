<div align="center">

# :fire: IGNIS - @venizia/dev-configs

**Shared ESLint, Prettier, and TypeScript configs for the IGNIS ecosystem**

[![npm](https://img.shields.io/npm/v/@venizia/dev-configs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/dev-configs)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](./LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/ESLint-9%2B-4B32C3.svg?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-3.x-F7B93E.svg?style=flat-square&logo=prettier&logoColor=black)](https://prettier.io/)

[Documentation](https://ignis.venizia.ai) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Repository](https://github.com/VENIZIA-AI/ignis)

</div>

---

One source of truth for lint, format, and compile settings across every IGNIS package, example, and
downstream app. It ships three things: an ESLint flat config array, a Prettier config object, and two
`tsconfig` files - one base, one for NodeNext modules.

Reach for it when you are building on IGNIS and want the same rules the framework itself is written
under. Consumption is three lines per tool.

## Install

```bash
bun add -d @venizia/dev-configs eslint prettier typescript
```

`eslint`, `prettier`, and `typescript` are optional peers - install only the ones you use.
TypeScript is pinned at **6.x** across the IGNIS monorepo.

## Use it

**`eslint.config.mjs`**

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**`.prettierrc.mjs`**

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

**`tsconfig.json`**

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

To prepend your own layers, spread the array:

```javascript
export default [{ ignores: ['scripts/'] }, ...eslintConfigs];
```

## Decorators: read this or DI breaks

> [!IMPORTANT]
> `experimentalDecorators`, `emitDecoratorMetadata`, and `useDefineForClassFields: false` are what
> make the IGNIS DI system work. Without them `@inject`, `@controller`, and `@repository` metadata is
> **silently dropped** - no error, just an application that cannot resolve its own bindings.
>
> **Bun does not resolve these flags through `extends`.** An application `tsconfig.json` must declare
> them inline, even when it already extends `tsconfig.common.json`.

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false
  }
}
```

`useDefineForClassFields: false` keeps class field declarations as assignments; the `define`
semantics of ES2022 would overwrite values a decorator wrote during construction.

## What each config sets

### ESLint - `eslintConfigs`

A flat config array (ESLint 9+; the legacy `.eslintrc` format is not supported). Three layers, later
ones winning:

| Layer | Source | Brings |
| :--- | :--- | :--- |
| 1 | `@minimaltech/eslint-common` | `eslint:recommended`, `typescript-eslint` recommended, `eslint-plugin-prettier` (format violations are lint errors), naming-convention rules |
| 2 | `@minimaltech/eslint-node` | `eslint-plugin-n`, LoopBack-style strict rules |
| 3 | this package | the IGNIS overrides below |

| Rule | Setting | Why |
| :--- | :--- | :--- |
| `@typescript-eslint/no-explicit-any` | `off` | framework generics need escape hatches; prefer a simple cast over a baroque one |
| `curly` | `['error', 'all']` | always braces, no single-line ifs |
| `unicorn/switch-case-braces` | `['error', 'always']` | braced `case` blocks so a `const` cannot leak between cases |

Layer 1 sets `parserOptions.project: './tsconfig.json'`, so a `tsconfig.json` must exist at the lint
root and **must `include` the config files themselves** or ESLint fails on them:

```json
{ "include": ["src", "./*.config.*", ".prettierrc.*"] }
```

### Prettier - `prettierConfigs`

| Setting | Value |
| :--- | :--- |
| `printWidth` | `100` |
| `tabWidth` | `2` |
| `singleQuote` | `true` |
| `semi` | `true` |
| `trailingComma` | `'all'` |
| `bracketSpacing` | `true` |
| `arrowParens` | `'avoid'` |

### TypeScript

Two files, both reachable under the `@venizia/dev-configs/` export path.

| File | Use for |
| :--- | :--- |
| `tsconfig.base.json` | the foundation: `target`/`lib` ES2024, `module` Node16, the decorator flags, strict mode, `declaration` + source maps, `noEmitOnError` |
| `tsconfig.common.json` | applications: extends the base, switches `module` and `moduleResolution` to `nodenext` |

Strictness is deliberately balanced rather than maximal - `strict: true`, but `noImplicitAny`,
`strictPropertyInitialization`, and `useUnknownInCatchVariables` are `false` because DI-injected
properties and framework generics cannot satisfy them. `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride`, and `noFallthroughCasesInSwitch` are on.

The base config `exclude`s tests (`**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`). If your build
config re-includes them, remember `noEmitOnError: true` means one broken test aborts the whole emit.

## Notes

- Changing anything here propagates to every IGNIS package and example. Treat edits as a
  monorepo-wide change, not a local one.
- It is the root of the build chain: `dev-configs -> inversion -> helpers -> boot -> core`.
- Use `tsc` directly. Never `npx`, `bunx`, or `bun x` for TypeScript compilation.

## Links

[Documentation](https://ignis.venizia.ai) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/) &#8226;
[Issues](https://github.com/VENIZIA-AI/ignis/issues)

MIT licensed - see [LICENSE.md](./LICENSE.md).
