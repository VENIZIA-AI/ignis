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

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="New Feature" />

**In one line.** 0.4.4 fixes a secrets leak after a failed rotation, adds a datasource family for engines that only run SQL, and adds two codemods that clean up casts and string unions. Update the packages together; the rest needs no action.

## What changed

Each row links the entry with the details.

| Group | Change | Entry |
|---|---|---|
| Security | After a failed `onSecretRotated()` a datasource kept the rotated `user` and `password` in its settings when those keys were not there before. The restore now removes them | [Failed rotation left credentials in settings](/changelogs/2026-10-26-secret-rotation-failure-leaks-credentials) |
| Behavior change | `devz codemod model-settings --check` exits 1 while a model is left untouched, and reports `@model(options)` and aliased decorators | [devz codemod --check](/changelogs/2026-10-26-devz-codemod-check-fails-on-untouched) |
| Feature | `@venizia/ignis-connectors/raw-sql`: a datasource and repository base for an engine that runs SQL text and returns rows | [Raw SQL datasource](/changelogs/2026-10-26-raw-sql-datasource) |
| Feature | `devz codemod drop-redundant-casts` removes the `as X` casts the compiler no longer needs | [drop-redundant-casts](/changelogs/2026-10-26-devz-codemod-drop-redundant-casts) |
| Feature | `devz codemod const-classes` turns a string-literal union in an exported type into a const class | [const-classes](/changelogs/2026-10-26-devz-codemod-const-classes) |
| Fix | The `skipMigrate` warning names the right replacement for `false`; `enable` is optional on middleware options; `devz codemod` names a path it cannot read | [skipMigrate warning and middleware enable](/changelogs/2026-10-26-skip-migrate-warning-and-middleware-enable) |
| Docs | The package READMEs carry the Venizia credit, the root README is short, the licence files name Venizia Co., Ltd. | [READMEs, licences and company name](/changelogs/2026-10-26-readmes-license-and-company-name) |
| Docs | The wiki's claims were checked against the code | [Wiki claims checked](/changelogs/2026-10-26-wiki-claims-checked-against-the-code) |
| Docs | The wiki has a new look: header, ecosystem switcher, light and dark switch, home page, footer | [The wiki has a new look](/changelogs/2026-10-26-wiki-new-look) |

## Upgrade checklist

Do these in order.

1. **Update every `@venizia/*` package together** to 0.4.4. IGNIS packages pin each other exactly, so a partial update leaves two copies of a package.
2. **IGNIS 0.4.4 runs on Bun >= 1.4 and ships ESM only.**
3. **Optional: run the new codemods** when you want them. Both are dry runs until you pass `--write`:

```bash
bunx devz codemod drop-redundant-casts   # lists the casts the compiler no longer needs
bunx devz codemod const-classes          # lists the string unions it would turn into const classes
```

4. **If a script runs `devz codemod model-settings --check`**, it now fails while a model is left for you to fix by hand. Fix the model it names, or run the codemod with `--write`.
5. **`skipMigrate` still works.** It was announced for removal in 0.4.4; the removal moved to 0.4.5 and the boot warning says so. Write `migration: { use: false }` instead (`devz codemod model-settings --write` does it).
6. **Rotating secrets through Vault or calling `onSecretRotated()`?** Nothing to do: the leak is closed. Releases 0.2.0 to 0.4.3 had it, so check what logged or read the datasource settings after a failed rotation.

## Who is affected

- **Apps that rotate database credentials.** Step 6; the security entry says who should care.
- **Scripts that call `devz codemod --check`.** Step 4.
- **Apps with a model that still sets `skipMigrate`.** Step 5.
- **Everyone else.** Update the packages together; no other change is needed.
