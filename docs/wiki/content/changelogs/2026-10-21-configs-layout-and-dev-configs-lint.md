---
title: One Lint Command, .configs Split by Job, and a Library Preset
description: "devz lint replaces each project's lint script, .configs splits into lints, formatters and builders with a .ignore each, and vulcan add --preset ignis --lib creates a shared library."
packages: ['@venizia/dev-configs', '@venizia/ignis']
---

# Changelog - 2026-10-21

## One lint command, `.configs` split by job, and a library preset

<Badge type="tip" text="Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Lint with `devz lint`, keep each tool's settings in its own `.configs/` folder, and create a shared library with `vulcan add --preset ignis --lib <name>`.

```
my-app/
├── .configs/
│   ├── lints/        oxlint.config.mts  eslint.config.mjs  .ignore
│   ├── formatters/   oxfmt.config.mts   .ignore
│   └── builders/     vite.config.mts  (or tsconfig.build.json, tsconfig.esm.json)
├── package.json      "lint": "devz lint", "lint:fix": "devz lint --fix"
└── tsconfig.json
```

## What changed

- **`devz lint [--fix] [files]`.** `@venizia/dev-configs` ships a `devz` command. It runs oxlint, ESLint, then oxfmt, and stops at the first tool that fails. With file paths it handles only those files, which is what a pre-commit hook passes. Files the tools do not handle (`.md`, `.json`) are dropped, and a listed file that a `.ignore` skips passes quietly.
- **`.configs/` is split by job.** Lint configs go in `.configs/lints/`, the oxfmt config in `.configs/formatters/`, and every other tsconfig and the bundler config in `.configs/builders/`. `tsconfig.json` is the only tsconfig left at the project root; `.configs/vulcan.config.mts` stays too.
- **A `.ignore` per folder.** `.configs/lints/.ignore` lists the paths oxlint and ESLint skip; `.configs/formatters/.ignore` the paths oxfmt skips. One gitignore-style pattern per line, relative to the project. `ignorePatterns` inside a `.configs/` file never worked.
- **The IGNIS preset has two kinds.** `vulcan add --preset ignis --app <name>` creates an API, as before. `vulcan add --preset ignis --lib <name>` creates a shared library: `exports` points at `src/index.ts`, `@venizia/ignis` is a peer, and its scripts are `typecheck`, `lint`, `lint:fix`, `test` and `clean`. Without `--app` or `--lib`, VULCAN asks in a terminal and refuses elsewhere.

## Who is affected

| You have | Do this |
|---|---|
| `"lint": "sh scripts/lint.sh"` | Change the scripts to `"lint": "devz lint"` and `"lint:fix": "devz lint --fix"`, then delete `scripts/lint.sh` |
| `.configs/oxlint.config.mts`, `.configs/eslint.config.mjs` | Move them to `.configs/lints/` |
| `.configs/oxfmt.config.mts` | Move it to `.configs/formatters/` |
| `.configs/vite.config.ts` | Move it to `.configs/builders/`, add one `../` to every path the config builds from `import.meta.url`, and pass `--config .configs/builders/vite.config.ts` to `vite` |
| `.configs/tsconfig.build.json`, `.configs/tsconfig.esm.json` | Move them to `.configs/builders/` and add one `../` to each relative path inside them |
| `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.test.json` at the root | Move them to `.configs/builders/`, prefix their paths with `../../` (`include`, `paths`, `tsBuildInfoFile`, `exclude`), and point the `references` of `tsconfig.json` at `./.configs/builders/...` |
| Paths to skip, in a config or on a lint command line | Put them in `.configs/lints/.ignore` and `.configs/formatters/.ignore` |
| An editor setting that points at a config, such as `oxc.configPath` | Point it at the new path |

`vulcan doctor` reports a config still left directly in `.configs/` and names the folder it belongs in.

## Migration

```bash
mkdir -p .configs/lints .configs/formatters
git mv .configs/oxlint.config.mts .configs/eslint.config.mjs .configs/lints/
git mv .configs/oxfmt.config.mts .configs/formatters/
git rm scripts/lint.sh
```

```json
{
  "scripts": {
    "lint": "devz lint",
    "lint:fix": "devz lint --fix"
  }
}
```

The full layout and the command table are in [Tooling Configuration](/best-practices/code-style-standards/tooling).
