# @venizia/dev-configs

The oxlint, oxfmt, ESLint, Prettier and TypeScript settings every IGNIS package is built with. Install
it as a dev dependency in an application that wants the same rules.

## Install

```bash
bun add -d @venizia/dev-configs oxlint oxlint-tsgolint oxfmt eslint typescript
```

`oxlint` (>=1.88.0), `oxlint-tsgolint` (>=7.0.2004), `oxfmt` (>=0.73.0), `eslint` (9 or 10),
`prettier` (3) and `typescript` (5 or 6) are optional peers. Install only the tools you use. A
project that still runs ESLint and Prettier installs `eslint prettier` and skips the oxc tools.

## Use it

Each tool takes one file. IGNIS keeps them in a `.configs/` folder and passes `-c` to each tool.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(oxlintConfigs);
```

```typescript
// .configs/oxfmt.config.mts
import { defineConfig } from 'oxfmt';
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';

export default defineConfig(oxfmtConfigs);
```

```typescript
// .configs/eslint.config.mts - the one rule oxlint cannot run yet
import { namingConventionConfigs } from '@venizia/dev-configs/linters';

export default namingConventionConfigs;
```

```bash
oxlint -c .configs/oxlint.config.mts
eslint -c .configs/eslint.config.mts .
oxfmt -c .configs/oxfmt.config.mts --check "**/*.{ts,tsx,mts,js,mjs}"
```

`tsconfig.json` stays at the project root. Bun, the editor and oxlint's type-aware engine only find it
there.

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
| `@venizia/dev-configs` | Everything below, re-exported |
| `@venizia/dev-configs/compilers` | `BunCompiler` |
| `@venizia/dev-configs/formatters` | `oxfmtConfigs`, `prettierConfigs` |
| `@venizia/dev-configs/linters` | `oxlintConfigs`, `namingConventionConfigs`, `eslintConfigs`, `ReactEslintConfigs`, the rule classes and their types |
| `@venizia/dev-configs/tsconfig.base.json` | Target and lib ES2025, `module` Node16, strict mode with `noImplicitAny`, `strictPropertyInitialization` and `useUnknownInCatchVariables` off, `noEmitOnError`, tests excluded |
| `@venizia/dev-configs/tsconfig.common.json` | Extends the base and switches `module` and `moduleResolution` to `nodenext` |

## What each config sets

### oxlintConfigs

`oxlintConfigs` (type `OxlintConfig`) is a static port of the `eslintConfigs` rules, generated with
`@oxlint/migrate`. It enables the `typescript` and `unicorn` plugins and type-aware linting, so it needs
`oxlint-tsgolint`.

Not ported:

| Rule | Why |
| :--- | :--- |
| `@typescript-eslint/naming-convention` | oxlint has no equivalent yet - `namingConventionConfigs` runs it in ESLint |
| `@typescript-eslint/prefer-optional-chain` | In oxlint's nursery |
| `no-invalid-this` | `noImplicitThis` in `tsconfig.base.json` covers it |
| `n/prefer-node-protocol` | Maps to `unicorn/prefer-node-protocol` |

### namingConventionConfigs

`namingConventionConfigs` (type `Linter.Config[]`) sets only `@typescript-eslint/naming-convention`, with
the 15 LoopBack 4 selectors. It targets `.ts`, `.tsx`, `.mts` and `.cts`, and ignores `dist`, `build`,
`coverage`, `*.d.ts` and plain JavaScript. ESLint does not report unused disable comments in this
config, because oxlint owns the other rules.

### Rule classes

Each rule has a class with `static readonly NAME` and `static build(options)`. `build` returns the rule
entry with the IGNIS defaults. Every `severity` defaults to `'error'`.

| Class | Rule name | `build` options (default) |
| :--- | :--- | :--- |
| `EqeqeqRule` | `eqeqeq` | `mode`: `'always' \| 'smart'` (`'smart'`) |
| `NoUnusedVarsRule` | `no-unused-vars` | `vars` (`'all'`), `args` (`'none'`), `ignoreRestSiblings` (`false`) |
| `SwitchCaseBracesRule` | `unicorn/switch-case-braces` | `mode`: `'always' \| 'avoid'` (`'always'`) |
| `NoRestrictedImportsRule` | `no-restricted-imports` | `extraPaths`: `IRestrictedImportPath[]` (none), added to `PATHS` (lodash) |
| `NoRestrictedPropertiesRule` | `no-restricted-properties` | `extraProperties`: `IRestrictedProperty[]` (none), added to `SECURE_CONTEXT` (`crypto.randomUUID`) |
| `PreferNullishCoalescingRule` | `typescript/prefer-nullish-coalescing` | `ignoreConditionalTests`, `ignoreMixedLogicalExpressions`, `ignoreTernaryTests` (oxlint's own defaults) |
| `NamingConventionRule` | `@typescript-eslint/naming-convention` | `extraSelectors`: `TNamingSelector[]` (none), added after `SELECTORS` |

Types: `TRuleSeverity`, `TOxlintRuleEntry`, `TNamingSelector`, `IRestrictedImportPath`.

Replace a rule by key. This makes `==` an error everywhere and bans one more import:

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import {
  EqeqeqRule,
  NoRestrictedImportsRule,
  oxlintConfigs,
} from '@venizia/dev-configs/linters';

export default defineConfig({
  ...oxlintConfigs,
  rules: {
    ...oxlintConfigs.rules,
    [EqeqeqRule.NAME]: EqeqeqRule.build({ mode: 'always' }),
    [NoRestrictedImportsRule.NAME]: NoRestrictedImportsRule.build({
      extraPaths: [{ name: 'moment', message: 'Use TemporalHelper instead.' }],
    }),
  },
});
```

### oxfmtConfigs and prettierConfigs

`oxfmtConfigs` (type `OxfmtConfig`) and `prettierConfigs` hold the same seven options, so the output
matches. oxfmt differs from Prettier on long union types, which it breaks with a leading `|` per line.

| Setting | Value |
| :--- | :--- |
| `printWidth` | `100` |
| `tabWidth` | `2` |
| `singleQuote` | `true` |
| `semi` | `true` |
| `trailingComma` | `'all'` |
| `bracketSpacing` | `true` |
| `arrowParens` | `'avoid'` |

### eslintConfigs

`eslintConfigs` keeps its shape and resolves to the same rules as before, but is now owned here instead
of wrapping `@minimaltech/eslint-node`: ESLint recommended, typescript-eslint, Prettier as a lint
rule, naming conventions, `curly`, `eslint-plugin-n`, plus these IGNIS rules:

| Rule | Setting |
| :--- | :--- |
| `@typescript-eslint/no-explicit-any` | `off` |
| `@typescript-eslint/ban-ts-comment` | `error` - `@ts-expect-error` with a description is still allowed |
| `@typescript-eslint/no-namespace` | `error` |
| `unicorn/switch-case-braces` | `['error', 'always']` |

### ReactEslintConfigs

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
| `react-hooks/rules-of-hooks` / `exhaustive-deps` | `error`, every source file |
| `@typescript-eslint/consistent-type-imports` | `['error', { prefer: 'type-imports' }]` |
| `naming-convention` | the base rule, plus PascalCase functions (`function App()`), `.jsx`/`.tsx` |
| `no-restricted-properties` | `NoRestrictedPropertiesRule.build()` - bans `crypto.randomUUID` |

Nothing in the base is relaxed: frontend code meets the backend's standard, so a floating promise, a
`void`, a use before declaration or a shadowed name fails the lint as it does in a service.

Rules the automatic JSX runtime or `tsc` already enforce (`react-in-jsx-scope`, `prop-types`,
`jsx-no-undef`, ...) are left out.

- `reactVersion` defaults to `'detect'`. Under ESLint 10, eslint-plugin-react 7 cannot detect it and
  aborts - pass the version: `create({ plugins, reactVersion: '19.2' })`.
- In an `eslint.config.ts`, `eslint-plugin-jsx-a11y` needs `@types/eslint-plugin-jsx-a11y`.
- `consistent-type-imports` keeps the default `fixStyle`; a codebase that prefers
  `inline-type-imports` sets it on top.

### ReactOxlintConfigs and reactNamingConventionConfigs

The oxlint version of the React preset. oxlint runs the React, hooks and `jsx-a11y` rules natively, so
nothing is passed in. Pair it with `reactNamingConventionConfigs` on the ESLint side:

```ts
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { ReactOxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(ReactOxlintConfigs.create());

// .configs/eslint.config.mts
import { reactNamingConventionConfigs } from '@venizia/dev-configs/linters';

export default reactNamingConventionConfigs;
```

`ReactOxlintConfigs.create()` is `oxlintConfigs` plus the same rules as the ESLint table above, as
strict as the base. `react/no-deprecated` is left out: oxlint has no port of it. `crypto.randomUUID`
is banned because it exists only in a secure context (https, localhost), and is `undefined` on a
plain-http origin or in a WebView.

The presets start strict. An application that wants less overrides the rule after the preset:

```ts
const base = ReactOxlintConfigs.create();

export default defineConfig({
  ...base,
  rules: { ...base.rules, 'typescript/no-floating-promises': 'warn' },
});
```

`reactNamingConventionConfigs` is `namingConventionConfigs` plus PascalCase functions in `.jsx` and
`.tsx` files. To ban `crypto.randomUUID` in a project without React, add
`[NoRestrictedPropertiesRule.NAME]: NoRestrictedPropertiesRule.build()` to its rules.

### BunCompiler

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
- [oxlint and oxfmt changelog](https://ignis.venizia.ai/changelogs/2026-10-16-oxlint-oxfmt-migration)
- [Changelog](https://ignis.venizia.ai/changelogs/)
- [Source](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs)

MIT licensed - see [LICENSE.md](./LICENSE.md).
