---
title: skipMigrate Is Removed From @model
description: "The deprecated skipMigrate key of @model is gone; the decorator throws on it and names the replacement, migration: { use: false }."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-26

> [!NOTE]
> `devz codemod model-settings`, named on this page, was removed in `@venizia/dev-configs` 0.4.7-5; on that release or later it exits 2 as an unknown codemod. Run it from an earlier release, or move the keys by hand with the table in [the old @model keys are removed](/changelogs/2026-11-03-old-model-settings-keys-are-removed).

## skipMigrate is removed from @model

<Badge type="warning" text="Breaking Change" />

**In one line.** Write `migration: { use: false }` where you wrote `skipMigrate: true`. The old key was deprecated in 0.4.3 and warned at boot; in 0.4.4 the decorator throws on it. Ships in 0.4.4.

## What changed

- **The key is gone.** TypeScript rejects `skipMigrate`, and an untyped caller gets an error when the decorator runs: `skipMigrate was removed in 0.4.4 | write migration: { use: false } | run bunx devz codemod model-settings --write`. The class never registers.
- **The boot warning is gone.**
- **The registry entry has no `skipMigrate` field.** It carries `migration: { use }`; read that. A model that declares `migration` gets `use` filled in (`true` unless you wrote `false`).

## Who is affected

| You wrote | Now |
|---|---|
| `@model({ skipMigrate: true })` | Throws. Write `migration: { use: false }`. |
| `@model({ skipMigrate: false })` | Throws. Remove the key: `migration.use` is `true` by default. |
| `@model({ migration: { use: false } })` | Works, as before. |
| Tooling that reads `metadata.skipMigrate` from the registry | Reads `undefined`. Read `metadata.migration?.use !== false` instead. |

## Migrate

The codemod is a dry run until you pass `--write`:

```bash
bunx devz codemod model-settings           # lists the files it would change, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bun fmt && bun run typecheck               # tidy the formatting, then check
```

It rewrites `skipMigrate: true` to `migration: { use: false }` and removes `skipMigrate: false`. A value it cannot read for sure (a variable, a shorthand) is left in place and reported with its file and line; fix those by hand.
