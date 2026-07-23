---
title: Repositories
description: The typed data-access object for one model - CRUD, filters, and transactions without hand-written SQL
difficulty: intermediate
---

# Repositories

A repository is the typed data-access object for one model - it turns a `@model` schema into `find`, `create`, `updateById`, `deleteById`, and friends, with the query shape validated at compile time.

## In one example

The smallest real repository: bind a model and a datasource, extend `DefaultCRUDRepository`.

```typescript
import { repository, DefaultCRUDRepository } from '@venizia/ignis';
import { User } from '../models/user.model';
import { PostgresDataSource } from '../datasources/postgres.datasource';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

That's it - `UserRepository` already has `find`, `findOne`, `findById`, `create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll`, `count`, and `existsWith`.

## How it works

- **Engine-neutral contract, PostgreSQL implementation.** `AbstractRepository` (engine-neutral, `src/base`) declares the CRUD contract - no SQL, no Drizzle. The PostgreSQL connector implements it as a chain of classes, each layer adding one capability (see table below).
- **Datasource is auto-injected.** `@repository({ model, dataSource })` auto-injects the datasource at constructor param[0] and lazily resolves the entity class from its own metadata - a plain `extends DefaultCRUDRepository<...> {}` needs no constructor at all.
- **One options object per verb.** Reads and updates carry a `filter` (`where`, `fields`, `include`, `order`, `limit`, `offset`); writes carry `data`; all of them accept an `options` bag for `transaction`, `shouldReturn`, and `shouldSkipDefaultFilter`.

**PostgreSQL class chain**

| Class | Alias | Adds |
|---|---|---|
| `RelationalBaseRepository` | `PostgresBaseRepository` | `FilterBuilder`/`UpdateBuilder`, hidden-column exclusion |
| `ReadableRelationalRepository` | `ReadableRepository` | The read verbs |
| `PersistableRelationalRepository` | `PersistableRepository` | create/update/delete |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | Empty - the recommended entry point |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | Overrides delete to set `deletedAt` instead of removing the row |

## Common tasks

### Read with a filter

`find` and `findOne` take `filter.where`, plus `order` and `limit` for paging.

```typescript
const users = await userRepository.find({
  filter: {
    where: { status: 'active' },
    order: ['createdAt DESC'],
    limit: 20,
  },
});
```

See [Filter System](/references/base/filter-system/) for every operator (`gte`, `like`, `inq`, JSON paths, `and`/`or`).

### Create a record

`create` returns `{ count, data }`, not the bare record - `count` is `1` on success, `data` is the inserted row (or `null` if `options.shouldReturn: false`).

```typescript
const { count, data } = await userRepository.create({
  data: { email: 'jane@example.com' },
});
```

### Update by id

`updateById` returns the same `{ count, data }` shape, with `data` set to the updated row.

```typescript
const { data: updated } = await userRepository.updateById({
  id: '123',
  data: { email: 'new@example.com' },
});
```

### Soft delete

Extend `SoftDeletableRepository` instead of `DefaultCRUDRepository` on a model with a `deletedAt` column - `deleteById` sets the timestamp instead of removing the row, and `restoreById` clears it.

```typescript
@repository({ model: Category, dataSource: PostgresDataSource })
export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}

await categoryRepository.deleteById({ id: '123' }); // sets deletedAt
await categoryRepository.restoreById({ id: '123' }); // clears deletedAt
```

See [SoftDeletableRepository](./soft-deletable) for hard delete and bulk restore.

### Include relations

Pass `include` in the filter to eager-load related rows, with an optional nested `scope` filter.

```typescript
await userRepository.find({
  filter: {
    include: [{ relation: 'posts', scope: { where: { published: true } } }],
  },
});
```

See [Relations & Includes](./relations) for one-to-many, many-to-many, and nested includes.

### Run inside a transaction

`beginTransaction()` delegates to the datasource; pass the handle as `options.transaction` on any repository call to run it inside that transaction.

```typescript
const transaction = await userRepository.beginTransaction();

try {
  await userRepository.create({ data: { email: 'a@example.com' }, options: { transaction } });
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

See [DataSources](/references/base/datasources) for the rollback-safe pattern (`rollback()` itself can throw). See [Advanced Features](./advanced) for isolation levels and other transaction options.

### Retry a read behind a replicated pool

Pass `retry` in `options` on `find`, `findOne`, or `findById` to re-read until a predicate passes - useful for read-after-write staleness behind a replicated pool (e.g. PgDog primary + replicas).

```typescript
const user = await userRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});
```

See [Advanced Features - Read Retry](./advanced#read-retry-replica-lag) for the typed-per-verb `until` predicate, defaults, and the transaction-skip rule.

## See also

- [Relations & Includes](./relations) - eager loading, nested `scope` filters, many-to-many
- [Advanced Features](./advanced) - transactions, hidden properties, `shouldQueryRange`, performance, read retry
- [SoftDeletableRepository](./soft-deletable) - soft delete, restore, hard delete
- [Repository Mixins (Removed)](./mixins) - where `FieldsVisibilityMixin`/`DefaultFilterMixin` behavior lives now
- [Filter System](/references/base/filter-system/) - every `where` operator, ordering, pagination
- [Repositories Guide](/guides/core-concepts/persistent/repositories) - creating repositories step by step

**Files:**

- [`packages/core/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/core/abstract.ts) - neutral `AbstractRepository`
- [`packages/core/src/connectors/postgres/repositories/core/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/index.ts) - PostgreSQL hierarchy + compatibility aliases
