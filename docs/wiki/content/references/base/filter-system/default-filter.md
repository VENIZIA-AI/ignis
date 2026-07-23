---
title: Default Filter
description: Automatically apply filter conditions to all repository queries
difficulty: intermediate
lastUpdated: 2026-07-23
---

# Default Filter <Badge type="tip" text="v0.0.5+" />

A model's `settings.defaultFilter` merges into every `find`/`findOne`/`findById`/`count`/`updateById`/`updateAll`/`deleteById`/`deleteAll` call for that model - the standard way to implement soft delete, multi-tenancy, active-record scoping, and query-limit protection without repeating a `where` clause at every call site.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { userTable } from '@/schemas';

@model({
  type: 'entity',
  settings: { defaultFilter: { where: { isDeleted: false }, limit: 100 } },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}
```

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `settings.defaultFilter` | `TFilter` | none | Filter merged into every query for the model - `where`, `limit`, `offset`, `order`, `fields`, `include` are all valid inside it. |
| `settings.defaultLimit` | `number` (positive integer) | `DEFAULT_LIMIT` (`10`) | Per-model row cap. Independent of `defaultFilter` - see [Fields, Order & Pagination -> Default limit resolution](./fields-order-pagination#default-limit-resolution). |
| `options.shouldSkipDefaultFilter` | `boolean` | `false` | Skips the `defaultFilter` merge for one call. Does not drop `defaultLimit`. |

```typescript
import { userRepository } from '@/repositories';

await userRepository.find({ filter: { where: { status: 'active' } } });
// WHERE "isDeleted" = false AND "status" = 'active' LIMIT 100
```

## Merge semantics

`applyDefaultFilter()` merges the model's `defaultFilter` with the caller's filter via `FilterBuilder.mergeFilter()`.

- **`where` narrows per-key.** See the narrowing law below.
- **Everything else is user-wins-if-provided.** A caller value replaces the default, but a caller value of `undefined` never does - a filter built by spreading an optional object can't silently blow away a tenant scope or a limit.

| Property | Merge strategy |
|---|---|
| `where` | Per-key narrowing (below) |
| `limit`, `offset`/`skip`, `order`, `fields`, `include` | Caller replaces default, if the caller's value is defined |

### The `where` narrowing law

Keys present on only one side pass through untouched. When the same key appears on both sides, the outcome depends on shape:

| Default | Caller | Result |
|---|---|---|
| scalar | scalar | **Caller wins** - the one true override (`isDeleted: false` -> `isDeleted: true` opts an admin out of soft-delete) |
| operator object | operator object | **AND-composed** into an `and: [...]` group - both conditions apply |
| scalar | operator object | **AND-composed** |
| operator object | scalar | **AND-composed** |

- **`and` collisions concatenate.** Both conjunct lists merge into one.
- **`or` collisions cannot concatenate** - that would union, not narrow - so each side's `or` group becomes its own conjunct instead.
- **Non-scalar collisions always AND-compose.** A default scope - a `createdAt` floor, a tenant `inq` - can be narrowed by a caller filter but never widened or dropped.
- **Only scalar-over-scalar is a true override.** Every other collision shape composes rather than replaces.

```typescript
// Default: a floor on createdAt. Caller: an upper bound on the same key.
const defaultFilter = { where: { createdAt: { gte: '2024-01-01' } } };
const userFilter = { where: { createdAt: { lte: '2024-12-31' } } };

// Both operator objects on the same key -> AND-composed, so the floor survives:
// { where: { and: [{ createdAt: { gte: '2024-01-01' } }, { createdAt: { lte: '2024-12-31' } }] } }
```

Non-colliding keys still combine with an implicit AND, exactly like two `where` objects merged by hand:

```typescript
// Default: { where: { isDeleted: false, tenantId: 'tenant-123' } }
// Caller:  { where: { or: [{ status: 'active' }, { priority: 'high' }] } }
// Result:  WHERE "isDeleted" = false AND "tenantId" = 'tenant-123' AND ("status" = 'active' OR "priority" = 'high')
```

## Bypassing the default filter

Pass `shouldSkipDefaultFilter: true` in `options` to skip the merge entirely. Every repository verb honors it - `find`, `findOne`, `findById`, `count`, `updateById`, `updateAll`, `deleteById`, `deleteAll`:

```typescript
// Normal - default filter applies
await repository.find({ filter: { where: { role: 'admin' } } });
// WHERE "isDeleted" = false AND "role" = 'admin'

// Admin/maintenance path - bypassed
await repository.find({
  filter: { where: { role: 'admin' } },
  options: { shouldSkipDefaultFilter: true },
});
// WHERE "role" = 'admin' (includes soft-deleted rows)
```

`updateById` and `deleteById` merge the default filter into their `{ id }` condition the same way `updateAll`/`deleteAll` merge it into their `where` - the bypass applies to all four identically:

```typescript
// Also merges the default filter into { id: postId } - skip to update a soft-deleted row
await postRepository.updateById({
  id: postId,
  data: { title: 'Restored' },
  options: { shouldSkipDefaultFilter: true },
});
```

It composes with a transaction the same way any other option does:

```typescript
const tx = await repository.beginTransaction();
try {
  await repository.updateAll({
    where: { status: 'archived' },
    data: { isDeleted: true },
    options: { transaction: tx, shouldSkipDefaultFilter: true },
  });
  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
}
```

`updateAll`/`deleteAll` additionally require `force: true` when the resulting `where` is empty - see [Advanced Repository Features -> Empty where protection](../repositories/advanced#empty-where-protection).

| Scenario | Why bypass |
|---|---|
| Admin dashboard | View records a default scope would otherwise hide |
| Data recovery | Restore soft-deleted rows |
| Cross-tenant analytics | Count/aggregate across every tenant |
| Data migration | Update rows regardless of status |

`shouldSkipDefaultFilter` lives on the same options interface every repository verb accepts:

```typescript
interface IExtraOptions extends IWithTransaction {
  shouldSkipDefaultFilter?: boolean;
  log?: TRepositoryLogOptions;
  lock?: TLockOptions;
}

interface IWithTransaction {
  transaction?: ITransaction;
}
```

`log` and `lock` are documented in [Advanced Repository Features](../repositories/advanced.md) - `log` only takes effect on write verbs (`create`/`updateById`/`updateAll`/`deleteById`/`deleteAll`), not on reads.

## Configuring a default filter

Any `TFilter` property is valid inside `defaultFilter` - `where`, `limit`, `offset`, `order`, `fields`, `include` (see [Filter System Overview](./)). Two shapes cover most cases.

**Soft delete or multi-tenant scoping** - a `where` clause that every query must carry:

```typescript
@model({
  type: 'entity',
  settings: { defaultFilter: { where: { deletedAt: null } } },
})
export class Post extends BaseEntity<typeof Post.schema> {}

await postRepository.find({ filter: {} });
// WHERE "deletedAt" IS NULL

await postRepository.updateById({
  id: postId,
  data: { deletedAt: null },
  options: { shouldSkipDefaultFilter: true }, // restore
});
```

**Query-limit protection** - prefer the dedicated `settings.defaultLimit` over a `limit` inside `defaultFilter`. It resolves independently (`query.limit ?? defaultLimit ?? 10`, see [Fields, Order & Pagination -> Default limit resolution](./fields-order-pagination#default-limit-resolution)) and, unlike `defaultFilter`, is not dropped by `shouldSkipDefaultFilter`:

```typescript
@model({
  type: 'entity',
  settings: { defaultLimit: 1000 },
})
export class LogEntry extends BaseEntity<typeof LogEntry.schema> {}

await logEntryRepository.find({ filter: {} }); // LIMIT 1000
await logEntryRepository.find({ filter: { limit: 50 } }); // LIMIT 50
```

`@model` validates `defaultLimit` at decoration time - it must be a positive integer or the class throws on load.

## Relation include default filters

`include` also applies the related model's `defaultFilter`, and it can be bypassed or scoped per relation:

```typescript
await repository.find({
  filter: {
    include: [
      { relation: 'posts' }, // related model's default filter applies
      { relation: 'comments', shouldSkipDefaultFilter: true }, // skipped for this relation only
      { relation: 'tags', scope: { limit: 10, order: ['name ASC'] } }, // scope merges with the default filter
    ],
  },
});
```

## How it works

```
+------------------+     +--------------------------+     +------------------+
|  Model Settings  | --> | RelationalBaseRepository  | --> | Repository Method |
|  defaultFilter   |     | applyDefaultFilter()      |     | find/count/etc   |
+------------------+     +--------------------------+     +------------------+
                                     |
                                     v
                              +------------------+
                              |  FilterBuilder   |
                              |  mergeFilter()   |
                              +------------------+
```

`RelationalBaseRepository` (compatibility alias `PostgresBaseRepository`, `packages/core/src/connectors/postgres/repositories/core/base.ts`) implements the default-filter behavior directly - no mixin is composed onto it:

```typescript
hasDefaultFilter(): boolean
getDefaultFilter(): TFilter | undefined
getDefaultLimit(): number | undefined
applyDefaultFilter(opts: { userFilter?: TFilter; shouldSkipDefaultFilter?: boolean }): TFilter
```

`getDefaultFilter()` reads `this.modelSettings?.defaultFilter`, where `modelSettings` is a protected getter on `AbstractRepository` (`src/base/repositories/core/abstract.ts`) resolved from `MetadataRegistry` by the entity's constructor, not by name string, on first access, then memoized.

Read verbs (`find`/`findOne`/`findById`/`count`) call `applyDefaultFilter()` directly. Write verbs (`updateById`/`updateAll`/`deleteById`/`deleteAll`) route through the shared `_update`/`_delete` helpers, which call it against `{ where: opts.where }` (or `{ id }` for the `ById` forms) before building the SQL condition.

> [!NOTE]
> An older `DefaultFilterMixin` implemented this same behavior via mixin composition. It is no longer composed onto any repository class - see [Repository Mixins (Removed)](../repositories/mixins.md) for history.

The merge itself is `FilterBuilder.mergeFilter()`:

```typescript
const filterBuilder = new FilterBuilder();

filterBuilder.mergeFilter({
  defaultFilter: { where: { isDeleted: false }, limit: 100 },
  userFilter: { where: { status: 'active' }, limit: 10 },
});
// { where: { isDeleted: false, status: 'active' }, limit: 10 }
```

## See also

- [Filter System Overview](./) - the `filter` shape and every operator family
- [Fields, Order & Pagination](./fields-order-pagination) - `defaultLimit` resolution in full
- [Advanced Repository Features](../repositories/advanced.md) - transactions, `log`/`lock` options, empty-where protection
- [Repository Mixins (Removed)](../repositories/mixins.md) - history of the removed `DefaultFilterMixin`

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder.mergeFilter()`/`mergeWhere()`, the narrowing merge
- [`packages/core/src/connectors/postgres/repositories/core/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/base.ts) - `RelationalBaseRepository`, `applyDefaultFilter`/`getDefaultFilter`/`getDefaultLimit`
- [`packages/core/src/connectors/postgres/repositories/core/readable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/readable.ts) - `find`/`findOne`/`count` calling `applyDefaultFilter`
- [`packages/core/src/connectors/postgres/repositories/core/persistable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/persistable.ts) - `_update`/`_delete` calling `applyDefaultFilter` for `updateById`/`updateAll`/`deleteById`/`deleteAll`
- [`packages/core/src/base/metadata/persistents.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/metadata/persistents.ts) - `@model` decorator, `defaultLimit` validation
- [`packages/core/src/base/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/types.ts) - `IExtraOptions`, `IWithTransaction`
