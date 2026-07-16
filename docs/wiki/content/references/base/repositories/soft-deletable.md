---
title: SoftDeletableRepository
description: Repository with soft-delete and restore operations using deletedAt timestamps
difficulty: intermediate
---

# SoftDeletableRepository

Reference for `SoftDeletableRepository` - delete methods set a `deletedAt` timestamp instead of removing the row, with matching restore methods. For the common tasks, start with the [Repositories overview](/references/base/repositories/).

**Files:**

- [`packages/core/src/connectors/postgres/repositories/core/soft-deletable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/soft-deletable.ts) - `SoftDeletableRelationalRepository` - delete/restore overrides, `isStrict` findById
- [`packages/core/src/connectors/postgres/repositories/core/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/index.ts) - compatibility alias `SoftDeletableRepository`
- [`packages/core/src/connectors/postgres/models/enrichers/tz.enricher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/models/enrichers/tz.enricher.ts) - `generateTzColumnDefs` - adds the `deletedAt` column

## Setup

### 1. Define the model with a `deletedAt` column

Use the `generateTzColumnDefs` enricher with the `deleted` option enabled:

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
> - The model **must** have a `deletedAt` column. `SoftDeletableRepository` requires `TSoftDeletableTableSchema`, which enforces `{ deletedAt: AnyPgColumn<{ data: Date | string | null }> }`.
> - Set `defaultFilter: { where: { deletedAt: null } }` in `@model` settings so soft-deleted records are excluded by default.
> - Optionally add `deletedAt` to `hiddenProperties` to hide it from API responses.
> - Use `generateTzColumnDefs` with `deleted: { enable: true, ... }` to add the column, or define it manually with `timestamp('deleted_at', { mode: 'date', withTimezone: true })`.

### 2. Extend `SoftDeletableRepository`

```typescript
import { repository, SoftDeletableRepository } from '@venizia/ignis';
import { Category } from '@/models/category.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: Category, dataSource: PostgresDataSource })
export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}
```

## Delete Operations

- **Delete sets a timestamp, not a `DELETE`.** All delete methods set `deletedAt = new Date()` instead of removing the row - `deleteById` calls `updateById` internally, `deleteAll`/`deleteBy` call `updateAll`.
- **Bypass with `shouldHardDelete`.** Pass `options.shouldHardDelete: true` to skip soft delete and delegate to the parent's real `DELETE`.

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

`where` only needs `options.force: true` when it is empty - a non-empty condition never needs it.

```typescript
// Soft delete matching records - non-empty where, no force needed
const result = await repository.deleteAll({
  where: { status: 'archived' },
});

// Soft delete every row - empty where requires force
const result = await repository.deleteAll({
  where: {},
  options: { force: true },
});

// Hard delete matching records
const result = await repository.deleteAll({
  where: { status: 'archived' },
  options: { shouldHardDelete: true },
});
```

### deleteBy

Same behavior as `deleteAll`, but `where` is a required parameter instead of optional.

```typescript
// Soft delete by where condition
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

- **Restore clears the timestamp.** Restore methods set `deletedAt = null`.
- **Default filter is bypassed automatically.** They internally pass `shouldSkipDefaultFilter: true` so they can find the soft-deleted records the default filter would otherwise hide - you do not need to set this yourself.

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
// Restore all soft-deleted records (empty where requires force)
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
// Calls restoreAll internally
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

- **Everything else is inherited unchanged.** `find`, `findOne`, `count`, `existsWith` behave exactly as on `DefaultCRUDRepository`.
- **The default filter excludes soft-deleted rows.** `{ deletedAt: null }` is applied automatically - pass `options: { shouldSkipDefaultFilter: true }` to include them.

## Options Reference

### Delete Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldHardDelete` | `boolean` | `false` | Bypass soft delete and physically remove the row |
| `shouldReturn` | `boolean` | `true` | Return the updated/deleted record |
| `force` | `boolean` | `false` | Allow an empty `where` condition (`deleteAll`/`deleteBy`) |
| `transaction` | `ITransaction` | - | Transaction context |
| `log` | `{ use: boolean; level?: TLogLevel }` | - | Enable operation logging |
| `shouldSkipDefaultFilter` | `boolean` | `false` | Bypass the default filter |

### Restore Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldReturn` | `boolean` | `true` | Return the restored record |
| `force` | `boolean` | `false` | Allow an empty `where` condition (`restoreAll` only - `restoreById` has no `force` option) |
| `transaction` | `ITransaction` | - | Transaction context |

## How It Works

| Operation | SQL Behavior |
|-----------|-------------|
| `deleteById` | `UPDATE SET deletedAt = NOW() WHERE id = ?` (via `updateById`) |
| `deleteAll` / `deleteBy` | `UPDATE SET deletedAt = NOW() WHERE ...` (via `updateAll`) |
| `restoreById` | `UPDATE SET deletedAt = NULL WHERE id = ?` (with `shouldSkipDefaultFilter: true`) |
| `restoreAll` / `restoreBy` | `UPDATE SET deletedAt = NULL WHERE ...` (with `shouldSkipDefaultFilter: true`) |
| `find` / `findOne` / `count` | Default filter automatically adds `WHERE deletedAt IS NULL` |
| `deleteById({ shouldHardDelete: true })` | `DELETE FROM ... WHERE id = ?` (delegates to the parent repository) |

> [!TIP]
> `shouldHardDelete` bypasses soft delete entirely and delegates to the parent `DefaultCRUDRepository`'s delete implementation, which performs a real SQL `DELETE`.

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
} catch (error) {
  await tx.rollback();
  throw error;
}
```

## Type Constraint

`SoftDeletableRepository` enforces that the schema includes a `deletedAt` column at the type level:

```typescript
export type TDeletedAtColumn = AnyPgColumn<{ data: Date | string | null }>;

export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

export class SoftDeletableRelationalRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  // ...
> extends DefaultRelationalRepository<EntitySchema, ...> { }
```

If your schema does not have a `deletedAt` column, you get a TypeScript compilation error when extending `SoftDeletableRepository`.

## Class Hierarchy

`SoftDeletableRepository` is the friendly alias for `SoftDeletableRelationalRepository`, the last tier of the PostgreSQL repository chain:

```
AbstractRepository (engine-neutral, src/base)
  -> RelationalBaseRepository (PostgresBaseRepository)
    -> ReadableRelationalRepository (ReadableRepository)
      -> PersistableRelationalRepository (PersistableRepository)
        -> DefaultRelationalRepository (DefaultCRUDRepository)
          -> SoftDeletableRelationalRepository (SoftDeletableRepository)   <-- you are here
```

## Quick Reference

| Want to... | Code |
|------------|------|
| Soft delete by ID | `repository.deleteById({ id })` |
| Hard delete by ID | `repository.deleteById({ id, options: { shouldHardDelete: true } })` |
| Soft delete by condition | `repository.deleteAll({ where })` |
| Restore by ID | `repository.restoreById({ id })` |
| Restore by condition | `repository.restoreAll({ where })` |
| Find including deleted | `repository.find({ filter, options: { shouldSkipDefaultFilter: true } })` |
| Strict findById (404) | `repository.findById({ id, options: { isStrict: true } })` |

## See also

- [Repositories overview](/references/base/repositories/) - CRUD basics, common tasks
- [Advanced Features](./advanced) - transactions, hidden properties, performance
- [Repository Mixins (Removed)](./mixins) - where default-filter and fields-visibility behavior lives now
- [Default Filter](/references/base/filter-system/default-filter) - configuring `@model` default filters
- [Models - Full Reference](/references/base/models-reference) - `@model`, entity hierarchy, schema enrichers
