---
title: IGNIS Lints with oxlint and Formats with oxfmt
description: "The IGNIS repository replaces Prettier and most of ESLint with oxlint and oxfmt, and @venizia/dev-configs gains matching exports. Nothing was removed from the package."
---

# Changelog - 2026-10-16

## IGNIS lints with oxlint and formats with oxfmt

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** `@venizia/dev-configs` **0.3.0** ships oxlint and oxfmt configs next to the ESLint and Prettier ones, and the IGNIS repository uses them. It is the only package released for this change.

```typescript
// .configs/oxlint.config.mts
import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters';

export default defineConfig(oxlintConfigs);
```

On `packages/kernel` (253 files), linting went from 8.16s to about 0.8s with type-aware rules on, and formatting from 2.16s to 0.06s.

## What changed

- **oxlint replaces ESLint for linting.** `oxlintConfigs` is a rule-for-rule port of the previous preset. Type-aware rules run through `oxlint-tsgolint`.
- **oxfmt replaces Prettier.** `oxfmtConfigs` holds the same seven options as `prettierConfigs`.
- **ESLint stays for one rule.** `@typescript-eslint/naming-convention` has no oxlint port yet, so `namingConventionConfigs` runs it alone.
- **Every project owns a `.configs/` folder.** It holds `oxlint.config.mts`, `oxfmt.config.mts` and `eslint.config.mjs`. Packages also keep `tsconfig.build.json` and `tsconfig.esm.json` there. `tsconfig.json` stays at the project root.
- **`eslintConfigs` is owned by IGNIS.** It no longer wraps `@minimaltech/eslint-node`. The rules live in `linters/eslint.ts` and resolve to the same config as before, rule for rule.
- **The TypeScript target is ES2025.** `tsconfig.base.json` and `tsconfig.common.json` move from ES2024 to ES2025, target and lib. The emitted JavaScript of every IGNIS package is unchanged; the gain is the ES2025 types (`Set` methods, iterator helpers, `Promise.try`).
- **New `@venizia/dev-configs` exports.** Subpaths `/compilers`, `/formatters` and `/linters`, plus one class per rule (see the table below).

| New export | From | Use |
|------------|------|-----|
| `oxlintConfigs` | `/linters` | The oxlint rules |
| `namingConventionConfigs` | `/linters` | ESLint config with the naming-convention rule only |
| `EqeqeqRule`, `NoUnusedVarsRule`, `SwitchCaseBracesRule`, `NoRestrictedImportsRule`, `PreferNullishCoalescingRule`, `NamingConventionRule` | `/linters` | Rebuild one rule with `build()` to customize it |
| `ReactOxlintConfigs` | `/linters` | The React preset for oxlint, as strict as the backend preset |
| `reactNamingConventionConfigs` | `/linters` | The naming rule for a React project (PascalCase components) |
| `NoRestrictedPropertiesRule` | `/linters` | Bans `crypto.randomUUID`, which a plain-http origin does not have |
| `oxfmtConfigs` | `/formatters` | The oxfmt options |

## Who is affected

- **Contributors to the IGNIS repository.** Use the new commands below. The `.prettierrc.mjs`, `.prettierignore` and root `eslint.config.mjs` files are gone.
- **Consumers of `@venizia/dev-configs`.** No lint action needed. `eslintConfigs`, `prettierConfigs`, `ReactEslintConfigs`, `BunCompiler` and the two tsconfig exports keep their shape, and the root import still re-exports everything.
- **Consumers of `ReactEslintConfigs`.** The preset no longer relaxes the base for a UI: `no-floating-promises`, `no-void`, `no-use-before-define`, `no-shadow` and `no-unused-vars` are errors again, `exhaustive-deps` is an error, and `crypto.randomUUID` is banned. Await or `.catch()` every promise a handler starts, and declare a component above its first use.
- **Consumers that extend `tsconfig.common.json`.** Your target becomes ES2025. Your runtime needs ES2025 support (Bun 1.4 and Node 24 have it); a bundler that rejects ES2025 needs its own target, as the IGNIS wiki does for esbuild.
- **Consumers who want the faster tools.** Switch with the steps below.

## For contributors

| Command | What it does |
|---------|--------------|
| `make lint-<pkg>` | oxlint, ESLint and an oxfmt check for one package, e.g. `make lint-kernel` |
| `make fmt-<pkg>` | The same with fixes applied |
| `make lint-packages` / `make fmt` | Every package |
| `make lint-all` | Packages, examples, example typecheck and `scripts/` |
| `make build` / `make rebuild` / `make clean` / `make typecheck` | Inside a package: build, type-check then clean then build, clean, type-check |
| `make <pkg>` | From the root: rebuild one package after its dependencies, as before |

Each package now has a two-to-four-line `Makefile` that includes the shared `make/project.mk`. Its `package.json` keeps only `force-update`, `prepublishOnly` (`make rebuild`) and, for `atlas` and `boot`, `test`. The `scripts/build.sh`, `clean.sh` and `rebuild.sh` files are gone, and so are the `lint` and `prettier:*` scripts. Examples keep their own scripts, because you copy them.

Two things to know when you touch a build or lint config:

- Every tool call passes `-c .configs/<tool>.config.mts`. No tool finds that folder on its own.
- An `ignorePatterns` entry inside `.configs/` resolves against `.configs/`, so it matches nothing. `dist` and `node_modules` are skipped through `.gitignore`.

oxlint exits 0 when it finds only warnings, so every lint call passes `--deny-warnings`: a warning fails the build, as it did under ESLint.

## For consumers: switch to oxlint and oxfmt

1. Replace the tools:

   ```bash
   bun remove prettier
   bun add -d @venizia/dev-configs oxlint oxlint-tsgolint oxfmt eslint
   ```

2. Create `.configs/oxlint.config.mts`, `.configs/oxfmt.config.mts` and `.configs/eslint.config.mjs` with the three snippets in the [package README](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/README.md).
   Keep the ESLint config `.mjs`: ESLint loads a TypeScript config only through `jiti`, one more
   dependency. oxlint and oxfmt read their `.mts` configs on their own.
3. Update your scripts to pass `-c`:

   ```json
   {
     "lint": "oxlint -c .configs/oxlint.config.mts --deny-warnings && eslint -c .configs/eslint.config.mjs . && oxfmt -c .configs/oxfmt.config.mts --check \"**/*.{ts,tsx,mts,js,mjs}\"",
     "lint:fix": "oxlint -c .configs/oxlint.config.mts --fix && eslint -c .configs/eslint.config.mjs . --fix && oxfmt -c .configs/oxfmt.config.mts \"**/*.{ts,tsx,mts,js,mjs}\""
   }
   ```

4. Delete `.prettierrc.mjs`, `.prettierignore` and the old `eslint.config.mjs`.
5. Remove `"./*.config.*"` and `".prettierrc.*"` from your `tsconfig.json` `include`. Keep `tsconfig.json` at the root.
6. Run `lint:fix` once.

## Details

- **Format drift.** oxfmt breaks long union types with a leading `|` per line, where Prettier does not. Expect one round of reformatting.
- **Unused disable comments.** Drop `--report-unused-disable-directives`. oxlint does not run the naming-convention rule, so it would flag every naming disable comment as unused.
- **Stricter checks.** oxlint caught four real `no-unsafe-optional-chaining` bugs that ESLint missed: `(x?.y as T).z` still throws when `x` is undefined.
- **Not ported.** `prefer-optional-chain` (an oxlint nursery rule) and `no-invalid-this` (covered by `noImplicitThis`). `n/prefer-node-protocol` became `unicorn/prefer-node-protocol`.
- **Peer dependencies.** `oxlint` (>=1.88.0), `oxfmt` (>=0.73.0), and `oxlint-tsgolint` (>=7.0.2004) are new optional peers. `typescript-eslint` is a new dependency.
- **Upgrading the range.** 0.3.0 is a minor bump on a 0.x package, so a `^0.2.x` range does not reach it - write `^0.3.0`.
- **TypeScript.** `oxlint-tsgolint` is built on TypeScript 7 and works in a project on 6.
- **Build.** `tsc-alias` must read the root `tsconfig.json`, not a `.configs/` one, or `@/...` imports stay unrewritten in `dist`. `dev-configs` now compiles with target ES2024.

See [Tooling Configuration](/best-practices/code-style-standards/tooling) for the full setup and rule customization.

**Files:** [`packages/dev-configs/src/linters/oxlint.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/src/linters/oxlint.ts), [`packages/dev-configs/src/formatters/oxfmt.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/src/formatters/oxfmt.ts), [`packages/dev-configs/src/linters/eslint.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/src/linters/eslint.ts), [`Makefile`](https://github.com/VENIZIA-AI/ignis/blob/main/Makefile)
