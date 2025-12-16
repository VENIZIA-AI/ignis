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

### Example Implementation

```typescript
// src/repositories/configuration.repository.ts
import {
  Configuration,
  configurationRelations,
  TConfigurationSchema,
} from '@/models/entities';
import { IDataSource, inject, repository, DefaultCRUDRepository } from '@venizia/ignis';

// Decorator to mark this class as a repository for DI
@repository({})
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(
    // Inject the configured datasource
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    // Pass the datasource, the model's Entity class, and the relations definitions to the super constructor
    super({ dataSource, entityClass: Configuration, relations: configurationRelations.definitions });
  }

  // You can add custom data access methods here
  async findByCode(code: string): Promise<Configuration | undefined> {
    // 'this.connector' gives you direct access to the Drizzle instance
    const result = await this.connector.query.Configuration.findFirst({
      where: (table, { eq }) => eq(table.code, code)
    });
    return result;
  }
}
```
This architecture provides a clean and powerful abstraction for data access, separating the "how" of data fetching (Drizzle logic) from the "what" of business logic (services).
