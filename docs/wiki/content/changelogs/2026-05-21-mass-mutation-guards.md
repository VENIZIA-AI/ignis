---
title: Mass Update/Delete Guards - Blank Id & Empty Where
description: Persistable repository now rejects null/undefined ids and where clauses that resolve to no SQL condition, preventing accidental table-wide mutations
---

# Changelog - 2026-05-21

## Mass Update/Delete Guards

`PersistableRepository` now blocks two ways an update/delete could silently run against an entire table. The first is a `null`/`undefined` id on `updateById`/`deleteById`. The second is a `where` that resolves to **no SQL condition** on the bulk operations. Both previously slipped past the empty-where check.

## Overview

- **`validateId` guard**: `updateById`/`deleteById` throw on a `null`/`undefined` id before touching the database (falsy-but-valid ids like `0` and `''` are allowed)
- **Resolved-SQL emptiness**: `validateWhereCondition` now decides emptiness from the **resolved SQL condition** instead of `lodash.isEmpty(where)`
- **Covers all bulk ops**: `updateAll`, `updateBy`, `deleteAll`, `deleteBy` are all protected
- **`force` still works**: intentional table-wide mutations remain possible with `force: true`

## Security Fixes

### Blank id turns `updateById`/`deleteById` into a table-wide mutation

**Vulnerability:** `updateById`/`deleteById` build `where: { id }`. With `id === undefined`, the where is `{ id: undefined }` - which is **not** empty (`isEmpty({ id: undefined })` is `false`). The existing empty-where guard passed anyway. The filter builder then drops the `undefined` value, leaving **no `WHERE` clause** - and the update/delete ran against every row.

**Fix:** A `validateId` guard rejects `null`/`undefined` ids before execution.

**File:** `packages/core-server/src/base/repositories/core/persistable.ts`

```typescript
/** Guards id-based operations against a null/undefined id */
protected validateId(opts: { id: unknown; operationName: string }): void {
  if (opts.id !== null && opts.id !== undefined) {
    return;
  }
  throw getError({
    message: `[${opts.operationName}] DENY to perform | entity: ${this.entity.name} | id is null or undefined`,
  });
}
```

Wired into both id-based operations:
```typescript
this.validateId({ id: opts.id, operationName: 'updateById' });
// ...
this.validateId({ id: opts.id, operationName: 'deleteById' });
```

> [!NOTE]
> Only `null`/`undefined` are rejected. Falsy-but-valid ids such as `0` (numeric) and `''` (string) are still allowed - a naive `!id` check would have wrongly blocked them.

### All-undefined where bypasses the empty-where guard

**Vulnerability:** `validateWhereCondition` judged emptiness with `isEmpty(where)` on the object. A where like `{ status: undefined }` is a non-empty object, so it passed. Yet `toWhere` drops the undefined value, producing no `WHERE` clause and a table-wide `updateAll`/`deleteAll`.

**Fix:** Emptiness is now derived from the **resolved SQL condition**. If `toWhere(...)` produces `undefined` (no condition), the where is treated as empty. This covers `{}`, `{ status: undefined }`, `{ and: [] }`, and anything else that resolves to no predicate.

```typescript
protected validateWhereCondition(opts: {
  where: TWhere<DataObject>;
  force?: boolean;
  operationName: string;
}): boolean {
  const resolvedWhere = this.filterBuilder.toWhere({
    tableName: this.entity.name,
    schema: this.entity.schema,
    where: opts.where ?? {},
  });
  const isEmptyWhere = resolvedWhere === undefined;

  if (!opts.force && isEmptyWhere) {
    throw getError({
      message: `[${opts.operationName}] Entity: ${this.entity.name} | DENY to perform ${opts.operationName.replace('_', '')} | Empty where condition`,
    });
  }

  return isEmptyWhere;
}
```

Because the check now keys off the resolved SQL, `updateById`/`deleteById` with a blank id are also caught here as a second layer of defense.

## Behavior

| Operation | Input | Before | After |
|-----------|-------|--------|-------|
| `updateById` / `deleteById` | `id: undefined` / `null` | ran table-wide | throws |
| `updateById` / `deleteById` | `id: 0` / `''` | ran (correct) | ran (correct) |
| `updateAll` / `updateBy` / `deleteAll` / `deleteBy` | `where: {}` | throws (unless `force`) | throws (unless `force`) |
| `updateAll` / `updateBy` / `deleteAll` / `deleteBy` | `where: { x: undefined }` | ran table-wide | throws (unless `force`) |
| any bulk op | `force: true` | mass mutation | mass mutation (unchanged) |

## Files Changed

### Core Package (`packages/core-server`)

| File | Changes |
|------|---------|
| `src/base/repositories/core/persistable.ts` | Added `validateId`; `validateWhereCondition` now resolves the where to SQL and treats a missing condition as empty; `validateId` wired into `updateById`/`deleteById`; removed unused `lodash/isEmpty` import |

## No Breaking Changes

Legitimate operations are unaffected - well-formed ids and non-empty wheres behave exactly as before, and `force: true` still permits intentional table-wide mutations. Only previously-dangerous calls (blank id, all-undefined where) now fail fast.
