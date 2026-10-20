---
type: Package
title: dev-configs
description: Centralized oxlint, oxfmt, naming-convention ESLint, and TypeScript configuration consumed by every package in the IGNIS monorepo.
resource: packages/dev-configs
tags: [packages, dev-configs, tooling]
---

<!-- okf:generated:contents start -->
**Contents**

- [Exports](#exports)
- [oxlint and oxfmt](#oxlint-and-oxfmt)
- [House rules](#house-rules)
- [Ignoring generated paths](#ignoring-generated-paths)
- [ESLint - naming convention only](#eslint---naming-convention-only)
- [Per-project `.configs/` folder](#per-project-configs-folder)
- [TypeScript - the critical setting](#typescript---the-critical-setting)
- [Gotcha: changes here are monorepo-wide](#gotcha-changes-here-are-monorepo-wide)
- [Related](#related)
<!-- okf:generated:contents end -->

`@venizia/dev-configs` is the root of the IGNIS build dependency chain (`dev-configs -> inversion -> {filter, helpers} -> kernel -> core`) - it has no dependency on any other IGNIS package, and every other package depends on it for lint, format, and compiler settings. It ships a single CommonJS build.

## Exports

```typescript
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint'; // oxlint config object, without ESLint loaded
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';      // oxfmt config object
import { houseConfigs } from '@venizia/dev-configs/linters'; // ESLint: naming + house rules
```

The source is split by job: `compilers/` (`BunCompiler`), `formatters/` (`oxfmt.ts`, `prettier.ts`), `linters/` (`oxlint.ts`, `browser.ts`, `react-oxlint.ts`, `oxlint-presets.ts`, `eslint.ts`, `react-eslint.ts`, `rules/`) and `tsconfig/`. The subpaths `@venizia/dev-configs/compilers`, `/formatters` and `/linters` expose each folder. `@venizia/dev-configs/linters/oxlint` is `linters/oxlint-presets.ts`: `oxlintConfigs`, `OxlintConfigs`, `BrowserOxlintConfigs` and `ReactOxlintConfigs`, and no file that imports ESLint. The `/linters` barrel loads `eslint.ts` and `react-eslint.ts`, which import ESLint and typescript-eslint (about 1.2 s of every oxlint run), and an oxlint config needs none of it. The files are named by tool: `react-oxlint.ts` holds `ReactOxlintConfigs` and `react-eslint.ts` holds `ReactEslintConfigs` and `reactNamingConventionConfigs`; the `/linters` barrel exports both. The root export `@venizia/dev-configs` still re-exports everything, including `eslintConfigs`, `prettierConfigs`, `ReactEslintConfigs` and `BunCompiler`.

TypeScript configs are consumed by path, not by import: `@venizia/dev-configs/tsconfig.base.json`, `tsconfig.common.json`, `tsconfig.browser.json` and `tsconfig.react.json` are package.json `exports` entries that map to `src/tsconfig/` (`files` ships it). Every package's own `tsconfig.json` extends `tsconfig.common.json`, which in turn extends `tsconfig.base.json`. The package's own `tsconfig.json` extends its own `src/tsconfig/tsconfig.common.json`.

## oxlint and oxfmt

oxlint (lint, type-aware through `oxlint-tsgolint`) and oxfmt (format) replaced ESLint and Prettier for everything except one rule. They are optional peer dependencies: `oxlint >=1.88.0`, `oxfmt >=0.73.0`, `oxlint-tsgolint >=7.0.2004`. The ESLint config is `.mjs` so ESLint needs no `jiti`. `typescript-eslint` is a regular dependency.

- `oxlintConfigs` is the oxlint port of `eslintConfigs`, generated with `@oxlint/migrate`. Three rules are not ported: `prefer-optional-chain` (oxlint nursery), `no-invalid-this` (covered by `noImplicitThis`), and `n/prefer-node-protocol` (now `unicorn/prefer-node-protocol`).
- `prefer-nullish-coalescing` stays strict in every preset (decided by the maintainer, 2026-10-17). `OxlintConfigs.create({ lenientFallback: true })` - and the same option on the browser and React `create()` - allows `||` on string and number left sides only; BANA asked for it so its backend configs stay preset-only. The rule fires only on a nullable left side, so a probe needs `name?: string`, not `name: string`.
- `oxfmtConfigs` carries the same seven options the old Prettier config did: `printWidth: 100`, `tabWidth: 2`, `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `arrowParens: "avoid"`, `bracketSpacing: true`.
- `prettierConfigs` is still exported for a consumer that has not moved. IGNIS itself no longer uses it.
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

There are three tiers. The backend tier is `oxlintConfigs`, `oxfmtConfigs` and `tsconfig.common.json`. The browser tier is for browser code without React. The React tier builds on the browser tier. ARDOR asked for the browser tier because it repeated the same overrides in every project (issue #163).

| Tool | Browser | React |
|---|---|---|
| oxlint | `BrowserOxlintConfigs.create()` (`linters/browser.ts`): `oxlintConfigs` plus `NoRestrictedPropertiesRule` in the top-level `rules` | `ReactOxlintConfigs.create()`, built on the browser preset |
| oxfmt | `browserOxfmtConfigs`: `arrowParens: 'always'`, `bracketSameLine: true` | the same |
| tsconfig | `tsconfig.browser.json`: extends the **base**, not `common`; `module: ESNext`, `moduleResolution: bundler`, lib `ES2025` + `DOM` + `DOM.Iterable`, `types: []` | `tsconfig.react.json`: the browser config plus `jsx: react-jsx` |

The backend presets did not change. The backend keeps `arrowParens: 'avoid'`, a choice the user made. `types: []` keeps Bun's globals out of a browser `dist`.

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
| `const-class-values` | registered, enabled by no preset | exported `*State`/`*Status`/`*Stage`/`*Mode`/`*Kind`/`*Type` string-literal union (V-C-08). Three IGNIS types still match (`helpers` `TFieldMappingDataType` and `AESAlgorithmType`, `kernel` `TIdSchemaType`), so a preset at `error` would break `lint-helpers` and `lint-kernel` |

Checked against the BANA copies (2026-10-18): `max-params-own` gave the same hits on a 6-case snippet and on the BANA frontend; `no-leaked-render` gave the same 48 hits and the same fixed output on 3755 `.tsx` files; `no-new-error` differs only in also catching a bare `Error('x')` call. BANA's `pascal-case-tsx` was not taken: IGNIS and ARDOR name `.tsx` files in kebab-case (`about.page.tsx`, `product-list.tsx`), so PascalCase is a BANA product rule.

Both React presets (`ReactEslintConfigs`, `ReactOxlintConfigs`) run 15 `jsx-a11y` rules: the nine basics plus `anchor-is-valid`, `click-events-have-key-events`, `heading-has-content`, `label-has-associated-control`, `no-noninteractive-element-interactions`, `no-static-element-interactions`.

`typescript/no-deprecated` (type-aware, BANA turns it on) is not in the base: `core-server` uses `MinioHelper` and `SpawnOptions`, both deprecated on purpose, and would fail lint.

### consistent-type-imports and decorated parameters

oxlint 1.88 ignores decorator metadata (its schema says "except when referenced by decorator metadata", but a decorated constructor parameter, property or method parameter is flagged all the same, and `--fix` writes `import { type X }`). There is no rule option. tsc then emits `Function` (`Object` under Bun) for that `design:paramtypes` entry. That is accepted: IGNIS never injects by the entry (`@inject` names a key, `@repository` skips `Object` and `Function`), so the preset keeps `fixStyle: 'inline-type-imports'` and `disallowTypeAnnotations: false`. typescript-eslint's rule does honour it when `emitDecoratorMetadata` + `experimentalDecorators` are in `parserOptions` (measured: decorated class clean, undecorated flagged), which is the way out for code that reads the paramtypes.

## Ignoring generated paths

oxlint resolves `ignorePatterns` against the config file's folder and rejects `..`, so `.configs/` can never ignore a project path. `IOxlintPresetOptions.ignore` (every oxlint preset) appends an override that turns every rule off for `**/<pattern>`. It lands after the preset's overrides, so a caller's later override can undo it; `LintIgnore.oxlint({ config, patterns })` wraps a finished config. `LintIgnore.eslint({ patterns })` is `{ ignores }`. Packages with a Makefile still use `LINT_IGNORE` (`make/project.mk`).

## ESLint - naming convention only

oxlint has no port of `@typescript-eslint/naming-convention`, so ESLint stays for that one rule. `namingConventionConfigs` (a `Linter.Config[]`) is what each project's `.configs/eslint.config.mjs` exports. The legacy `eslintConfigs` still works and is owned here: the LoopBack 4 rule set (`OFF_RULES`, `STRICT_RULES` in `linters/eslint.ts`) on `@eslint/js`, typescript-eslint and `eslint-plugin-prettier` recommended, plus `eslint-plugin-n` and `eslint-plugin-unicorn`. It no longer depends on `@minimaltech/eslint-node`; the port resolves to the same config for `.ts`, `.tsx`, `.js`, `.mjs` and `.cjs` files (488 / 485 rules, verified deep-equal with `calculateConfigForFile`).

Notable rules in the oxlint port: `@typescript-eslint/no-explicit-any` is deliberately off (pragmatic, matches the framework's general stance against fighting the type checker at the boundary), while `curly` and `unicorn/switch-case-braces` both require braces on every control structure. `ban-ts-comment` and `no-namespace` are `error`.

`ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } })` is the frontend preset: the base, plus React correctness, `jsx-a11y` (15 rules), hooks and `consistent-type-imports`, with no UI relaxation (decided 2026-10-16: frontend code meets the backend's standard), `exhaustive-deps` an error and `crypto.randomUUID` banned. Plugins are options, never dependencies - the same seam IGNIS uses for optional peers - so a backend installs nothing. `reactVersion` defaults to `detect`, which aborts under ESLint 10 with eslint-plugin-react 7 - the option exists for that. The plugin type omits `configs`: each plugin types its presets differently (react-hooks 7 fails `ESLint.Plugin`), and only `rules` are used. The naming rule comes from `NamingConventionRule.build({ extraSelectors })`, extended for `.jsx`/`.tsx` only.

## Per-project `.configs/` folder

Every project (each package, `docs/wiki`, each example except `examples/rpc-client-app`) owns three small files under `.configs/`:

| File | Content |
|---|---|
| `oxlint.config.mts` | `defineConfig(oxlintConfigs)` |
| `oxfmt.config.mts` | `defineConfig(oxfmtConfigs)` |
| `eslint.config.mjs` | `houseConfigs` (naming convention + house rules), plus project rules where needed |

No tool finds `.configs/` on its own, so every call passes `-c .configs/<tool>.config.mts`. See [build system](/process/build-system.md) for the commands.

## TypeScript - the critical setting

`tsconfig.base.json` sets `experimentalDecorators: true` and `emitDecoratorMetadata: true`. These two flags are not stylistic - they are load-bearing for the entire DI system. `@inject` and `@injectable` rely on `reflect-metadata` receiving constructor parameter type metadata that only `emitDecoratorMetadata` causes `tsc` to emit; without it, the DI container silently receives no parameter metadata at all; there is no compiler error, just an empty metadata array, and `@inject` stops working with no diagnostic pointing at the cause. `useDefineForClassFields: false` is required alongside them, since the default `true` setting breaks decorator-driven property initialization.

Other base settings worth knowing: `target: ES2025`, `module`/`moduleResolution: Node16`, `strict: true` with `noImplicitAny: true` and `useUnknownInCatchVariables: true`, `strictPropertyInitialization: false` (a DI-injected property has no initializer) (off, TypeScript stops inferring callback parameters on a union of array types and editors flag them as `any`), and `noEmitOnError: true` - a single type error in a package's build empties its `dist/` rather than emitting best-effort output, which matters because `dist/` is gitignored.

`tsconfig.common.json` is the consumer-facing simplification: it extends `tsconfig.base.json` and switches `module`/`moduleResolution` to `nodenext`.

Bun ignores an `extends` that names a package (`@venizia/dev-configs/...`), even one level deep, so none of these options reach `bun run` or `bun test`; `tsc` follows the chain and stays green. Every `tsconfig.json` Bun runs therefore restates `experimentalDecorators: true` and `useDefineForClassFields: false` - see [gotchas](/conventions/gotchas.md). Flattening the presets would not help: the package-specifier form is skipped outright. Decided 2026-10-16 (issue #167): fix it in the docs and the repo's own tsconfigs, keep the presets as they are.

## Gotcha: changes here are monorepo-wide

Because every package extends these configs directly, a change to `tsconfig.base.json`, `oxlintConfigs`, `oxfmtConfigs` or `namingConventionConfigs` affects every package's build and lint output simultaneously. There is no per-package override mechanism beyond what each package's own `tsconfig.json` and `.configs/*.config.mts` layer on top.

## Related

- [Build system](/process/build-system.md)
- [Coding style](/conventions/coding-style.md)
- [inversion](/packages/inversion.md)
- [Monorepo layout](/overview/monorepo-layout.md)
