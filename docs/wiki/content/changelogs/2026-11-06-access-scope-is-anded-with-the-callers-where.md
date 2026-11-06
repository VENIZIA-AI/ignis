---
title: The access scope is combined with the caller's where by AND
description: "The row scope of access.resolve is ANDed with the where of every read, count, update and delete, and of an include, whatever shape the scope has. A where can only narrow it."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The access scope is combined with the caller's where by AND

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** The row scope that `access.resolve` returns is now ANDed with the caller's `where` for every read, count, update, delete and included relation, whatever shape the scope has. A `where` can only narrow a scope.

## What changed

- **One composition.** Before, the scope was merged into the filter by key, and a scope written as a single value per column (`{ merchantId: 'm1' }`) could be replaced by a `where` on the same column. Scopes written with an operator (`inq`, `in`), an `or`, an `and` or a `through` were already combined by AND. All of them are ANDed now, in one place.
- **Tests.** Both engines (PGlite and libsql) run every scope shape against every `where` shape on the same columns, for `find`, `findOne`, `count`, `updateBy`, `deleteBy`, an include with a scope, and a `through` child.
- **The default filter is unchanged.** `query.filter` (soft delete, visibility) still merges by key, and a caller's value replaces the default's, as documented. It is resolved against the caller's filter first and the scope goes on last and outermost, so on a model that has both, the opt-out keeps working inside the scope.

## Who is affected

- **Models whose `resolve` returns one value per column.** Upgrade to this release; nothing to change in your code.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/relational/core/repositories/dialect/filter.ts` | connectors |
| `src/relational/core/repositories/core/base.ts` | connectors |
