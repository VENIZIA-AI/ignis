---
title: Filter Offset/Skip Bug Fix
description: A filter with offset now applies it, and queries without skip or offset no longer get an implicit offset of 0.
packages: ['@venizia/ignis']
---

# Changelog - 2026-03-06

## Filter Offset/Skip Bug Fix

**In one line.** `{ offset: 20 }` in a filter now works like `{ skip: 20 }`, and queries without either no longer carry a forced offset of 0.

## What changed

- **`offset` is honoured.** `FilterBuilder` used to read only `skip`, so `{ offset: 20 }` did nothing. Both now map to the SQL `OFFSET`. If both are given, `skip` wins.
- **No forced `0`.** `SkipSchema` and `OffsetSchema` no longer use `.default(0)`, so a query that does not paginate has no `OFFSET` clause.

## Who is affected

- **Code passing `offset` in filters.** It now takes effect.
- **Everyone else.** No action needed.
