---
title: After 0.4.3 - What Changed and How to Upgrade
description: "Every change since 0.4.3 in one table, grouped by Security, Behavior changes, Features, Fixes and Docs, with an ordered upgrade checklist: update the packages, then read the rest. IGNIS 0.4.4 runs on Bun >= 1.4 and ships ESM only."
packages:
  [
    '@venizia/dev-configs',
    '@venizia/ignis-inversion',
    '@venizia/ignis-filter',
    '@venizia/ignis-helpers',
    '@venizia/ignis-boot',
    '@venizia/ignis-kernel',
    '@venizia/ignis-connectors',
    '@venizia/ignis-worker',
    '@venizia/ignis',
  ]
---

# Changelog - 2026-10-26

## After 0.4.3: what changed and how to upgrade

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="New Feature" />

**In one line.** 0.4.4 fixes a secrets leak after a failed rotation, removes the deprecated `skipMigrate` key, adds a datasource family for engines that only run SQL, adds a test helper that proves an application boots without infrastructure, and adds two codemods that clean up casts and string unions. Update the packages together; the rest needs no action.

## What changed

Each row links the entry with the details.

| Group | Change | Entry |
|---|---|---|
| Security | After a failed `onSecretRotated()` a datasource kept the rotated `user` and `password` in its settings when those keys were not there before. The restore now removes them | [Failed rotation left credentials in settings](/changelogs/2026-10-26-secret-rotation-failure-leaks-credentials) |
| Breaking | `skipMigrate` is removed from `@model`; the decorator throws on it and names `migration: { use: false }`. `devz codemod model-settings` rewrites it | [skipMigrate is removed](/changelogs/2026-10-26-skipmigrate-removed) |
| Behavior change | `devz codemod model-settings --check` exits 1 while a model is left untouched, and reports `@model(options)` and aliased decorators | [devz codemod --check](/changelogs/2026-10-26-devz-codemod-check-fails-on-untouched) |
| Feature | `@venizia/ignis-connectors/raw-sql`: a datasource and repository base for an engine that runs SQL text and returns rows | [Raw SQL datasource](/changelogs/2026-10-26-raw-sql-datasource) |
| Feature | `@venizia/dev-configs/testing` adds `spawnSyncBounded` and `useRepoTmp`, and `@venizia/dev-configs/testing/tmpdir-preload` keeps a bare `bun test` out of the system temp | [dev-configs testing export](/changelogs/2026-10-27-dev-configs-testing-spawn-tmpdir) |
| Feature | `devz check purity --claims <file>` and the `@venizia/dev-configs/checks` export run the browser-purity gate from dev-configs, so a repository keeps only its claims | [devz check purity](/changelogs/2026-10-27-dev-configs-check-purity) |
| Feature | `assertApplicationBoots` in `@venizia/ignis/testing` runs an application's real boot with no database, port or network, on a shared `verifyBindings` check in `@venizia/ignis-inversion`. New apps get `src/boot.test.ts` | [assertApplicationBoots](/changelogs/2026-10-27-assert-application-boots) |
| Feature | `devz codemod drop-redundant-casts` removes the `as X` casts the compiler no longer needs | [drop-redundant-casts](/changelogs/2026-10-26-devz-codemod-drop-redundant-casts) |
| Feature | `devz codemod const-classes` turns a string-literal union in an exported type into a const class | [const-classes](/changelogs/2026-10-26-devz-codemod-const-classes) |
| Fix | `enable` is optional on middleware options; the middleware types say what is installed; `devz codemod` names a path it cannot read | [middleware enable and codemod empty path](/changelogs/2026-10-26-middleware-enable-optional-and-codemod-empty-path) |
| Docs | The package READMEs carry the Venizia credit, the root README is short, the licence files name Venizia Co., Ltd. | [READMEs, licences and company name](/changelogs/2026-10-26-readmes-license-and-company-name) |
| Docs | The wiki's claims were checked against the code | [Wiki claims checked](/changelogs/2026-10-26-wiki-claims-checked-against-the-code) |
| Docs | The wiki has a new look: header, ecosystem switcher, light and dark switch, home page, footer | [The wiki has a new look](/changelogs/2026-10-26-wiki-new-look) |

## Upgrade checklist

Do these in order.

1. **Update every `@venizia/*` package together** to 0.4.4. IGNIS packages pin each other exactly, so a partial update leaves two copies of a package.
2. **IGNIS 0.4.4 runs on Bun >= 1.4 and ships ESM only.**
3. **Replace `skipMigrate`.** The decorator throws on it now. The codemod writes `migration: { use: false }` for `skipMigrate: true` and removes `skipMigrate: false`:

```bash
bunx devz codemod model-settings           # dry run: lists the files, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bun fmt && bun run typecheck               # tidy the formatting, then check
```

4. **Fix what the codemod prints.** It leaves a value it cannot read for sure (a variable, a shorthand) and names the file and line. If a script runs `devz codemod model-settings --check`, it now fails while a model is left for you to fix by hand. Tooling that reads `metadata.skipMigrate` from the registry should read `metadata.migration?.use !== false`.
5. **Optional: run the new codemods** when you want them. Both are dry runs until you pass `--write`:

```bash
bunx devz codemod drop-redundant-casts   # lists the casts the compiler no longer needs
bunx devz codemod const-classes          # lists the string unions it would turn into const classes
```

6. **Optional: add the boot test** to an existing app. New apps created from the `ignis` preset already have `src/boot.test.ts`; an existing app copies it from [Prove the Application Boots](/guides/tutorials/testing#prove-the-application-boots).
7. **Rotating secrets through Vault or calling `onSecretRotated()`?** Nothing to do: the leak is closed. Releases 0.2.0 to 0.4.3 had it, so check what logged or read the datasource settings after a failed rotation.

## Who is affected

- **Apps that rotate database credentials.** Step 7; the security entry says who should care.
- **Scripts that call `devz codemod --check`.** Step 4.
- **Apps with a model that sets `skipMigrate`, or tooling that reads `metadata.skipMigrate`.** Step 3; the entry has the replacement.
- **Apps that want the boot test.** Step 6; the entry has the file.
- **Everyone else.** Update the packages together; no other change is needed.
