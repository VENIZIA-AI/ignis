---
title: JSON-Path Where and Order Keys Are Now Qualified With the Table
description: "A JSON-path filter or order key now renders qualified with its table or query alias, so a query joining two tables that share a JSON column name no longer fails with an ambiguous-column error."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-09-26

## JSON-path where and order keys are qualified

<Badge type="info" text="Bug Fix" />

**In one line.** A query that joins two tables sharing a JSON column name no longer fails with an ambiguous-column error, in both Postgres and SQLite.

## What changed

- **A `where` or `order` key on a JSON/JSONB column** now renders qualified with the table, or the query alias on an included relation, like a plain column already did.
- **Postgres** renders `"orders"."metadata" #>> '{tier}'` instead of `"metadata" #>> '{tier}'`. **SQLite** renders `json_extract("orders"."metadata", '$."tier"')`.
- **The path itself is unchanged.** Only the column part differs.

## Who is affected

- **A query that joins a second table with a same-named JSON column.** Before, Postgres rejected it with `column reference "metadata" is ambiguous` and SQLite with `SQLITE_ERROR: ambiguous column name: metadata`. It now runs.
- **A test or log that asserts the exact rendered SQL for a JSON-path filter or order key.** It now sees the table or alias prefix. Update the expected string; the rows returned are unchanged.
- **A `FilterBuilder` subclass author.** The protected `buildJsonOperatorConditions` now receives `jsonPath` and `safeNumericCast` typed `string | SQL`, not `string`. An override that only forwards the value keeps working. One that treats it as text (`sql.raw(opts.jsonPath)`, or interpolating it into a template string) now gets an `SQL` object, emits `[object Object]`, and the query fails. Retype it to `string | SQL` and pass the value through.
- **Everyone else.** No action needed. A filter such as `{ 'metadata.tier': 'gold' }` is written as before.

See [JSON/JSONB Filtering](/references/base/filter-system/json-filtering).
