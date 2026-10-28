# Tooling Configuration

IGNIS lints with **oxlint**, formats with **`bun fmt`**, and keeps **ESLint** for one rule. oxlint and ESLint read their settings from `@venizia/dev-configs`; `bun fmt` reads the `[fmt]` table of `bunfig.toml`. `bun fmt` needs Bun 1.4.4 or newer.

```typescript
// .configs/lints/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(oxlintConfigs);
```

> [!IMPORTANT]
> **Bun is the only package manager** - never npm, yarn, or pnpm. **Compile with `tsc` directly**,
> through a package script; never reach for `npx` or `bun x`.
>
> `bunx` is fine for running a one-off CLI that is not a project dependency.

## Installation

```bash
bun add -d @venizia/dev-configs oxlint oxlint-tsgolint eslint typescript
```

| Tool | Job |
|------|-----|
| `oxlint` | Every lint rule except naming conventions |
| `oxlint-tsgolint` | Type-aware rules such as `no-floating-promises`. Install it next to `oxlint` |
| `eslint` | Runs one rule: `@typescript-eslint/naming-convention`, which oxlint cannot run yet |
| `typescript` | Type checking and the build |

## The `.configs/` layout

Every project keeps its tool settings in `.configs/`, one folder per job:

```
my-app/
├── .configs/
│   ├── lints/
│   │   ├── oxlint.config.mts
│   │   ├── eslint.config.mjs
│   │   └── .ignore            # optional: paths oxlint and eslint skip
│   ├── formatters/
│   │   └── .ignore            # optional: paths bun fmt skips
│   └── builders/              # only what the project builds with
│       └── vite.config.mts
├── src/
├── bunfig.toml                # the [fmt] table: the format of the project
├── package.json
└── tsconfig.json
```

| Folder | Holds |
|---|---|
| `lints/` | The oxlint and ESLint configs, and `.ignore` for both linters |
| `formatters/` | `.ignore`, the paths the formatter skips. The format itself lives in `bunfig.toml` |
| `builders/` | Every other tsconfig and the bundler config: a library's `tsconfig.build.json`, an app's `vite.config.mts`, and the projects a solution `tsconfig.json` references (`tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.test.json`) |

`tsconfig.json` is the only tsconfig at the project root. Bun, the editor's TypeScript server and oxlint's type-aware engine only look for it there; without it, Bun silently stops applying legacy decorators. A project split into app, node and test programs keeps those in `.configs/builders/` and lists them in the root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./.configs/builders/tsconfig.app.json" },
    { "path": "./.configs/builders/tsconfig.node.json" }
  ]
}
```

Inside a file in `.configs/builders/`, every path is relative to that folder: `"include": ["../../src"]`. `bun check` follows the references, like `tsc -b`.

A monorepo root also keeps `.configs/vulcan.config.mts`, where VULCAN reads it.

## Skipping paths: `.ignore`

To skip generated or vendored code, list it in the `.ignore` of the folder whose tools should skip it. One gitignore-style pattern per line, relative to the project; `#` starts a comment:

```
# .configs/lints/.ignore
src/components/shadcn/**
src/registry/*.generated.ts
```

`devz lint` reads both files. Each pattern in `lints/.ignore` reaches oxlint and ESLint as `--ignore-pattern`; each pattern in `formatters/.ignore` reaches `bun fmt` as `--ignore-pattern`. A path that only the formatter should skip (vendored code you still lint) goes in `formatters/.ignore` alone.

> [!NOTE]
> An `ignorePatterns` entry inside a `.configs/` file does not work. oxlint resolves it against the config's own folder and refuse `..`, so it can never name a project path. A pattern on the command line resolves from the project root, which is why `devz lint` passes them that way. `dist` and `node_modules` are skipped through `.gitignore`.

## oxlint Configuration

oxlint catches common errors and enforces best practices. It is a rule-for-rule port of the previous ESLint preset, and it runs type-aware rules through `oxlint-tsgolint`.

**`.configs/lints/oxlint.config.mts`:**
```typescript
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(oxlintConfigs);
```

**Includes:**
- The ESLint recommended and typescript-eslint rules, ported
- `unicorn/switch-case-braces: ['error', 'always']`
- `@typescript-eslint/no-explicit-any` off by default

**Customization:** each rule has a class in `@venizia/dev-configs/linters`. A class exposes the rule's `NAME` and a `build()` that returns its entry with the IGNIS defaults. Pass only what you change:

```typescript
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
    'no-console': 'warn',
  },
});
```

The rule classes and their options are in the [package README](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/README.md).

## ESLint Configuration (what oxlint cannot run)

ESLint runs what oxlint cannot express: `@typescript-eslint/naming-convention`, and the house rules - `venizia/max-params-own` (a function we write takes at most 5 positional parameters; beyond that, one options object), `venizia/no-new-error` (throw through `getError`, never `new Error`), and two that only warn: `venizia/const-class-values` (a string-literal union in an exported declaration is a const class plus `TConstValue`) and `@typescript-eslint/consistent-type-assertions` (`as X` casts; `as const` and `satisfies` pass).

**`.configs/lints/eslint.config.mjs`:**
```typescript
import { houseConfigs } from '@venizia/dev-configs/linters';

export default houseConfigs;
```

The two warnings never fail `make lint`: oxlint is the one that runs with `--deny-warnings`, and these two rules run in ESLint. `const-class-values` skips key sets (`Pick`, `Omit`, `Extract`, `Exclude`, `Record` arguments and mapped-type keys). Both are off in tests.

`max-params-own` does not count a signature that belongs to someone else: a callback passed inline to a call (`map`, `sort`, a library handler) or to a JSX prop, a function a declared type fixes, or a constructor whose parameters are all `@inject`. A hook callback (`useCallback(...)`) is yours, so it counts. Tests are exempt from `no-new-error`, because a test throws a plain `Error` to stand in for a driver. For a bootstrap that cannot import `getError`, disable the rule on that line and give the reason.

To change the allowed names, build the rule with extra selectors. An extra selector beats a base selector of the same kind only when it is more specific, so give it a `filter` - `{ selector: 'property', format: ['snake_case'] }` alone changes nothing, because the base `property` selector still wins:

```typescript
import { NamingConventionRule, houseConfigs } from '@venizia/dev-configs/linters';

export default [
  ...houseConfigs,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      [NamingConventionRule.NAME]: NamingConventionRule.build({
        extraSelectors: [{ selector: 'variable', format: null, filter: '^__' }],
      }),
    },
  },
];
```

Because oxlint owns the other rules, ESLint does not report unused `eslint-disable` comments. A project that wants the full ESLint preset instead still has `eslintConfigs`.

## Formatting with `bun fmt`

Automatic code formatting eliminates style debates. `bun fmt` reads the `[fmt]` table of `bunfig.toml` in the folder it runs in or any parent folder, so one table at the root of a monorepo serves every package.

**`bunfig.toml`:**
```toml
[fmt]
printWidth = 100
singleQuote = true
arrowParens = "always"
flavor = "oxfmt"
```

| Key | Value | Description |
|---------|-------|-------------|
| `printWidth` | `100` | Maximum line length |
| `singleQuote` | `true` | `'string'` (single quotes) |
| `arrowParens` | `"always"` | `(x) => x` not `x => x` |
| `flavor` | `"oxfmt"` | Keeps the output IGNIS was formatted with. Without it Bun formats in its default flavor, which puts the first member of a long union on its own `|` line |

Bun's defaults already match the rest of the old IGNIS style: `tabWidth` 2, `trailingComma` `"all"`, `semi` `true`, `bracketSpacing` `true`. The same table serves a React app; there is no separate frontend style.

**What it formats.** The code (`.ts`, `.tsx`, `.mts`, `.js`, `.mjs`) and every `.json`, `.jsonc`, `.yml`, `.yaml`, `.css`, `.html` and `.vue` file; Markdown is left alone. `devz lint` and `make lint` check all of them. Files a tool generates and rewrites on its own, such as drizzle-kit's `migration/meta/*_snapshot.json`, go in `.configs/formatters/.ignore` so a regenerate cannot turn lint red.

**`package.json` is sorted.** `bun fmt` sorts the keys of a `package.json` in the order `sort-package-json` uses (`name`, `version`, `description`, ..., `scripts`, `dependencies`, `devDependencies`, `peerDependencies`, ..., `engines`) and sorts the names inside the dependency blocks. It changes nothing else: the order of `exports`, `scripts`, `files` and `publishConfig` is kept. `devz lint --fix` rewrites them. `npm version`, `bun add`, `bun update` and `bun remove` keep a sorted file sorted. A project that wants its own key order sets `sortPackageJson = false` in `[fmt]`.

**Customization:** change a key in the table, or add `sortTailwindcss = true` where `tailwindcss` is installed.

> [!NOTE]
> Bun reads no `oxfmt.config.mts`. A project that still has one deletes it: Bun loads it when it finds one and fails if `@venizia/dev-configs/formatters` no longer resolves.

## Running the tools

`@venizia/dev-configs` ships a `devz` command that runs all three tools with the paths above. An app or a library created by `vulcan add` calls it from its scripts:

```json
{
  "scripts": {
    "lint": "devz lint",
    "lint:fix": "devz lint --fix"
  }
}
```

| Command | What it does |
|---|---|
| `devz lint` | Checks the whole project: oxlint, then ESLint, then a `bun fmt --check`. It stops at the first tool that fails |
| `devz lint --fix` | Fixes the whole project |
| `devz lint src/a.ts src/b.tsx` | Checks only those files - what a pre-commit hook passes |
| `devz lint --fix src/a.ts` | Fixes only those files. `--fix` comes first |
| `devz clean` | Takes no argument (`--help` prints the usage; any other argument exits 2 and deletes nothing). Removes `dist`, `node_modules/.cache` and the `*.tsbuildinfo` files in the project root |
| `devz check purity --claims <file> [package] [--json]` | Bundles every entry your claims file lists as browser-pure with `bun build --target=browser` and fails on a Node builtin, a Node global, an unresolved import, or a path into `@venizia/dev-configs`. Needs a build. `[package]` limits it to one package and exits 1 when it matches nothing; `--json` prints the verdict without machine paths. See [Checking browser purity](#checking-browser-purity) |
| `devz check purity --claims <file> [package] [--json]` | Bundles every entry your claims file lists as browser-pure with `bun build --target=browser` and fails on a Node builtin, a Node global, an unresolved import, or a path into `@venizia/dev-configs`. Needs a build. `[package]` limits it to one package and exits 1 when it matches nothing; `--json` prints the verdict without machine paths. See [Checking browser purity](#checking-browser-purity) |
| `devz check module-cycles <dir> [--max <n>]` | Lists the import cycles of a built ES module folder, such as `packages/kernel/dist/esm`. Exits 1 when there are more than `--max` (no bound by default), 2 on a usage error. Bun turns every member of a cycle into a lazy initializer, so a barrel `export *` over one can leave its exports undefined |
| `devz check split-report [--dist <dir>] [folder...]` | A report, never a gate: hub files, `types.ts` outside `common/`, scope folders without a barrel, files over 500 lines, and the import cycles of `--dist` (default `dist`; `dist/esm` in IGNIS). With no folder it reads every `packages/*` and `examples/*` that has a `src/` |
| `devz check catalog [--glob <pattern>]... [--pinned <file>]... [--preset-prefix <prefix>]` | Guards dependency ranges against the root `workspaces.catalog`: a catalogued dependency is `catalog:` (`npm publish` ships it verbatim), a `peerDependencies` range is never `catalog:`, and every catalog entry is used. `packages/*/package.json` is always read; `--glob` adds more. `--pinned` names a manifest outside the workspace, whose ranges must equal the catalog's. A file under `--preset-prefix` may use `catalog:` in its peers |
| `devz check test-weight [--top <n>] <junit.xml>...` | Reads the JUnit report of `bun test --reporter=junit`: totals, time per package, the heaviest files, how many files hold 80% of the time, the same suite and case name in more than one file, files with zero assertions, and skips. A `--parallel` run times each file under contention; re-time a suspect file alone |
| `devz check test-dead-code` | Lists the support files under `__tests__` (fixtures, helpers) that no other file refers to by name or path. They are candidates: delete one and run the suite before trusting it |
| `devz check test-mutate <ledger.json>` | Replays a mutation ledger: for each line it applies the break to a file, runs the survivor and the candidate test, and restores the file. The survivor must go red, or the line fails and exits 1 |
| `devz check test-controls <registry.json>` | Fails when a registered positive-control test (a test that proves a gate can fail) has been deleted or renamed |
| `devz codemod model-settings [paths...] [--write \| --check]` | Moves `@model` settings from the flat keys to `query` and `access`, and `skipMigrate` to `migration.use`. A dry run unless you pass `--write`; `--check` is the dry run that exits 1 when anything would change or a model is left untouched. Inside git it reads only the files git knows, so ignored folders are never touched; `--help` prints the usage. A `settings` value that is not an object literal is reported with its file and line and left untouched |
| `devz codemod drop-redundant-casts [paths...] [--write \| --check]` | Removes the `as X` casts the compiler no longer needs: a removal is kept only if the package still typechecks, checked in batches. A dry run unless you pass `--write`; `--check` exits 1 while a removable cast remains; `--project <tsconfig>` picks the tsconfig; `--include-tests` also tries test files. It never touches `as const`, `as unknown`, `x as unknown as T` or a cast of an `any` expression. [Details](/changelogs/2026-10-26-devz-codemod-drop-redundant-casts) |
| `devz codemod const-classes [paths...] [--write \| --check]` | Turns a string-literal union in an exported type alias, or in a property of an exported interface or object type, into a const class (`SCHEME_SET`, `isValid`) plus `TConstValue<typeof X>`, the shape the `venizia/const-class-values` rule asks for. It proposes the class and member names and prints them; `--emit-map` writes them to a file you edit, `--map` applies your names. The values stay the same, so no call site changes. A union in a parameter, a return type or a generic is reported and left untouched. [Details](/changelogs/2026-10-26-devz-codemod-const-classes) |

With a file list, the command drops the files the tools do not handle (`.md`, `.json`, ...) and exits 0 when none is left. A listed file that a `.ignore` skips passes quietly, so a commit that touches only generated code is not blocked. Paths are relative to the project, and `bun run lint src/a.ts` passes them through. Outside a script, run `bun x --no-install devz lint`: `--no-install` keeps Bun from fetching a newer version than the project pins.

### Checking browser purity

`devz check purity` is the gate behind `make purity` in IGNIS and ARDOR. The engine ships in `@venizia/dev-configs`; a repository supplies only its claims, in a module that exports `PURITY_CLAIMS`:

```typescript
// scripts/checks/purity/manifest.ts
import type { IPurityClaim, IPurityOptions } from '@venizia/dev-configs/checks';

export const PURITY_CLAIMS: IPurityClaim[] = [
  { package: 'inversion' },
  { package: 'helpers', subpaths: ['./core', './common'] },
  { package: 'connectors', impure: { './typesense': ['default'] } },
];

// Optional: every claimed sub-path must publish its runtime entry below this prefix.
export const PURITY_OPTIONS: IPurityOptions = { esmEntryPrefix: './dist/esm/' };
```

```bash
devz check purity --claims scripts/checks/purity/manifest.ts           # every claim
devz check purity kernel --claims scripts/checks/purity/manifest.ts    # one package
```

| Claim field | Meaning |
|---|---|
| `package` | Directory under `packages/`. The rows come from its `exports` map, one per runtime condition, so a sub-path added later is probed at once |
| `subpaths` | Claim only these sub-paths, as spelled in `exports`. Each must still exist |
| `external` | Third-party specifiers kept out of the bundle for one sub-path. A name that starts with the workspace scope is refused |
| `impure` | Sub-paths and conditions expected to fail. The waiver is exact: a waived entry that turns out pure fails as a stale waiver |

The scratch file goes to `.agents/local/tmp` under the folder you run in, never to the system temp. `@venizia/dev-configs/checks` also exports the engine functions (`buildManifest`, `probeEntry`, `checkPurity`) for a repository that wants them in its own tests. It is Bun-only tooling, so a browser entry must never import it.

### Checking browser purity

`devz check purity` is the gate behind `make purity` in IGNIS and ARDOR. The engine ships in `@venizia/dev-configs`; a repository supplies only its claims, in a module that exports `PURITY_CLAIMS`:

```typescript
// scripts/checks/purity/manifest.ts
import type { IPurityClaim, IPurityOptions } from '@venizia/dev-configs/checks';

export const PURITY_CLAIMS: IPurityClaim[] = [
  { package: 'inversion' },
  { package: 'helpers', subpaths: ['./core', './common'] },
  { package: 'connectors', impure: { './typesense': ['default'] } },
];

// Optional: every claimed sub-path must publish its runtime entry below this prefix.
export const PURITY_OPTIONS: IPurityOptions = { esmEntryPrefix: './dist/esm/' };
```

```bash
devz check purity --claims scripts/checks/purity/manifest.ts           # every claim
devz check purity kernel --claims scripts/checks/purity/manifest.ts    # one package
```

| Claim field | Meaning |
|---|---|
| `package` | Directory under `packages/`. The rows come from its `exports` map, one per runtime condition, so a sub-path added later is probed at once |
| `subpaths` | Claim only these sub-paths, as spelled in `exports`. Each must still exist |
| `external` | Third-party specifiers kept out of the bundle for one sub-path. A name that starts with the workspace scope is refused |
| `impure` | Sub-paths and conditions expected to fail. The waiver is exact: a waived entry that turns out pure fails as a stale waiver |

The scratch file goes to `.agents/local/tmp` under the folder you run in, never to the system temp. `@venizia/dev-configs/checks` also exports the engine functions (`buildManifest`, `probeEntry`, `checkPurity`) for a repository that wants them in its own tests. It is Bun-only tooling, so a browser entry must never import it.

In the IGNIS repository, the Makefile runs each package with its own tools:

| Command | What it does |
|---------|--------------|
| `make lint-<pkg>` | Lint one package by directory name, e.g. `make lint-kernel`: oxlint, ESLint, then a `bun fmt --check` |
| `make lint-fix-<pkg>` | Same tools with `--fix` and write mode |
| `make lint-packages` | Every package |
| `make lint-fix` | Fixes everything `lint-all` checks: every package, the files no package reaches, `scripts/` and `docs/wiki/scripts` (`fmt-files`, `fmt-scripts`, `fmt-wiki`) |
| `make lint-all` | Packages, `scripts/`, the files no package reaches and the wiki |
| `make lint-wiki` | Lint and format-check `docs/wiki/scripts` |

Packages carry no lint scripts of their own. Examples keep `lint` and `lint:fix` because they are templates you copy.

### A browser or React frontend

The presets so far target a backend. Code that runs in a browser swaps them for the browser tier, and a React app for the React tier, which builds on the browser one:

| File | Backend | Browser | React |
|---|---|---|---|
| `.configs/lints/oxlint.config.mts` | `oxlintConfigs` | `BrowserOxlintConfigs.create()` | `ReactOxlintConfigs.create()` |
| `.configs/lints/eslint.config.mjs` | `houseConfigs` | `houseConfigs` | `reactHouseConfigs` |
| `tsconfig.json` extends | `tsconfig.common.json` | `tsconfig.browser.json` | `tsconfig.react.json` |

A React app's lint files look like this. oxlint runs the React, hooks and accessibility rules natively, so there is no plugin to install:

```typescript
// .configs/lints/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { ReactOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig(ReactOxlintConfigs.create());
```

```typescript
// .configs/lints/eslint.config.mjs
import { reactNamingConventionConfigs } from '@venizia/dev-configs/linters';

export default reactNamingConventionConfigs;
```

The browser tier adds one rule to the backend preset:

| Adds | Setting |
|---|---|
| `no-restricted-properties` | bans `crypto.randomUUID`, which is `undefined` on a plain-http origin or in a WebView |
| `tsconfig.browser.json` | `moduleResolution: bundler`, the `DOM` lib, `types: []` so no Bun types reach `dist` |

The React tier adds these on top of the browser tier:

| Adds | Setting |
|---|---|
| React correctness (`jsx-key`, `no-children-prop`, ... - 13 rules) and `jsx-a11y` (15 rules) | `error`, `.jsx`/`.tsx` |
| `venizia/no-leaked-render` (ESLint, `reactHouseConfigs`) | `error`; `{count && <X />}` draws `0`, write `count ? <X /> : null` |
| `react/rules-of-hooks`, `react/exhaustive-deps` | `error`, every source file |
| `typescript/consistent-type-imports` | `['error', { prefer: 'type-imports' }]` |
| `naming-convention` (ESLint) | the base rule, plus PascalCase functions (`function App()`) on `.jsx`/`.tsx` |
| `tsconfig.react.json` | `jsx: react-jsx` |

Frontend code is held to the backend's standard: nothing in the base is relaxed, so a floating promise, a `void`, a use before declaration or a shadowed name fails the lint. An app that wants less overrides the rule after the preset:

```typescript
const base = ReactOxlintConfigs.create();

export default defineConfig({
  ...base,
  rules: { ...base.rules, 'typescript/no-floating-promises': 'warn' },
});
```

Generated or vendored paths go in `.configs/lints/.ignore` (see [Skipping paths](#skipping-paths-ignore)). The older in-config route still works for the linters: `ReactOxlintConfigs.create({ ignore })` turns every oxlint rule off for those paths, and `LintIgnore.eslint({ patterns })` is the ESLint entry; neither reaches `bun fmt`.

A project that stays on ESLint uses `ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } })` instead - the same rules, with the plugins passed in. The full tables are in the [package README](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/README.md).

## TypeScript Configuration

Use the centralized TypeScript configs:

**`tsconfig.json`:**
```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    },
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**What's Included:**

| Option | Value | Purpose |
|--------|-------|---------|
| `target` | `ES2025` | Modern JavaScript features |
| `experimentalDecorators` | `true` | Required for IGNIS decorators |
| `emitDecoratorMetadata` | `true` | Metadata reflection for DI |
| `useDefineForClassFields` | `false` | Decorator-compatible class fields |
| `strict` | `true` | Strict type checking |
| `skipLibCheck` | `true` | Faster compilation |
| `noEmitOnError` | `true` | A type error emits nothing - the build fails loudly |

Every package in the monorepo pins **TypeScript `^6.0.3`**; `@venizia/dev-configs` accepts
`^5.0.0 || ^6.0.0`. Do not upgrade past 6 - `typescript-eslint` breaks. oxlint's type-aware engine is built on TypeScript 7 and still works with a project on 6.

> [!WARNING]
> Bun ignores an `extends` that names a package, so none of the options above reach `bun run` or
> `bun test`. `tsc` follows the chain, so typecheck and build stay green and nothing reports it. In
> every `tsconfig.json` that Bun runs, restate `"experimentalDecorators": true` and
> `"useDefineForClassFields": false` in `compilerOptions`. Without them `@inject` parameter decorators
> are dropped silently, and class fields get other semantics than the `tsc` build.

## IDE Integration

### VS Code

**Recommended Extensions:**
- Oxc (`oxc.oxc-vscode`) - oxlint
- ESLint (`dbaeumer.vscode-eslint`) - the naming-convention rule only

**`.vscode/settings.json`:**
```json
{
  "oxc.configPath": ".configs/lints/oxlint.config.mts",
  "oxc.typeAware": true,
  "eslint.options": { "overrideConfigFile": ".configs/lints/eslint.config.mjs" },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

oxlint and ESLint do not look inside `.configs/` on their own, so the settings point at each file. The paths resolve against the folder VS Code opened: open the project folder itself. Format with `bun fmt` or `devz lint --fix`; the editor has no `bun fmt` hook of its own here.

### A raw oxlint call prints "typeAware ... only supported in the root config"

oxlint loads a config file it finds next to the files it lints (`oxlint.config.*`, `.oxlintrc.json`, `vite.config.*`), and it rejects `options.typeAware` in such a nested file:

```text
x The `options.typeAware` option is only supported in the root config, but it was found in <package>/.configs/lints/oxlint.config.mts.
```

The preset sets `typeAware`, and `.configs/lints/oxlint.config.mts` is the root config only when you hand it over. `make lint-*`, the pre-commit hook and `devz lint` always pass `-c`, so they never print this. A bare `oxlint packages/kernel` (or `oxlint .`) does. Pass the config, or turn the auto-loading off:

```bash
oxlint -c .configs/lints/oxlint.config.mts src          # the config as the root
oxlint --disable-nested-config packages/kernel          # no auto-loaded config at all
```

In VS Code the Oxc extension has the matching switch: `oxc.disableNestedConfig` (default `false`; when `true` only `oxc.configPath` is used), and setting `oxc.configPath`, as the settings above do, also stops the nested loading. Both are resource-scoped. Open the package folder, not the monorepo root, or set `oxc.configPath` per folder.

### WebStorm / IntelliJ

1. Go to **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**
2. Select "Manual ESLint configuration" and point it at `.configs/lints/eslint.config.mjs`
3. Run oxlint and `bun fmt` through the `lint` and `lint:fix` scripts, or install the Oxc plugin

## See Also

- [Naming Conventions](./naming-conventions) - File and class naming
- [Type Safety](./type-safety) - TypeScript best practices
