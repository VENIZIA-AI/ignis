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

-   `entity` (`BaseEntity`): An instance of the model class associated with this repository. It provides access to the Drizzle schema.
-   `dataSource` (`IDataSource`): The datasource instance injected into the repository, which holds the database connection.
-   `connector`: A getter that provides direct access to the Drizzle ORM instance from the datasource.
-   `filterBuilder` (`DrizzleFilterBuilder`): An instance of the filter builder responsible for converting `Ignis`'s filter objects into Drizzle-compatible query options.
-   `relations` (`{ [relationName: string]: TRelationConfig }`): A map of relation configurations defined for the entity.

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
-   `deleteById(opts)`
-   `deleteAll(opts)`

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
  force: true, // Force flag allows empty where
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
  force: true, // Force flag allows empty where
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
import {
  Configuration,
  configurationRelations,
  TConfigurationSchema,
} from '@/models/entities';
import { PostgresDataSource } from '@/datasources';
import { inject, repository, DefaultCRUDRepository } from '@venizia/ignis';

@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource, { entityClass: Configuration, relations: configurationRelations.definitions });
  }

  // Custom data access methods
  async findByCode(code: string): Promise<Configuration | undefined> {
    const result = await this.connector.query.Configuration.findFirst({
      where: (table, { eq }) => eq(table.code, code)
    });
    return result;
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

### Relations Auto-Resolution

Relations are now automatically resolved from the entity's static `relations` property:

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

// Relations are available for include queries
const users = await repo.find({
  filter: {
    where: { status: 'active' },
    include: [{ relation: 'posts' }], // Works automatically
  }
});
```

### Query Interface Validation

The `getQueryInterface()` method validates that the entity's schema is properly registered:

```typescript
// If schema key doesn't match, you get a helpful error:
// Error: [UserRepository] Schema key mismatch | Entity name 'User' not found in connector.query | Available keys: [Configuration, Post] | Ensure the model's TABLE_NAME matches the schema registration key
```
