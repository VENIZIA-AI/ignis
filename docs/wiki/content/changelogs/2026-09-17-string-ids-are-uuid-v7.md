---
title: String Ids Are UUID v7
description: "The default string primary key is now a time-ordered UUID v7: faster inserts, a smaller index and faster ordered paging."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-17

## The default string id is UUID v7

<Badge type="warning" text="Behavior" />

**In one line.** `generateIdColumnDefs({ id: { dataType: 'string' } })` now fills ids with `UuidV7Generator` from `@venizia/ignis-helpers` instead of `crypto.randomUUID()`, so ids sort in creation order.

## What changed

- **Faster writes and reads.** Measured on PGlite with 200k rows: inserts 11-36% faster, primary-key index 15 MB to 11 MB (27% smaller), and `ORDER BY id` paging about 2.5x faster. Generating one id is about 22 ns slower. Lookup by id is unchanged.
- **Runtimes.** Bun uses its native `Bun.randomUUIDv7`; a browser gets the same shape from `crypto.getRandomValues`, with a counter that keeps ids ordered inside one millisecond.
- **A `generator` you pass still wins.**

## Who is affected

- **Existing v4 ids stay as they are.** New v7 ids start with `01`, so they sort before most old ids. `ORDER BY id` is creation order only among v7 rows.
- **A v7 id reveals when the row was created.** Do not use a row id as a secret (share link, reset token); a v7 id has 62 random bits.
