---
title: Default Filter
description: Automatically apply filter conditions to all repository queries
difficulty: intermediate
lastUpdated: 2026-03-15
---

# Default Filter <Badge type="tip" text="v0.0.5+" />

Automatically apply filter conditions to all repository queries at the model level.

> [!NOTE] Added in v0.0.5
> This feature was introduced in IGNIS v0.0.5 to support soft delete, multi-tenancy, and other automatic filtering patterns.

> [!NOTE]
> Default filters are ideal for:
> - **Soft Delete**: Automatically exclude deleted records
> - **Multi-Tenancy**: Isolate data by tenant
> - **Active Records**: Filter to active/non-expired records
> - **Query Limits**: Prevent unbounded queries


## Quick Start

Configure a default filter in your model:

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { userTable } from '@/schemas';

@model({
  type: 'entity',
  settings: {
    // Applied to all repository queries
    defaultFilter: {
      where: { isDeleted: false },
      limit: 100,
    },
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}
```

Now all queries automatically include the default filter:

```typescript
// Your code
await userRepository.find({
  filter: { where: { status: 'active' } }
});

// Actual query executed
// WHERE isDeleted = false AND status = 'active' LIMIT 100
```


## Configuration

### Default Filter Properties

All standard filter properties are supported:

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      // WHERE conditions
      where: { isDeleted: false, tenantId: 'tenant-123' },

      // Maximum results (prevents unbounded queries)
      limit: 100,

      // Default pagination offset
      offset: 0,

      // Default sort order
      order: ['createdAt DESC'],

      // Default field selection
      fields: ['id', 'name', 'email', 'createdAt'],

      // Default relations to include
      include: [{ relation: 'profile' }],
    },
  },
})
export class User extends BaseEntity<typeof User.schema> {}
```


## Merge Behavior

When a user provides a filter, it is merged with the default filter using `FilterBuilder.mergeFilter()`. Non-`where` properties are user-wins; the `where` clause follows a **narrowing** collision law so a default scope can never be widened or dropped.

| Property | Merge Strategy |
|----------|----------------|
| `where` | **Per-key narrowing** -- non-colliding keys carry over; a colliding key is composed so the default condition always survives (see below) |
| `limit` | User replaces default (if provided) |
| `offset`/`skip` | User replaces default (if provided) |
| `order` | User replaces default (if provided) |
| `fields` | User replaces default (if provided) |
| `include` | User replaces default (if provided) |

A user value of `undefined` **never** overrides a defined default -- a caller cannot blow away a tenant or soft-delete scope by passing `undefined`.

### Where Clause Collision Law

Within `where`, keys present on only one side pass through untouched. When the **same key** appears in both the default and the user filter, the outcome depends on the shapes:

| Default | User | Result |
|---------|------|--------|
| scalar | scalar | **User wins** (the soft-delete opt-out -- e.g. `isDeleted: false` becomes `isDeleted: true`) |
| operator | operator | **AND-composed** into an `and: [...]` group (both conditions enforced) |
| scalar | operator | **AND-composed** |
| operator | scalar | **AND-composed** |

A colliding `and` key concatenates both conjunct lists (both survive). A colliding `or` key AND-composes the two disjunction groups as separate conjuncts -- the user's `or` cannot swallow the default's `or`. Every AND-composed pair is appended to any existing `and` group.

> [!IMPORTANT]
> Because operator collisions AND-compose rather than replace, a default scope (a `createdAt` floor, a tenant `inq`) can no longer be widened or dropped by a user filter. Only a bare scalar-over-scalar collision is a true override.

### Narrowing Example

```typescript
// Default filter: a floor on createdAt plus a tenant scope
const defaultFilter = {
  where: { createdAt: { gte: '2024-01-01' }, tenantId: { inq: ['t1', 't2'] } },
};

// User filter: an upper bound on createdAt
const userFilter = {
  where: { createdAt: { lte: '2024-12-31' } },
};
```

**Before** (old wholesale-replace law) -- the user key replaced the default's `createdAt`, dropping the floor:

```typescript
// { where: { createdAt: { lte: '2024-12-31' }, tenantId: { inq: ['t1', 't2'] } } }
```

**After** (narrowing law) -- operator over operator is AND-composed, so the floor survives:

```typescript
{
  where: {
    tenantId: { inq: ['t1', 't2'] },
    and: [
      { createdAt: { gte: '2024-01-01' } },
      { createdAt: { lte: '2024-12-31' } },
    ],
  },
}
```

### Scalar Override (soft-delete opt-out)

A plain scalar on both sides is the one case where the user still wins outright -- this is what lets an admin flip a soft-delete flag:

```typescript
// Default: { where: { isDeleted: false } }
// User:    { where: { isDeleted: true } }
// Result:  { where: { isDeleted: true } }
```

### Complex Where Conditions

Keys that do not collide combine with an implicit AND:

```typescript
// Default: soft delete and tenant isolation
const defaultFilter = {
  where: {
    isDeleted: false,
    tenantId: 'tenant-123',
  }
};

// User: OR conditions (a distinct key, so it carries through)
const userFilter = {
  where: {
    or: [{ status: 'active' }, { priority: 'high' }]
  }
};

// Result: AND of default + OR from user
// WHERE isDeleted = false AND tenantId = 'tenant-123'
//   AND (status = 'active' OR priority = 'high')
```


## Bypassing Default Filter

Use `shouldSkipDefaultFilter: true` to bypass the default filter:

```typescript
// Normal query - default filter applies
await repository.find({
  filter: { where: { role: 'admin' } }
});
// WHERE isDeleted = false AND role = 'admin'

// Admin query - bypass default filter
await repository.find({
  filter: { where: { role: 'admin' } },
  options: { shouldSkipDefaultFilter: true }
});
// WHERE role = 'admin' (includes deleted records)
```

### Supported Operations

`shouldSkipDefaultFilter` works with all repository methods:

```typescript
// Read operations
await repository.find({ filter, options: { shouldSkipDefaultFilter: true } });
await repository.findOne({ filter, options: { shouldSkipDefaultFilter: true } });
await repository.findById({ id, options: { shouldSkipDefaultFilter: true } });
await repository.count({ where, options: { shouldSkipDefaultFilter: true } });

// Update operations
await repository.updateById({ id, data, options: { shouldSkipDefaultFilter: true } });
await repository.updateAll({ where, data, options: { shouldSkipDefaultFilter: true } });

// Delete operations
await repository.deleteById({ id, options: { shouldSkipDefaultFilter: true } });
await repository.deleteAll({ where, options: { shouldSkipDefaultFilter: true, force: true } });
```

### Use Cases for Bypassing

| Scenario | Example |
|----------|---------|
| Admin dashboard | View all records including deleted |
| Data recovery | Restore soft-deleted records |
| Analytics | Count across all tenants |
| Data migration | Update records regardless of status |
| Audit logs | Access historical data |


## Common Patterns

### Soft Delete

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { deletedAt: null },  // or { isDeleted: false }
    },
  },
})
export class Post extends BaseEntity<typeof Post.schema> {}

// All queries exclude deleted posts
await postRepository.find({ filter: {} });
// WHERE deletedAt IS NULL

// Restore a deleted post
await postRepository.updateById({
  id: postId,
  data: { deletedAt: null },
  options: { shouldSkipDefaultFilter: true }
});
```

### Multi-Tenant Isolation

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { tenantId: 'current-tenant' },
    },
  },
})
export class Document extends BaseEntity<typeof Document.schema> {}

// Queries scoped to tenant
await documentRepository.find({ filter: { where: { type: 'invoice' } } });
// WHERE tenantId = 'current-tenant' AND type = 'invoice'

// Cross-tenant admin query
await documentRepository.find({
  filter: { where: { type: 'invoice' } },
  options: { shouldSkipDefaultFilter: true }
});
// WHERE type = 'invoice'
```

### Active Records

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: {
        isActive: true,
        expiresAt: { gt: new Date().toISOString() },
      },
      limit: 50,
    },
  },
})
export class Subscription extends BaseEntity<typeof Subscription.schema> {}
```

### Query Limit Protection

Use the dedicated `settings.defaultLimit` to raise (or lower) the per-model default page size. Prefer it over putting `limit` inside `defaultFilter`:

```typescript
@model({
  type: 'entity',
  settings: {
    defaultLimit: 1000,  // Per-model default when a query omits `limit`
  },
})
export class LogEntry extends BaseEntity<typeof LogEntry.schema> {}

// User can override limit, but there's always a sensible default
await logEntryRepository.find({ filter: {} });           // LIMIT 1000
await logEntryRepository.find({ filter: { limit: 50 } }); // LIMIT 50
```

> [!TIP]
> `defaultLimit` is independent of `defaultFilter`: bypassing the default filter via `shouldSkipDefaultFilter` does **not** drop the limit. See [Pagination → Default Limit](/references/base/filter-system/fields-order-pagination#default-limit).


## Relation Include Default Filters

When using `include` to load relations, the default filter of the related model is also applied. You can bypass it per-relation:

```typescript
await repository.find({
  filter: {
    include: [
      // Default filter of related model applies
      { relation: 'posts' },

      // Skip default filter for this specific relation
      { relation: 'comments', shouldSkipDefaultFilter: true },

      // Apply a custom scope (merged with relation's default filter)
      { relation: 'tags', scope: { limit: 10, order: ['name ASC'] } },
    ]
  }
});
```


## IExtraOptions Interface

The `shouldSkipDefaultFilter` option is part of the `IExtraOptions` interface:

```typescript
interface IExtraOptions extends IWithTransaction {
  /**
   * If true, bypass the default filter configured in model settings.
   */
  shouldSkipDefaultFilter?: boolean;
}

interface IWithTransaction {
  transaction?: ITransaction;
}
```

This allows combining with transactions:

```typescript
const tx = await repository.beginTransaction();

try {
  // Both transaction and shouldSkipDefaultFilter
  await repository.updateAll({
    where: { status: 'archived' },
    data: { isDeleted: true },
    options: {
      transaction: tx,
      shouldSkipDefaultFilter: true,
    }
  });

  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
}
```


## How It Works

### Architecture

```
+------------------+     +----------------------+     +------------------+
|  Model Settings  | --> | PostgresBaseRepository | --> | Repository Method |
|  defaultFilter   |     | applyDefaultFilter()   |     | find/count/etc   |
+------------------+     +----------------------+     +------------------+
                                |
                                v
                         +------------------+
                         |  FilterBuilder   |
                         |  mergeFilter()   |
                         +------------------+
```

### PostgresBaseRepository

`PostgresBaseRepository` (`packages/core/src/connectors/postgres/repositories/core/base.ts`) implements the default-filter behavior directly as protected methods - no mixin is composed onto it:

```typescript
// Check if default filter is configured
hasDefaultFilter(): boolean

// Get the raw default filter from model metadata
getDefaultFilter(): TFilter | undefined

// Merge default filter with user filter
applyDefaultFilter(opts: {
  userFilter?: TFilter;
  shouldSkipDefaultFilter?: boolean;
}): TFilter
```

`getDefaultFilter()` reads `this.modelSettings?.defaultFilter`, where `modelSettings` is a protected getter on `AbstractRepository` (`src/base/repositories/core/abstract.ts`) resolved from `MetadataRegistry` keyed by the entity's constructor (not by name string) on first access, and cached for subsequent calls.

> [!NOTE]
> An older `DefaultFilterMixin` implemented this same behavior via mixin composition. It is no longer composed onto any repository class - see [Repository Mixins (Legacy)](../repositories/mixins.md) for history.

### FilterBuilder.mergeFilter()

The merge logic is implemented in `FilterBuilder`:

```typescript
const filterBuilder = new FilterBuilder();

const merged = filterBuilder.mergeFilter({
  defaultFilter: { where: { isDeleted: false }, limit: 100 },
  userFilter: { where: { status: 'active' }, limit: 10 }
});

// Result:
// { where: { isDeleted: false, status: 'active' }, limit: 10 }
```


## Quick Reference

| Want to... | Code |
|------------|------|
| Configure default filter | `@model({ settings: { defaultFilter: { ... } } })` |
| Bypass default filter | `options: { shouldSkipDefaultFilter: true }` |
| Bypass for relation | `include: [{ relation: 'x', shouldSkipDefaultFilter: true }]` |
| Combine with transaction | `options: { transaction: tx, shouldSkipDefaultFilter: true }` |
| Check if model has default | `repository.hasDefaultFilter()` |
| Get raw default filter | `repository.getDefaultFilter()` |


## Next Steps

- [Filter System Overview](./index.md) - Filter structure and operators
- [Repository Mixins (Legacy)](../repositories/mixins.md) - Historical mixin architecture
- [Advanced Features](../repositories/advanced.md) - Transactions, hidden properties
