---
title: String Ids Are UUID v7
description: "The default string primary key is now a time-ordered UUID v7: inserts 11-36% faster, a 27% smaller index, ordered paging ~2.5x faster."
---

# Changelog - 2026-09-17

## The default string id is UUID v7

<Badge type="warning" text="Behavior" />

`generateIdColumnDefs({ id: { dataType: 'string' } })` filled ids with `crypto.randomUUID()` (v4,
fully random). It now uses `UuidV7Generator` from `@venizia/ignis-helpers`: the first 48 bits are the
creation time in milliseconds, so ids sort as text in creation order.

```text
v4  e6911088-8524-4b57-9fe6-2acaec5e0be4   random everywhere
v7  01a0affa-991a-716e-b520-12c39bcddbf1   01a0affa991a = creation ms
```

Measured on PGlite, 200k rows, `id text PRIMARY KEY`:

| | v4 | v7 |
|---|---|---|
| Generate one id | 55-59 ns | 77-80 ns |
| Insert 200k rows | 913-1030 ms | **663-812 ms** |
| Primary-key index | 15 MB | **11 MB** |
| Lookup by id (2000) | 160-174 ms | 165-189 ms |
| `ORDER BY id` paging (200 pages) | 2596-2633 ms | **932-1083 ms** |

A random id lands anywhere in the B-tree and splits pages; a time-ordered one appends. Generating
is ~22 ns slower (reading the clock costs ~26 ns on its own), paid back many times over at insert.

- Bun uses its native `Bun.randomUUIDv7` (monotonic); a browser gets the same shape from
  `crypto.getRandomValues`, with a counter that keeps ids ordered inside one millisecond.
- A `generator` you pass still wins.
- **Existing v4 ids stay as they are.** New v7 ids start with `01`, so they sort before most old ids -
  `ORDER BY id` is creation order only among v7 rows.
- **A v7 id reveals when the row was created.** Do not use a row id as a secret (share link, reset
  token); keep 62 random bits in mind if you do.
