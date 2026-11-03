---
title: Mass Update/Delete Guards - Blank Id & Empty Where
description: Repositories now reject null/undefined ids and where clauses that resolve to no condition, which used to update or delete every row.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-21

## Mass Update/Delete Guards

**In one line.** `updateById`, `deleteById` and the bulk update and delete methods can no longer silently run against a whole table.

## What changed

- **Blank id.** `updateById` and `deleteById` now throw on a `null` or `undefined` id. Before, the filter builder dropped the undefined id, leaving no `WHERE` clause, and every row was changed. Falsy but valid ids such as `0` and `''` are still allowed.
- **Empty where.** `updateAll`, `updateBy`, `deleteAll` and `deleteBy` now throw when the `where` resolves to no SQL condition. This covers `{}`, `{ status: undefined }` and `{ and: [] }`. Before, `{ status: undefined }` passed the empty check and ran table-wide.
- **`force: true`.** Still permits an intentional table-wide mutation.

| Operation | Input | Before | After |
|-----------|-------|--------|-------|
| `updateById` / `deleteById` | `id: undefined` / `null` | ran table-wide | throws |
| `updateById` / `deleteById` | `id: 0` / `''` | ran | ran |
| `updateAll` / `updateBy` / `deleteAll` / `deleteBy` | `where: { x: undefined }` | ran table-wide | throws unless `force` |

## Who is affected

- **Code that passes a possibly-undefined id or where value.** These calls now fail fast instead of mutating every row.
- **Everyone else.** No action needed. Well-formed ids and non-empty wheres behave as before.
