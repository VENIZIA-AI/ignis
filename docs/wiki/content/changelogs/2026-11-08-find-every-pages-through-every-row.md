---
title: A repository reads every matching row, a page at a time
description: "repo.findEvery() is an async iterator that yields every row a filter matches as pages, one query per page, paging by primary key so inserts and deletes while it runs never shift the window."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-08

## A repository reads every matching row, a page at a time

<Badge type="tip" text="New Feature" />

**In one line.** `repo.findEvery()` yields every row that matches a filter, one page per iteration, without loading them all and without a growing offset.

## What changed

- **`findEvery({ filter, pageSize, options })` on relational repositories.** It is an async iterator that yields one page (an array of up to `pageSize` rows, 500 by default) per iteration. The last page may be shorter; an empty result yields no page.
- **It pages by primary key.** Each page reads the rows after the last `id` of the page before, in ascending `id` order. A row inserted or deleted while the loop runs does not shift the window: a smaller key is not visited, a larger one is, and no row comes twice.
- **It reads like `find`.** The default filter, the row scope and the hidden fields apply to every page, `options.transaction` is used for every page, and the type of a page follows `fields`.
- **Breaking out stops it.** After a `break`, `return` or throw in the loop, no further query is made.

```typescript
for await (const page of repo.findEvery({
  filter: { where: { status: 'ACTIVE' } },
  pageSize: 200,
})) {
  await exportRows(page);
}
```

## Who is affected

- **Applications that loop over `find` with a limit and an offset.** No action needed; `findEvery` can replace the loop.
- **Everyone else.** No action needed. The new method adds to the repository and changes nothing that exists.

## Details

- `order`, `limit`, `skip`, `offset` and `include` in the filter are refused with a 400: the key owns the order and the window. `where` and `fields` work; `id` is read for the cursor even when `fields` leaves it out, and is not returned then.
- `pageSize` is an integer from 1 to 10 000, and at most the model's `limit.max` (1000 unless the model sets it). Anything else is a 400.
- The model's `id` must be a single-column primary key and not a hidden property. A composite primary key is refused with a 400.
- Every refusal surfaces on the first iteration, not when `findEvery` is called.

| File | Package |
|------|---------|
| `src/relational/core/repositories/core/readable.ts` | connectors |
