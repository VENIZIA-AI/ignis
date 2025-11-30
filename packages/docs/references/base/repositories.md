# Deep Dive: Repositories

This document provides a technical overview of Ignis's repository architecture, focusing on the `AbstractRepository` and `ViewRepository` classes.

## `AbstractRepository`

The `AbstractRepository` is the base class for all repositories in Ignis. It sets up the fundamental properties and dependencies required for data access.

-   **File:** `packages/core/src/base/repositories/core/base.ts`

### Key Properties

-   `entity` (`BaseEntity`): An instance of the model class associated with this repository. It provides access to the Drizzle schema.
-   `dataSource` (`IDataSource`): The datasource instance injected into the repository, which holds the database connection.
-   `connector`: A getter that provides direct access to the Drizzle ORM instance from the datasource.
-   `filterBuilder` (`DrizzleFilterBuilder`): An instance of the filter builder responsible for converting Ignis's filter objects into Drizzle-compatible query options.

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

## `ViewRepository`

The `ViewRepository` is the primary repository class you will extend. It provides a read-only implementation of the repository pattern.

-   **File:** `packages/core/src/base/repositories/core/view.ts`

### Implemented Methods

`ViewRepository` provides concrete implementations for all read operations:

-   **`find(opts)`**: Returns an array of entities matching the filter.
-   **`findOne(opts)`**: Returns the first entity matching the filter.
-   **`findById(opts)`**: A convenience method that calls `findOne` with an ID-based `where` clause.
-   **`count(opts)`**: Returns the number of entities matching the `where` clause.
-   **`existsWith(opts)`**: Returns `true` if at least one entity matches the `where` clause.

### How it Works

1.  When you call a method like `find({ filter })`, the `ViewRepository` passes the filter object to `this.filterBuilder.build()`.
2.  The `DrizzleFilterBuilder` converts the Ignis-style filter (with `where`, `include`, `limit`, etc.) into a Drizzle-compatible options object (with `where`, `with`, `limit`, etc.).
3.  The repository then uses the `this.connector` (the Drizzle instance) to execute the query (e.g., `this.connector.query.myModel.findMany(queryOptions)`).

### Write Operations

`ViewRepository` throws a "NOT ALLOWED" error for all write operations (`create`, `update`, `delete`). A `CrudRepository` with write capabilities will be provided in a future version of the framework.

### Example Implementation

```typescript
// src/repositories/configuration.repository.ts
import { Configuration, TConfigurationSchema } from '@/models/entities';
import { IDataSource, inject, repository, ViewRepository } from '@vez/ignis';

// Decorator to mark this class as a repository for DI
@repository({})
export class ConfigurationRepository extends ViewRepository<TConfigurationSchema> {
  constructor(
    // Inject the configured datasource
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    // Pass the datasource and the model's Entity class to the super constructor
    super({ dataSource, entityClass: Configuration });
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
