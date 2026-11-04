---
title: updateEach gives each row its own data in one transaction
description: "The relational repository's updateEach takes a list of { id, data } and runs one update per row inside one transaction, with the default filter, row scope, hidden fields and audit stamps of updateById."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-04

## updateEach gives each row its own data in one transaction

<Badge type="tip" text="New Feature" />

**In one line.** `repo.updateEach({ rows: [{ id, data }, ...] })` sets N rows to N different values in one call and one transaction, without a raw `UPDATE ... FROM (VALUES ...)` that skips the audit stamps and the row scope.

## What changed

- **`updateEach({ rows, options? })`** on the relational `PersistableRepository`. Each row runs the way `updateById` does: the write guard, the default filter, the row scope, hidden fields in the result and the audit stamps (`modifiedAt`, `modifiedBy`).
- **One transaction.** Without `options.transaction` the repository opens one, commits at the end and rolls back on any error, so a refused payload or a failed statement writes nothing. With `options.transaction` it joins yours and never commits it.
- **Order and misses.** Rows apply in the order given and `data` comes back in that order. A row that matches nothing (missing, outside the scope, soft deleted) is `null` and adds 0 to `count`.
- **Edges.** Empty `rows` return `{ count: 0, data: [] }` with no transaction. `shouldReturn: false` returns `data: null`. A null `id` throws before that row is written.

## Who is affected

- **Callers that update many rows with different values.** Use `updateEach` instead of N `updateById` calls.
- **Everyone else.** No action needed. The method is on the relational repository only, so the search and remote repositories are unchanged.

## Details

```typescript
const { count, data } = await productRepository.updateEach({
  rows: [
    { id: 'p-1', data: { price: 120 } },
    { id: 'p-2', data: { price: 95 } },
  ],
});
```

It costs N statements in one transaction, not one statement. See [Repositories](/guides/core-concepts/persistent/repositories#different-data-for-each-row-with-updateeach).
