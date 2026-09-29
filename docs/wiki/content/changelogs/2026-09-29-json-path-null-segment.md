---
title: A JSON-Path Segment Named null Now Reaches Its Key on Postgres
description: "Postgres JSON-path literals now quote every element, so a key named null (any case) is read as a key in where, order and update, instead of as SQL NULL."
---

# Changelog - 2026-09-29

## A JSON-path segment named `null` reaches its key on Postgres

<Badge type="info" text="Bug Fix" />

**In one line.** On Postgres, a JSON path now renders every element quoted - `'{"meta","null"}'` instead of `'{meta,null}'` - so a key named `null` or `NULL` is read as a key.

## What was wrong

Postgres reads an unquoted `NULL` element of an array literal as SQL NULL. A path such as `metadata.NULL` therefore never reached the key `NULL`:

| Call | Before | Now |
|---|---|---|
| `where: { 'metadata.NULL': 'b' }` | no rows | the rows whose `NULL` key is `'b'` |
| `where: { 'metadata.NULL': null }` | every row | only the rows with no `NULL` key |
| `order: ['metadata.NULL DESC']` | sorted by nothing (NULL for every row) | sorted by the key's value |
| update `{ 'metadata.NULL': 'z' }` | failed: `path element at position 1 is null` | writes the key |

SQLite already quoted its path (`'$."NULL"'`) and is unchanged.

## Who is affected

- **Data with a JSON key named `null` in any case.** Filters, sorts and updates on that key now work on Postgres.
- **A test or log line that asserts the exact rendered Postgres SQL** of a JSON-path key. The path literal is now quoted: `"orders"."metadata" #>> '{"tier"}'`. Update the expected string; the rows returned are unchanged.
- **Everyone else.** No action needed. Quoting changes nothing for any other segment, including array indexes (`items[0]` renders `'{"items","0"}'`).

## Migration

None.

**Files:** [`packages/connectors/src/relational/postgres/repositories/dialect/internal/json-path.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/dialect/internal/json-path.ts)
