---
title: Default Filter & Repository Mixins
description: Models can define a default filter, such as soft delete or tenant isolation, that repositories apply to every query unless you skip it.
packages: ['@venizia/ignis']
---

# Changelog - 2026-01-02

## Default Filter & Repository Mixins

**In one line.** Set a `defaultFilter` once on a model and every read, update and delete applies it automatically.

> [!NOTE]
> **2026-08-01 Update:** The `import { FilterBuilder } from '@venizia/ignis'` form shown below no longer resolves. The Postgres class is now `PostgresFilterBuilder`, from the same path; the name `FilterBuilder` belongs to the neutral abstract base at `@venizia/ignis/relational`. See [Relational Connector Lift](./2026-08-01-relational-connector-lift).

## What changed

- **Default filter.** Configure it in the model settings; it is merged with the caller's filter on reads, updates and deletes.
- **Skip option.** Pass `options: { shouldSkipDefaultFilter: true }` to bypass it for admin or maintenance work.
- **Repository mixins.** `DefaultFilterMixin` and `FieldsVisibilityMixin` provide these features as composable pieces.
- **`IExtraOptions`.** New options interface (transaction plus `shouldSkipDefaultFilter`) that replaces `TTransactionOption`.
- **`mergeFilter`.** `FilterBuilder` has a new `mergeFilter` method that combines a default and a user filter.

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { isDeleted: false },
      limit: 100,
    },
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}

await userRepo.find({ filter: { where: { status: 'active' } } });
// WHERE isDeleted = false AND status = 'active' LIMIT 100

await repo.find({
  filter: { where: { role: 'admin' } },
  options: { shouldSkipDefaultFilter: true }
});
// WHERE role = 'admin' (includes deleted records)
```

| Property | Merge strategy |
|----------|----------------|
| `where` | Deep merge (user overrides matching keys) |
| `limit`, `offset`/`skip`, `order`, `fields`, `include` | User value replaces the default, if provided |

## Who is affected

- **Models without `defaultFilter`.** No action needed.
- **Code that uses `DrizzleFilterBuilder`, calls `FilterBuilder.build()` or uses `TTransactionOption`.** Update as below.

## Breaking changes

> [!WARNING]
> Affects direct users of the filter builder and custom repositories with explicit generic types.

### `DrizzleFilterBuilder` renamed to `FilterBuilder`

**Before:**
```typescript
import { DrizzleFilterBuilder } from '@venizia/ignis';
const builder = new DrizzleFilterBuilder();
```

**After:**
```typescript
import { FilterBuilder } from '@venizia/ignis';
const builder = new FilterBuilder();
```

### `FilterBuilder.build()` signature

**Before:**
```typescript
filterBuilder.build({
  tableName: 'users',
  schema: userSchema,
  relations: { posts: { ... } },
  filter: myFilter,
  relationResolver: (schema) => { ... },
  hiddenPropertiesResolver: (relationName) => { ... },
});
```

**After:**
```typescript
// Relations and hidden properties resolved internally
filterBuilder.build({
  tableName: 'users',
  schema: userSchema,
  filter: myFilter,
});
```

### `TTransactionOption` deprecated

**Before:**
```typescript
import { TTransactionOption } from '@venizia/ignis';

class MyRepo extends AbstractRepository<Schema, Data, Persist, TTransactionOption> {}
```

**After:**
```typescript
import { IExtraOptions } from '@venizia/ignis';

class MyRepo extends AbstractRepository<Schema, Data, Persist, IExtraOptions> {}
```

`TTransactionOption` remains as a deprecated alias of `IExtraOptions`.

## Details

- See [Default Filter Guide](/references/base/filter-system/default-filter), [Advanced Repository Features](/references/base/repositories/advanced) (including [what moved from the removed mixins](/references/base/repositories/advanced#moved-from-the-removed-mixins)).
