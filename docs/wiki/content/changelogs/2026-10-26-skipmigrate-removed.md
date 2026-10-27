---
title: skipMigrate Is Removed From @model
description: "The deprecated skipMigrate key of @model is gone. The decorator throws on it and names the replacement, migration: { use: false }. devz codemod model-settings rewrites it. Ships in 0.4.4."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-26

## skipMigrate is removed from @model

<Badge type="warning" text="Breaking Change" />

**In one line.** Write `migration: { use: false }` where you wrote `skipMigrate: true`. The old key was deprecated in 0.4.3 and warned at boot; in 0.4.4 the decorator throws on it. Ships in 0.4.4.

## What changed

- **The key is gone.** `skipMigrate` is no longer a key of `@model`, so TypeScript rejects it, and an untyped caller gets an error when the decorator runs: `skipMigrate was removed in 0.4.4 | write migration: { use: false } | run bunx devz codemod model-settings --write`. The class never registers.
- **The boot warning is gone.** There is nothing left to warn about.
- **The registry entry has no `skipMigrate` field.** It carries `migration: { use }`; read that. A model that declares `migration` gets `use` filled in (`true` unless you wrote `false`).

## Who is affected

| You wrote | Now |
|---|---|
| `@model({ skipMigrate: true })` | Throws. Write `migration: { use: false }`. |
| `@model({ skipMigrate: false })` | Throws. Remove the key: `migration.use` is `true` by default. |
| `@model({ migration: { use: false } })` | Works, as before. |
| Tooling that reads `metadata.skipMigrate` from the registry | Reads `undefined`. Read `metadata.migration?.use !== false` instead. |

## Migrate

Run the codemod that already converts it. It is a dry run until you pass `--write`:

```bash
bunx devz codemod model-settings           # lists the files it would change, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bun fmt && bun run typecheck               # tidy the formatting, then check
```

It rewrites `skipMigrate: true` to `migration: { use: false }` and removes `skipMigrate: false`. A value it cannot read for sure (a variable, a shorthand) is left in place and reported with its file and line; fix those by hand.
