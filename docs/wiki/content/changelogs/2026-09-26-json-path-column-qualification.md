---
title: JSON-Path Where and Order Keys Are Now Qualified With the Table
description: "A JSON-path filter or order key now renders qualified with its table or query alias, in Postgres and SQLite, so a query joining two tables that share a JSON column name no longer fails with an ambiguous-column error."
---

# Changelog - 2026-09-26

## JSON-path where and order keys are qualified

<Badge type="info" text="Bug Fix" />

**In one line.** A `where` or `order` key on a JSON/JSONB column now renders qualified with the table - or the query alias, on an included relation - exactly like a plain column already did, in both Postgres and SQLite.

## What changed

- **Postgres.** A JSON-path `where` (`#>>`) and `order` (`#>`) extraction now qualifies the column: `"orders"."metadata" #>> '{tier}'` instead of `"metadata" #>> '{tier}'`. The numeric-cast branch (`::numeric`) and a JSON path nested under `not` qualify the same way.
- **SQLite.** `json_extract` now takes the qualified column: `json_extract("orders"."metadata", '$."tier"')` instead of `json_extract("metadata", '$."tier"')`. A numeric path component that doubles the candidate reads still works - both extractions inside the `coalesce(...)` qualify.
- **The path segment is unchanged.** Only the column part renders differently; the validated path literal (`'{tier}'`, `'$."tier"'`) is exactly as before, and no new injection surface opens.

## Who is affected

- **A query that joins a second table with a same-named JSON column.** Before, Postgres rejected it with `column reference "metadata" is ambiguous` and SQLite with `SQLITE_ERROR: ambiguous column name: metadata`; it now runs on both. This is the defect this change fixes.
- **A test or a log line that asserts the exact rendered SQL string for a JSON-path filter or order key.** It now sees the table (or alias) prefix on that fragment. Update the expected string - the filter shape and the returned rows are unchanged.
- **A `FilterBuilder` subclass author.** The protected `buildJsonOperatorConditions` now receives `jsonPath`/`safeNumericCast` typed `string | SQL`, not `string`. An existing override still compiles either way (parameters are bivariant) and one that only forwards the value (to `super`, or straight into an operator function) keeps working, still qualified. But one still typed `string` that treats the value as text (`sql.raw(opts.jsonPath)`, or interpolating it into a template string) now receives an `SQL` object and emits `[object Object]` - the query then fails. Retype it to `string | SQL` and pass the value through instead of stringifying it.
- **Everyone else.** No action needed. The filter API, the rows returned, and their order are all unchanged.

## Migration

None. This is a defect fix with no public API change - a filter such as `{ 'metadata.tier': 'gold' }` is written exactly as before.

## See also

- [JSON/JSONB Filtering](/references/base/filter-system/json-filtering)
- [Fields, Order & Pagination](/references/base/filter-system/fields-order-pagination)
