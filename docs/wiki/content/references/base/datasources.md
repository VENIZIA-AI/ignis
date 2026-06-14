---
title: DataSources Reference
description: Technical reference for DataSource classes and database connections
difficulty: intermediate
---

# Deep Dive: DataSources

Technical reference for DataSource classes - managing database connections in IGNIS.

**Files:** `packages/core/src/base/datasources/*.ts`

## Quick Reference

| Class/Interface | Purpose | Key Members |
|-----------------|---------|-------------|
| **IDataSource** | Contract for all datasources | `name`, `settings`, `connector`, `getSchema()`, `configure()`, `beginTransaction()` |
| **AbstractDataSource** | Base implementation with logging | Extends `BaseHelper`, declares abstract methods |
| **BaseDataSource** | Concrete class to extend | Auto-discovery, transaction support, constructor with config |
| **ITransaction** | Transaction object | `connector`, `isActive`, `isolationLevel`, `commit()`, `rollback()` |
| **IsolationLevels** | Isolation level constants | `READ_COMMITTED`, `REPEATABLE_READ`, `SERIALIZABLE` |

## `IDataSource` Interface

Contract for all datasource classes in the framework.

**File:** `packages/core/src/base/datasources/common/types.ts`

### Type Parameters

```typescript
interface IDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions>
```

| Type Parameter | Default | Description |
|----------------|---------|-------------|
| `Settings` | `{}` | Connection configuration type (host, port, etc.) |
| `Schema` | `TAnyDataSourceSchema` | Combined Drizzle schema type (tables + relations) |
| `ConfigurableOptions` | `{}` | Options passed to `configure()` |

### Properties & Methods

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Datasource name |
| `settings` | `Settings` | Configuration object |
| `connector` | `TNodePostgresConnector<Schema>` | Drizzle ORM connector instance |
| `schema` | `Schema` | Combined Drizzle schema (auto-discovered or manual) |
| `getSchema()` | `Schema` | Returns combined Drizzle schema |
| `getSettings()` | `Settings` | Returns connection settings |
| `getConnector()` | `TNodePostgresConnector<Schema>` | Returns the Drizzle connector |
| `getConnectionString()` | `ValueOrPromise<string>` | Returns connection string |
| `configure(opts?)` | `ValueOrPromise<void>` | Initializes pool and connector |
| `beginTransaction(opts?)` | `Promise<ITransaction<Schema>>` | Starts a new database transaction |

## `AbstractDataSource` & `BaseDataSource`

**File:** `packages/core/src/base/datasources/base.ts`

### `AbstractDataSource`

Top-level abstract class that implements `IDataSource`. Extends `BaseHelper` for scoped logging. Declares the core properties and abstract methods.

```typescript
abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends BaseHelper implements IDataSource<Settings, Schema, ConfigurableOptions>
```

**Properties:**

| Property | Type | Visibility | Description |
|----------|------|------------|-------------|
| `name` | `string` | public | Datasource identifier |
| `settings` | `Settings` | public | Connection configuration |
| `connector` | `TNodePostgresConnector<Schema>` | public | Drizzle ORM instance |
| `schema` | `Schema` | public | Combined schema (tables + relations) |
| `pool` | `Pool` | protected | node-postgres connection pool |

**Abstract methods** (must be implemented by subclasses):

| Method | Return Type | Description |
|--------|-------------|-------------|
| `configure(opts?)` | `ValueOrPromise<void>` | Initialize pool and Drizzle connector |
| `getConnectionString()` | `ValueOrPromise<string>` | Return the database connection URL |
| `beginTransaction(opts?)` | `Promise<ITransaction<Schema>>` | Start a new transaction |

**Concrete methods:**

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getSettings()` | `Settings` | Returns `this.settings` |
| `getConnector()` | `TNodePostgresConnector<Schema>` | Returns `this.connector` |
| `getSchema()` | `Schema` | Returns `this.schema` (throws if not initialized) |

### `BaseDataSource`

Extends `AbstractDataSource` with a constructor, **schema auto-discovery**, and a default `beginTransaction()` implementation.

```typescript
abstract class BaseDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
```

#### Key Features

| Feature | Description |
|---------|-------------|
| **Schema Auto-Discovery** | Schema is automatically built from registered `@repository` decorators |
| **Manual Override** | You can manually provide schema in constructor for full control |
| **Built-in Transaction Support** | `beginTransaction()` implemented using the `pool` property |

> [!TIP]
> Set `autoDiscovery` to `false` in the `@datasource` decorator to disable automatic schema discovery. This is useful when you want to manually provide the schema.

### Constructor Options

```typescript
constructor(opts: {
  name: string;           // DataSource name (usually class name)
  config: Settings;       // Database connection settings
  schema?: Schema;        // Optional - auto-discovered if not provided
})
```

### Schema Auto-Discovery

When you use `@repository({ model: YourModel, dataSource: YourDataSource })`, the framework automatically:

1. Registers the model-datasource binding in the MetadataRegistry
2. When `getSchema()` is called, discovers all models bound to this datasource
3. Builds the combined schema (tables + relations) automatically

**This means you no longer need to manually merge tables and relations in the DataSource constructor!**

### Configuration Flow

1.  **Your DataSource's `constructor` is called**:
    -   You call `super()` with `name` and `config`
    -   Schema is auto-discovered from `@repository` bindings (or manually provided via `schema`)

2.  **`Application.registerDataSources()` is called during startup**:
    -   The application gets your `DataSource` instance from the DI container
    -   It calls the `configure()` method on your instance

3.  **Your `configure()` method runs**:
    -   Call `this.getSchema()` to get the auto-discovered schema
    -   Create a `Pool` instance and assign it to `this.pool` (required for transaction support)
    -   Create the Drizzle connector with the pool and schema

### Example Implementations

#### Pattern 1: Auto-Discovery (Recommended)

Simplest approach - schema is auto-discovered from repositories:

```typescript
// src/datasources/postgres.datasource.ts
import { BaseDataSource, datasource, ValueOrPromise } from '@venizia/ignis';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/**
 * PostgresDataSource with auto-discovery support.
 *
 * How it works:
 * 1. @repository decorator binds model to datasource
 * 2. When configure() is called, getSchema() auto-discovers all bound models
 * 3. Drizzle is initialized with the auto-discovered schema
 */
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
  private readonly protocol = 'postgresql';

  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: applicationEnvironment.get<string>('APP_ENV_POSTGRES_HOST'),
        port: int(applicationEnvironment.get<string>('APP_ENV_POSTGRES_PORT')),
        database: applicationEnvironment.get<string>('APP_ENV_POSTGRES_DATABASE'),
        user: applicationEnvironment.get<string>('APP_ENV_POSTGRES_USERNAME'),
        password: applicationEnvironment.get<string>('APP_ENV_POSTGRES_PASSWORD'),
        ssl: false,
      },
      // NO schema property - auto-discovered from @repository bindings!
    });
  }

  override configure(): ValueOrPromise<void> {
    // getSchema() auto-discovers models from @repository bindings
    const schema = this.getSchema();

    const dsSchema = Object.keys(schema);
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      dsSchema.length,
      dsSchema,
    );

    // Store pool reference for transaction support
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

With this pattern, when you define repositories:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {}
```

The `PostgresDataSource.schema` will automatically include User and Configuration tables and their relations.

#### Pattern 2: Manual Schema (Full Control)

When you need explicit control over schema (e.g., subset of models, custom ordering):

```typescript
import {
  User, userTable, userRelations,
  Configuration, configurationTable, configurationRelations,
} from '@/models/entities';

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'mydb',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
      // Manually provide schema using spread syntax
      schema: {
        [User.TABLE_NAME]: userTable,
        [Configuration.TABLE_NAME]: configurationTable,
        ...userRelations.relations,
        ...configurationRelations.relations,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    // When schema is manually provided, getSchema() returns it directly
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema: this.getSchema() });
  }

  override getConnectionString(): ValueOrPromise<string> {
    // ...
  }
}
```

> [!IMPORTANT]
> You must assign `this.pool` in your `configure()` method. The built-in `beginTransaction()` uses `this.pool` to acquire a `PoolClient` for transaction isolation. If `this.pool` is not set, `beginTransaction()` will throw an error.

### `@datasource` Decorator

The `@datasource` decorator registers datasource metadata:

```typescript
@datasource({
  driver: 'node-postgres',       // Required - database driver
  autoDiscovery?: true           // Optional - defaults to true
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `TDataSourceDriver` | - | Database driver name (currently only `'node-postgres'`) |
| `autoDiscovery` | `boolean` | `true` | Enable/disable schema auto-discovery |

### Abstract Methods

When extending `BaseDataSource`, these methods must be implemented:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `configure(opts?)` | `ValueOrPromise<void>` | Initialize pool and Drizzle connector. Must set `this.pool` and `this.connector`. |
| `getConnectionString()` | `ValueOrPromise<string>` | Return the database connection string. |

### Helper Methods

| Method | Description |
|--------|-------------|
| `getSchema()` | Returns the schema (auto-discovers via `discoverSchema()` if not manually provided) |
| `getSettings()` | Returns connection settings |
| `getConnector()` | Returns the Drizzle connector |
| `hasDiscoverableModels()` | Returns `true` if there are models registered for this datasource via `@repository` |

### Protected Methods

| Method | Description |
|--------|-------------|
| `discoverSchema()` | Queries the `MetadataRegistry` for all `@repository` bindings targeting this datasource, then calls `registry.buildSchema()` to merge tables and relations into a single schema object. |

## Connector Types

**File:** `packages/core/src/base/datasources/common/types.ts`

| Type | Description |
|------|-------------|
| `TNodePostgresConnector<Schema>` | Drizzle connector using `NodePgClient` (Pool or PoolClient) |
| `TNodePostgresTransactionConnector<Schema>` | Drizzle connector using `PoolClient` specifically (for transaction isolation) |
| `TAnyConnector<Schema>` | Union of both connector types |
| `TAnyDataSourceSchema` | `Record<string, any>` - base type for all schema objects |

### `DataSourceDrivers`

Static class for driver validation:

```typescript
DataSourceDrivers.NODE_POSTGRES  // 'node-postgres'
DataSourceDrivers.isValid('node-postgres')  // true
```

## Transaction Support

DataSources provide built-in transaction management through the `beginTransaction()` method. This allows you to perform atomic operations across multiple repositories.

### How It Works

`BaseDataSource.beginTransaction()` does the following:

1. Acquires a `PoolClient` from `this.pool`
2. Executes `BEGIN TRANSACTION ISOLATION LEVEL <level>` on the client
3. Creates a separate Drizzle connector scoped to that client
4. Returns an `ITransaction` object with `commit()`, `rollback()`, and the scoped `connector`

When `commit()` or `rollback()` is called, the client is released back to the pool.

### Transaction Types

| Type | Description |
|------|-------------|
| `ITransaction<Schema>` | Transaction object with `commit()`, `rollback()`, and `connector` |
| `ITransactionOptions` | Options for starting a transaction (e.g., `isolationLevel`) |
| `TIsolationLevel` | Union type: `'READ COMMITTED'` \| `'REPEATABLE READ'` \| `'SERIALIZABLE'` |
| `IsolationLevels` | Static class with isolation level constants and validation |

### ITransaction Interface

```typescript
interface ITransaction<Schema> {
  connector: TNodePostgresTransactionConnector<Schema>;
  isActive: boolean;       // read-only getter, false after commit/rollback
  isolationLevel: TIsolationLevel;

  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

### Isolation Levels

Use the `IsolationLevels` static class for type-safe isolation level constants:

```typescript
import { IsolationLevels } from '@venizia/ignis';

// Available levels
IsolationLevels.READ_COMMITTED   // Default - prevents dirty reads
IsolationLevels.REPEATABLE_READ  // Consistent reads within transaction
IsolationLevels.SERIALIZABLE     // Strictest isolation

// Validation
IsolationLevels.isValid('READ COMMITTED'); // true
IsolationLevels.isValid('INVALID');        // false
```

> [!NOTE]
> The default isolation level is `READ COMMITTED` when no `isolationLevel` option is provided.

### Usage Example

```typescript
// Start transaction from datasource or repository
const tx = await dataSource.beginTransaction({
  isolationLevel: IsolationLevels.SERIALIZABLE
});

try {
  // Use tx.connector for operations
  await tx.connector.insert(userTable).values({ name: 'Alice' });
  await tx.connector.insert(profileTable).values({ userId: '...', bio: 'Hello' });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

> **Note:** For most use cases, prefer using `repository.beginTransaction()` which provides a higher-level API. See [Repositories Reference](./repositories/#transactions) for details.

This architecture ensures that datasources are configured consistently and that the fully-initialized Drizzle connector, aware of all schemas and relations, is available to repositories for querying.

## See Also

- **Related Concepts:**
  - [DataSources Guide](/guides/core-concepts/persistent/datasources) - Creating DataSources tutorial
  - [Repositories](/guides/core-concepts/persistent/repositories) - Using DataSources for database access
  - [Models](/guides/core-concepts/persistent/models) - Entity schemas loaded by DataSource
  - [Transactions](/guides/core-concepts/persistent/transactions) - Multi-operation database transactions

- **References:**
  - [Repositories API](/references/base/repositories/) - Data access layer
  - [Environment Variables](/references/configuration/environment-variables) - Configuration management

- **External Resources:**
  - [Drizzle ORM Documentation](https://orm.drizzle.team/) - ORM configuration
  - [node-postgres Documentation](https://node-postgres.com/) - Connection pooling guide

- **Best Practices:**
  - [Performance Optimization](/best-practices/performance-optimization) - Connection pool tuning
  - [Security Guidelines](/best-practices/security-guidelines) - Database credential management

- **Tutorials:**
  - [Complete Installation](/guides/tutorials/complete-installation) - Database setup
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - DataSource configuration
