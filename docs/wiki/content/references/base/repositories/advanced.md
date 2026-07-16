---
title: Advanced Repository Features
description: Transactions, row-level locking, hidden properties, performance, and safety guards
difficulty: intermediate
---

# Advanced Repository Features

Exhaustive reference for everything beyond basic CRUD - transactions, row-level locking, hidden-property exclusion, performance tuning, return-type inference, debugging, and the built-in safety guards. For the common tasks, start with the [Repositories overview](/references/base/repositories/).

**Files:**

- [`packages/core/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/core/abstract.ts) - engine-neutral `AbstractRepository`
- [`packages/core/src/base/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/types.ts) - `IExtraOptions`, `TLockOptions`, `TCount`, `TDataRange`
- [`packages/core/src/connectors/postgres/repositories/core/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/base.ts) - `RelationalBaseRepository` - hidden-column exclusion, `buildQuery`, `resolveConnector`, lock validation
- [`packages/core/src/connectors/postgres/repositories/core/readable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/readable.ts) - `ReadableRelationalRepository` - Core API vs. Query API selection, `shouldQueryRange`
- [`packages/core/src/connectors/postgres/repositories/core/persistable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/persistable.ts) - `PersistableRelationalRepository` - create/update/delete, empty-where guard
- [`packages/core/src/connectors/postgres/repositories/core/soft-deletable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/soft-deletable.ts) - `SoftDeletableRelationalRepository`
- [`packages/core/src/connectors/postgres/repositories/dialect/update.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/update.ts) - `UpdateBuilder` - nested JSON path updates
- [`packages/core/src/connectors/postgres/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/abstract.ts) - `beginTransaction()`, isolation levels

## Transactions

Orchestrate atomic operations across multiple repositories. `repository.beginTransaction()` delegates to `dataSource.beginTransaction()` and returns an `IDatabaseTransaction` (`isActive`, `commit()`, `rollback()`, `connector`, `isolationLevel`).

### Basic transaction

```typescript
const tx = await repository.beginTransaction();

try {
  // All operations use the same transaction
  const user = await userRepository.create({
    data: { name: 'Alice', email: 'alice@example.com' },
    options: { transaction: tx },
  });

  const profile = await profileRepository.create({
    data: { userId: user.data.id, bio: 'Hello!' },
    options: { transaction: tx },
  });

  await tx.commit();
  return { user: user.data, profile: profile.data };
} catch (error) {
  await tx.rollback();
  throw error;
}
```

> [!WARNING] `rollback()` can throw
> A failed `COMMIT` or `ROLLBACK` **throws** rather than resolving as success - a poisoned connection is destroyed rather than returned to the pool. Because `rollback()` can throw and is normally called from a `catch`, nest it in its own `try...catch` if the rollback error matters; a `rollback()` called after the transaction already failed is a silent no-op, so the `catch { await tx.rollback(); throw error; }` pattern shown above is always safe. See [DataSources - Full Reference](/references/base/datasources-reference#transaction-support) for the full commit/rollback lifecycle.

### Isolation levels

Control how transactions interact with concurrent operations using the `IsolationLevels` const class:

```typescript
import { IsolationLevels } from '@venizia/ignis/postgres';

const tx = await repository.beginTransaction({
  isolationLevel: IsolationLevels.SERIALIZABLE,
});
```

| Level | Description | Use case |
|-------|-------------|----------|
| `IsolationLevels.READ_COMMITTED` | Default. See committed data only | Most applications |
| `IsolationLevels.REPEATABLE_READ` | Consistent reads within transaction | Reports, analytics |
| `IsolationLevels.SERIALIZABLE` | Full isolation, prevents anomalies | Financial, inventory |

A plain string literal (`'SERIALIZABLE'`) works too - `isolationLevel` is typed `TIsolationLevel`, a string union the const class's values satisfy.

### Transaction with multiple repositories

```typescript
async function transferFunds(fromId: string, toId: string, amount: number) {
  const tx = await accountRepository.beginTransaction();

  try {
    await accountRepository.updateById({
      id: fromId,
      data: { balance: sql`balance - ${amount}` },
      options: { transaction: tx },
    });

    await accountRepository.updateById({
      id: toId,
      data: { balance: sql`balance + ${amount}` },
      options: { transaction: tx },
    });

    await transferRepository.create({
      data: { fromId, toId, amount, status: 'completed' },
      options: { transaction: tx },
    });

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
```

## Row-Level Locking

Acquire pessimistic locks on selected rows within a transaction using PostgreSQL's `SELECT ... FOR UPDATE/SHARE` syntax.

### Basic usage

Pass `lock` in `options` alongside a `transaction`:

```typescript
const tx = await repository.beginTransaction();

try {
  // Lock the row - other transactions will wait
  const item = await repository.findOne({
    filter: { where: { id: '123' } },
    options: {
      transaction: tx,
      lock: { strength: 'update' },
    },
  });

  // Safe to modify - no concurrent changes possible
  await repository.updateById({
    id: '123',
    data: { quantity: item.quantity - 1 },
    options: { transaction: tx },
  });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

### Lock strengths

Use the `LockStrengths` const class or string literals:

```typescript
import { LockStrengths } from '@venizia/ignis';

// Using constant
lock: { strength: LockStrengths.UPDATE }

// Using string literal
lock: { strength: 'update' }
```

| Strength | SQL | Use case |
|----------|-----|----------|
| `update` | `FOR UPDATE` | Exclusive lock for writes |
| `no key update` | `FOR NO KEY UPDATE` | Exclusive lock, allows concurrent `FOR KEY SHARE` |
| `share` | `FOR SHARE` | Shared read lock, prevents writes |
| `key share` | `FOR KEY SHARE` | Weakest lock, only prevents key changes |

### Wait behavior

Control what happens when rows are already locked via `lock.config`:

```typescript
// Skip locked rows (queue-style worker pattern)
const items = await repository.find({
  filter: { where: { status: 'pending' }, limit: 10 },
  options: {
    transaction: tx,
    lock: { strength: 'update', config: { skipLocked: true } },
  },
});

// Fail immediately instead of waiting
const item = await repository.findOne({
  filter: { where: { id: '123' } },
  options: {
    transaction: tx,
    lock: { strength: 'update', config: { noWait: true } },
  },
});
```

| Config | SQL | Behavior |
|--------|-----|----------|
| *(none)* | `FOR UPDATE` | Wait until lock is released |
| `{ noWait: true }` | `FOR UPDATE NOWAIT` | Throw error immediately if locked |
| `{ skipLocked: true }` | `FOR UPDATE SKIP LOCKED` | Silently skip locked rows |

`noWait` and `skipLocked` are mutually exclusive at the type level (`TLockConfig`).

### Constraints

> [!WARNING]
> Row-level locking requires a **transaction** and is **incompatible with `include`/`fields`** in the filter (these force the Drizzle Query API, which does not support `.for()`).

```typescript
// Error - no transaction
await repository.findOne({
  filter: { where: { id: '123' } },
  options: { lock: { strength: 'update' } },
});

// Error - include forces the Query API
await repository.findOne({
  filter: { where: { id: '123' }, include: [{ relation: 'posts' }] },
  options: { transaction: tx, lock: { strength: 'update' } },
});
```

**Supported methods:** `find`, `findOne`, `findById` (delegates to `findOne`). Not `count`/`existsWith`.

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

### Automatic exclusion

Hidden properties are excluded at the **SQL level** for maximum security:

```typescript
// Read operations exclude hidden properties
const user = await userRepository.findById({ id: '123' });
// Result: { id: '123', email: 'john@example.com', name: 'John' }
// Note: password, secret, apiKey are NOT included

// Write operations exclude hidden from RETURNING clause
const created = await userRepository.create({
  data: { email: 'new@example.com', password: 'hashed_secret' },
});
// Result: { count: 1, data: { id: '456', email: 'new@example.com' } }
// Note: password stored in DB but not returned
```

### Filtering by hidden properties

You **can** filter by hidden properties - you just can't see them in results:

```typescript
// This works! Finds user but password not in result
const user = await userRepository.findOne({
  filter: { where: { password: 'hashed_value' } },
});
```

### Relations with hidden properties

Hidden properties are also excluded from included relations - see [Relations & Includes](./relations#hidden-properties-in-relations).

```typescript
const post = await postRepository.findOne({
  filter: { include: [{ relation: 'author' }] },
});
// post.author will NOT include password, secret, etc.
```

### Accessing hidden data

When you need hidden fields (e.g., for authentication), bypass the repository via the `connector` getter:

```typescript
// Direct connector access - includes all fields
const connector = userRepository.connector;
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.email, 'john@example.com'));
// fullUser includes password, secret, apiKey
```

## Performance Optimization

### Core API for flat queries

The repository automatically uses Drizzle's Core API (faster) for simple queries; a query with `include` or `fields` forces the Query API instead:

```typescript
// Automatically optimized - uses Core API
const users = await repository.find({
  filter: {
    where: { status: 'active' },
    limit: 10,
    order: ['createdAt DESC'],
  },
});
// Uses: db.select().from(table).where(...).orderBy(...).limit(10)

// Uses Query API (has relations)
const usersWithPosts = await repository.find({
  filter: {
    where: { status: 'active' },
    include: [{ relation: 'posts' }],
  },
});
// Uses: db.query.tableName.findMany({ with: { posts: true }, ... })
```

| Filter options | API used | Performance |
|----------------|----------|-------------|
| `where`, `limit`, `order`, `offset`/`skip` only | Core API | ~15-20% faster |
| Has `include` (relations) | Query API | Standard |
| Has `fields` selection | Query API | Standard |

### Always use limit

Prevent memory exhaustion on large tables:

```typescript
// Good - bounded result set
await repository.find({
  filter: { where: { status: 'active' }, limit: 100 },
});

// Dangerous - could return millions of rows
await repository.find({
  filter: { where: { status: 'active' } },
});
```

> [!NOTE]
> `find()` always applies a default limit when no `limit` is set in the filter - the model's `@model({ settings: { defaultLimit } })` if declared, otherwise the global default of `10`. Pass an explicit `limit` in the filter to override either default. `findOne`/`findById` are unaffected - they force `limit: 1` on the Core API path regardless.

### Pagination with data range

Use `shouldQueryRange` to get both data and total count in a single call:

```typescript
const result = await userRepository.find({
  filter: {
    where: { status: 'active' },
    limit: 20,
    skip: 40,
    order: ['createdAt DESC'],
  },
  options: { shouldQueryRange: true },
});

// Result type: { data: User[], range: { start: number, end: number, total: number } }
// range follows HTTP Content-Range standard (inclusive end index)
// Example: { data: [...20 users], range: { start: 40, end: 59, total: 150 } }
```

- **Parallel by default.** `find` and `count` execute concurrently via `Promise.all`.
- **Sequential inside a transaction.** A transaction connector wraps a single client, so parallel queries on it are not safe - the two queries run one after another instead.

### WeakMap cache

- **Column metadata is cached per schema.** The filter builder caches table column metadata (`getCachedColumns`) to avoid repeated reflection.
- **Populated on first access.** The first access calls Drizzle's `getTableColumns()` and caches the result; subsequent queries retrieve it from the `WeakMap`.
- **No configuration needed.** The cache is automatic.

## TypeScript Return Types

### shouldReturn inference

Repository methods infer return types based on `shouldReturn`:

```typescript
// shouldReturn: false - TypeScript knows data is null
const result1 = await repository.create({
  data: { name: 'John' },
  options: { shouldReturn: false },
});
// Type: Promise<{ count: number; data: undefined | null }>

// shouldReturn: true (default) - TypeScript knows data is the entity
const result2 = await repository.create({
  data: { name: 'John' },
  options: { shouldReturn: true },
});
// Type: Promise<{ count: number; data: User }>
console.log(result2.data.name); // 'John' - fully typed!

// Array operations
const results = await repository.createAll({
  data: [{ name: 'John' }, { name: 'Jane' }],
  options: { shouldReturn: true },
});
// Type: Promise<{ count: number; data: User[] }>
```

### Generic return types

Override return types for queries with relations:

```typescript
type UserWithPosts = User & {
  posts: Post[];
};

const user = await userRepository.findOne<UserWithPosts>({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }],
  },
});

if (user) {
  console.log(user.posts[0].title); // Fully typed
}
```

**Supported methods:**
- `find<R>()`, `findOne<R>()`, `findById<R>()`
- `create<R>()`, `createAll<R>()`
- `updateById<R>()`, `updateAll<R>()`, `updateBy<R>()`
- `deleteById<R>()`, `deleteAll<R>()`, `deleteBy<R>()`

## Debugging

### Log option

Enable logging for specific operations via `TRepositoryLogOptions` (`{ use: boolean; level?: TLogLevel }`):

```typescript
await repository.create({
  data: { name: 'John', email: 'john@example.com' },
  options: { log: { use: true, level: 'debug' } },
});
// Output: [_create] Executing with opts: { data: [...], options: {...} }

// Available levels: 'debug', 'info', 'warn', 'error'
await repository.updateById({
  id: '123',
  data: { name: 'Jane' },
  options: { log: { use: true, level: 'info' } },
});
```

**Available on:** `create`, `createAll`, `updateById`, `updateAll`, `updateBy`, `deleteById`, `deleteAll`, `deleteBy` - every write operation that goes through the internal `_create`, `_update`, or `_delete` methods.

### Query interface validation

The repository validates schema registration on first Query API access:

```typescript
// If schema key doesn't match, you get a helpful error:
// Error: [UserRepository] Schema key mismatch
// | Entity name 'User' not found in connector.query
// | Available keys: [Configuration, Post]
// | Ensure the model's TABLE_NAME matches the schema registration key
```

## Safety Features

### Empty where protection

`updateAll`/`updateBy`/`deleteAll`/`deleteBy` refuse an empty `where` unless `force: true` is passed - prevents accidental mass updates/deletes:

```typescript
// Throws error - empty where without force
await repository.deleteAll({ where: {} });

// Explicit force flag - logs warning, proceeds
await repository.deleteAll({
  where: {},
  options: { force: true },
});
// Warning: [_delete] Entity: User | Performing delete with empty condition
```

| Scenario | `force: false` (default) | `force: true` |
|----------|-------------------------|---------------|
| Empty `where` | Throws error | Logs warning, proceeds |
| Valid `where` | Executes normally | Executes normally |

> [!NOTE]
> `updateById` and `deleteById` always have a non-empty where (`{ id }`) so they are not affected by this guard.

### Transaction safety

`resolveConnector` validates transaction state before use:

```typescript
// If a transaction has already been committed or rolled back:
// Error: [UserRepository][resolveConnector] Transaction is no longer active
```

## Direct Connector Access

For advanced queries not supported by the repository API, `repository.connector` is a getter (not a method) that resolves the datasource's Drizzle connector:

```typescript
const connector = repository.connector;

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

The PostgreSQL connector's canonical names carry the engine in the class name; the historical `*Repository` names remain available as compatibility aliases re-exporting the exact same classes.

| Canonical class | Alias | Scope | Description |
|---|---|---|---|
| `AbstractRepository` | - | N/A | Engine-neutral abstract base (`src/base`), defines all method signatures, lazy `dataSource`/`entity` resolution. Plain `BaseHelper` subclass, no mixin composition. |
| `RelationalBaseRepository` | `PostgresBaseRepository` | N/A | PostgreSQL connector base. Adds `FilterBuilder`/`UpdateBuilder`, hidden-column exclusion (`getHiddenProperties`/`getVisibleProperties`), default-filter application (`getDefaultFilter`/`applyDefaultFilter`) - the behavior formerly provided by the now-removed `FieldsVisibilityMixin`/`DefaultFilterMixin` (see [Repository Mixins](./mixins)). |
| `ReadableRelationalRepository` | `ReadableRepository` | `READ_ONLY` | Read-only operations (`find`, `findOne`, `findById`, `count`, `existsWith`). Write operations throw errors. |
| `PersistableRelationalRepository` | `PersistableRepository` | `READ_WRITE` | Adds write operations (`create`, `update`, `delete`) with `UpdateBuilder`. |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | `READ_WRITE` | Extends `PersistableRelationalRepository` with no additional logic - **recommended default**. |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | `READ_WRITE` | Extends `DefaultRelationalRepository` with soft delete + restore operations - see [SoftDeletableRepository](./soft-deletable). |

Code samples throughout the docs use the alias names (`DefaultCRUDRepository`, `ReadableRepository`) since that is what `@venizia/ignis/postgres` code most commonly imports today.

### Creating a read-only repository

```typescript
@repository({ model: AuditLog, dataSource: PostgresDataSource })
export class AuditLogRepository extends ReadableRepository<typeof AuditLog.schema> {
  // Only has: find, findOne, findById, count, existsWith
  // Write operations throw "NOT ALLOWED" error
}
```

### Alias methods

`AbstractRepository` provides two alias methods for convenience:

- `updateBy(opts)` - Alias for `updateAll(opts)`. Delegates directly.
- `deleteBy(opts)` - Alias for `deleteAll(opts)`. Delegates directly.

Both accept the same parameters (`where`, `data`/`options`) and support `shouldReturn` and `force` options.

## Default Filter Bypass

When models have a `defaultFilter` configured, you can bypass it for admin/maintenance operations:

```typescript
// Normal query - default filter applies
await repository.find({
  filter: { where: { status: 'active' } },
});
// WHERE isDeleted = false AND status = 'active' (if model has soft-delete default)

// Admin query - bypass default filter
await repository.find({
  filter: { where: { status: 'active' } },
  options: { shouldSkipDefaultFilter: true },
});
// WHERE status = 'active' (includes deleted records)
```

**Supported on all operations:**

```typescript
// Read operations
await repository.find({ filter, options: { shouldSkipDefaultFilter: true } });
await repository.findOne({ filter, options: { shouldSkipDefaultFilter: true } });
await repository.count({ where, options: { shouldSkipDefaultFilter: true } });

// Write operations
await repository.updateAll({ where, data, options: { shouldSkipDefaultFilter: true } });
await repository.deleteAll({ where, options: { shouldSkipDefaultFilter: true, force: true } });
```

**Combined with transactions:**

```typescript
const tx = await repository.beginTransaction();
await repository.updateAll({
  where: { status: 'archived' },
  data: { isDeleted: true },
  options: {
    transaction: tx,
    shouldSkipDefaultFilter: true,
  },
});
await tx.commit();
```

> [!TIP]
> See [Default Filter](../filter-system/default-filter) for full documentation on configuring model default filters.

## Nested JSON Updates

Repositories support updating specific fields within `json`/`jsonb` columns without overwriting the entire object, via **JSON path notation** in the update data - handled by `UpdateBuilder`.

### Basic usage

Use dot notation keys to target nested properties:

```typescript
// Assume 'metadata' is a JSONB column
// Current value: { theme: 'light', notifications: { email: true } }

await repository.updateById({
  id: '123',
  data: {
    // Update only the theme, preserving other fields
    'metadata.theme': 'dark',
  },
});

// New value: { theme: 'dark', notifications: { email: true } }
```

### Supported features

- **Deep nesting:** update properties at any depth (e.g., `settings.display.font.size`).
- **Array access:** update array elements by index (e.g., `tags[0]`).
- **Auto-creation:** creates missing intermediate keys automatically (`jsonb_set` with `create_missing = true`).
- **Type safety:** validates that the target column is a JSON/JSONB type.
- **Multiple updates:** multiple updates to the same column are chained as nested `jsonb_set` calls.
- **Mixed updates:** combine regular column updates with JSON path updates in a single call.

### Examples

#### Deeply nested updates

```typescript
await repository.updateById({
  id: '123',
  data: {
    'metadata.settings.display.fontSize': 16,
    'metadata.settings.display.showSidebar': true,
  },
});
```

#### Array element updates

```typescript
await repository.updateById({
  id: '123',
  data: {
    // Set the first address as primary
    'metadata.addresses[0].primary': true,
  },
});
```

#### Mixed updates (regular + JSON)

```typescript
await repository.updateById({
  id: '123',
  data: {
    status: 'active',           // Regular column
    'metadata.lastLogin': now,  // JSON path
    'preferences.lang': 'en',   // Another JSON path
  },
});
```

### Security & validation

The framework validates JSON paths to prevent SQL injection:

- **Allowed characters:** path components must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/` (identifiers, kebab-case, or array indices).
- **Column type validation:** only `json` and `jsonb` columns are allowed. Other column types throw an error.
- **Values:** values are serialized to JSONB literals with proper escaping.

> [!NOTE]
> This feature uses PostgreSQL's `jsonb_set` function. It is only available for columns defined as `json` or `jsonb`.

## ExtraOptions Reference

All repository operations accept an `options` parameter (`IExtraOptions`/its postgres narrowing `IDatabaseExtraOptions`) with these fields:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transaction` | `IDatabaseTransaction` | - | Transaction context for the operation |
| `log` | `{ use: boolean; level?: TLogLevel }` | - | Enable operation logging |
| `shouldSkipDefaultFilter` | `boolean` | `false` | Bypass the default filter from model settings |
| `lock` | `TLockOptions` | - | Row-level locking (requires transaction, Core API only) |

Write operations additionally support:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldReturn` | `boolean` | `true` | Return the created/updated/deleted data |
| `force` | `boolean` | `false` | Allow empty `where` condition on bulk operations |
| `shouldQueryRange` | `boolean` | `false` | Return `{ data, range }` with total count (find only) |

## Quick Reference

| Feature | Code |
|---------|------|
| Start transaction | `const tx = await repository.beginTransaction()` |
| Use transaction | `options: { transaction: tx }` |
| Commit | `await tx.commit()` |
| Rollback | `await tx.rollback()` |
| Bypass default filter | `options: { shouldSkipDefaultFilter: true }` |
| Lock rows for update | `options: { transaction: tx, lock: { strength: 'update' } }` |
| Lock + skip locked | `options: { transaction: tx, lock: { strength: 'update', config: { skipLocked: true } } }` |
| Enable logging | `options: { log: { use: true, level: 'debug' } }` |
| Force delete all | `options: { force: true }` |
| Skip returning data | `options: { shouldReturn: false }` |
| Get data + count | `options: { shouldQueryRange: true }` |
| Access connector | `repository.connector` |

## See also

- [Repositories overview](/references/base/repositories/) - CRUD basics, common tasks
- [Relations & Includes](./relations) - eager loading, nested `scope` filters, many-to-many
- [SoftDeletableRepository](./soft-deletable) - soft delete, restore, hard delete
- [Repository Mixins (Removed)](./mixins) - where `FieldsVisibilityMixin`/`DefaultFilterMixin` behavior lives now
- [Filter System](/references/base/filter-system/) - every `where` operator, JSON paths, array operators
- [Default Filter](/references/base/filter-system/default-filter) - automatic filter configuration
- [DataSources - Full Reference](/references/base/datasources-reference) - transaction internals, isolation levels, driver seam
- [Transactions guide](/guides/core-concepts/persistent/transactions) - multi-operation database transactions
