# Deep Dive: DataSources

Technical reference for DataSource classes - managing database connections in Ignis.

**Files:** `packages/core/src/base/datasources/*.ts`

## Quick Reference

| Class/Interface | Purpose | Key Members |
|-----------------|---------|-------------|
| **IDataSource** | Contract for all datasources | `name`, `settings`, `connector`, `schema`, `configure()` |
| **AbstractDataSource** | Base implementation with logging | Extends `BaseHelper` |
| **BaseDataSource** | Concrete class to extend | Constructor accepts `name`, `driver`, `config`, `schema` |

## `IDataSource` Interface

Contract for all datasource classes in the framework.

**File:** `packages/core/src/base/datasources/types.ts`

### Properties & Methods

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Datasource name |
| `settings` | `object` | Configuration object |
| `connector` | `TDatabaseConnector` | Database connector instance (e.g., Drizzle) |
| `schema` | `object` | Combined Drizzle schema (tables + relations) |
| `configure()` | Method | Initializes the `connector` |
| `getConnectionString()` | Method | Returns connection string |

## `AbstractDataSource` & `BaseDataSource`

**File:** `packages/core/src/base/datasources/base.ts`

### `AbstractDataSource`

This is the top-level abstract class that implements the `IDataSource` interface. It initializes the `BaseHelper` for logging and sets up the basic properties.

### `BaseDataSource`

This class extends `AbstractDataSource` and provides a constructor that standardizes how datasources are created. When you create your own datasource, you extend `BaseDataSource`.

### Constructor and Configuration Flow

1.  **Your DataSource's `constructor` is called**:
    -   You call `super()` with the `name`, `driver`, `config` (connection settings), and the crucial `schema` object.
    -   The `schema` object **must** contain all your Drizzle tables and `relations` definitions.

2.  **`Application.registerDataSources()` is called during startup**:
    -   The application gets your `DataSource` instance from the DI container.
    -   It calls the `configure()` method on your instance.

3.  **Your `configure()` method runs**:
    -   This is where you instantiate the Drizzle ORM.
    -   You pass the `this.settings` (your config) and `this.schema` to Drizzle, creating the `this.connector`.

### Example Implementation

```typescript
// src/datasources/postgres.datasource.ts
import {
  // ... import your models and relations
} from '@/models/entities';
import {
  BaseDataSource,
  datasource,
  TNodePostgresConnector,
  ValueOrPromise,
} from '@vez/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Decorator to mark this class as a datasource for DI
@datasource()
export class PostgresDataSource extends BaseDataSource<
  TNodePostgresConnector, // Type of the connector
  IDSConfigs              // Type of the config object
> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: { /* ... connection details from environment ... */ },
      schema: {
        // Register all tables and relations here
        usersTable,
        configurationTable,
        ...configurationRelations,
      },
    });
  }

  // This method is called by the application at startup
  override configure(): ValueOrPromise<void> {
    this.connector = drizzle({
      client: new Pool(this.settings),
      schema: this.schema,
    });
  }
  // ...
}
```

This architecture ensures that datasources are configured consistently and that the fully-initialized Drizzle connector, aware of all schemas and relations, is available to repositories for querying.
