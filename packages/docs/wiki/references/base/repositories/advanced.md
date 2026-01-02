# Advanced Repository Features

Transactions, hidden properties, performance optimization, type inference, and debugging.


## Transactions

Orchestrate atomic operations across multiple repositories.

### Basic Transaction

```typescript
const tx = await repo.beginTransaction();

try {
  // All operations use the same transaction
  const user = await userRepo.create({
    data: { name: 'Alice', email: 'alice@example.com' },
    options: { transaction: tx }
  });

  const profile = await profileRepo.create({
    data: { userId: user.data.id, bio: 'Hello!' },
    options: { transaction: tx }
  });

  // Commit if all succeeded
  await tx.commit();

  return { user: user.data, profile: profile.data };
} catch (error) {
  // Rollback on any error
  await tx.rollback();
  throw error;
}
```

### Isolation Levels

Control how transactions interact with concurrent operations:

```typescript
const tx = await repo.beginTransaction({
  isolationLevel: 'SERIALIZABLE'
});
```

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | Default. See committed data only | Most applications |
| `REPEATABLE READ` | Consistent reads within transaction | Reports, analytics |
| `SERIALIZABLE` | Full isolation, prevents anomalies | Financial, inventory |

### Transaction with Multiple Repositories

```typescript
async function transferFunds(fromId: string, toId: string, amount: number) {
  const tx = await accountRepo.beginTransaction();

  try {
    // Debit source account
    await accountRepo.updateById({
      id: fromId,
      data: { balance: sql`balance - ${amount}` },
      options: { transaction: tx }
    });

    // Credit destination account
    await accountRepo.updateById({
      id: toId,
      data: { balance: sql`balance + ${amount}` },
      options: { transaction: tx }
    });

    // Record the transfer
    await transferRepo.create({
      data: { fromId, toId, amount, status: 'completed' },
      options: { transaction: tx }
    });

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
```


## Hidden Properties

Automatically exclude sensitive fields from query results.

### Configuration

Define hidden properties in your model:

```typescript
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret', 'apiKey'],
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}
```

### Automatic Exclusion

Hidden properties are excluded at the **SQL level** for maximum security:

```typescript
// Read operations exclude hidden properties
const user = await userRepo.findById({ id: '123' });
// Result: { id: '123', email: 'john@example.com', name: 'John' }
// Note: password, secret, apiKey are NOT included

// Write operations exclude hidden from RETURNING clause
const created = await userRepo.create({
  data: { email: 'new@example.com', password: 'hashed_secret' }
});
// Result: { count: 1, data: { id: '456', email: 'new@example.com' } }
// Note: password stored in DB but not returned
```

### Filtering by Hidden Properties

You **can** filter by hidden properties - you just can't see them in results:

```typescript
// This works! Finds user but password not in result
const user = await userRepo.findOne({
  filter: { where: { password: 'hashed_value' } }
});
```

### Relations with Hidden Properties

Hidden properties are also excluded from included relations:

```typescript
const post = await postRepo.findOne({
  filter: {
    include: [{ relation: 'author' }]
  }
});
// post.author will NOT include password, secret, etc.
```

### Accessing Hidden Data

When you need hidden fields (e.g., for authentication), bypass the repository:

```typescript
// Direct connector access - includes all fields
const connector = userRepo.getConnector();
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.email, 'john@example.com'));
// fullUser includes password, secret, apiKey
```


## Performance Optimization

### Core API for Flat Queries

The repository automatically uses Drizzle's Core API (faster) for simple queries:

```typescript
// Automatically optimized - uses Core API
const users = await repo.find({
  filter: {
    where: { status: 'active' },
    limit: 10,
    order: ['createdAt DESC']
  }
});
// Uses: db.select().from(table).where(...).orderBy(...).limit(10)

// Uses Query API (has relations)
const usersWithPosts = await repo.find({
  filter: {
    where: { status: 'active' },
    include: [{ relation: 'posts' }]
  }
});
// Uses: db.query.tableName.findMany({ with: { posts: true }, ... })
```

| Filter Options | API Used | Performance |
|----------------|----------|-------------|
| `where`, `limit`, `order`, `offset` only | Core API | ~15-20% faster |
| Has `include` (relations) | Query API | Standard |
| Has `fields` selection | Query API | Standard |

### Always Use Limit

Prevent memory exhaustion on large tables:

```typescript
// ✅ Good - bounded result set
await repo.find({
  filter: {
    where: { status: 'active' },
    limit: 100
  }
});

// ⚠️ Dangerous - could return millions of rows
await repo.find({
  filter: { where: { status: 'active' } }
});
```

### Pagination Pattern

```typescript
async function getPaginatedUsers(page: number, pageSize: number = 20) {
  const [users, total] = await Promise.all([
    userRepo.find({
      filter: {
        where: { status: 'active' },
        limit: pageSize,
        skip: (page - 1) * pageSize,
        order: ['createdAt DESC']
      }
    }),
    userRepo.count({ where: { status: 'active' } })
  ]);

  return {
    data: users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}
```

### WeakMap Cache

The filter builder caches table column metadata, avoiding repeated reflection:

```typescript
// Internal optimization - automatic
// First query: getTableColumns(schema) → cached
// Subsequent queries: retrieved from WeakMap
```


## TypeScript Return Types

### shouldReturn Inference

Repository methods infer return types based on `shouldReturn`:

```typescript
// shouldReturn: false - TypeScript knows data is null
const result1 = await repo.create({
  data: { name: 'John' },
  options: { shouldReturn: false }
});
// Type: Promise<{ count: number; data: null }>
console.log(result1.data); // null

// shouldReturn: true (default) - TypeScript knows data is the entity
const result2 = await repo.create({
  data: { name: 'John' },
  options: { shouldReturn: true }
});
// Type: Promise<{ count: number; data: User }>
console.log(result2.data.name); // 'John' - fully typed!

// Array operations
const results = await repo.createAll({
  data: [{ name: 'John' }, { name: 'Jane' }],
  options: { shouldReturn: true }
});
// Type: Promise<{ count: number; data: User[] }>
```

### Generic Return Types

Override return types for queries with relations:

```typescript
// Define expected return type
type UserWithPosts = User & {
  posts: Post[];
};

// Use generic override
const user = await userRepo.findOne<UserWithPosts>({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }]
  }
});

// TypeScript knows the structure!
if (user) {
  console.log(user.posts[0].title); // Fully typed
}
```

**Supported Methods:**
- `find<R>()`, `findOne<R>()`, `findById<R>()`
- `create<R>()`, `createAll<R>()`
- `updateById<R>()`, `updateAll<R>()`
- `deleteById<R>()`, `deleteAll<R>()`


## Debugging

### Log Option

Enable logging for specific operations:

```typescript
// Enable debug logging
await repo.create({
  data: { name: 'John', email: 'john@example.com' },
  options: {
    log: { use: true, level: 'debug' }
  }
});
// Output: [_create] Executing with opts: { data: [...], options: {...} }

// Available levels: 'debug', 'info', 'warn', 'error'
await repo.updateById({
  id: '123',
  data: { name: 'Jane' },
  options: { log: { use: true, level: 'info' } }
});
```

**Available on:** `create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll`

### Query Interface Validation

The repository validates schema registration on startup:

```typescript
// If schema key doesn't match, you get a helpful error:
// Error: [UserRepository] Schema key mismatch
// | Entity name 'User' not found in connector.query
// | Available keys: [Configuration, Post]
// | Ensure the model's TABLE_NAME matches the schema registration key
```


## Safety Features

### Empty Where Protection

Prevents accidental mass updates/deletes:

```typescript
// ❌ Throws error - empty where without force
await repo.deleteAll({ where: {} });

// ✅ Explicit force flag - logs warning, proceeds
await repo.deleteAll({
  where: {},
  options: { force: true }
});
// Warning: [_delete] Entity: User | Performing delete with empty condition
```

| Scenario | `force: false` (default) | `force: true` |
|----------|-------------------------|---------------|
| Empty `where` | Throws error | Logs warning, proceeds |
| Valid `where` | Executes normally | Executes normally |

### Constructor Type Validation

The `@repository` decorator validates constructor parameters:

```typescript
// ❌ Error: First parameter must extend AbstractDataSource
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(dataSource: any) { // 'any' not allowed!
    super(dataSource);
  }
}

// ✅ Correct: Concrete DataSource type
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }
}
```


## Direct Connector Access

For advanced queries not supported by the repository API:

```typescript
// Get the Drizzle connector
const connector = repo.getConnector();

// Raw Drizzle query
const results = await connector
  .select({
    userId: userTable.id,
    postCount: sql<number>`count(${postTable.id})`,
  })
  .from(userTable)
  .leftJoin(postTable, eq(userTable.id, postTable.authorId))
  .groupBy(userTable.id)
  .having(sql`count(${postTable.id}) > 5`);

// Use with caution - bypasses repository features like hidden properties
```


## Repository Class Hierarchy

| Class | Description |
|-------|-------------|
| `AbstractRepository` | Base class, defines method signatures |
| `ReadableRepository` | Read-only operations (find, findOne, count) |
| `PersistableRepository` | Adds write operations (create, update, delete) |
| `DefaultCRUDRepository` | Full CRUD - **use this one** |

### Creating a Read-Only Repository

```typescript
@repository({ model: AuditLog, dataSource: PostgresDataSource })
export class AuditLogRepository extends ReadableRepository<typeof AuditLog.schema> {
  // Only has: find, findOne, findById, count, existsWith
  // Write operations throw "NOT ALLOWED" error
}
```


## Default Filter Bypass

When models have a `defaultFilter` configured, you can bypass it for admin/maintenance operations:

```typescript
// Normal query - default filter applies
await repo.find({
  filter: { where: { status: 'active' } }
});
// WHERE isDeleted = false AND status = 'active' (if model has soft-delete default)

// Admin query - bypass default filter
await repo.find({
  filter: { where: { status: 'active' } },
  options: { skipDefaultFilter: true }
});
// WHERE status = 'active' (includes deleted records)
```

**Supported on all operations:**

```typescript
// Read operations
await repo.find({ filter, options: { skipDefaultFilter: true } });
await repo.findOne({ filter, options: { skipDefaultFilter: true } });
await repo.count({ where, options: { skipDefaultFilter: true } });

// Write operations
await repo.updateAll({ where, data, options: { skipDefaultFilter: true } });
await repo.deleteAll({ where, options: { skipDefaultFilter: true, force: true } });
```

**Combined with transactions:**

```typescript
const tx = await repo.beginTransaction();
await repo.updateAll({
  where: { status: 'archived' },
  data: { isDeleted: true },
  options: {
    transaction: tx,
    skipDefaultFilter: true
  }
});
await tx.commit();
```

> [!TIP]
> See [Default Filter](../filter-system/default-filter.md) for full documentation on configuring model default filters.


## Quick Reference

| Feature | Code |
|---------|------|
| Start transaction | `const tx = await repo.beginTransaction()` |
| Use transaction | `options: { transaction: tx }` |
| Commit | `await tx.commit()` |
| Rollback | `await tx.rollback()` |
| Bypass default filter | `options: { skipDefaultFilter: true }` |
| Enable logging | `options: { log: { use: true, level: 'debug' } }` |
| Force delete all | `options: { force: true }` |
| Skip returning data | `options: { shouldReturn: false }` |
| Access connector | `repo.getConnector()` |


## Next Steps

- [Overview](./index.md) - Repository basics
- [Filter System](../filter-system/) - Query operators
- [Default Filter](../filter-system/default-filter.md) - Automatic filter configuration
- [Repository Mixins](./mixins.md) - Composable features
- [Relations & Includes](./relations.md) - Eager loading
- [JSON Path Filtering](../filter-system/json-filtering) - JSONB queries
- [Array Operators](../filter-system/array-operators) - PostgreSQL arrays
