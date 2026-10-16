---
type: Package
title: dev-configs
description: Centralized oxlint, oxfmt, naming-convention ESLint, and TypeScript configuration consumed by every package in the IGNIS monorepo.
resource: packages/dev-configs
tags: [packages, dev-configs, tooling]
---

`@venizia/dev-configs` is the root of the IGNIS build dependency chain (`dev-configs -> inversion -> {filter, helpers} -> kernel -> core`) - it has no dependency on any other IGNIS package, and every other package depends on it for lint, format, and compiler settings. It ships a single CommonJS build.

## Exports

```typescript
import { oxlintConfigs } from '@venizia/dev-configs/linters';       // oxlint config object
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';      // oxfmt config object
import { namingConventionConfigs } from '@venizia/dev-configs/linters'; // ESLint, naming rule only
```

The source is split by job: `compilers/` (`BunCompiler`), `formatters/` (`oxfmt.ts`, `prettier.ts`), `linters/` (`oxlint.ts`, `browser.ts`, `eslint.ts`, `react.ts`, `rules/`) and `tsconfig/`. The subpaths `@venizia/dev-configs/compilers`, `/formatters` and `/linters` expose each folder. The root export `@venizia/dev-configs` still re-exports everything, including `eslintConfigs`, `prettierConfigs`, `ReactEslintConfigs` and `BunCompiler`.

TypeScript configs are consumed by path, not by import: `@venizia/dev-configs/tsconfig.base.json`, `tsconfig.common.json`, `tsconfig.browser.json` and `tsconfig.react.json` are package.json `exports` entries that map to `src/tsconfig/` (`files` ships it). Every package's own `tsconfig.json` extends `tsconfig.common.json`, which in turn extends `tsconfig.base.json`. The package's own `tsconfig.json` extends its own `src/tsconfig/tsconfig.common.json`.

## oxlint and oxfmt

oxlint (lint, type-aware through `oxlint-tsgolint`) and oxfmt (format) replaced ESLint and Prettier for everything except one rule. They are optional peer dependencies: `oxlint >=1.88.0`, `oxfmt >=0.73.0`, `oxlint-tsgolint >=7.0.2004`. The ESLint config is `.mjs` so ESLint needs no `jiti`. `typescript-eslint` is a regular dependency.

- `oxlintConfigs` is the oxlint port of `eslintConfigs`, generated with `@oxlint/migrate`. Three rules are not ported: `prefer-optional-chain` (oxlint nursery), `no-invalid-this` (covered by `noImplicitThis`), and `n/prefer-node-protocol` (now `unicorn/prefer-node-protocol`).
- `oxfmtConfigs` carries the same seven options the old Prettier config did: `printWidth: 100`, `tabWidth: 2`, `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `arrowParens: "avoid"`, `bracketSpacing: true`.
- `prettierConfigs` is still exported for a consumer that has not moved. IGNIS itself no longer uses it.
- `oxlint-tsgolint` is built on TypeScript 7. IGNIS is on TypeScript 6 and it works.

### Rule classes

`linters/rules/` holds one class per rule: `NamingConventionRule`, `EqeqeqRule`, `NoUnusedVarsRule`, `SwitchCaseBracesRule`, `NoRestrictedImportsRule`, `PreferNullishCoalescingRule`. Each has `static readonly NAME` and `static build(opts)`, which returns a rule entry. The types `TRuleSeverity`, `TOxlintRuleEntry`, `TNamingSelector` and `IRestrictedImportPath` are exported too.

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

## ESLint - naming convention only

oxlint has no port of `@typescript-eslint/naming-convention`, so ESLint stays for that one rule. `namingConventionConfigs` (a `Linter.Config[]`) is what each project's `.configs/eslint.config.mjs` exports. The legacy `eslintConfigs` still works and is owned here: the LoopBack 4 rule set (`OFF_RULES`, `STRICT_RULES` in `linters/eslint.ts`) on `@eslint/js`, typescript-eslint and `eslint-plugin-prettier` recommended, plus `eslint-plugin-n` and `eslint-plugin-unicorn`. It no longer depends on `@minimaltech/eslint-node`; the port resolves to the same config for `.ts`, `.tsx`, `.js`, `.mjs` and `.cjs` files (488 / 485 rules, verified deep-equal with `calculateConfigForFile`).

Notable rules in the oxlint port: `@typescript-eslint/no-explicit-any` is deliberately off (pragmatic, matches the framework's general stance against fighting the type checker at the boundary), while `curly` and `unicorn/switch-case-braces` both require braces on every control structure. `ban-ts-comment` and `no-namespace` are `error`.

`ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } })` is the frontend preset: the base, plus React correctness, `jsx-a11y` basics, hooks and `consistent-type-imports`, with no UI relaxation (decided 2026-10-16: frontend code meets the backend's standard), `exhaustive-deps` an error and `crypto.randomUUID` banned. Plugins are options, never dependencies - the same seam IGNIS uses for optional peers - so a backend installs nothing. `reactVersion` defaults to `detect`, which aborts under ESLint 10 with eslint-plugin-react 7 - the option exists for that. The plugin type omits `configs`: each plugin types its presets differently (react-hooks 7 fails `ESLint.Plugin`), and only `rules` are used. The naming rule comes from `NamingConventionRule.build({ extraSelectors })`, extended for `.jsx`/`.tsx` only.

## Per-project `.configs/` folder

Every project (each package, `docs/wiki`, each example except `examples/rpc-client-app`) owns three small files under `.configs/`:

| File | Content |
|---|---|
| `oxlint.config.mts` | `defineConfig(oxlintConfigs)` |
| `oxfmt.config.mts` | `defineConfig(oxfmtConfigs)` |
| `eslint.config.mjs` | `namingConventionConfigs`, plus project rules where needed |

No tool finds `.configs/` on its own, so every call passes `-c .configs/<tool>.config.mts`. See [build system](/process/build-system.md) for the commands.

## TypeScript - the critical setting

`tsconfig.base.json` sets `experimentalDecorators: true` and `emitDecoratorMetadata: true`. These two flags are not stylistic - they are load-bearing for the entire DI system. `@inject` and `@injectable` rely on `reflect-metadata` receiving constructor parameter type metadata that only `emitDecoratorMetadata` causes `tsc` to emit; without it, the DI container silently receives no parameter metadata at all; there is no compiler error, just an empty metadata array, and `@inject` stops working with no diagnostic pointing at the cause. `useDefineForClassFields: false` is required alongside them, since the default `true` setting breaks decorator-driven property initialization.

Other base settings worth knowing: `target: ES2025`, `module`/`moduleResolution: Node16`, `strict: true` with `noImplicitAny: false` (pragmatic strictness), and `noEmitOnError: true` - a single type error in a package's build empties its `dist/` rather than emitting best-effort output, which matters because `dist/` is gitignored.

`tsconfig.common.json` is the consumer-facing simplification: it extends `tsconfig.base.json` and switches `module`/`moduleResolution` to `nodenext`.

## Gotcha: changes here are monorepo-wide

Because every package extends these configs directly, a change to `tsconfig.base.json`, `oxlintConfigs`, `oxfmtConfigs` or `namingConventionConfigs` affects every package's build and lint output simultaneously. There is no per-package override mechanism beyond what each package's own `tsconfig.json` and `.configs/*.config.mts` layer on top.

## Related

- [Build system](/process/build-system.md)
- [Coding style](/conventions/coding-style.md)
- [inversion](/packages/inversion.md)
- [Monorepo layout](/overview/monorepo-layout.md)
