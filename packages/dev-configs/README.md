# @venizia/dev-configs

The oxlint, oxfmt, ESLint, Prettier and TypeScript settings every IGNIS package is built with. Install
it as a dev dependency in an application that wants the same rules.

## Install

```bash
bun add -d @venizia/dev-configs oxlint oxlint-tsgolint oxfmt eslint typescript
```

`oxlint` (>=1.88.0), `oxlint-tsgolint` (>=7.0.2004), `oxfmt` (>=0.73.0), `eslint` (9 or 10),
`prettier` (3) and `typescript` (5 or 6) are optional peers. Install only the tools you use. Keep the
ESLint config `.mjs`: a TypeScript one (`.mts`) makes ESLint require `jiti`, one more dependency. A
project that still runs ESLint and Prettier installs `eslint prettier` and skips the oxc tools.

## Use it

Each tool takes one file. IGNIS keeps them in a `.configs/` folder and passes `-c` to each tool.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(oxlintConfigs);
```

```typescript
// .configs/oxfmt.config.mts
import { defineConfig } from 'oxfmt';
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';

export default defineConfig(oxfmtConfigs);
```

```typescript
// .configs/eslint.config.mjs - what oxlint cannot run: naming convention + house rules
import { houseConfigs } from '@venizia/dev-configs/linters';

export default houseConfigs;
```

```bash
oxlint -c .configs/oxlint.config.mts --deny-warnings
eslint -c .configs/eslint.config.mjs .
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
    "useDefineForClassFields": false
  },
  "include": ["src"]
}
```

The two options in `compilerOptions` repeat the base on purpose - see
[Restate the runtime options](#restate-the-runtime-options-in-your-own-tsconfig).

### Browser and React projects

The presets above target a Bun or Node backend. Code that runs in a browser swaps each one for its
browser version. A React project swaps it for the React version, which builds on the browser one.

| Tool | Backend | Browser | React |
| :--- | :--- | :--- | :--- |
| oxlint | `oxlintConfigs` | `BrowserOxlintConfigs.create()` | `ReactOxlintConfigs.create()` |
| oxfmt | `oxfmtConfigs` | `browserOxfmtConfigs` | `browserOxfmtConfigs` |
| ESLint | `houseConfigs` | `houseConfigs` | `reactHouseConfigs` |
| tsconfig | `tsconfig.common.json` | `tsconfig.browser.json` | `tsconfig.react.json` |

## Restate the runtime options in your own tsconfig

Bun ignores an `extends` that names a package. With `"extends": "@venizia/dev-configs/tsconfig.common.json"`,
`bun run` and `bun test` see none of the preset's options - even one level deep (measured on Bun 1.4.2).
Bun then compiles TC39 decorators: a parameter decorator such as `@inject` is dropped with no error,
and a method decorator such as `@provide` receives the wrong arguments. Class fields get define
semantics, while the `tsc` build uses assign semantics.

`tsc` follows the whole chain, so typecheck and build stay green. Only what Bun runs diverges, which
is why nothing reports it.

In every `tsconfig.json` that Bun runs - an application, a package whose tests run under
`bun test`, a browser or React project tested with Bun - restate the options that change the emitted
code:

```json
"experimentalDecorators": true,
"useDefineForClassFields": false
```

Every IGNIS package and example does.

| Flag | Base value | Why |
| :--- | :--- | :--- |
| `experimentalDecorators` | `true` | `@inject`, `@controller`, `@repository` and the other decorators need it |
| `emitDecoratorMetadata` | `true` | Optional - restate it only if your code reads `design:*` metadata. IGNIS reads `design:paramtypes` once, to validate a `@repository` constructor, and skips the check when the metadata is absent. Under Bun it turns an interface-typed constructor parameter into a runtime import (`Export named 'X' not found`), so import such names with `import type`; `tsc --noEmit --isolatedModules` (TS1272) finds most of them, loading `src/index.ts` under Bun the rest |
| `useDefineForClassFields` | `false` | Class fields are assigned, not defined, so a subclass field initializer does not shadow a value the base constructor set |

## Entry points

| Entry point | What it gives |
| :--- | :--- |
| `@venizia/dev-configs` | Everything below, re-exported |
| `@venizia/dev-configs/compilers` | `BunCompiler` |
| `@venizia/dev-configs/formatters` | `oxfmtConfigs`, `browserOxfmtConfigs`, `prettierConfigs` |
| `@venizia/dev-configs/testing` | `rejectionOf`, `expectRejection` - test helpers for a promise that must reject (imports `bun:test`; tests only) |
| `@venizia/dev-configs/linters` | `oxlintConfigs`, `OxlintConfigs`, `BrowserOxlintConfigs`, `ReactOxlintConfigs`, `LintIgnore`, `namingConventionConfigs`, `reactNamingConventionConfigs`, `houseConfigs`, `reactHouseConfigs`, `eslintConfigs`, `ReactEslintConfigs`, the rule classes and their types |
| `@venizia/dev-configs/linters/oxlint` | `oxlintConfigs`, `OxlintConfigs`, `IOxlintPresetOptions`, `BrowserOxlintConfigs`, `ReactOxlintConfigs`, `LintIgnore`, the rule classes and their types: everything an oxlint config needs, and nothing that loads ESLint. Loads in milliseconds: `/linters` also loads ESLint and its plugins, which an oxlint config never uses |
| `@venizia/dev-configs/tsconfig.base.json` | Target and lib ES2025, `module` Node16, strict mode (`noImplicitAny` and `useUnknownInCatchVariables` on) with `strictPropertyInitialization` off (DI-injected properties have no initializer), `noEmitOnError`, tests excluded |
| `@venizia/dev-configs/tsconfig.common.json` | Extends the base and switches `module` and `moduleResolution` to `nodenext` |
| `@venizia/dev-configs/tsconfig.browser.json` | Extends the base for a browser library built with a bundler: `module` ESNext, `moduleResolution` bundler, lib ES2025 + `DOM` + `DOM.Iterable`, `types: []` so no Bun types reach `dist` |
| `@venizia/dev-configs/tsconfig.react.json` | Extends `tsconfig.browser.json` and sets `jsx: react-jsx` |

## What each config sets

### oxlintConfigs

`oxlintConfigs` (type `OxlintConfig`) is a static port of the `eslintConfigs` rules, generated with
`@oxlint/migrate`. It enables the `typescript` and `unicorn` plugins and type-aware linting, so it needs
`oxlint-tsgolint`. It also enforces `typescript/consistent-type-imports` (`prefer: type-imports`,
`fixStyle: inline-type-imports`; `import('pkg').T` annotations stay allowed): a value import of a type
becomes a runtime import when Bun runs a decorated class's source, and loading fails with
`Export named 'X' not found`. `oxlint --fix` rewrites them.

oxlint (1.88) does not read decorator metadata, so it also rewrites the import of a decorated
constructor parameter's class to `import { type X }`. tsc then emits `Function` (or `Object` under Bun)
as that parameter's `design:paramtypes` entry. IGNIS never injects by that entry - `@inject` names its
key, and `@repository` skips `Object` and `Function` - so nothing breaks. Code that does read
`design:paramtypes` must not take this rule's fix there; typescript-eslint's
`consistent-type-imports` leaves decorated classes alone when `emitDecoratorMetadata` and
`experimentalDecorators` are in its `parserOptions`.

Not ported:

| Rule | Why |
| :--- | :--- |
| `@typescript-eslint/naming-convention` | oxlint has no equivalent yet - `namingConventionConfigs` runs it in ESLint |
| `@typescript-eslint/prefer-optional-chain` | In oxlint's nursery |
| `no-invalid-this` | `noImplicitThis` in `tsconfig.base.json` covers it |
| `n/prefer-node-protocol` | Maps to `unicorn/prefer-node-protocol` |

#### lenientFallback

`prefer-nullish-coalescing` flags `||` on any nullable left side, so `opts.name || 'guest'` fails when
`name` is `string | undefined`. That is the default: `||` also swallows a real `''` or `0`. A project
where `''` and `0` fall back on purpose opts out in one line:

```ts
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { OxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(OxlintConfigs.create({ lenientFallback: true }));
```

It allows `||` where the left side is a string or a number, and still flags it on objects and
booleans. `BrowserOxlintConfigs.create()` and `ReactOxlintConfigs.create()` take the same option.
`OxlintConfigs.create()` with no option is `oxlintConfigs`.

### houseConfigs and the house rules

`houseConfigs` is `namingConventionConfigs` plus the house rules oxlint cannot express;
`reactHouseConfigs` is the same over `reactNamingConventionConfigs`. The rules ship as the ESLint plugin
`houseEslintPlugin`, registered as `venizia`:

| Class | Rule | Default | What it enforces |
| :--- | :--- | :--- | :--- |
| `MaxParamsOwnRule` | `venizia/max-params-own` | `build({ max: 5 })` | A function we write takes at most `max` positional parameters. Not counted: an inline callback passed to a call or a JSX prop, a signature a declared type fixes, a constructor whose parameters are all `@inject`. A hook callback counts. |
| `NoNewErrorRule` | `venizia/no-new-error` | `error` | Throw through `getError` (or an `ApplicationError`), never `new Error(...)` / `Error(...)`. Off in tests. |
| `NoLeakedRenderRule` | `venizia/no-leaked-render` | `error`, in `reactHouseConfigs` only | A JSX child is drawn with `cond ? <X /> : null`, never `cond && <X />`, which draws `0` when `cond` is `0`. `--fix` rewrites it. `disabled={a && b}` is a value, not a child, and passes. |
| `ConstClassValuesRule` | `venizia/const-class-values` | off; `build({ namePattern })` | An exported type named like a logic value (`State`, `Status`, `Stage`, `Mode`, `Kind`, `Type` by default) is a const class plus `TConstValue<typeof X>`, not a union of string literals. |

`const-class-values` is registered in the plugin but no preset turns it on: a few IGNIS types still
break it. Enable it with `[ConstClassValuesRule.NAME]: ConstClassValuesRule.build()`.

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
| `NoUnusedVarsRule` | `no-unused-vars` | `vars` (`'all'`), `args` (`'none'`), `ignoreRestSiblings` (`false`), `argsIgnorePattern` / `varsIgnorePattern` / `caughtErrorsIgnorePattern` / `destructuredArrayIgnorePattern` (none) |
| `SwitchCaseBracesRule` | `unicorn/switch-case-braces` | `mode`: `'always' \| 'avoid'` (`'always'`) |
| `NoRestrictedImportsRule` | `no-restricted-imports` | `extraPaths`: `IRestrictedImportPath[]` (none), added to `PATHS` (lodash) |
| `NoRestrictedPropertiesRule` | `no-restricted-properties` | `extraProperties`: `IRestrictedProperty[]` (none), added to `SECURE_CONTEXT` (`crypto.randomUUID`) |
| `PreferNullishCoalescingRule` | `typescript/prefer-nullish-coalescing` | `ignoreConditionalTests`, `ignoreMixedLogicalExpressions`, `ignoreTernaryTests`, `ignorePrimitives` (`{ string: true, ... }`; oxlint's own defaults) |
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
} from '@venizia/dev-configs/linters/oxlint';

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

`browserOxfmtConfigs` is `oxfmtConfigs` with two changes for browser and React code:

| Setting | Value | Effect |
| :--- | :--- | :--- |
| `arrowParens` | `'always'` | `(x) => x` instead of `x => x` |
| `bracketSameLine` | `true` | The closing `>` of a multi-line JSX element stays on its last attribute line, which keeps JSX diffs small |

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
| `jsx-a11y` (`alt-text`, `aria-props`, `aria-role`, `click-events-have-key-events`, `label-has-associated-control`, ... - 15 rules) | `error`, `.jsx`/`.tsx` |
| `react-hooks/rules-of-hooks` / `exhaustive-deps` | `error`, every source file |
| `@typescript-eslint/consistent-type-imports` | `['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }]` |
| `naming-convention` | the base rule, plus PascalCase functions (`function App()`), `.jsx`/`.tsx` |
| `no-restricted-properties` | `NoRestrictedPropertiesRule.build()` - bans `crypto.randomUUID` |

Nothing in the base is relaxed: frontend code meets the backend's standard, so a floating promise, a
`void`, a use before declaration or a shadowed name fails the lint as it does in a service.

Rules the automatic JSX runtime or `tsc` already enforce (`react-in-jsx-scope`, `prop-types`,
`jsx-no-undef`, ...) are left out.

- `reactVersion` defaults to `'detect'`. Under ESLint 10, eslint-plugin-react 7 cannot detect it and
  aborts - pass the version: `create({ plugins, reactVersion: '19.2' })`.
- In an `eslint.config.ts`, `eslint-plugin-jsx-a11y` needs `@types/eslint-plugin-jsx-a11y`.
- `consistent-type-imports` uses `fixStyle: inline-type-imports`, the same as the base preset.

### BrowserOxlintConfigs

`BrowserOxlintConfigs.create()` is `oxlintConfigs` plus `NoRestrictedPropertiesRule.build()`. That
rule bans `crypto.randomUUID`, which exists only in a secure context (https, localhost). On a
plain-http origin or in a WebView, the method is `undefined`. Use this preset for browser code that
does not use React.

```ts
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { BrowserOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(BrowserOxlintConfigs.create());
```

### ReactOxlintConfigs and reactNamingConventionConfigs

The oxlint version of the React preset. oxlint runs the React, hooks and `jsx-a11y` rules natively, so
nothing is passed in. Pair it with `reactNamingConventionConfigs` on the ESLint side:

```ts
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { ReactOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(ReactOxlintConfigs.create());

// .configs/eslint.config.mjs
import { reactNamingConventionConfigs } from '@venizia/dev-configs/linters';

export default reactNamingConventionConfigs;
```

`ReactOxlintConfigs.create()` is `BrowserOxlintConfigs.create()` plus the same rules as the ESLint
table above, as strict as the base. `react/no-deprecated` is left out: oxlint has no port of it.

Both React presets run the same fifteen `jsx-a11y` rules, including the six that need a human
decision (`click-events-have-key-events`, `no-static-element-interactions`,
`no-noninteractive-element-interactions`, `label-has-associated-control`, `heading-has-content`,
`anchor-is-valid`). `reactHouseConfigs` adds `venizia/no-leaked-render`, which oxlint has no port of.

The presets start strict. An application that wants less overrides the rule after the preset:

```ts
const base = ReactOxlintConfigs.create();

export default defineConfig({
  ...base,
  rules: { ...base.rules, 'typescript/no-floating-promises': 'warn' },
});
```

`reactNamingConventionConfigs` is `namingConventionConfigs` plus PascalCase functions in `.jsx` and
`.tsx` files.

### Ignoring generated or vendored paths

A project that lints generated files or vendored code lists them once and gives the list to both tools.
oxlint cannot do it alone: its `ignorePatterns` resolve against the folder of the config file, so one
in `.configs/` never reaches a project path. The `ignore` option of any oxlint preset turns every rule
off for the paths instead, and `LintIgnore.eslint` is the ESLint `ignores` entry. A package with a
Makefile can set `LINT_IGNORE` instead (`make/project.mk` passes it as `--ignore-pattern`).

```ts
// .configs/lint-ignore.mjs
export const LINT_IGNORE = ['src/components/shadcn/**', 'dev-dist/**'];

// .configs/oxlint.config.mts
export default defineConfig(ReactOxlintConfigs.create({ ignore: LINT_IGNORE }));

// .configs/eslint.config.mjs
export default [LintIgnore.eslint({ patterns: LINT_IGNORE }), ...reactHouseConfigs];
```

A pattern is a project path, as in `--ignore-pattern`. The off-override comes after the preset's own
overrides, so a rule you add after the preset is on again in an ignored path. Wrap the finished config
instead: `LintIgnore.oxlint({ config, patterns: LINT_IGNORE })`.

### BunCompiler

`BunCompiler.compile()` builds one Bun executable: minified, with a linked source map. The
compile target comes from `BUN_TARGET` and defaults to `bun-linux-x64`. `define` passes compile-time
constants to `Bun.build`; a compile script uses it to bake the build stamp.

```typescript
import { BunCompiler } from '@venizia/dev-configs';

await BunCompiler.compile({ entrypoint: './src/index.ts', outfile: './dist/app' });
```

Bake a value into the binary with `define`. Each value is a JSON-encoded expression:

```typescript
await BunCompiler.compile({
  entrypoint: './src/index.ts',
  outfile: './dist/app',
  define: { APP_FLAVOUR: JSON.stringify('blue') },
});
```

## Where it sits

The root of the chain, with no IGNIS dependency: **dev-configs** -> inversion -> {filter, helpers}
-> {boot, kernel} -> connectors -> {core-worker, core-server}.

## Links

- [Tooling configuration](https://ignis.venizia.ai/best-practices/code-style-standards/tooling)
- [TypeScript 6 and toolchain changelog](https://ignis.venizia.ai/changelogs/2026-03-31-typescript-6-and-toolchain)
- [oxlint and oxfmt changelog](https://ignis.venizia.ai/changelogs/2026-10-16-oxlint-oxfmt-migration)
- [Changelog](https://ignis.venizia.ai/changelogs/)
- [Source](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs)

MIT licensed - see [LICENSE.md](./LICENSE.md).
