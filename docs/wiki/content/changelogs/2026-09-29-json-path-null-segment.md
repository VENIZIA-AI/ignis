---
title: A JSON-Path Segment Named null Now Reaches Its Key on Postgres
description: "Postgres JSON-path literals now quote every element, so a key named null (any case) is read as a key in where, order and update, instead of as SQL NULL."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-09-29

## A JSON-path segment named `null` reaches its key on Postgres

<Badge type="info" text="Bug Fix" />

**In one line.** On Postgres, a JSON key named `null` or `NULL` is now read as a key in `where`, `order` and update, not as SQL NULL.

## What changed

Postgres reads an unquoted `NULL` element of an array literal as SQL NULL, so a path such as `metadata.NULL` never reached the key. The path now renders every element quoted: `'{"meta","null"}'` instead of `'{meta,null}'`.

- `where: { 'metadata.NULL': 'b' }` returned no rows. It now returns the rows whose `NULL` key is `'b'`.
- `where: { 'metadata.NULL': null }` returned every row. It now returns only the rows with no `NULL` key.
- `order: ['metadata.NULL DESC']` sorted by nothing. It now sorts by the key's value.
- Updating `{ 'metadata.NULL': 'z' }` failed with `path element at position 1 is null`. It now writes the key.
- SQLite already quoted its path and is unchanged.

## Who is affected

- **Data with a JSON key named `null` in any case.** Filters, sorts and updates on that key now work on Postgres.
- **A test or log that asserts the exact rendered Postgres SQL** of a JSON-path key. The path literal is now quoted: `"orders"."metadata" #>> '{"tier"}'`. Update the expected string; the rows returned are unchanged.
- **Everyone else.** No action needed. Other segments, including array indexes (`items[0]` renders `'{"items","0"}'`), behave the same.
