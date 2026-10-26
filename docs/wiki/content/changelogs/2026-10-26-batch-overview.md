---
title: After 0.4.2 - What Changed and How to Upgrade
description: "Every change since 0.4.2 in one table, grouped by Security, Breaking, Behavior changes, Features, Fixes and Docs/tooling, with an ordered upgrade checklist: update the packages, run the codemod, review shared rows, then read the rest."
packages:
  [
    '@venizia/ignis-kernel',
    '@venizia/ignis-connectors',
    '@venizia/ignis-helpers',
    '@venizia/ignis-inversion',
    '@venizia/ignis',
    '@venizia/dev-configs',
  ]
---

# Changelog - 2026-10-26

## After 0.4.2: what changed and how to upgrade

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="warning" text="Behavior Change" />

**In one line.** X.Y.Z closes a security gap in how shared rows are written, removes the flat `@model` settings keys that 0.4.2 deprecated, and makes `devz codemod` a dry run. Run the codemod, review your shared rows, and the rest needs no action.

## What changed

Each row links the entry with the details.

| Group | Change | Entry |
|---|---|---|
| Security | A restricted caller could change or delete a shared row when `write.sharedRows` was `false`. Updates and deletes now leave shared rows out unless it is `true` | [Shared rows need sharedRows](/changelogs/2026-10-26-shared-rows-writes-need-shared-rows) |
| Breaking | `defaultFilter`, `defaultLimit`, `maxLimit` and `scopeFilter` are removed from `@model` settings and the decorator throws on them; `getScopeFilterSettings()` is `getAccessSettings()` | [Deprecated model settings keys removed](/changelogs/2026-10-26-remove-deprecated-model-settings) |
| Behavior change | `devz codemod model-settings` is a dry run unless you pass `--write`; `devz clean --help` no longer deletes | [devz codemod dry run](/changelogs/2026-10-26-devz-codemod-dry-run-by-default) |
| Behavior change | `@model` `type` is optional (`'view'` throws); `skipMigrate` is deprecated for `migration: { use }` and warns at boot | [type and migration settings](/changelogs/2026-10-26-model-type-and-migration-settings) |
| Behavior change | ESLint warns on a string-literal union in an exported type and on an `as X` cast. Never fails the lint | [dev-configs warnings](/changelogs/2026-10-26-dev-configs-warn-const-class-and-casts) |
| Behavior change | `release.ts --mode` rejects an unknown mode; temp folders stay in `.agents/local/tmp` | [Repository tooling](/changelogs/2026-10-26-repository-tooling) |
| Feature | String options in the kernel are const classes with `SCHEME_SET` and `isValid` | [Kernel](/changelogs/2026-10-26-kernel-string-domains-const-classes) |
| Feature | The same for connectors | [Connectors](/changelogs/2026-10-26-connectors-string-domains-const-classes) |
| Feature | The same for helpers, inversion and the server | [Helpers, inversion, server](/changelogs/2026-10-26-helpers-string-domains-const-classes) |
| Feature | The rule builder options of `@venizia/dev-configs` are const classes | [dev-configs rule options](/changelogs/2026-10-26-dev-configs-rule-options-const-classes) |
| Fix | `TSearchScopeResolver` is exported, so `defineSearchController` type-checks | [TSearchScopeResolver](/changelogs/2026-10-26-search-scope-type-export) |
| Fix | The release sweep includes every package that depends on a changed one | [Release sweep](/changelogs/2026-10-26-release-sweep-cascade) |
| Docs and tooling | Examples type-check in CI, `.gitignore` anchors `release/`, VULCAN 0.4.4 | [Repository tooling](/changelogs/2026-10-26-repository-tooling) |

## Upgrade checklist

Do these in order.

1. **Update every `@venizia/*` package together** to X.Y.Z. IGNIS packages pin each other exactly, so a partial update leaves two copies of a package.
2. **Run the codemod.** It rewrites the removed `@model` settings keys and `skipMigrate`:

```bash
bunx devz codemod model-settings           # dry run: lists the files, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bun fmt && bun run typecheck               # tidy the formatting, then check
```

3. **Fix what the codemod prints.** It leaves a `settings` value it cannot read for sure (a variable, a call, a spread) and names the file and line. Rename any override of `getScopeFilterSettings()` to `getAccessSettings()`.
4. **Review shared rows.** If a scoped model has rows with `null` in the scope column (for example `merchantId: null`) and `write.sharedRows` is `false`, a restricted caller can no longer update or delete them. Set `sharedRows: true` only if that caller should. A scope shape the guard cannot read makes deletes fail with 403 `scope_write_denied`, as updates already did.
5. **Remove `type: 'view'`** from any `@model`. Views were never supported and the decorator throws on it. `type: 'entity'` can be removed.
6. **Optional: act on the new lint warnings** when you touch the code. They never fail the lint.
7. **Maintainers who release:** the sweep now includes dependents, so `--dry-run` may list more packages; a bad `--mode` stops the script.

Coming from before 0.4.2? Also read [a CRUD write route no longer inherits a read-only authorize](/changelogs/2026-10-25-crud-write-routes-read-authorize) (`defineCrudController` refuses to boot when the controller-level `authorize` is read-only), [scopeFilter now holds writes to the scope](/changelogs/2026-10-25-scope-filter-write-guard) and [model settings under query and access](/changelogs/2026-10-25-model-settings-query-access).

## Who is affected

- **Models that use an old settings key or `skipMigrate`.** Run the codemod; the old keys throw at boot.
- **Scoped models with shared rows.** Step 4; the security entry has the exact scope shapes.
- **Everyone else.** The const classes keep their values and public types stay assignment-compatible; no action needed.
