---
title: SoftDeletableRepository
description: Repository with soft-delete and restore operations using deletedAt timestamps
difficulty: intermediate
---

# SoftDeletableRepository

A repository that overrides delete operations to set a `deletedAt` timestamp instead of physically removing records. Extends `DefaultCRUDRepository` with restore capabilities.

**File:** `packages/core/src/base/repositories/core/soft-deletable.ts`


## Setup

### 1. Define Model with Soft Delete

```typescript
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import {
  BaseEntity,
  model,
  generateIdColumnDefs,
  generateTzColumnDefs,
} from '@venizia/ignis';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['deletedAt'],
    defaultFilter: { where: { deletedAt: null } },
  },
})
export class Category extends BaseEntity<typeof Category.schema> {
  static override schema = pgTable('Category', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    name: text('name').notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
  });
}
```

> [!IMPORTANT]
> - The model **must** have a `deletedAt` column (`Date | null`).
> - Set `defaultFilter: { where: { deletedAt: null } }` so soft-deleted records are excluded by default.
> - Optionally add `deletedAt` to `hiddenProperties` to hide it from API responses.

### 2. Create Repository

```typescript
import { repository, SoftDeletableRepository } from '@venizia/ignis';
import { Category } from '@/models/category.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: Category, dataSource: PostgresDataSource })
export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}
```


## Delete Operations

All delete methods set `deletedAt = new Date()` instead of removing the row. They internally call the corresponding `update` method.

### deleteById

```typescript
// Soft delete — sets deletedAt timestamp
const result = await repo.deleteById({ id: '123' });
// { count: 1, data: { id: '123', name: 'Electronics', deletedAt: '2026-03-06T...' } }

// Hard delete — physically removes the row
const result = await repo.deleteById({
  id: '123',
  options: { shouldHardDelete: true },
});
```

### deleteAll

```typescript
// Soft delete all matching records
const result = await repo.deleteAll({
  where: { status: 'archived' },
  options: { force: true },
});

// Hard delete all matching records
const result = await repo.deleteAll({
  where: { status: 'archived' },
  options: { shouldHardDelete: true, force: true },
});
```

### deleteBy

```typescript
// Soft delete by where condition (requires non-empty where)
const result = await repo.deleteBy({
  where: { name: 'Obsolete' },
});
```


## Restore Operations

Restore methods set `deletedAt = null` and automatically use `shouldSkipDefaultFilter: true` to find soft-deleted records.

### restoreById

```typescript
const result = await repo.restoreById({ id: '123' });
// { count: 1, data: { id: '123', name: 'Electronics', deletedAt: null } }

// Without returning data
const result = await repo.restoreById({
  id: '123',
  options: { shouldReturn: false },
});
```

### restoreAll

```typescript
// Restore all soft-deleted records (requires force for empty where)
const result = await repo.restoreAll({
  where: {},
  options: { force: true },
});

// Restore matching records
const result = await repo.restoreAll({
  where: { name: 'Electronics' },
});
```

### restoreBy

```typescript
// Alias for restoreAll with required where
const result = await repo.restoreBy({
  where: { status: 'archived' },
});
```


## Read Operations

### findById with isStrict

`SoftDeletableRepository` overrides `findById` to support a `isStrict` option that throws a `404 Not Found` error when the record doesn't exist:

```typescript
// Returns null if not found (default)
const category = await repo.findById({ id: '123' });

// Throws 404 if not found
const category = await repo.findById({
  id: '123',
  options: { isStrict: true },
});
```


## Options Reference

### Delete Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldHardDelete` | `boolean` | `false` | Bypass soft delete and physically remove the row |
| `shouldReturn` | `boolean` | `true` | Return the updated/deleted record |
| `force` | `boolean` | `false` | Allow empty `where` condition (deleteAll/deleteBy) |
| `transaction` | `ITransaction` | — | Transaction context |

### Restore Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldReturn` | `boolean` | `true` | Return the restored record |
| `force` | `boolean` | `false` | Allow empty `where` condition (restoreAll) |
| `transaction` | `ITransaction` | — | Transaction context |


## How It Works

| Operation | Behavior |
|-----------|----------|
| `deleteById` | `UPDATE SET deletedAt = NOW() WHERE id = ?` |
| `deleteAll` | `UPDATE SET deletedAt = NOW() WHERE ...` |
| `restoreById` | `UPDATE SET deletedAt = NULL WHERE id = ?` (skips default filter) |
| `restoreAll` | `UPDATE SET deletedAt = NULL WHERE ...` (skips default filter) |
| `find` / `findOne` | Default filter automatically excludes `deletedAt IS NOT NULL` |

> [!TIP]
> Restore operations automatically set `shouldSkipDefaultFilter: true` so they can find soft-deleted records that would normally be hidden by the default filter.


## With Transactions

```typescript
const tx = await this.dataSource.beginTransaction();
try {
  await this.categoryRepo.deleteById({ id: '123', options: { transaction: tx } });
  await this.auditRepo.create({
    data: { action: 'soft_delete', entityId: '123' },
    options: { transaction: tx },
  });
  await tx.commit();
} catch {
  await tx.rollback();
}
```
