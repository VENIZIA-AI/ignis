# Deep Dive: Repositories

Technical reference for repository classes - the data access layer in Ignis.

**Files:** `packages/core/src/base/repositories/core/*.ts`

## Quick Reference

| Class | Capabilities | Use Case |
|-------|--------------|----------|
| **AbstractRepository** | Base class with properties | Extend for custom repositories |
| **ReadableRepository** | Read-only operations | Views, external tables |
| **PersistableRepository** | Read + Write operations | Rarely used directly |
| **DefaultCRUDRepository** | Full CRUD operations | Standard data tables ✅ |

## `AbstractRepository`

Base class for all repositories - sets up fundamental properties and dependencies for data access.

**File:** `packages/core/src/base/repositories/core/base.ts`

### Key Properties

-   `entity` (`BaseEntity`): An instance of the model class associated with this repository. It provides access to the Drizzle schema. Auto-resolved from `@repository` metadata or passed in constructor.
-   `dataSource` (`IDataSource`): The datasource instance injected into the repository, which holds the database connection. Auto-injected from `@repository` decorator or passed in constructor.
-   `connector`: A getter that provides direct access to the Drizzle ORM instance from the datasource.
-   `filterBuilder` (`DrizzleFilterBuilder`): An instance of the filter builder responsible for converting `Ignis`'s filter objects into Drizzle-compatible query options.
-   `operationScope` (`TRepositoryOperationScope`): Defines whether the repository is read-only or read-write.
-   `defaultLimit` (`number`): Default limit for queries (default: 10).

### Key Methods

-   `getEntityRelations()`: Returns a map of relation configurations from the entity's static `relations` property.

### Abstract Methods

`AbstractRepository` defines the method signatures for standard CRUD operations that concrete repository classes must implement:
- `count()`
- `existsWith()`
- `find()`
- `findOne()`
- `findById()`
- `create()`
- `updateById()`
- `deleteById()`
- (and `...All` variants)

## `ReadableRepository`

The `ReadableRepository` provides a **read-only** implementation of the repository pattern. It is ideal for data sources that should not be modified, such as views or tables from an external system.

-   **File:** `packages/core/src/base/repositories/core/readable.ts`

### Implemented Methods

`ReadableRepository` provides concrete implementations for all read operations:

-   **`find(opts)`**: Returns an array of entities matching the filter.
-   **`findOne(opts)`**: Returns the first entity matching the filter.
-   **`findById(opts)`**: A convenience method that calls `findOne` with an ID-based `where` clause.
-   **`count(opts)`**: Returns the number of entities matching the `where` clause.
-   **`existsWith(opts)`**: Returns `true` if at least one entity matches the `where` clause.

### Write Operations

`ReadableRepository` throws a "NOT ALLOWED" error for all write operations (`create`, `update`, `delete`).

## `PersistableRepository`

The `PersistableRepository` extends `ReadableRepository` and adds **write operations**. It provides the core logic for creating, updating, and deleting records with built-in safety mechanisms.

-   **File:** `packages/core/src/base/repositories/core/persistable.ts`

### Implemented Methods

-   `create(opts)`
-   `createAll(opts)`
-   `updateById(opts)`
-   `updateAll(opts)`
-   `updateBy(opts)` - Alias for `updateAll`
-   `deleteById(opts)`
-   `deleteAll(opts)`
-   `deleteBy(opts)` - Alias for `deleteAll`

### Safety Features

#### Empty Where Clause Protection

The `PersistableRepository` includes safety mechanisms to prevent accidental mass updates or deletions:

**Update Operations (`updateAll`):**
```typescript
// ❌ Throws error: Empty where condition without force flag
await repository.updateAll({
  data: { status: 'inactive' },
  where: {}, // Empty condition
});

// ✅ Warning logged: Explicitly allow mass update with force flag
await repository.updateAll({
  data: { status: 'inactive' },
  where: {},
  options: { force: true }, // Force flag allows empty where
});
```

**Delete Operations (`deleteAll`):**
```typescript
// ❌ Throws error: Empty where condition without force flag
await repository.deleteAll({
  where: {}, // Empty condition
});

// ✅ Warning logged: Explicitly allow mass delete with force flag
await repository.deleteAll({
  where: {},
  options: { force: true }, // Force flag allows empty where
});
```

#### Behavior Summary

| Scenario | `force: false` (default) | `force: true` |
|----------|-------------------------|---------------|
| Empty `where` clause | ❌ Throws error | ✅ Logs warning and proceeds |
| Valid `where` clause | ✅ Executes normally | ✅ Executes normally |

**Warning Messages:**

When performing operations with empty `where` conditions and `force: true`, the repository logs a warning:

```
[_update] Entity: MyEntity | Performing update with empty condition | data: {...} | condition: {}
[_delete] Entity: MyEntity | Performing delete with empty condition | condition: {}
```

This helps track potentially dangerous operations in your logs.

You will typically not use this class directly, but rather the `DefaultCRUDRepository`.

## `DefaultCRUDRepository`

This is the primary class you should extend for repositories that require full **Create, Read, Update, and Delete (CRUD)** capabilities. It extends `PersistableRepository` and serves as the standard, full-featured repository implementation.

-   **File:** `packages/core/src/base/repositories/core/default-crud.ts`

### @repository Decorator Requirements

**IMPORTANT:** Both `model` AND `dataSource` are required in the `@repository` decorator for schema auto-discovery. Without both, the model won't be registered and relational queries will fail.

```typescript
// ❌ WRONG - Will throw error
@repository({ model: User })  // Missing dataSource!
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// ❌ WRONG - Will throw error
@repository({ dataSource: PostgresDataSource })  // Missing model!
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// ✅ CORRECT - Both model and dataSource provided
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

### Injection Patterns

The `@repository` decorator supports two injection patterns:

#### Pattern 1: Zero Boilerplate (Recommended)

DataSource is auto-injected from metadata - no constructor needed:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed - datasource auto-injected at param index 0

  async findByEmail(email: string) {
    return this.findOne({ filter: { where: { email } } });
  }
}
```

#### Pattern 2: Explicit @inject

When you need constructor control, use explicit `@inject`. **Important:** The first parameter must extend `AbstractDataSource` - this is enforced via reflection:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,  // ✅ Must be concrete DataSource type, NOT 'any'
  ) {
    super(dataSource);
  }
}
```

**Note:** When `@inject` is at param index 0, auto-injection is skipped (your `@inject` takes precedence).

### Constructor Type Validation

The framework validates constructor parameters at decorator time:

1. **First parameter must extend `AbstractDataSource`** - Using `any`, `object`, or non-DataSource types will throw an error
2. **Type compatibility check** - The constructor parameter type must be compatible with the `dataSource` specified in `@repository`

```typescript
// ❌ Error: First parameter must extend AbstractDataSource | Received: 'Object'
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: any,  // Will cause runtime error!
  ) {
    super(dataSource);
  }
}

// ❌ Error: Type mismatch | Constructor expects 'MongoDataSource' but @repository specifies 'PostgresDataSource'
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.MongoDataSource' })
    dataSource: MongoDataSource,  // Wrong type!
  ) {
    super(dataSource);
  }
}
```

### Example Implementation

```typescript
// src/repositories/configuration.repository.ts
import { Configuration, TConfigurationSchema } from '@/models/entities';
import { PostgresDataSource } from '@/datasources';
import { inject, repository, DefaultCRUDRepository } from '@venizia/ignis';

// Pattern 1: Zero boilerplate (recommended)
@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  // No constructor needed - datasource and entity auto-resolved!

  // Custom data access methods
  async findByCode(code: string): Promise<Configuration | undefined> {
    const result = await this.connector.query.Configuration.findFirst({
      where: (table, { eq }) => eq(table.code, code)
    });
    return result;
  }
}

// Pattern 2: With explicit constructor (when you need custom initialization)
@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource); // Just pass dataSource - entity and relations auto-resolved!
  }
}
```

This architecture provides a clean and powerful abstraction for data access, separating the "how" of data fetching (Drizzle logic) from the "what" of business logic (services).

## Advanced Features

### Log Option for Debugging

All CRUD operations support a `log` option for debugging:

```typescript
// Enable logging for a specific operation
await repo.create({
  data: { name: 'John', email: 'john@example.com' },
  options: {
    log: { use: true, level: 'debug' }
  }
});
// Output: [_create] Executing with opts: { data: [...], options: {...} }

// Available log levels: 'debug', 'info', 'warn', 'error'
await repo.updateById({
  id: '123',
  data: { name: 'Jane' },
  options: { log: { use: true, level: 'info' } }
});
```

**Available on:** `create`, `createAll`, `updateById`, `updateAll`, `deleteById`, `deleteAll`

### TypeScript Return Type Inference

Repository methods now have improved type inference based on `shouldReturn`:

```typescript
// When shouldReturn: false - TypeScript knows data is null
const result1 = await repo.create({
  data: { name: 'John' },
  options: { shouldReturn: false }
});
// Type: Promise<TCount & { data: null }>
console.log(result1.data); // null

// When shouldReturn: true (default) - TypeScript knows data is the entity
const result2 = await repo.create({
  data: { name: 'John' },
  options: { shouldReturn: true }
});
// Type: Promise<TCount & { data: User }>
console.log(result2.data.name); // 'John' - fully typed!

// Same for array operations
const results = await repo.createAll({
  data: [{ name: 'John' }, { name: 'Jane' }],
  options: { shouldReturn: true }
});
// Type: Promise<TCount & { data: User[] }>
```

### Generic Return Types

For queries involving relations (`include`) or custom mapped types, you can override the return type of repository methods. This provides stronger type safety at the application layer without losing the convenience of the repository pattern.

```typescript
// Define custom return type with relations
type ProductWithChannels = Product & {
  saleChannelProducts: (SaleChannelProduct & {
    saleChannel: SaleChannel
  })[]
};

// Use generic override
const product = await productRepo.findOne<ProductWithChannels>({
  filter: {
    where: { id: '...' },
    include: [{
      relation: 'saleChannelProducts',
      scope: { include: [{ relation: 'saleChannel' }] }
    }]
  }
});

// TypeScript knows the structure!
if (product) {
  console.log(product.saleChannelProducts[0].saleChannel.name);
}
```

**Supported Methods:**
- `find<R>()`
- `findOne<R>()`
- `findById<R>()`
- `create<R>()`, `createAll<R>()`
- `updateById<R>()`, `updateAll<R>()`
- `deleteById<R>()`, `deleteAll<R>()`

### Transactions

Repositories provide direct access to transaction management via the `beginTransaction()` method. This allows you to orchestrate atomic operations across multiple repositories or services.

```typescript
// Start a transaction
const tx = await repo.beginTransaction();

try {
  // Perform operations within the transaction
  const user = await userRepo.create({
    data: { name: 'Alice' },
    options: { transaction: tx } // Pass the transaction object
  });

  const profile = await profileRepo.create({
    data: { userId: user.id, bio: 'Hello' },
    options: { transaction: tx } // Use the same transaction
  });

  // Commit changes
  await tx.commit();
} catch (error) {
  // Rollback on error
  await tx.rollback();
  throw error;
}
```

**Isolation Levels:**
You can specify the isolation level when starting a transaction:
```typescript
const tx = await repo.beginTransaction({
  isolationLevel: 'SERIALIZABLE' // 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'
});
```

### Relations Auto-Resolution

Relations are automatically resolved from the entity's static `relations` property. This resolution is **recursive**, allowing for deeply nested `include` queries across multiple levels of the entity graph.

> [!WARNING]
> **Performance Recommendation:** Each nested `include` adds significant overhead to SQL generation and result mapping. We strongly recommend a **maximum of 2 levels** (e.g., `Product -> Junction -> SaleChannel`). For deeper relationships, fetching data in multiple smaller queries is often more performant.

```typescript
// Define entity with static relations
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelations.definitions;
}

// Repository automatically uses entity's relations
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No need to pass relations in constructor - auto-resolved!
}

// Nested inclusion (Product -> Junction -> SaleChannel)
const product = await repo.findOne({
  filter: {
    include: [
      {
        relation: 'saleChannelProducts', // Level 1
        scope: {
          include: [{ relation: 'saleChannel' }] // Level 2 (Nested)
        }
      }
    ]
  }
});
```

### Query Interface Validation

The `getQueryInterface()` method validates that the entity's schema is properly registered:

```typescript
// If schema key doesn't match, you get a helpful error:
// Error: [UserRepository] Schema key mismatch | Entity name 'User' not found in connector.query | Available keys: [Configuration, Post] | Ensure the model's TABLE_NAME matches the schema registration key
```

## Performance Optimizations

### Core API for Flat Queries

The `ReadableRepository` automatically optimizes flat queries (no relations, no field selection) using Drizzle's Core API instead of Query API. This provides ~15-20% performance improvement for simple queries.

> [!IMPORTANT]
> **Always use `limit`:** To ensure consistent performance and prevent memory exhaustion, always provide a `limit` in your filter options, especially for public-facing endpoints.

**Automatic Optimization:**

```typescript
// This query is automatically optimized to use Core API
const users = await repo.find({
  filter: {
    where: { status: 'active' },
    limit: 10,                       // ✅ Mandatory limit for performance
    order: ['createdAt DESC'],
  }
});
// Uses: db.select().from(table).where(...).orderBy(...).limit(10)

// This query uses Query API (relations need relational mapper)
const usersWithPosts = await repo.find({
  filter: {
    where: { status: 'active' },
    include: [{ relation: 'posts' }],  // Has relations
  }
});
// Uses: db.query.tableName.findMany({ with: { posts: true }, ... })
```

**When Core API is used:**

| Filter Options | API Used | Reason |
|----------------|----------|--------|
| `where`, `limit`, `order`, `offset` only | Core API | Flat query, no overhead |
| Has `include` (relations) | Query API | Needs relational mapper |
| Has `fields` selection | Query API | Core API field syntax differs |

**Protected Helper Method:**

For advanced use cases, you can directly use the `findWithCoreAPI` method:

```typescript
// Available in subclasses
protected async findWithCoreAPI(opts: {
  filter: TFilter<DataObject>;
  findOne?: boolean;
}): Promise<Array<DataObject>>;

// Check if Core API can be used
protected canUseCoreAPI(filter: TFilter<DataObject>): boolean;
```

### WeakMap Cache for Filter Builder

The `DrizzleFilterBuilder` uses a static WeakMap cache for `getTableColumns()` results, avoiding repeated reflection calls:

```typescript
// Internal optimization - no action needed
// First call: getTableColumns(schema) → cached
// Subsequent calls: retrieved from WeakMap
```

This is especially beneficial for:
- High-concurrency environments
- Queries with nested AND/OR conditions (each recursion reuses cache)
- Multiple queries to the same table

## Query Operators

The filter builder supports a comprehensive set of query operators for building complex queries.

**File:** `packages/core/src/base/repositories/operators/query.ts`

### Available Operators

| Operator | Alias | SQL Equivalent | Description |
|----------|-------|----------------|-------------|
| `eq` | - | `=` | Equal to |
| `ne` | `neq` | `!=` | Not equal to |
| `gt` | - | `>` | Greater than |
| `gte` | - | `>=` | Greater than or equal |
| `lt` | - | `<` | Less than |
| `lte` | - | `<=` | Less than or equal |
| `like` | - | `LIKE` | Pattern matching (case-sensitive) |
| `nlike` | - | `NOT LIKE` | Negative pattern matching |
| `ilike` | - | `ILIKE` | Pattern matching (case-insensitive, PostgreSQL) |
| `nilike` | - | `NOT ILIKE` | Negative case-insensitive pattern |
| `in` | `inq` | `IN` | Value in array |
| `nin` | - | `NOT IN` | Value not in array |
| `between` | - | `BETWEEN` | Value between two values |
| `is` | - | `IS NULL` | Null check |
| `isn` | - | `IS NOT NULL` | Not null check |
| `regexp` | - | `~` | PostgreSQL POSIX regex (case-sensitive) |
| `iregexp` | - | `~*` | PostgreSQL POSIX regex (case-insensitive) |

### Logical Operators

| Operator | Description |
|----------|-------------|
| `and` | Combine conditions with AND |
| `or` | Combine conditions with OR |

### Usage Examples

**Simple equality:**
```typescript
await repo.find({ filter: { where: { status: 'active' } } });
// SQL: WHERE status = 'active'
```

**Comparison operators:**
```typescript
await repo.find({
  filter: {
    where: {
      age: { gte: 18, lt: 65 },
      score: { gt: 100 }
    }
  }
});
// SQL: WHERE age >= 18 AND age < 65 AND score > 100
```

**Array operators:**
```typescript
// IN operator
await repo.find({ filter: { where: { id: [1, 2, 3] } } });
// SQL: WHERE id IN (1, 2, 3)

// Using explicit IN
await repo.find({ filter: { where: { status: { in: ['active', 'pending'] } } } });

// NOT IN
await repo.find({ filter: { where: { status: { nin: ['deleted', 'archived'] } } } });
```

**Pattern matching:**
```typescript
// LIKE (case-sensitive)
await repo.find({ filter: { where: { name: { like: '%john%' } } } });

// ILIKE (case-insensitive, PostgreSQL)
await repo.find({ filter: { where: { email: { ilike: '%@gmail.com' } } } });
```

**Regex (PostgreSQL):**
```typescript
// Case-sensitive regex
await repo.find({ filter: { where: { name: { regexp: '^John' } } } });

// Case-insensitive regex
await repo.find({ filter: { where: { name: { iregexp: '^john' } } } });
```

**Between:**
```typescript
await repo.find({
  filter: {
    where: {
      createdAt: { between: [new Date('2024-01-01'), new Date('2024-12-31')] }
    }
  }
});
// SQL: WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31'
```

**Logical operators:**
```typescript
// OR conditions
await repo.find({
  filter: {
    where: {
      or: [
        { status: 'active' },
        { isPublished: true }
      ]
    }
  }
});

// AND conditions (explicit)
await repo.find({
  filter: {
    where: {
      and: [
        { role: 'admin' },
        { createdAt: { gte: new Date('2024-01-01') } }
      ]
    }
  }
});

// Nested conditions
await repo.find({
  filter: {
    where: {
      status: 'active',
      or: [
        { role: 'admin' },
        { and: [{ role: 'user' }, { verified: true }] }
      ]
    }
  }
});
```

### Security Notes

- **Empty IN array:** Returns `false` (no rows), preventing security bypass
- **Empty NOT IN array:** Returns `true` (all rows match)
- **BETWEEN validation:** Requires exactly 2 elements in array, throws error otherwise
- **Invalid columns:** Throws error if column doesn't exist in schema
