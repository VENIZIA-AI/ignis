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
| `@venizia/dev-configs` | `eslintConfigs` (flat config array), `ReactEslintConfigs`, `prettierConfigs`, `BunCompiler` |
| `@venizia/dev-configs/tsconfig.base.json` | Target and lib ES2024, `module` Node16, strict mode with `noImplicitAny`, `strictPropertyInitialization` and `useUnknownInCatchVariables` off, `noEmitOnError`, tests excluded |
| `@venizia/dev-configs/tsconfig.common.json` | Extends the base and switches `module` and `moduleResolution` to `nodenext` |

## What each config sets

`eslintConfigs` is `@minimaltech/eslint-node` (ESLint recommended, typescript-eslint, Prettier as a
lint rule, naming conventions, `curly`, `eslint-plugin-n`) plus these IGNIS rules:

| Rule | Setting |
| :--- | :--- |
| `@typescript-eslint/no-explicit-any` | `off` |
| `@typescript-eslint/ban-ts-comment` | `error` - `@ts-expect-error` with a description is still allowed |
| `@typescript-eslint/no-namespace` | `error` |
| `unicorn/switch-case-braces` | `['error', 'always']` |

`ReactEslintConfigs.create({ plugins })` is `eslintConfigs` plus what a React frontend needs. The
plugins come in as options, so a backend installs none of them:

```js
// eslint.config.mjs
import { ReactEslintConfigs } from '@venizia/dev-configs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['dist/'] },
  ...ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } }),
];
```

| Adds | Setting |
| :--- | :--- |
| React correctness (`jsx-key`, `no-children-prop`, `no-deprecated`, ... - 14 rules) | `error`, `.jsx`/`.tsx` |
| `jsx-a11y` basics (`alt-text`, `aria-props`, `aria-role`, ... - 9 rules) | `error`, `.jsx`/`.tsx` |
| `react-hooks/rules-of-hooks` / `exhaustive-deps` | `error` / `warn`, every source file |
| `@typescript-eslint/consistent-type-imports` | `['error', { prefer: 'type-imports' }]` |
| `naming-convention` | the base rule, plus PascalCase functions (`function App()`), `.jsx`/`.tsx` |
| `no-floating-promises`, `no-void`, `no-invalid-this`, `no-use-before-define` | `off` - a UI fires promises from handlers and uses components above their declaration |
| `no-explicit-any` | `warn` (the base has it `off`) |
| `no-shadow` | `warn` |
| `no-unused-vars` | `warn`, `_`-prefixed names ignored |

Rules the automatic JSX runtime or `tsc` already enforce (`react-in-jsx-scope`, `prop-types`,
`jsx-no-undef`, ...) are left out.

- `reactVersion` defaults to `'detect'`. Under ESLint 10, eslint-plugin-react 7 cannot detect it and
  aborts - pass the version: `create({ plugins, reactVersion: '19.2' })`.
- In an `eslint.config.ts`, `eslint-plugin-jsx-a11y` needs `@types/eslint-plugin-jsx-a11y`.
- `consistent-type-imports` keeps the default `fixStyle`; a codebase that prefers
  `inline-type-imports` sets it on top.

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
