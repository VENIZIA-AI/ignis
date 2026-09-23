# @venizia/dev-configs

The ESLint, Prettier and TypeScript settings every IGNIS package is built with. Install it as a dev
dependency in an application that wants the same rules.

## Install

```bash
bun add -d @venizia/dev-configs eslint prettier typescript
```

`eslint` (9 or 10), `prettier` (3) and `typescript` (5 or 6) are optional peers. Install only the
tools you use.

## Use it

Each tool takes one file.

```javascript
// eslint.config.mjs
import { eslintConfigs } from '@venizia/dev-configs';

export default [{ ignores: ['dist/'] }, ...eslintConfigs];
```

```javascript
// .prettierrc.mjs
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

```json
// tsconfig.json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```

## Declare the decorator flag in your own tsconfig

The base config sets `experimentalDecorators`. But Bun can miss a flag inherited through `extends`
when it runs your source. Parameter decorators are then dropped with no error, and an `@inject`
value is `undefined` at run time.

Declare `experimentalDecorators: true` in your application's own `tsconfig.json`, as in the example
earlier. Every IGNIS example does.

| Flag | Base value | Why |
| :--- | :--- | :--- |
| `experimentalDecorators` | `true` | `@inject`, `@controller`, `@repository` and the other decorators need it |
| `emitDecoratorMetadata` | `true` | Optional. IGNIS reads `design:paramtypes` once, to validate a `@repository` constructor, and skips the check when the metadata is absent |
| `useDefineForClassFields` | `false` | Class fields are assigned, not defined, so a subclass field initializer does not shadow a value the base constructor set |

## Entry points

| Entry point | What it gives |
| :--- | :--- |
| `@venizia/dev-configs` | `eslintConfigs` (flat config array), `prettierConfigs`, `BunCompiler` |
| `@venizia/dev-configs/tsconfig.base.json` | Target and lib ES2024, `module` Node16, strict mode with `noImplicitAny`, `strictPropertyInitialization` and `useUnknownInCatchVariables` off, `noEmitOnError`, tests excluded |
| `@venizia/dev-configs/tsconfig.common.json` | Extends the base and switches `module` and `moduleResolution` to `nodenext` |

## What each config sets

`eslintConfigs` is `@minimaltech/eslint-node` (ESLint recommended, typescript-eslint, Prettier as a
lint rule, naming conventions, `eslint-plugin-n`) plus three IGNIS rules:

| Rule | Setting |
| :--- | :--- |
| `@typescript-eslint/no-explicit-any` | `off` |
| `curly` | `['error', 'all']` |
| `unicorn/switch-case-braces` | `['error', 'always']` |

`prettierConfigs`:

| Setting | Value |
| :--- | :--- |
| `printWidth` | `100` |
| `tabWidth` | `2` |
| `singleQuote` | `true` |
| `semi` | `true` |
| `trailingComma` | `'all'` |
| `bracketSpacing` | `true` |
| `arrowParens` | `'avoid'` |

`BunCompiler.compile()` builds one Bun executable: minified, with a linked source map. The
compile target comes from `BUN_TARGET` and defaults to `bun-linux-x64`.

```typescript
import { BunCompiler } from '@venizia/dev-configs';

await BunCompiler.compile({ entrypoint: './src/index.ts', outfile: './dist/app' });
```

## Where it sits

The root of the chain, with no IGNIS dependency: **dev-configs** -> inversion -> {filter, helpers}
-> {boot, kernel} -> connectors -> {core-worker, core-server} -> atlas.

## Links

- [Tooling configuration](https://ignis.venizia.ai/best-practices/code-style-standards/tooling)
- [TypeScript 6 and toolchain changelog](https://ignis.venizia.ai/changelogs/2026-03-31-typescript-6-and-toolchain)
- [Changelog](https://ignis.venizia.ai/changelogs/)
- [Source](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs)

MIT licensed - see [LICENSE.md](./LICENSE.md).
