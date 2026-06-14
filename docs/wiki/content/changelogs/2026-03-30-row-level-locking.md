---
title: Row-Level Locking (FOR UPDATE)
description: Add pessimistic row-level locking support to repository read operations via IExtraOptions
---

# Changelog - 2026-03-30

## Row-Level Locking (FOR UPDATE)

Repositories now support PostgreSQL row-level locking (`SELECT ... FOR UPDATE / FOR SHARE / etc.`) on all read operations via a new `lock` option in `IExtraOptions`.

## Overview

- **Row-level locking**: `find`, `findOne`, and `findById` accept `lock: { strength, config? }` in options
- **All PostgreSQL lock strengths**: `update`, `no key update`, `share`, `key share` via `LockStrengths` constant class
- **Wait behavior control**: `noWait` and `skipLocked` options for concurrent workloads
- **Safety validations**: Throws if used without a transaction or with Query API (include/fields)

## New Features

### `LockStrengths` Constant Class

**File:** `packages/core/src/base/repositories/common/constants.ts`

**Problem:** No way to express row-level locking in repository queries. Developers had to drop down to raw Drizzle connector access to use `SELECT ... FOR UPDATE`.

**Solution:** New `LockStrengths` class following the existing `TConstValue` pattern, plus `TLockConfig` and `TLockOptions` types on `IExtraOptions`.

```typescript
import { LockStrengths } from '@venizia/ignis';

// Basic FOR UPDATE within a transaction
const tx = await repo.beginTransaction();
try {
  const item = await repo.findOne({
    filter: { where: { id: '123' } },
    options: {
      transaction: tx,
      lock: { strength: LockStrengths.UPDATE },
    },
  });

  await repo.updateById({
    id: '123',
    data: { quantity: item.quantity - 1 },
    options: { transaction: tx },
  });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

**Benefits:**
- Type-safe lock strength via `TLockStrength` union type
- Consistent with existing `RepositoryOperationScopes`, `RelationTypes` patterns
- Zero overhead when not used - lock logic is skipped entirely

### Lock Wait Behavior

Control what happens when target rows are already locked by another transaction:

```typescript
// Skip already-locked rows (queue-style processing)
const pending = await repo.find({
  filter: { where: { status: 'pending' }, limit: 10 },
  options: {
    transaction: tx,
    lock: { strength: 'update', config: { skipLocked: true } },
  },
});

// Fail immediately if rows are locked (no waiting)
const item = await repo.findOne({
  filter: { where: { id: '123' } },
  options: {
    transaction: tx,
    lock: { strength: 'update', config: { noWait: true } },
  },
});
```

### All Lock Strengths

| Strength | SQL | Use Case |
|----------|-----|----------|
| `update` | `FOR UPDATE` | Exclusive lock for writes |
| `no key update` | `FOR NO KEY UPDATE` | Exclusive lock, allows concurrent `FOR KEY SHARE` |
| `share` | `FOR SHARE` | Shared read lock, prevents writes |
| `key share` | `FOR KEY SHARE` | Weakest lock, only prevents key changes |

### Safety Validations

```typescript
// Error: lock without transaction
await repo.findOne({
  filter: { where: { id: '123' } },
  options: { lock: { strength: 'update' } },
});
// Throws: "Row-level locking requires a transaction"

// Error: lock with include/fields (Query API)
await repo.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }],
  },
  options: {
    transaction: tx,
    lock: { strength: 'update' },
  },
});
// Throws: "Row-level locking is incompatible with Query API"
```

> [!NOTE]
> Row-level locking only works with the Drizzle Core API path. Queries that use `include` or `fields` route through the Drizzle Query API, which does not support `.for()`. Remove `include`/`fields` from the filter when using locks.

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/common/constants.ts` | Added `LockStrengths` class and `TLockStrength` type |
| `src/base/repositories/common/types.ts` | Added `TLockConfig`, `TLockOptions` types. Added `lock?` to `IExtraOptions` |
| `src/base/repositories/core/abstract.ts` | Added `validateLockOptions()` method |
| `src/base/repositories/core/readable.ts` | Applied `.for()` in `findWithCoreAPI()`. Added validation in `find()` and `findOne()` |

## No Breaking Changes

All changes are additive. The `lock` property on `IExtraOptions` is optional. Existing code requires no migration.
