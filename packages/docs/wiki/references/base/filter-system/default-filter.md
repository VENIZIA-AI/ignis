---
title: Default Filter
description: Automatically apply filter conditions to all repository queries
difficulty: intermediate
lastUpdated: 2026-01-02
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
await userRepo.find({
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

When a user provides a filter, it is merged with the default filter:

| Property | Merge Strategy |
|----------|----------------|
| `where` | **Deep merge** - user values override matching keys |
| `limit` | User replaces default (if provided) |
| `offset`/`skip` | User replaces default (if provided) |
| `order` | User replaces default (if provided) |
| `fields` | User replaces default (if provided) |
| `include` | User replaces default (if provided) |

### Where Clause Merging

The `where` clause uses deep merge with user values taking precedence:

```typescript
// Default filter
{ where: { isDeleted: false, status: 'pending' }, limit: 100 }

// User filter
{ where: { status: 'active', role: 'admin' }, limit: 10 }

// Merged result
{
  where: {
    isDeleted: false,    // From default (preserved)
    status: 'active',    // User overrides default
    role: 'admin'        // From user (added)
  },
  limit: 10              // User overrides default
}
```

### Complex Where Conditions

```typescript
// Default: soft delete and tenant isolation
const defaultFilter = {
  where: {
    isDeleted: false,
    tenantId: 'tenant-123',
  }
};

// User: OR conditions
const userFilter = {
  where: {
    or: [{ status: 'active' }, { priority: 'high' }]
  }
};

// Result: AND of default + OR from user
// WHERE isDeleted = false AND tenantId = 'tenant-123'
//   AND (status = 'active' OR priority = 'high')
```

### Operator Object Merging

Operator objects are deep merged, allowing range combinations:

```typescript
// Default: created after 2024
const defaultFilter = {
  where: {
    createdAt: { gte: '2024-01-01' }
  }
};

// User: created before end of 2024
const userFilter = {
  where: {
    createdAt: { lte: '2024-12-31' }
  }
};

// Result: date range
{
  where: {
    createdAt: { gte: '2024-01-01', lte: '2024-12-31' }
  }
}
```


## Bypassing Default Filter

Use `shouldSkipDefaultFilter: true` to bypass the default filter:

```typescript
// Normal query - default filter applies
await repo.find({
  filter: { where: { role: 'admin' } }
});
// WHERE isDeleted = false AND role = 'admin'

// Admin query - bypass default filter
await repo.find({
  filter: { where: { role: 'admin' } },
  options: { shouldSkipDefaultFilter: true }
});
// WHERE role = 'admin' (includes deleted records)
```

### Supported Operations

`shouldSkipDefaultFilter` works with all repository methods:

```typescript
// Read operations
await repo.find({ filter, options: { shouldSkipDefaultFilter: true } });
await repo.findOne({ filter, options: { shouldSkipDefaultFilter: true } });
await repo.findById({ id, options: { shouldSkipDefaultFilter: true } });
await repo.count({ where, options: { shouldSkipDefaultFilter: true } });

// Update operations
await repo.updateById({ id, data, options: { shouldSkipDefaultFilter: true } });
await repo.updateAll({ where, data, options: { shouldSkipDefaultFilter: true } });

// Delete operations
await repo.deleteById({ id, options: { shouldSkipDefaultFilter: true } });
await repo.deleteAll({ where, options: { shouldSkipDefaultFilter: true, force: true } });
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
await postRepo.find({ filter: {} });
// WHERE deletedAt IS NULL

// Restore a deleted post
await postRepo.updateById({
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
await docRepo.find({ filter: { where: { type: 'invoice' } } });
// WHERE tenantId = 'current-tenant' AND type = 'invoice'

// Cross-tenant admin query
await docRepo.find({
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

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      limit: 1000,  // Prevent unbounded queries
    },
  },
})
export class LogEntry extends BaseEntity<typeof LogEntry.schema> {}

// User can override limit, but there's always a sensible default
await logRepo.find({ filter: {} });           // LIMIT 1000
await logRepo.find({ filter: { limit: 50 } }); // LIMIT 50
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
const tx = await repo.beginTransaction();

try {
  // Both transaction and shouldSkipDefaultFilter
  await repo.updateAll({
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
+------------------+     +------------------+     +------------------+
|  Model Settings  | --> | DefaultFilterMixin | --> | Repository Method |
|  defaultFilter   |     | applyDefaultFilter |     | find/count/etc   |
+------------------+     +------------------+     +------------------+
                                |
                                v
                         +------------------+
                         |  FilterBuilder   |
                         |  mergeFilter()   |
                         +------------------+
```

### DefaultFilterMixin

The `DefaultFilterMixin` provides:

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
| Combine with transaction | `options: { transaction: tx, shouldSkipDefaultFilter: true }` |
| Check if model has default | `repo.hasDefaultFilter()` |
| Get raw default filter | `repo.getDefaultFilter()` |


## Next Steps

- [Filter System Overview](./index.md) - Filter structure and operators
- [Repository Mixins](../repositories/mixins.md) - Mixin architecture
- [Advanced Features](../repositories/advanced.md) - Transactions, hidden properties
