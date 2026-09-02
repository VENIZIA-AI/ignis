---
title: Advanced Repository Features
description: Transactions, row-level locking, hidden properties, performance, and safety guards
difficulty: intermediate
---

# Advanced Repository Features

Everything beyond basic CRUD - transactions, row-level locking, hidden-property exclusion, performance tuning, return-type inference, debugging, and the built-in safety guards. For the common tasks, start with the [Repositories overview](/references/base/repositories/).

**Files:**

- [`packages/kernel/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/core/abstract.ts) - engine-neutral `AbstractRepository`
- [`packages/kernel/src/base/repositories/common/types/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/common/types/index.ts) - `IExtraOptions`, `TLockOptions`, `TCount`, `TDataRange`, `IReadRetryOptions`, `IWithReadRetry`, `TFindOptions`, `TFindOneOptions`, `TFindRangeOptions`, `TDataWithRange`
- [`packages/helpers/src/modules/retry/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/retry/helper.ts) - `RetryHelper.executeWithRetryUntil`, the engine behind `options.retry`
- [`packages/connectors/src/relational/postgres/repositories/core/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/core/base.ts) - `RelationalBaseRepository` - hidden-column exclusion, `buildQuery`, `resolveConnector`, lock validation
- [`packages/connectors/src/relational/postgres/repositories/core/readable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/core/readable.ts) - `ReadableRelationalRepository` - Core API vs. Query API selection, `shouldQueryRange`
- [`packages/connectors/src/relational/postgres/repositories/core/persistable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/core/persistable.ts) - `PersistableRelationalRepository` - create/update/delete, empty-where guard
- [`packages/connectors/src/relational/postgres/repositories/core/soft-deletable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/core/soft-deletable.ts) - `SoftDeletableRelationalRepository`
- [`packages/connectors/src/relational/postgres/repositories/dialect/update.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/dialect/update.ts) - `UpdateBuilder` - nested JSON path updates
- [`packages/connectors/src/relational/postgres/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/datasources/abstract.ts) - `beginTransaction()`, isolation levels

## Transactions

Operations on separate repositories only become one atomic unit when they share a transaction handle. Start one and pass it to every call that must succeed or fail together:

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

### The rules

- `beginTransaction()` delegates to `dataSource.beginTransaction()`.
- The returned `IDatabaseTransaction` exposes `isActive`, `commit()`, `rollback()`, `connector`, and `isolationLevel`.
- Pass the same `tx` as `options.transaction` on every call that belongs to the unit of work.

> [!WARNING] `rollback()` can throw
> A failed `COMMIT` or `ROLLBACK` throws rather than resolving as success - a poisoned connection is destroyed rather than returned to the pool. Because `rollback()` can throw and is normally called from a `catch`, nest it in its own `try...catch` if the rollback error matters. A `rollback()` called after the transaction already failed is a silent no-op. The `catch { await tx.rollback(); throw error; }` pattern in the basic transaction example is always safe. See [DataSources - Full Reference](/references/base/datasources-reference#transaction-support) for the full commit/rollback lifecycle.

### Isolation levels

Pass `isolationLevel` to control how the transaction sees concurrent changes:

```typescript
import { IsolationLevels } from '@venizia/ignis/postgres';

const tx = await repository.beginTransaction({
  isolationLevel: IsolationLevels.SERIALIZABLE,
});
```

| Level | SQL | Use case |
|---|---|---|
| `IsolationLevels.READ_COMMITTED` | `READ COMMITTED` | Default. Sees committed data only |
| `IsolationLevels.REPEATABLE_READ` | `REPEATABLE READ` | Consistent reads within the transaction |
| `IsolationLevels.SERIALIZABLE` | `SERIALIZABLE` | Full isolation, prevents anomalies |

A plain string literal (`'SERIALIZABLE'`) works too - `isolationLevel` is typed `TIsolationLevel`, a string union the const class's values satisfy.

### Raw SQL inside a transaction

A transaction also covers Drizzle's `sql` template for atomic column updates:

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

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
```

## Row-Level Locking

Acquire pessimistic locks on selected rows inside a transaction with PostgreSQL's `SELECT ... FOR UPDATE/SHARE`. Pass `lock` alongside `transaction`:

```typescript
const tx = await repository.beginTransaction();

try {
  // Lock the row - other transactions will wait
  const item = await repository.findOne({
    filter: { where: { id: '123' } },
    options: { transaction: tx, lock: { strength: 'update' } },
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

**Supported methods:** `find`, `findOne`, `findById` (delegates to `findOne`). Not `count`/`existsWith`.

### Lock strengths

Use the `LockStrengths` const class or an equivalent string literal:

```typescript
import { LockStrengths } from '@venizia/ignis';

lock: { strength: LockStrengths.UPDATE }
// same as
lock: { strength: 'update' }
```

| Strength | SQL | Use case |
|---|---|---|
| `update` | `FOR UPDATE` | Exclusive lock for writes |
| `no key update` | `FOR NO KEY UPDATE` | Exclusive lock, allows concurrent `FOR KEY SHARE` |
| `share` | `FOR SHARE` | Shared read lock, prevents writes |
| `key share` | `FOR KEY SHARE` | Weakest lock, only prevents key changes |

### Wait behavior

Control what happens when a targeted row is already locked via `lock.config`:

```typescript
// Skip locked rows (queue-style worker pattern)
const items = await repository.find({
  filter: { where: { status: 'pending' }, limit: 10 },
  options: { transaction: tx, lock: { strength: 'update', config: { skipLocked: true } } },
});

// Fail immediately instead of waiting
const item = await repository.findOne({
  filter: { where: { id: '123' } },
  options: { transaction: tx, lock: { strength: 'update', config: { noWait: true } } },
});
```

| Config | SQL | Behavior |
|---|---|---|
| *(none)* | `FOR UPDATE` | Wait until the lock is released |
| `{ noWait: true }` | `FOR UPDATE NOWAIT` | Throw immediately if locked |
| `{ skipLocked: true }` | `FOR UPDATE SKIP LOCKED` | Silently skip locked rows |

`noWait` and `skipLocked` are mutually exclusive at the type level (`TLockConfig`).

> [!WARNING] Requires a transaction, incompatible with `include`/`fields`
> Row-level locking needs a transaction and cannot combine with `include`/`fields` in the filter - both force the Drizzle Query API, which has no `.for()`.
>
> ```typescript
> // Error - no transaction
> await repository.findOne({
>   filter: { where: { id: '123' } },
>   options: { lock: { strength: 'update' } },
> });
>
> // Error - include forces the Query API
> await repository.findOne({
>   filter: { where: { id: '123' }, include: [{ relation: 'posts' }] },
>   options: { transaction: tx, lock: { strength: 'update' } },
> });
> ```

## Read Retry (Replica Lag)

Behind a replicated pool (e.g. PgDog), a read right after a write can land on a replica that has not caught up. The row looks missing or stale. Pass `retry` to re-read until it is fresh:

```typescript
// create -> read: default predicate ("result is non-null") is enough
const user = await userRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});

// update -> read: tell retry what "fresh" means
const order = await orderRepository.findById({
  id,
  options: { retry: { until: result => result?.status === 'PAID' } },
});
```

Works the same on PostgreSQL and search (Typesense, Meilisearch) repositories.

### The rules

- Retry happens only when the read succeeded but `until(result)` says "not yet".
- A real database error is never retried. It throws immediately, same as without `retry`.
- Out of attempts? You get the last result as-is. No new error.
- Inside a transaction, retry is skipped - transactions already go to the primary. Locked reads (`lock`) require a transaction, so they never retry either.
- On [`SoftDeletableRepository.findById`](/references/base/repositories/soft-deletable#findbyid-with-isstrict), `isStrict: true` is checked only after the attempts run out. A strict read waits out replica lag before it throws `404`.
- Write verbs do not have this option. `retry` on a write is a compile error.

### Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `maxAttempts` | `number` | `3` | Total reads, including the first. Below `1` throws. |
| `until` | `(result) => boolean` | per verb (below) | Return `true` to stop: "fresh enough". |
| `maxTotalMs` | `number` | unlimited | Stop starting new attempts after this much time. Never cuts a running read short. |
| `backoff` | `IRetryBackoffOptions` | 50ms up to 500ms, jittered | Wait between attempts. Details: [Retry Utility](/references/utilities/retry). |
| `signal` | `AbortSignal` | - | Cancel the loop. An abort rejects the call. |

`until` is typed per verb - the predicate sees exactly what the verb returns:

| Verb | `until` sees | Default: stops when |
|---|---|---|
| `findOne` / `findById` | `TNullable<R>` | result is not `null`/`undefined` |
| `find` | `Array<R>` | array is non-empty |
| `find` + `shouldQueryRange: true` | `{ data: R[]; range: ... }` | `data` is non-empty |

> [!WARNING] Empty is a normal answer for `find`
> `find`'s default predicate is "array is non-empty". A `find` that legitimately matches nothing will burn all attempts before returning `[]`. Where "no results" is normal, pass your own `until` - or do not use `retry` there.

> [!TIP]
> `retry` runs on `executeWithRetryUntil` from `@venizia/ignis-helpers` - use it directly for any non-repository polling. See [Retry Utility](/references/utilities/retry).

## Hidden Properties

Fields like `password` must never leave the database by accident. Declare them once on the model and every read path drops them for you:

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

```typescript
const user = await userRepository.findById({ id: '123' });
// { id: '123', email: 'john@example.com', name: 'John' } - no password, secret, apiKey
```

### The rules

- Exclusion happens at the **SQL level** - hidden columns are never selected, not filtered out afterward.
- Read operations exclude hidden properties from the result.
- Write operations exclude hidden properties from the `RETURNING` clause - the value is still written, only not echoed back.
- You **can** filter `where` on a hidden property; you still cannot see it in the result.
- Hidden properties are also excluded from included relations - see [Relations & Includes](./relations#hidden-properties-in-relations).
- Need a hidden field anyway (e.g. to verify a password hash)? Use `repository.connector` to bypass the exclusion - see [Direct Connector Access](#direct-connector-access).

## Performance Optimization

### Core API for flat queries

A query with no `include`/`fields` runs on Drizzle's Core API, which is faster than the Query API a relation forces:

```typescript
// Automatically optimized - uses Core API
const users = await repository.find({
  filter: { where: { status: 'active' }, limit: 10, order: ['createdAt DESC'] },
});
// db.select().from(table).where(...).orderBy(...).limit(10)

// Has a relation - uses Query API
const usersWithPosts = await repository.find({
  filter: { where: { status: 'active' }, include: [{ relation: 'posts' }] },
});
// db.query.tableName.findMany({ with: { posts: true }, ... })
```

| Filter options | API used | Performance |
|---|---|---|
| `where`, `limit`, `order`, `offset`/`skip` only | Core API | ~15-20% faster |
| Has `include` (relations) | Query API | Standard |
| Has `fields` selection | Query API | Standard |

### Always set a limit

An unbounded `find` can return millions of rows:

```typescript
// Bounded result set
await repository.find({ filter: { where: { status: 'active' }, limit: 100 } });

// Dangerous - no limit in the filter
await repository.find({ filter: { where: { status: 'active' } } });
```

> [!NOTE]
> `find()` always applies a default limit when the filter has none. It uses the model's `@model({ settings: { defaultLimit } })` if declared, otherwise the global default of `10`. Pass an explicit `limit` to override either default. `findOne`/`findById` are unaffected - they force `limit: 1` on the Core API path regardless.

### Pagination with data range

Pass `shouldQueryRange` to get data and total count from a single call:

```typescript
const result = await userRepository.find({
  filter: { where: { status: 'active' }, limit: 20, skip: 40, order: ['createdAt DESC'] },
  options: { shouldQueryRange: true },
});
// { data: User[], range: { start: 40, end: 59, total: 150 } }
// range follows the HTTP Content-Range standard (inclusive end index)
```

- **Parallel by default.** `find` and `count` execute concurrently via `Promise.all`.
- **Sequential inside a transaction.** A transaction connector wraps a single client, so parallel queries on it are not safe - the two queries run one after another instead.

### WeakMap cache

- **Column metadata is cached per schema.** The filter builder caches table column metadata (`getCachedColumns`) to avoid repeated reflection.
- **Populated on first access.** The first access calls Drizzle's `getTableColumns()` and caches the result; later queries read the `WeakMap` instead.
- **No configuration needed.** The cache is automatic.

## TypeScript Return Types

### shouldReturn inference

`shouldReturn` decides the result shape at the type level, no manual casting needed:

```typescript
// shouldReturn: false - TypeScript knows data is null
const result1 = await repository.create({
  data: { name: 'John' },
  options: { shouldReturn: false },
});
// Promise<{ count: number; data: undefined | null }>

// shouldReturn: true (default) - TypeScript knows data is the entity
const result2 = await repository.create({ data: { name: 'John' } });
console.log(result2.data.name); // 'John' - fully typed
```

The same inference applies to `createAll`, `updateById`, `updateAll`, `updateBy`, `deleteById`, `deleteAll`, `deleteBy`.

### Generic return types

Pass a type argument to widen the result for a query with relations:

```typescript
type UserWithPosts = User & { posts: Post[] };

const user = await userRepository.findOne<UserWithPosts>({
  filter: { where: { id: '123' }, include: [{ relation: 'posts' }] },
});

if (user) {
  console.log(user.posts[0].title); // Fully typed
}
```

**Supported on:** `find<R>()`, `findOne<R>()`, `findById<R>()`, `create<R>()`, `createAll<R>()`, `updateById<R>()`, `updateAll<R>()`, `updateBy<R>()`, `deleteById<R>()`, `deleteAll<R>()`, `deleteBy<R>()`.

## Debugging

### Log option

Pass `log` to trace a single operation without turning on logging globally:

```typescript
await repository.create({
  data: { name: 'John', email: 'john@example.com' },
  options: { log: { use: true, level: 'debug' } },
});
// [_create] Executing with opts: { data: [...], options: {...} }
```

| Level | Meaning |
|---|---|
| `debug` | Verbose - opts and intermediate state |
| `info` | Default when `level` is omitted |
| `warn` | Notable but non-fatal conditions |
| `error` | Failure paths |

**Supported on:** `create`, `createAll`, `updateById`, `updateAll`, `updateBy`, `deleteById`, `deleteAll`, `deleteBy` - every write operation that goes through the internal `_create`, `_update`, or `_delete` methods.

### Query interface validation

The repository validates schema registration the first time it touches the Query API. A mismatch fails with a pointer to the problem instead of a raw Drizzle error:

```
Error: [UserRepository] Schema key mismatch
| Entity name 'User' not found in connector.query
| Available keys: [Configuration, Post]
| Ensure the model's TABLE_NAME matches the schema registration key
```

## Safety Features

### Empty where protection

`updateAll`/`updateBy`/`deleteAll`/`deleteBy` refuse an empty `where` unless `force: true` is passed, to block accidental mass updates and deletes:

```typescript
// Throws - empty where without force
await repository.deleteAll({ where: {} });

// Explicit force - logs a warning, proceeds
await repository.deleteAll({ where: {}, options: { force: true } });
// Warning: [_delete] Entity: User | Performing delete with empty condition
```

| Scenario | `force: false` (default) | `force: true` |
|---|---|---|
| Empty `where` | Throws | Logs a warning, proceeds |
| Valid `where` | Executes normally | Executes normally |

> [!NOTE]
> `updateById` and `deleteById` always have a non-empty where (`{ id }`), so this guard never applies to them.

### Transaction safety

`resolveConnector` validates transaction state before every use. A transaction already committed or rolled back fails fast instead of running against a dead connection:

```
Error: [UserRepository][resolveConnector] Transaction is no longer active
```

## Direct Connector Access

`repository.connector` is a getter (not a method) that resolves the datasource's Drizzle connector, for queries the repository API does not cover:

```typescript
const connector = repository.connector;

const results = await connector
  .select({ userId: userTable.id, postCount: sql<number>`count(${postTable.id})` })
  .from(userTable)
  .leftJoin(postTable, eq(userTable.id, postTable.authorId))
  .groupBy(userTable.id)
  .having(sql`count(${postTable.id}) > 5`);
```

> [!WARNING]
> Queries through `connector` bypass repository features - hidden-property exclusion included. Use it with intent, not as a default escape hatch.

## Repository Class Hierarchy

The PostgreSQL connector's canonical names carry the engine in the class name. The historical `*Repository` names remain as compatibility aliases re-exporting the exact same classes.

| Canonical class | Alias | Scope | Description |
|---|---|---|---|
| `AbstractRepository` | - | N/A | Engine-neutral abstract base (`src/base`), defines every method signature, lazy `dataSource`/`entity` resolution. Plain `BaseHelper` subclass, no mixin composition. |
| `RelationalBaseRepository` | `PostgresBaseRepository` | N/A | PostgreSQL connector base. Adds `FilterBuilder`/`UpdateBuilder`, hidden-column exclusion (`getHiddenProperties`/`getVisibleProperties`), default-filter application (`getDefaultFilter`/`applyDefaultFilter`) - the behavior formerly provided by the now-removed `FieldsVisibilityMixin`/`DefaultFilterMixin` (see [Repository Mixins](./mixins)). |
| `ReadableRelationalRepository` | `ReadableRepository` | `READ_ONLY` | Read-only operations (`find`, `findOne`, `findById`, `count`, `existsWith`). Write operations throw. |
| `PersistableRelationalRepository` | `PersistableRepository` | `READ_WRITE` | Adds write operations (`create`, `update`, `delete`) with `UpdateBuilder`. |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | `READ_WRITE` | Extends `PersistableRelationalRepository` with no additional logic - **recommended default**. |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | `READ_WRITE` | Extends `DefaultRelationalRepository` with soft delete and restore - see [SoftDeletableRepository](./soft-deletable). |

Code samples throughout the docs use the alias names (`DefaultCRUDRepository`, `ReadableRepository`), since that is what `@venizia/ignis/postgres` code most commonly imports today.

```typescript
@repository({ model: AuditLog, dataSource: PostgresDataSource })
export class AuditLogRepository extends ReadableRepository<typeof AuditLog.schema> {
  // Only has: find, findOne, findById, count, existsWith
  // Write operations throw a "NOT ALLOWED" error
}
```

### Alias methods

`AbstractRepository` provides two alias methods for convenience, both delegating directly and supporting the same `shouldReturn`/`force` options:

- `updateBy(opts)` - alias for `updateAll(opts)`.
- `deleteBy(opts)` - alias for `deleteAll(opts)`.

## Default Filter Bypass

A model's `defaultFilter` (e.g. soft-delete's `isDeleted = false`) applies to every query unless you opt out for an admin or maintenance path:

```typescript
// Normal query - default filter applies
await repository.find({ filter: { where: { status: 'active' } } });
// WHERE isDeleted = false AND status = 'active' (if the model has a soft-delete default)

// Admin query - bypass the default filter
await repository.find({
  filter: { where: { status: 'active' } },
  options: { shouldSkipDefaultFilter: true },
});
// WHERE status = 'active' (includes deleted records)
```

**Supported on every operation:**

```typescript
await repository.find({ filter, options: { shouldSkipDefaultFilter: true } });
await repository.findOne({ filter, options: { shouldSkipDefaultFilter: true } });
await repository.count({ where, options: { shouldSkipDefaultFilter: true } });
await repository.updateAll({ where, data, options: { shouldSkipDefaultFilter: true } });
await repository.deleteAll({ where, options: { shouldSkipDefaultFilter: true, force: true } });
```

> [!TIP]
> Combine it with a transaction for an atomic admin operation:
> ```typescript
> const tx = await repository.beginTransaction();
> await repository.updateAll({
>   where: { status: 'archived' },
>   data: { isDeleted: true },
>   options: { transaction: tx, shouldSkipDefaultFilter: true },
> });
> await tx.commit();
> ```
> See [Default Filter](../filter-system/default-filter) for configuring model default filters.

## Nested JSON Updates

`json`/`jsonb` columns update in place with dot-notation keys - `UpdateBuilder` compiles them into chained `jsonb_set` calls instead of overwriting the whole column:

```typescript
// 'metadata' is a jsonb column: { theme: 'light', notifications: { email: true } }
await repository.updateById({
  id: '123',
  data: {
    status: 'active',                    // regular column
    'metadata.theme': 'dark',            // JSON path, any depth
    'metadata.addresses[0].primary': true, // array element by index
  },
});
// metadata becomes: { theme: 'dark', notifications: { email: true }, addresses: [{ primary: true }, ...] }
```

### The rules

- **Deep nesting:** target a property at any depth (`settings.display.font.size`).
- **Array access:** update an array element by index (`tags[0]`).
- **Auto-creation:** missing intermediate keys are created automatically (`jsonb_set` with `create_missing = true`).
- **Type safety:** the target column must be `json`/`jsonb`. Any other column type throws.
- **Multiple paths on one column:** chained as nested `jsonb_set` calls in a single statement.
- **Mixed updates:** regular columns and JSON paths combine in the same `data` object, as in the basic usage example.

### Security and validation

- **Allowed characters:** each path component must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/` (identifiers, kebab-case, or array indices) - this is what blocks SQL injection through a path.
- **Column type validation:** only `json` and `jsonb` columns are allowed.
- **Values:** serialized to JSONB literals with proper escaping.

> [!NOTE]
> This feature uses PostgreSQL's `jsonb_set` function and only applies to columns defined as `json` or `jsonb`.

## ExtraOptions Reference

Every repository operation accepts an `options` parameter (`IExtraOptions`, narrowed by postgres to `IDatabaseExtraOptions`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transaction` | `IDatabaseTransaction` | - | Transaction context for the operation |
| `log` | `{ use: boolean; level?: TLogLevel }` | - | Enable operation logging |
| `shouldSkipDefaultFilter` | `boolean` | `false` | Bypass the default filter from model settings |
| `lock` | `TLockOptions` | - | Row-level locking (requires transaction, Core API only) |

Read operations (`find`, `findOne`, `findById`) additionally support:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retry` | `IReadRetryOptions` | - | Re-read with backoff until a predicate passes - see [Read Retry](#read-retry-replica-lag). Skipped inside a transaction. Not accepted by write operations. |

Write operations additionally support:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shouldReturn` | `boolean` | `true` | Return the created/updated/deleted data |
| `force` | `boolean` | `false` | Allow an empty `where` condition on bulk operations |
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
| Retry a read until fresh | `options: { retry: { until: result => result?.status === 'PAID' } }` |
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
- [Retry Utility](/references/utilities/retry) - `executeWithRetry`/`executeWithRetryUntil`, backoff strategies, jitter modes
- [Search & Typesense - Repository Tiers](/guides/core-concepts/persistent/search-typesense#repository-tiers) - `retry` on the search chain
