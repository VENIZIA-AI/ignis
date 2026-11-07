---
title: An update that sets deletedAt is checked as an update and a delete
description: "On a soft-deletable repository, an update or upsert whose data sets deletedAt must satisfy both the UPDATE and the DELETE access scope. Setting it back to null is checked as an update, as restore is."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-09

## An update that sets deletedAt is checked as an update and a delete

<Badge type="info" text="Bug Fix" /> <Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** On a `SoftDeletableRepository`, an ordinary update that writes `deletedAt` now asks the access scope for both `UPDATE` and `DELETE`, and the row must satisfy both.

## What changed

- **Which calls.** `updateById`, `updateAll`, `updateBy`, `updateEach`, and the update branch of `upsert`, on Postgres and on SQLite.
- **Set means both scopes.** When the data sets `deletedAt` to any value but `null`, `access.resolve` is asked for `UPDATE` and for `DELETE`. The rows the call selects must match both scopes, and the values it writes (the other columns included) are checked against both. A `Date`, a string, `false`, `0` and an SQL expression all count as set.
- **Null means restore.** When the data sets `deletedAt` to `null`, `access.resolve` is asked for `UPDATE` alone, as `restoreById` and `restoreAll` are.
- **Every spelling.** The property name (`deletedAt`), the database column name (`deleted_at`) and a JSON path on the column are all read. A `deletedAt` left `undefined` is not written and changes nothing.
- **Data is read once.** The update reads each value of `data` once, into a copy that the check and the write both use.
- **Upsert refusal.** When an upsert's update branch sets `deletedAt` and the existing row is outside either scope, the call fails with the write-denied 403.
- **New repository methods: `resolveUpdateOperations`.** A protected method of `PersistableRelationalRepository` that returns the operations an update is checked against, with its type `TUpdateScopeOperations`. `SoftDeletableRelationalRepository` overrides it.

## Who is affected

- **Models whose `access.resolve` gives `UPDATE` and `DELETE` different scopes, or leaves one unresolved.** An update that writes `deletedAt` now reaches only the rows both scopes allow. A row outside either one is not changed (`count` is 0), and an upsert is refused with a 403. To soft-delete without the `UPDATE` scope, call `deleteById`, `deleteAll` or `deleteBy`.
- **Resolvers that return the same scope for every operation.** No action needed.
- **Repositories without soft delete** (`DefaultCRUDRepository`, `DefaultSqliteRepository`). No change: `deletedAt` is an ordinary column there.

## Breaking changes

> [!WARNING]
> An update that sets the soft-delete column, on a model whose `UPDATE` and `DELETE` scopes differ, changes fewer rows than before.

**Before:**

```typescript
// access.resolve was asked for UPDATE only; the row had to match the UPDATE scope.
await repository.updateById({ id, data: { deletedAt: new Date() } });
```

**After:**

```typescript
// access.resolve is asked for UPDATE and DELETE; the row must match both scopes.
// When a scope does not cover the row, the result is { count: 0 } and the row is unchanged.
await repository.updateById({ id, data: { deletedAt: new Date() } });

// A soft delete checked against the DELETE scope alone stays available:
await repository.deleteById({ id });
```

## Details

```typescript
// access.resolve: ({ operation }) => operation === ScopeOperations.DELETE ? null : { merchantId }
await repository.updateById({ id, data: { name: 'Lamp' } }); // UPDATE: count 1
await repository.updateById({ id, data: { deletedAt: new Date() } }); // UPDATE and DELETE: count 0, row unchanged
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
