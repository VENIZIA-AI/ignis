---
title: SoftDeletableRepository
description: Repository with soft-delete and restore operations using deletedAt timestamps
difficulty: intermediate
---

# SoftDeletableRepository

A repository that overrides delete operations to set a `deletedAt` timestamp instead of physically removing records. Extends `DefaultCRUDRepository` with restore capabilities.

**File:** `packages/core/src/connectors/postgres/repositories/core/soft-deletable.ts` (PostgreSQL connector - soft delete via `deletedAt` is a Drizzle/SQL-specific pattern, not part of the engine-neutral `AbstractRepository`)


## Setup

### 1. Define Model with Soft Delete

Use the `generateTzColumnDefs` enricher with the `deleted` option enabled to add a `deletedAt` column:

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
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
    ...generateTzColumnDefs({
      deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
    }),
    name: text('name').notNull(),
  });
}
```

> [!IMPORTANT]
> - The model **must** have a `deletedAt` column (`Date | null`). The `SoftDeletableRepository` requires `TSoftDeletableTableSchema` which enforces `{ deletedAt: AnyPgColumn<{ data: Date | null }> }`.
> - Set `defaultFilter: { where: { deletedAt: null } }` in `@model` settings so soft-deleted records are excluded by default.
> - Optionally add `deletedAt` to `hiddenProperties` to hide it from API responses.
> - Use `generateTzColumnDefs` with `deleted: { enable: true, ... }` to add the column, or define it manually with `timestamp('deleted_at', { mode: 'date', withTimezone: true })`.

### 2. Create Repository

```typescript
import { repository, SoftDeletableRepository } from '@venizia/ignis';
import { Category } from '@/models/category.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: Category, dataSource: PostgresDataSource })
export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}
```


## Delete Operations

All delete methods set `deletedAt = new Date()` instead of removing the row. They internally call the corresponding `update` method (`updateById` or `updateAll`).

### deleteById

```typescript
// Soft delete - sets deletedAt timestamp
const result = await repository.deleteById({ id: '123' });
// { count: 1, data: { id: '123', name: 'Electronics', deletedAt: '2026-03-06T...' } }

// Without returning data
const result = await repository.deleteById({
  id: '123',
  options: { shouldReturn: false },
});

// Hard delete - physically removes the row
const result = await repository.deleteById({
  id: '123',
  options: { shouldHardDelete: true },
});
```

### deleteAll

```typescript
// Soft delete all matching records
const result = await repository.deleteAll({
  where: { status: 'archived' },
  options: { force: true },
});

// Hard delete all matching records
const result = await repository.deleteAll({
  where: { status: 'archived' },
  options: { shouldHardDelete: true, force: true },
});
```

### deleteBy

```typescript
// Soft delete by where condition (alias for deleteAll)
const result = await repository.deleteBy({
  where: { name: 'Obsolete' },
});

// Hard delete by where condition
const result = await repository.deleteBy({
  where: { name: 'Obsolete' },
  options: { shouldHardDelete: true },
});
```


## Restore Operations

Restore methods set `deletedAt = null` and automatically use `shouldSkipDefaultFilter: true` to find soft-deleted records.

### restoreById

```typescript
const result = await repository.restoreById({ id: '123' });
// { count: 1, data: { id: '123', name: 'Electronics', deletedAt: null } }

// Without returning data
const result = await repository.restoreById({
  id: '123',
  options: { shouldReturn: false },
});
```

### restoreAll

```typescript
// Restore all soft-deleted records (requires force for empty where)
const result = await repository.restoreAll({
  where: {},
  options: { force: true },
});

// Restore matching records
const result = await repository.restoreAll({
  where: { name: 'Electronics' },
});
```

### restoreBy

```typescript
// Alias for restoreAll
const result = await repository.restoreBy({
  where: { status: 'archived' },
});
```


## Read Operations

### findById with isStrict

`SoftDeletableRepository` overrides `findById` to support an `isStrict` option that throws a `404 Not Found` error when the record doesn't exist:

```typescript
// Returns null if not found (default)
const category = await repository.findById({ id: '123' });

// Throws 404 if not found
const category = await repository.findById({
  id: '123',
  options: { isStrict: true },
});
// Throws: [CategoryRepository][findById] Entity with id 123 not found (HTTP 404)
```

All other read operations (`find`, `findOne`, `count`, `existsWith`) work as normal. The default filter (`{ deletedAt: null }`) automatically excludes soft-deleted records. Use `shouldSkipDefaultFilter: true` to include them.


## Options Reference

### Delete Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldHardDelete` | `boolean` | `false` | Bypass soft delete and physically remove the row |
| `shouldReturn` | `boolean` | `true` | Return the updated/deleted record |
| `force` | `boolean` | `false` | Allow empty `where` condition (`deleteAll`/`deleteBy`) |
| `transaction` | `ITransaction` | - | Transaction context |
| `log` | `{ use: boolean; level?: TLogLevel }` | - | Enable operation logging |
| `shouldSkipDefaultFilter` | `boolean` | `false` | Bypass the default filter |

### Restore Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldReturn` | `boolean` | `true` | Return the restored record |
| `force` | `boolean` | `false` | Allow empty `where` condition (`restoreAll`) |
| `transaction` | `ITransaction` | - | Transaction context |

> [!NOTE]
> Restore operations automatically set `shouldSkipDefaultFilter: true` internally so they can find soft-deleted records that the default filter would normally hide. You do not need to set this yourself.


## How It Works

| Operation | SQL Behavior |
|-----------|-------------|
| `deleteById` | `UPDATE SET deletedAt = NOW() WHERE id = ?` (via `updateById`) |
| `deleteAll` / `deleteBy` | `UPDATE SET deletedAt = NOW() WHERE ...` (via `updateAll`) |
| `restoreById` | `UPDATE SET deletedAt = NULL WHERE id = ?` (via `updateById` with `shouldSkipDefaultFilter: true`) |
| `restoreAll` / `restoreBy` | `UPDATE SET deletedAt = NULL WHERE ...` (via `updateAll` with `shouldSkipDefaultFilter: true`) |
| `find` / `findOne` / `count` | Default filter automatically adds `WHERE deletedAt IS NULL` |
| `deleteById({ shouldHardDelete: true })` | `DELETE FROM ... WHERE id = ?` (delegates to parent `PersistableRepository`) |

> [!TIP]
> The `shouldHardDelete` option bypasses soft delete entirely and delegates to the parent `DefaultCRUDRepository`'s delete implementation, which performs a real SQL `DELETE`.


## With Transactions

```typescript
const tx = await this.dataSource.beginTransaction();
try {
  await this.categoryRepository.deleteById({ id: '123', options: { transaction: tx } });
  await this.auditRepository.create({
    data: { action: 'soft_delete', entityId: '123' },
    options: { transaction: tx },
  });
  await tx.commit();
} catch {
  await tx.rollback();
}
```


## Type Constraint

`SoftDeletableRepository` enforces that the schema includes a `deletedAt` column at the type level:

```typescript
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: AnyPgColumn<{ data: Date | null }>;
};

export class SoftDeletableRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  // ...
> extends DefaultCRUDRepository<EntitySchema, ...> { }
```

If your schema does not have a `deletedAt` column, you will get a TypeScript compilation error when extending `SoftDeletableRepository`.


## Class Hierarchy

```
AbstractRepository (engine-neutral, src/base)
  -> PostgresBaseRepository (connectors/postgres)
    -> ReadableRepository
      -> PersistableRepository
        -> DefaultCRUDRepository
          -> SoftDeletableRepository   <-- you are here
```


## Quick Reference

| Want to... | Code |
|------------|------|
| Soft delete by ID | `repository.deleteById({ id })` |
| Hard delete by ID | `repository.deleteById({ id, options: { shouldHardDelete: true } })` |
| Soft delete by condition | `repository.deleteAll({ where, options: { force: true } })` |
| Restore by ID | `repository.restoreById({ id })` |
| Restore by condition | `repository.restoreAll({ where })` |
| Find including deleted | `repository.find({ filter, options: { shouldSkipDefaultFilter: true } })` |
| Strict findById (404) | `repository.findById({ id, options: { isStrict: true } })` |


## Next Steps

- [Advanced Features](./advanced.md) - Transactions, hidden properties
- [Repository Mixins (Removed)](./mixins.md) - Where default-filter and fields-visibility behavior lives now
- [Repository Overview](./index.md) - Repository basics

## See Also

- **Related Concepts:**
  - [Repositories Overview](./index) - Core repository operations
  - [Default Filter](../filter-system/default-filter) - Automatic filtering
  - [Models](/guides/core-concepts/persistent/models) - Entity definitions with enrichers
