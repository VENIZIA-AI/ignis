---
title: Repositories
description: The typed data-access object for one model - CRUD, filters, and transactions without hand-written SQL
difficulty: intermediate
---

# Repositories

A repository is the typed data-access object for one model. It turns a `@model` schema into `find`, `create`, `updateById`, `deleteById`, and friends, with the query shape validated at compile time.

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

- **Engine-neutral contract, relational implementation.** `AbstractRepository` (engine-neutral, `@venizia/ignis-kernel`) declares the CRUD contract - no SQL, no Drizzle. The relational tier implements it as a chain of classes, each layer adding one capability (see table below).
- **Datasource is auto-injected.** `@repository({ model, dataSource })` auto-injects the datasource at constructor param[0] and lazily resolves the entity class from its own metadata. A plain `extends DefaultCRUDRepository<...> {}` needs no constructor at all.
- **Two repository types.** `type` defaults to `RepositoryTypes.MODEL`, which requires `model`. `RepositoryTypes.REMOTE` takes no `model` - see [Read another service's API](#read-another-service-s-api).
- **One options object per verb.** Reads and updates carry a `filter` (`where`, `fields`, `include`, `order`, `limit`, `offset`). Writes carry `data`. Every verb also accepts an `options` bag for `transaction` and `shouldSkipDefaultFilter`; `shouldReturn` is a write-only option, and `retry`/`shouldQueryRange` are read-only ones.

**The relational class chain, and the Postgres binding of each rung**

| Neutral class | Postgres binding | Adds |
|---|---|---|
| `RelationalBaseRepository` | `PostgresBaseRepository` | `FilterBuilder`/`UpdateBuilder`, hidden-column exclusion |
| `ReadableRelationalRepository` | `ReadableRepository` | The read verbs |
| `PersistableRelationalRepository` | `PersistableRepository` | create/update/delete |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | Empty - the recommended entry point |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | Overrides delete to set `deletedAt` instead of removing the row |

A Postgres class is **not** an alias for the neutral one beside it, and it does not extend the Postgres class above it. Each one extends its own neutral counterpart and rebinds two generic defaults - `ExtraOptions` to `IDatabaseExtraOptions` and `TDataSource` to `IPostgresDataSource`. SQLite binds the same five rungs as `SqliteBaseRepository`, `ReadableSqliteRepository`, `PersistableSqliteRepository`, `DefaultSqliteRepository`, and `SoftDeletableSqliteRepository`.

Import the Postgres names from `@venizia/ignis` or `@venizia/ignis/postgres`, the SQLite names from `@venizia/ignis/sqlite`, and the neutral names from `@venizia/ignis/relational`. The neutral names are deliberately absent from the engine subpaths, so one class never ships under two names.

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

`runInTransaction({ transaction?, transactionOptions?, execute })` writes the try/catch above for
you - see [Transactions - runInTransaction](/guides/core-concepts/persistent/transactions#runintransaction).

### Retry a read behind a replicated pool

A read right after a write can hit a replica that has not caught up. Pass `retry` to re-read until the result is fresh:

```typescript
const user = await userRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});
```

Full options and rules: [Advanced Features - Read Retry](./advanced#read-retry-replica-lag).

### Read another service's API

Data behind another service has no local model, so `@repository` would have nothing to put in `model`. Declare the repository `RepositoryTypes.REMOTE` and give it the datasource only:

```typescript
import { HttpDataSource, HttpRepository } from '@venizia/ignis-connectors/http';
import { datasource, repository, RepositoryTypes } from '@venizia/ignis';

type TProduct = { id: string; name: string };

@datasource()
export class CatalogDataSource extends HttpDataSource {
  constructor() {
    super({ name: 'catalog', baseUrl: 'https://catalog.internal/api' });
  }
}

@repository({ type: RepositoryTypes.REMOTE, dataSource: CatalogDataSource })
export class ProductRepository extends HttpRepository<TProduct> {
  constructor(dataSource: CatalogDataSource) {
    super({ dataSource, resource: 'products' });
  }
}
```

The datasource is still injected at constructor param[0]. No model binding is registered, so the datasource discovers no schema through this repository.

| `type` | Value | `model` | Registers |
|---|---|---|---|
| `RepositoryTypes.MODEL` (default) | `'model'` | Required | Model binding + datasource injection |
| `RepositoryTypes.REMOTE` | `'remote'` | Refused | Datasource injection only |

TypeScript rejects a `MODEL` repository without `model` and a `REMOTE` one with it. A JavaScript caller gets the same answer at decoration time, as does an unknown `type`.

## See also

- [Relations & Includes](./relations) - eager loading, nested `scope` filters, many-to-many
- [Advanced Features](./advanced) - transactions, hidden properties, `shouldQueryRange`, performance, read retry
- [SoftDeletableRepository](./soft-deletable) - soft delete, restore, hard delete
- [Repository Mixins (Removed)](./mixins) - where `FieldsVisibilityMixin`/`DefaultFilterMixin` behavior lives now
- [Filter System](/references/base/filter-system/) - every `where` operator, ordering, pagination
- [Repositories Guide](/guides/core-concepts/persistent/repositories) - creating repositories step by step

**Files:**

- [`packages/kernel/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/core/abstract.ts) - neutral `AbstractRepository`
- [`packages/connectors/src/relational/core/repositories/core/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/core) - the engine-neutral relational ladder, where every verb is implemented
- [`packages/connectors/src/relational/postgres/repositories/core/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/core) - the Postgres bindings, one subclass per neutral class
