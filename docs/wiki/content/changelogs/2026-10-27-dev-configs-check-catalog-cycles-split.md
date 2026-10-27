---
title: devz check catalog, module-cycles and split-report Ship in dev-configs
description: "The catalog guard, the import-cycle list and the split report move from IGNIS's scripts into @venizia/dev-configs as devz check commands with options, so ARDOR and VULCAN stop keeping copies. The output is identical."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-27

## devz check catalog, module-cycles and split-report ship in dev-configs

<Badge type="tip" text="Enhancement" />

**In one line.** Three repository scripts that ARDOR and VULCAN kept their own copies of are now `devz check` commands. Nothing changes for an application. Ships in 0.4.4.

## What changed

- **`devz check catalog`.** Guards dependency ranges against the root `workspaces.catalog`. Options carry what differed between the copies: `--glob <pattern>` (more manifests), `--preset-prefix <prefix>` (a preset may use `catalog:` in its peers) and `--pinned <file>` (a manifest outside the workspace must equal the catalog's version). The report is the one `make catalog-check` printed.
- **`devz check module-cycles <dir> [--max <n>]`.** The import cycles of a built ES module folder.
- **`devz check split-report [--dist <dir>] [folder...]`.** The informational split report; `--dist` is `dist/esm` where a package publishes two builds and `dist` where it publishes one.
- **`@venizia/dev-configs/checks`** also exports `findCatalogProblems`, `ModuleGraph`, `runModuleCycles` and `SplitReport`.
- **Proof of identical output.** On one commit, `make catalog-check`, the cycle list of each of the eight packages and the split report of `packages/kernel` print the same bytes before and after; the full split report differs only in the file count of dev-configs, which gained the moved sources.

## Who is affected

Nobody who only uses IGNIS. A repository that copied the scripts can delete them; the usage is in [Running the tools](/best-practices/code-style-standards/tooling#running-the-tools).
