---
title: An access scope the resolver built wrong is treated as unresolved
description: "A resolve that returns false, 0, an empty string, a list, an empty object or an object with an undefined value no longer leaves the model without a row scope. It is read as unresolved, so onMissing decides, deny by default."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-06

## An access scope the resolver built wrong is treated as unresolved

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `access.resolve` returns a `where`, `ScopeFilters.UNRESTRICTED` or nothing. Anything else, such as `false`, `0`, `''`, `[]`, `{}` or `{ merchantId: undefined }`, used to open reads and some writes; it is now an unresolved scope.

## What changed

- **One reading of the resolver.** The read path and the write guard read the result the same way. A usable scope is a non-empty object whose values are all defined (and whose `and` / `or` branches are too; an `and` with no branch restricts nothing, so it is not usable, while an empty `or` matches nothing and stays). `ScopeFilters.UNRESTRICTED` and `null` / `undefined` keep their meaning.
- **Unresolved follows `onMissing`.** With the default (`deny`) the call matches no row and a create is refused. A model that declared `onMissing: allow` keeps allowing it.
- **The common case.** `resolve: () => ({ merchantId: user.merchantId })` for a user without a `merchantId` is `{ merchantId: undefined }`: it no longer reads as "no scope".

## Who is affected

- **Models whose resolver can return one of those values for some callers.** Those callers now get no rows. Return `ScopeFilters.UNRESTRICTED` for a caller that must see everything.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/relational/core/repositories/common/scope-filter.ts` | connectors |
| `src/relational/core/repositories/common/scope-write-guard.ts` | connectors |
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
