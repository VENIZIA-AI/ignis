---
title: An update that sets deletedAt is checked as a delete
description: "On a soft-deletable repository, an update or upsert whose data sets deletedAt is held to the DELETE access scope, so only a caller allowed to delete can soft-delete a row. Setting it back to null is checked as an update, as restore is."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-09

## An update that sets deletedAt is checked as a delete

<Badge type="info" text="Bug Fix" /> <Badge type="danger" text="Security" />

**In one line.** On a `SoftDeletableRepository`, writing `deletedAt` through an ordinary update now asks the access scope for `DELETE`, the same as `deleteById`.

## What changed

- **Which calls.** `updateById`, `updateAll`, `updateBy`, `updateEach`, and the update branch of `upsert`, on Postgres and on SQLite.
- **Set means delete.** When the data sets `deletedAt` to any value but `null`, `access.resolve` receives `DELETE`. Both the rows the call selects and the values it writes are held to the `DELETE` scope. A `Date`, a string, `false`, `0` and an SQL expression all count as set.
- **Null means restore.** When the data sets `deletedAt` to `null`, `access.resolve` receives `UPDATE`, as `restoreById` and `restoreAll` do.
- **Every spelling.** The property name (`deletedAt`), the database column name (`deleted_at`) and a JSON path on the column are all read. A `deletedAt` left `undefined` is not written and does not change the operation.
- **Upsert refusal.** When an upsert's update branch sets `deletedAt` and the existing row is outside the `DELETE` scope, the call fails with the write-denied 403, and its message names `delete`.

## Who is affected

- **Models whose `access.resolve` gives `DELETE` a narrower scope than `UPDATE`, or none.** An update that writes `deletedAt` now gets the `DELETE` scope. A row outside it is not changed (`count` is 0), and an upsert is refused with a 403. To soft-delete, call `deleteById`, `deleteAll` or `deleteBy` as a caller allowed to delete.
- **Resolvers that return the same scope for every operation.** No action needed.
- **Repositories without soft delete** (`DefaultCRUDRepository`, `DefaultSqliteRepository`). No change: `deletedAt` is an ordinary column there.

## Details

```typescript
// access.resolve: ({ operation }) => operation === ScopeOperations.DELETE ? null : { merchantId }
await repository.updateById({ id, data: { name: 'Lamp' } }); // UPDATE: count 1
await repository.updateById({ id, data: { deletedAt: new Date() } }); // DELETE: count 0, row unchanged
await repository.updateById({
  id,
  data: { deletedAt: null },
  options: { shouldSkipDefaultFilter: true },
}); // UPDATE: restored
```

| File | Package |
|------|---------|
| `src/relational/core/repositories/core/soft-deletable.ts` | connectors |
| `src/relational/core/repositories/core/persistable.ts` | connectors |
