---
title: A repository pages through every matching row
description: "repo.findEvery() is an async iterator that visits every row a filter matches, one query per page, paging by primary key so inserts and deletes while it runs never shift the window."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-08

## A repository pages through every matching row

<Badge type="tip" text="New Feature" />

**In one line.** `repo.findEvery()` visits every row that matches a filter, a page at a time, without loading them all and without a growing offset.

## What changed

- **`findEvery({ filter, pageSize, options })` on relational repositories.** It is an async iterator that yields one row at a time and reads `pageSize` rows per query (500 by default).
- **It pages by primary key.** Each page starts after the last `id` of the one before, in ascending `id` order. A row inserted or deleted while the loop runs does not shift the window: a smaller key is not visited, a larger one is, and no row comes twice.
- **It reads like `find`.** The default filter, the row scope and the hidden fields apply to every page, and `options.transaction` is used for every page.
- **Breaking out stops it.** After a `break` or `return` no further query is made.

```typescript
for await (const user of repo.findEvery({
  filter: { where: { status: 'ACTIVE' } },
  pageSize: 200,
})) {
  await exportRow(user);
}
```

## Who is affected

- **Applications that loop over `find` with a limit and an offset.** No action needed; `findEvery` can replace the loop.
- **Everyone else.** No action needed. The new method adds to the repository and changes nothing that exists.

## Details

- `order`, `limit`, `skip`, `offset` and `include` are refused with a 400: the key owns the order and the window. `where` and `fields` work; `id` is read for the cursor even when `fields` leaves it out, and is not returned then.
- `pageSize` is a positive integer, at most 10 000 and at most the model's `limit.max`.
- The model's `id` must be a single-column primary key and not a hidden property. A composite primary key is refused with a 400.

| File | Package |
|------|---------|
| `src/relational/core/repositories/core/readable.ts` | connectors |
