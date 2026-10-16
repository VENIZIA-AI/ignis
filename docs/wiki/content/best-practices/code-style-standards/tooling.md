# Tooling Configuration

IGNIS lints with **oxlint**, formats with **oxfmt**, and keeps **ESLint** for one rule. All three read their settings from `@venizia/dev-configs`.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(oxlintConfigs);
```

> [!IMPORTANT]
> **Bun is the only package manager** - never npm, yarn, or pnpm. **Compile with `tsc` directly**,
> through a package script; never reach for `npx` or `bun x`.
>
> `bunx` is fine for running a one-off CLI that is not a project dependency. The `ignis-build-info`
> how-to runs `bunx ignis-build-info`.

## Installation

```bash
bun add -d @venizia/dev-configs oxlint oxlint-tsgolint oxfmt eslint typescript
```

| Tool | Job |
|------|-----|
| `oxlint` | Every lint rule except naming conventions |
| `oxlint-tsgolint` | Type-aware rules such as `no-floating-promises`. Install it next to `oxlint` |
| `oxfmt` | Formatting. Prettier-compatible output |
| `eslint` | Runs one rule: `@typescript-eslint/naming-convention`, which oxlint cannot run yet |
| `typescript` | Type checking and the build |

## The `.configs/` layout

Every project keeps its tool settings in a `.configs/` folder:

```
my-app/
├── .configs/
│   ├── oxlint.config.mts
│   ├── oxfmt.config.mts
│   └── eslint.config.mjs
├── src/
├── package.json
└── tsconfig.json
```

No tool finds `.configs/` on its own, so every call passes `-c`:

```bash
oxlint -c .configs/oxlint.config.mts
eslint -c .configs/eslint.config.mjs .
oxfmt -c .configs/oxfmt.config.mts --check "**/*.{ts,tsx,mts,js,mjs}"
```

`tsconfig.json` stays at the project root. Bun, the editor's TypeScript server and oxlint's type-aware engine only look for it there. Without it, Bun silently stops applying legacy decorators.

> [!NOTE]
> An `ignorePatterns` entry inside a `.configs/*` file resolves against `.configs/`, not the project, so it matches nothing. `dist` and `node_modules` are skipped through `.gitignore`. To skip another folder, pass `--ignore-pattern "folder/**"` on the command line.

## oxlint Configuration

oxlint catches common errors and enforces best practices. It is a rule-for-rule port of the previous ESLint preset, and it runs type-aware rules through `oxlint-tsgolint`.

**`.configs/oxlint.config.mts`:**
```typescript
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters';

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
} from '@venizia/dev-configs/linters';

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

## ESLint Configuration (naming conventions only)

oxlint has no port of `@typescript-eslint/naming-convention`, so ESLint runs that one rule.

**`.configs/eslint.config.mjs`:**
```typescript
import { namingConventionConfigs } from '@venizia/dev-configs/linters';

export default namingConventionConfigs;
```

To change the allowed names, build the rule with extra selectors. Extra selectors go last, so they win over a base selector they overlap:

```typescript
import {
  NamingConventionRule,
  namingConventionConfigs,
} from '@venizia/dev-configs/linters';

export default [
  ...namingConventionConfigs,
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

## oxfmt Configuration

Automatic code formatting eliminates style debates.

**`.configs/oxfmt.config.mts`:**
```typescript
import { defineConfig } from 'oxfmt';
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';

export default defineConfig(oxfmtConfigs);
```

**Default Settings:**

| Setting | Value | Description |
|---------|-------|-------------|
| `bracketSpacing` | `true` | `{ foo: bar }` |
| `singleQuote` | `true` | `'string'` (single quotes) |
| `printWidth` | `100` | Maximum line length |
| `tabWidth` | `2` | 2-space indentation |
| `trailingComma` | `'all'` | `[1, 2, 3,]` |
| `arrowParens` | `'avoid'` | `x => x` not `(x) => x` |
| `semi` | `true` | Semicolons required |

**Customization:**
```typescript
import { defineConfig } from 'oxfmt';
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';

export default defineConfig({
  ...oxfmtConfigs,
  printWidth: 120, // Override specific settings
});
```

## Running the tools

In an application, add scripts that pass `-c`:

```json
{
  "scripts": {
    "lint": "oxlint -c .configs/oxlint.config.mts --deny-warnings && eslint -c .configs/eslint.config.mjs . && oxfmt -c .configs/oxfmt.config.mts --check \"**/*.{ts,tsx,mts,js,mjs}\"",
    "lint:fix": "oxlint -c .configs/oxlint.config.mts --fix && eslint -c .configs/eslint.config.mjs . --fix && oxfmt -c .configs/oxfmt.config.mts \"**/*.{ts,tsx,mts,js,mjs}\""
  }
}
```

In the IGNIS repository, the Makefile runs each package with its own tools:

| Command | What it does |
|---------|--------------|
| `make lint-<pkg>` | Lint one package by directory name, e.g. `make lint-kernel`: oxlint, ESLint, then an oxfmt check |
| `make fmt-<pkg>` | Same tools with `--fix` and write mode |
| `make lint-packages` / `make fmt` | Every package |
| `make lint-all` | Packages, examples, example typecheck and `scripts/` |
| `make lint-wiki` | Lint and format-check `docs/wiki/scripts` |

Packages carry no lint scripts of their own. Examples keep `lint` and `lint:fix` because they are templates you copy.

### A React frontend

A React app swaps two of the three `.configs/` files for their React versions. oxlint runs the React, hooks and accessibility rules natively, so there is no plugin to install:

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { ReactOxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(ReactOxlintConfigs.create());
```

```typescript
// .configs/eslint.config.mjs
import { reactNamingConventionConfigs } from '@venizia/dev-configs/linters';

export default reactNamingConventionConfigs;
```

`.configs/oxfmt.config.mts` stays the same.

| Adds | Setting |
|---|---|
| React correctness (`jsx-key`, `no-children-prop`, ... - 13 rules) and `jsx-a11y` basics (9 rules) | `error`, `.jsx`/`.tsx` |
| `react/rules-of-hooks`, `react/exhaustive-deps` | `error`, every source file |
| `typescript/consistent-type-imports` | `['error', { prefer: 'type-imports' }]` |
| `no-restricted-properties` | bans `crypto.randomUUID`, which is `undefined` on a plain-http origin or in a WebView |
| `naming-convention` (ESLint) | the base rule, plus PascalCase functions (`function App()`) on `.jsx`/`.tsx` |

Frontend code is held to the backend's standard: nothing in the base is relaxed, so a floating promise, a `void`, a use before declaration or a shadowed name fails the lint. An app that wants less overrides the rule after the preset:

```typescript
const base = ReactOxlintConfigs.create();

export default defineConfig({
  ...base,
  rules: { ...base.rules, 'typescript/no-floating-promises': 'warn' },
});
```

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
    }
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
> Bun does not resolve `experimentalDecorators` / `emitDecoratorMetadata` through `extends`. In an
> **application** `tsconfig.json` that Bun executes, declare both flags directly in
> `compilerOptions`, or `@inject` parameter decorators are dropped silently and DI fails at boot.

## IDE Integration

### VS Code

**Recommended Extensions:**
- Oxc (`oxc.oxc-vscode`) - oxlint and oxfmt
- ESLint (`dbaeumer.vscode-eslint`) - the naming-convention rule only

**`.vscode/settings.json`:**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "oxc.configPath": ".configs/oxlint.config.mts",
  "oxc.fmt.configPath": ".configs/oxfmt.config.mts",
  "oxc.typeAware": true,
  "eslint.options": { "overrideConfigFile": ".configs/eslint.config.mjs" },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

The tools do not look inside `.configs/` on their own, so the settings point at each file. The paths resolve against the folder VS Code opened: open the project folder itself.

### WebStorm / IntelliJ

1. Go to **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**
2. Select "Manual ESLint configuration" and point it at `.configs/eslint.config.mjs`
3. Run oxlint and oxfmt through the `lint` and `lint:fix` scripts, or install the Oxc plugin

## See Also

- [Naming Conventions](./naming-conventions) - File and class naming
- [Type Safety](./type-safety) - TypeScript best practices
