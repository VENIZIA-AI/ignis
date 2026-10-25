---
title: The Deprecated Model Settings Keys Are Removed
description: "defaultFilter, defaultLimit, maxLimit and scopeFilter are gone from @model settings. A model that still uses one throws when the decorator runs. getScopeFilterSettings() is now getAccessSettings(). devz codemod model-settings rewrites the keys."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## The deprecated model settings keys are removed

<Badge type="warning" text="Breaking Change" />

**In one line.** 0.4.2 grouped `@model` settings under `query` and `access` and kept the flat keys with a warning. 0.4.3 removes the flat keys. A model that still uses one throws when the `@model` decorator runs, so no model can silently lose its row scope.

## What changed

- **The keys are removed** from `IModelSettings`: `defaultFilter`, `defaultLimit`, `maxLimit` and `scopeFilter` (with `scopeFilter.writeGuard` and `scopeFilter.sharedRows`). The types `IScopeFilterSettings`, `IDeprecatedModelSetting` and the `deprecatedSettings` metadata field go with them.
- **The decorator throws on an old key.** A plain-JavaScript or `any`-typed model gets no type error, and a model that dropped `scopeFilter` would run unscoped. So the decorator refuses it, listing every removed key it finds:

```text
[model][Product] Removed settings key(s): settings.defaultFilter (use settings.query.filter), settings.scopeFilter (use settings.access) | removed in 0.4.3 | run 'devz codemod model-settings' to rewrite them
```

- **The boot deprecation warning is gone**, with the code that normalised the old keys.
- **`getScopeFilterSettings()` is `getAccessSettings()`.** It is the repository method that returns the model's `access` settings, and the override point for stubs and test doubles. A subclass that overrides the old name no longer takes effect: rename the override.

## Migrate

One command rewrites the `settings` of every `@model({ ... })`:

```bash
bunx devz codemod model-settings --check   # lists the files that would change, exits 1 if any
bunx devz codemod model-settings           # rewrites them
bun fmt && bun run typecheck               # tidy the formatting, then check
```

| Old key | New key |
|---|---|
| `defaultFilter` | `query.filter` |
| `defaultLimit` | `query.limit.default` |
| `maxLimit` | `query.limit.max` |
| `scopeFilter` | `access` |
| `scopeFilter.writeGuard` | `access.write.mode` |
| `scopeFilter.sharedRows` | `access.write.sharedRows` |

The codemod prints, with file and line, any `settings` it cannot read for sure (a variable, a call, a spread) and leaves it alone; fix those by hand. See [Model Settings](/guides/core-concepts/persistent/model-settings) and [the 0.4.2 regrouping](/changelogs/2026-10-25-model-settings-query-access).

## Who is affected

- **Models that still use an old key.** They fail at boot with the message above. Run the codemod.
- **Code that overrides `getScopeFilterSettings()`** (test doubles, stubs). Rename it to `getAccessSettings()`.
- **Everyone else.** No action needed.
