---
type: Package
title: dev-configs
description: Centralized oxlint, naming-convention ESLint, and TypeScript configuration consumed by every package in the IGNIS monorepo.
resource: packages/dev-configs
tags: [packages, dev-configs, tooling]
---

<!-- okf:generated:contents start -->
**Contents**

- [Exports](#exports)
- [oxlint and formatting](#oxlint-and-formatting)
- [House rules](#house-rules)
- [Ignoring generated paths](#ignoring-generated-paths)
- [ESLint - naming convention only](#eslint---naming-convention-only)
- [Per-project `.configs/` folder](#per-project-configs-folder)
- [TypeScript - the critical setting](#typescript---the-critical-setting)
- [Gotcha: changes here are monorepo-wide](#gotcha-changes-here-are-monorepo-wide)
- [Shared checks (`devz check`, `./checks`)](#shared-checks-devz-check-checks)
- [Related](#related)
<!-- okf:generated:contents end -->

`@venizia/dev-configs` is the root of the IGNIS build dependency chain (`dev-configs -> inversion -> {filter, helpers} -> kernel -> core`) - it has no dependency on any other IGNIS package, and every other package depends on it for lint, format, and compiler settings. It ships a single CommonJS build.

## Exports

```typescript
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint'; // oxlint config object, without ESLint loaded
import { houseConfigs } from '@venizia/dev-configs/linters'; // ESLint: naming + house rules
import { PurityManifest, PurityCheck } from '@venizia/dev-configs/checks'; // the engine behind `devz check` (Bun-only tooling); `buildManifest` and `checkPurity` are deprecated aliases until 0.5
```

The source is split by job: `compilers/` (`BunCompiler`; `compile({ entrypoint, workers, outfile, target, plugins, define })` - `workers` are extra entrypoints, the Bun Worker files the app starts, compiled into the same binary; `define` is passed to `Bun.build`, how a compile script bakes the build stamp, see [boot](/packages/boot.md)), `linters/` (`oxlint.ts`, `browser.ts`, `react-oxlint.ts`, `oxlint-presets.ts`, `eslint.ts`, `react-eslint.ts`, `rules/`) and `tsconfig/`. The subpaths `@venizia/dev-configs/compilers`, `/formatters` and `/linters` expose each folder. `@venizia/dev-configs/linters/oxlint` is `linters/oxlint-presets.ts`, and every oxlint config in the repo imports it. It exports what an oxlint config needs: the presets (`oxlintConfigs`, `OxlintConfigs`, `BrowserOxlintConfigs`, `ReactOxlintConfigs`), `LintIgnore`, and every rule class and rule type of `rules/` (`EqeqeqRule`, `NamingConventionRule`, `NoRestrictedImportsRule`, `NoRestrictedPropertiesRule`, `NoUnusedVarsRule`, `PreferNullishCoalescingRule`, `SwitchCaseBracesRule`, `TRuleSeverity`, `TOxlintRuleEntry`, ...). It loads no ESLint: the rule classes and `LintIgnore` import ESLint types only, which the build erases, so a rule class is safe in an oxlint config. It leaves out `eslint.ts`, `react-eslint.ts` and `house/`, which import ESLint and typescript-eslint. The `/linters` barrel re-exports the subpath and adds those three, and an oxlint run through it loads them for nothing (about 1.2 s; measured on `filter`, median 1.5 s before and 0.33 s after). `make build-checks` loads the built subpath in a fresh process and fails if any ESLint module appears, and checks that the barrel exports the same values. The files are named by tool: `react-oxlint.ts` holds `ReactOxlintConfigs` and `react-eslint.ts` holds `ReactEslintConfigs` and `reactNamingConventionConfigs`; the `/linters` barrel exports both. The root export `@venizia/dev-configs` still re-exports everything, including `eslintConfigs`, `prettierConfigs`, `ReactEslintConfigs` and `BunCompiler`.

TypeScript configs are consumed by path, not by import: `@venizia/dev-configs/tsconfig.base.json`, `tsconfig.common.json`, `tsconfig.browser.json` and `tsconfig.react.json` are package.json `exports` entries that map to `src/tsconfig/` (`files` ships it). Every package's own `tsconfig.json` extends `tsconfig.common.json`, which in turn extends `tsconfig.base.json`. The package's own `tsconfig.json` extends its own `src/tsconfig/tsconfig.common.json`.

## oxlint and formatting

oxlint (lint, type-aware through `oxlint-tsgolint`) and `bun fmt` (format) replaced ESLint for everything except one rule. oxlint and its type-aware engine are optional peer dependencies: `oxlint >=1.89.0`, `oxlint-tsgolint >=7.0.2004`; `bun fmt` needs Bun 1.4.4 and is not a dependency. The ESLint config is `.mjs` so ESLint needs no `jiti`. `typescript-eslint` is a regular dependency.

- `oxlintConfigs` is the oxlint port of `eslintConfigs`, generated with `@oxlint/migrate`. Three rules are not ported: `prefer-optional-chain` (oxlint nursery), `no-invalid-this` (covered by `noImplicitThis`), and `n/prefer-node-protocol` (now `unicorn/prefer-node-protocol`).
- `prefer-nullish-coalescing` stays strict in every preset (decided by the maintainer, 2026-10-17). `OxlintConfigs.create({ lenientFallback: true })` - and the same option on the browser and React `create()` - allows `||` on string and number left sides only; BANA asked for it so its backend configs stay preset-only. The rule fires only on a nullable left side, so a probe needs `name?: string`, not `name: string`.
- The format is the `[fmt]` table of the root `bunfig.toml`: `printWidth = 100`, `singleQuote = true`, `arrowParens = "always"`, `flavor = "oxfmt"`. Bun's defaults give `tabWidth` 2, `trailingComma` `"all"`, `semi`, `bracketSpacing`. `flavor = "oxfmt"` keeps oxfmt's output once `oxfmt` is not in `package.json`; without it Bun formats in its default flavor (14 files changed in the measurement). Bun inherits `[fmt]` from a parent folder, so packages need no bunfig of their own, and it overrides the keys of any config file it also loads. `bun fmt` also sorts every `package.json` (sort-package-json key order, dependency names alphabetical, `exports`/`scripts`/`files` order kept); `FORMAT_GLOB` and the make globs are `**/*.{ts,mts,tsx,js,mjs,json,jsonc,yml,yaml,css,html,vue}` (no Markdown), and `devz lint <files>` passes a listed json, yaml, css, html or vue file to `bun fmt` only. Generated files go in `.configs/formatters/.ignore` (the examples list drizzle-kit's `migration/meta/**`). `npm version` (the release bump), `bun add`, `bun update` and `bun remove` leave a sorted manifest sorted.
- `oxfmtConfigs`, `browserOxfmtConfigs`, `prettierConfigs` and the `./formatters` subpath were removed (2026-10-23, breaking). One style serves backend and frontend. `eslintConfigs` lost the Prettier rule (`eslint-plugin-prettier`) and the `prettier` peer.
- `oxlint-tsgolint` is built on TypeScript 7. IGNIS is on TypeScript 6 and it works.

### Rule classes

`linters/rules/` holds one class per rule: `NamingConventionRule`, `EqeqeqRule`, `NoUnusedVarsRule`, `SwitchCaseBracesRule`, `NoRestrictedImportsRule`, `PreferNullishCoalescingRule`. Each has `static readonly NAME` and `static build(opts)`, which returns a rule entry. A `_name` variable (an omitted value, `{ page: _page, ...rest }`) passes both `NamingConventionRule` (underscore allowed, case still checked) and `NoUnusedVarsRule` (`varsIgnorePattern: ^_` by default). The types `TRuleSeverity`, `TOxlintRuleEntry`, `TNamingSelector` and `IRestrictedImportPath` are exported too.

```typescript
rules: { [EqeqeqRule.NAME]: EqeqeqRule.build({ mode: 'always' }) }
NamingConventionRule.build({ extraSelectors: [/* ... */] })
NoRestrictedImportsRule.build({ extraPaths: [/* ... */] })
```

Some classes carry defaults (`NamingConventionRule.SELECTORS`, `NoRestrictedImportsRule.PATHS`).

### Browser and React tiers

There are three tiers. The backend tier is `oxlintConfigs` and `tsconfig.common.json`. The browser tier is for browser code without React. The React tier builds on the browser tier. ARDOR asked for the browser tier because it repeated the same overrides in every project (issue #163).

| Tool | Browser | React |
|---|---|---|
| oxlint | `BrowserOxlintConfigs.create()` (`linters/browser.ts`): `oxlintConfigs` plus `NoRestrictedPropertiesRule` in the top-level `rules` | `ReactOxlintConfigs.create()`, built on the browser preset |
| tsconfig | `tsconfig.browser.json`: extends the **base**, not `common`; `module: ESNext`, `moduleResolution: bundler`, lib `ES2025` + `DOM` + `DOM.Iterable`, `types: []` | `tsconfig.react.json`: the browser config plus `jsx: react-jsx` |

The backend presets did not change. `types: []` keeps Bun's globals out of a browser `dist`. Since 2026-10-24 one format serves backend and frontend: `arrowParens = "always"` (`(x) => x`), a choice the maintainer made.

Moving the ban into the browser tier changed the React preset in one way. The ban used to sit in an override limited to `js/jsx/ts/tsx/mts/cts`. It is now in the top-level `rules`, so it covers every file, `.mjs` and `.cjs` included. Every other rule is identical: 147 keys, checked by diffing against the 0.3.0 config.

### React preset for oxlint

Every lint preset (backend, browser and React) lives here, and ARDOR consumes them. `ReactOxlintConfigs.create()` is `BrowserOxlintConfigs.create()` plus three groups of rules: the `react` / `jsx-a11y` rules of `ReactEslintConfigs`, the hooks rules, and `consistent-type-imports`. `react/no-deprecated` is the one `ReactEslintConfigs` rule left out, because oxlint lacks it. The browser preset supplies the `crypto.randomUUID` ban, because that method is undefined outside a secure context. Nothing in the base is relaxed for a UI (decided 2026-10-16: frontend code meets the backend's standard - no floating promise, no `void`) and `exhaustive-deps` is an error; `ReactEslintConfigs` follows the same rule and bans `crypto.randomUUID` too. The values match what ARDOR measured for its strict variant. `reactNamingConventionConfigs` adds the PascalCase function selector on `.jsx` / `.tsx`. oxlint has no `no-restricted-syntax`, so the secure-context ban is `no-restricted-properties`.

## House rules

`houseEslintPlugin` (namespace `venizia`) carries what oxlint cannot express. One class per rule in `linters/house/`, each with `NAME`, `RULE` and `build()`.

| Rule | In | Notes |
|---|---|---|
| `max-params-own` | `houseConfigs`, `reactHouseConfigs` | At most 5 positional parameters on a function we write |
| `no-new-error` | both | `getError`, never `new Error` / `Error()`; off in tests |
| `no-leaked-render` | `reactHouseConfigs` only, `.jsx`/`.tsx` | `cond && <X />` draws `0`; fixer writes `cond ? <X /> : null` |
| `const-class-values` | both, `warn` | V-C-08: a string-literal union in an exported declaration (alias, interface member, generic constraint, parameter or return type); skips `Pick`/`Omit`/`Extract`/`Exclude`/`Record` arguments and mapped-type keys; off in tests. `namePattern` narrows it to exported aliases with a matching name |
| `@typescript-eslint/consistent-type-assertions` | both, `warn`, `assertionStyle: never` | V-C-10: `as X` warns, `as const` and `satisfies` do not; off in tests. These two warn only, so `make lint` (oxlint `--deny-warnings` is the oxlint side) still passes |

### The async style rules (opt-in)

Five more rules, all at `error`, apply to test files too, and are **not** in `houseConfigs` or `reactHouseConfigs` yet. A project turns them on by spreading two arrays next to the house configs: `[...houseConfigs, ...asyncStyleConfigs]`, and for a React project `[...reactHouseConfigs, ...reactAsyncStyleConfigs]`. A later release moves them into the house arrays and keeps the two exports as aliases. The convention behind them is [async style](/conventions/async-style.md).

| Rule | In | Notes |
|---|---|---|
| `no-inline-await` | `asyncStyleConfigs` | `await` only as a whole statement or as the whole initializer of a declaration; `return g(await f())` is the same report. The fixer hoists the `await` into a `const result = ...` in front of the statement, only when nothing that does more than read a value runs before it and it is not in a branch, a loop test, an unbraced `if` or an arrow expression body |
| `no-return-await` | `asyncStyleConfigs` | `return await f()` becomes `return f()`; inside `try`, `catch` or `finally` it becomes `const result = await f(); return result;`. It stands beside `typescript/return-await`, which asks for an `await` only when a promise is returned inside a `try` |
| `no-async-hook-callback` | `reactAsyncStyleConfigs` | an async arrow or function expression passed to any `use[A-Z]*` call (`React.useX` too): as the argument, as the value of a property of an object literal argument (`useMutation({ mutationFn: async () => {} })`, an async method too) or as an element of an array literal; report only. What a sync callback builds inside is not an argument and is not reported |
| `effect-cleanup-consistency` | `reactAsyncStyleConfigs` | the callback of `useEffect`, `useLayoutEffect`, `useInsertionEffect` returns nothing on every path or a cleanup on every path; uses ESLint code paths |

`devz codemod async-style [paths...] [--write | --check]` applies the fixers of the first two through ESLint's own `Linter.verifyAndFix`, lists what it cannot fix with file, line and rule, and with `--write` refuses a file that has local changes. The two hook rules have no fixer and no codemod: moving an async hook body into a promise chain changes error handling.

Checked against the BANA copies (2026-10-18): `max-params-own` gave the same hits on a 6-case snippet and on the BANA frontend; `no-leaked-render` gave the same 48 hits and the same fixed output on 3755 `.tsx` files; `no-new-error` differs only in also catching a bare `Error('x')` call. BANA's `pascal-case-tsx` was not taken: IGNIS and ARDOR name `.tsx` files in kebab-case (`about.page.tsx`, `product-list.tsx`), so PascalCase is a BANA product rule.

Both React presets (`ReactEslintConfigs`, `ReactOxlintConfigs`) run 15 `jsx-a11y` rules: the nine basics plus `anchor-is-valid`, `click-events-have-key-events`, `heading-has-content`, `label-has-associated-control`, `no-noninteractive-element-interactions`, `no-static-element-interactions`.

`typescript/no-deprecated` (type-aware, BANA turns it on) is not in the base: `core-server` uses `MinioHelper` and `SpawnOptions`, both deprecated on purpose, and would fail lint.

### consistent-type-imports and decorated parameters

oxlint 1.88 ignores decorator metadata (its schema says "except when referenced by decorator metadata", but a decorated constructor parameter, property or method parameter is flagged all the same, and `--fix` writes `import { type X }`). There is no rule option. tsc then emits `Function` (`Object` under Bun) for that `design:paramtypes` entry. That is accepted: IGNIS never injects by the entry (`@inject` names a key, `@repository` skips `Object` and `Function`), so the preset keeps `fixStyle: 'inline-type-imports'` and `disallowTypeAnnotations: false`. typescript-eslint's rule does honour it when `emitDecoratorMetadata` + `experimentalDecorators` are in `parserOptions` (measured: decorated class clean, undecorated flagged), which is the way out for code that reads the paramtypes.

## Ignoring generated paths

oxlint resolves `ignorePatterns` against the config file's folder and rejects `..`, so `.configs/` can never ignore a project path. `IOxlintPresetOptions.ignore` (every oxlint preset) appends an override that turns every rule off for `**/<pattern>`. It lands after the preset's overrides, so a caller's later override can undo it; `LintIgnore.oxlint({ config, patterns })` wraps a finished config. `LintIgnore.eslint({ patterns })` is `{ ignores }`. Packages with a Makefile still use `LINT_IGNORE` (`make/project.mk`).

## ESLint - naming convention only

oxlint has no port of `@typescript-eslint/naming-convention`, so ESLint stays for that one rule. `namingConventionConfigs` (a `Linter.Config[]`) is what each project's `.configs/lints/eslint.config.mjs` exports. The legacy `eslintConfigs` still works and is owned here: the legacy rule set (`OFF_RULES`, `STRICT_RULES` in `linters/eslint.ts`) on `@eslint/js`, typescript-eslint recommended, plus `eslint-plugin-n` and `eslint-plugin-unicorn`. It no longer depends on `@minimaltech/eslint-node`; the port resolves to the same config for `.ts`, `.tsx`, `.js`, `.mjs` and `.cjs` files (488 / 485 rules, verified deep-equal with `calculateConfigForFile`).

Notable rules in the oxlint port: `@typescript-eslint/no-explicit-any` is deliberately off (pragmatic, matches the framework's general stance against fighting the type checker at the boundary), while `curly` and `unicorn/switch-case-braces` both require braces on every control structure. `ban-ts-comment` and `no-namespace` are `error`.

`ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } })` is the frontend preset: the base, plus React correctness, `jsx-a11y` (15 rules), hooks and `consistent-type-imports`, with no UI relaxation (decided 2026-10-16: frontend code meets the backend's standard), `exhaustive-deps` an error and `crypto.randomUUID` banned. Plugins are options, never dependencies - the same seam IGNIS uses for optional peers - so a backend installs nothing. `reactVersion` defaults to `detect`, which aborts under ESLint 10 with eslint-plugin-react 7 - the option exists for that. The plugin type omits `configs`: each plugin types its presets differently (react-hooks 7 fails `ESLint.Plugin`), and only `rules` are used. The naming rule comes from `NamingConventionRule.build({ extraSelectors })`, extended for `.jsx`/`.tsx` only.

## Per-project `.configs/` folder

Every project (each package, `docs/wiki`, each example except `examples/rpc-client-app`) splits `.configs/` by job:

| File | Content |
|---|---|
| `lints/oxlint.config.mts` | `defineConfig(oxlintConfigs)`, imported from `@venizia/dev-configs/linters/oxlint` |
| `lints/eslint.config.mjs` | `houseConfigs` (naming convention + house rules), plus project rules where needed |
| `lints/.ignore` | Optional: paths oxlint and eslint skip, one gitignore-style pattern per line, relative to the project |
| `formatters/.ignore` | Optional: paths `bun fmt` skips, same format |
| `builders/tsconfig.*.json` | Every tsconfig but the root `tsconfig.json`: a built package's build program, or the app/node/test projects a solution `tsconfig.json` references; a Vite app also keeps `builders/vite.config.mts` |

No tool finds `.configs/` on its own, so every call passes `-c`. oxlint resolves `ignorePatterns` and ignore files from their own folder and refuse `..`, so nothing in `.configs/` can name a project path: `devz lint` (the package's `devz` bin, `src/cli/lint.ts`) reads each `.ignore` and passes its patterns on the command line (`--ignore-pattern`, also for `bun fmt`), which resolves from the project root. `LintIgnore` keeps the in-config route for oxlint and eslint. `devz lint [--fix] [files]` runs oxlint, eslint, then `bun fmt --no-script` (Bun takes the options from the `[fmt]` table of the nearest `bunfig.toml`) and stops at the first failure; with files it drops non-TS paths, exits 0 when none is left, and adds `--no-warn-ignored` and `--no-error-on-unmatched-pattern` so a listed ignored file passes. It resolves each tool from the nearest `node_modules/.bin`, else PATH. See [build system](/process/build-system.md) for the commands. `devz codemod` (`src/cli/codemod/`) holds the codemods, all dry runs unless `--write`, all git-aware (`files.ts`): `model-settings` (settings keys, `skipMigrate`) and `drop-redundant-casts` (`drop-redundant-casts.ts`): it loads the package tsconfig with the `typescript` JS API, removes the `as X` casts in memory, and keeps a removal only if the compiler reports no error beyond the baseline; a failing batch is narrowed by the places of the new errors, then by halving, on the compiler's incremental builder; `as const`, `as unknown`, double casts and casts of `any` are never candidates. `const-classes` (`const-classes.ts`) is syntactic: it parses each file, turns a string-literal union of an exported type alias or of a property of an exported interface or object type into a const class plus `TConstValue`, picks the names (class = type name without `T`, plural; member = value in upper snake case) unless a `--map` file overrides them, and reports a union in a parameter, return, generic or nested position as untouched. `namespace-functions` (`namespace-functions/`) is syntactic too: it reads a table (`mappings/<package-dir>.ts`, one file per package, joined in `mappings/index.ts` as `ALL_MAPPINGS`; the entry shape `INamespaceMapping` and how to write one are in `mapping.ts`) and rewrites a call of a function that moved into a class, imported by name, alias or namespace from a listed module, to `ClassName.method({ key: argument })`, adds the class to that import and drops the old name once no use is left; a spread, a wrong argument count, a value use, a re-export, a type-only import or a colliding local name is reported. A conversion pull request adds its entries to its package's file, never before the class exists; the shipped files are empty.

## TypeScript - the critical setting

`tsconfig.base.json` sets `experimentalDecorators: true` and `emitDecoratorMetadata: true`. These two flags are not stylistic - they are load-bearing for the entire DI system. `@inject` and `@injectable` rely on `reflect-metadata` receiving constructor parameter type metadata that only `emitDecoratorMetadata` causes `tsc` to emit; without it, the DI container silently receives no parameter metadata at all; there is no compiler error, just an empty metadata array, and `@inject` stops working with no diagnostic pointing at the cause. `useDefineForClassFields: false` is required alongside them, since the default `true` setting breaks decorator-driven property initialization.

Other base settings worth knowing: `target: ES2025`, `module: esnext` with `moduleResolution: bundler` and `noUncheckedSideEffectImports: false`, `strict: true` with `noImplicitAny: true` and `useUnknownInCatchVariables: true`, `strictPropertyInitialization: false` (a DI-injected property has no initializer) (off, TypeScript stops inferring callback parameters on a union of array types and editors flag them as `any`), and `noEmitOnError: true` - a single type error in a package's build empties its `dist/` rather than emitting best-effort output, which matters because `dist/` is gitignored.

`tsconfig.common.json` is the consumer-facing simplification: it extends `tsconfig.base.json` and repeats `module: esnext` / `moduleResolution: bundler` (it was `nodenext` until 0.4.4: under `nodenext` a package whose `type` is unset is CommonJS and resolves drizzle's `.d.cts`, while IGNIS's ESM-only types resolve `.d.ts`, so every drizzle type is a second, incompatible declaration; `bundler` reads every import through the `import` condition). `packages/dev-configs/tsconfig.json` pins `nodenext` itself: Node loads its lint presets, so its own emit must stay CommonJS, and any package that emits CommonJS from these presets must do the same. The side-effect import check is off because TypeScript 6 would otherwise fail `import 'dotenv-flow/config'`.

Bun ignores an `extends` that names a package (`@venizia/dev-configs/...`), even one level deep, so none of these options reach `bun run` or `bun test`; `tsc` follows the chain and stays green. Every `tsconfig.json` Bun runs therefore restates `experimentalDecorators: true` and `useDefineForClassFields: false` - see [gotchas](/conventions/gotchas.md). Flattening the presets would not help: the package-specifier form is skipped outright. Decided 2026-10-16 (issue #167): fix it in the docs and the repo's own tsconfigs, keep the presets as they are.

## Gotcha: changes here are monorepo-wide

Because every package extends these configs directly, a change to `tsconfig.base.json`, `oxlintConfigs` or `namingConventionConfigs` affects every package's build and lint output simultaneously. There is no per-package override mechanism beyond what each package's own `tsconfig.json` and `.configs/*.config.mts` layer on top.

## Shared checks (`devz check`, `./checks`)

`devz check purity --claims <file> [package] [--json]` is the browser-purity gate, run from the IGNIS repo by `make purity`. The engine lives in `src/checks/purity/` (`probe.ts` bundles an entry with `bun build --target=browser` and reads the metafile; `manifest.ts` derives one row per runtime condition of each claimed package's `exports` map and guards stale claims, stale waivers and workspace `external`s; `run.ts` prints the report and the `--json` verdict). A repository supplies only a module that exports `PURITY_CLAIMS` and optionally `PURITY_OPTIONS` (`esmEntryPrefix`). The scratch file goes to `<cwd>/.agents/local/tmp`, and an entry whose bundle reaches `@venizia/dev-configs` fails. `devz check catalog [--glob]... [--pinned]... [--preset-prefix]`, `devz check module-cycles <dir> [--max]` and `devz check split-report [--dist] [folder...]` are the other three (`catalog.ts`, `module-cycles.ts`, `split-report.ts`). `devz check test-weight`, `test-dead-code`, `test-mutate` and `test-controls` are the tools of the trim-tests method ([Trimming tests](/process/trimming-tests.md)): the JUnit analysis, the support files nothing refers to, the mutation-ledger replay (`test-mutate.ts`), and the registry of positive-control tests (`scripts/checks/controls.json`, `make controls-check`). `./checks` exports the engine functions; it is Bun-only and must never be reached from a browser entry (`probe.ts` enforces that). Its test fixtures are deliberately impure and are excluded from the package's lint and typecheck.

## Related

- [Build system](/process/build-system.md)
- [Coding style](/conventions/coding-style.md)
- [inversion](/packages/inversion.md)
- [Monorepo layout](/overview/monorepo-layout.md)
