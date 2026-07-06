---
title: DataSources Reference
description: Technical reference for the engine-neutral DataSource contract and the PostgreSQL connector implementation
difficulty: intermediate
---

# Deep Dive: DataSources

Technical reference for DataSource classes - managing database and search engine connections in IGNIS.

> [!IMPORTANT] Base vs. Connectors
> IGNIS splits datasources into an **engine-neutral root** (`src/base/datasources/`) and **per-engine connectors** (`src/connectors/{postgres,typesense,memory}/datasources/`). `AbstractDataSource` has no SQL, no Drizzle, and no `pool` - those live only in the PostgreSQL connector. See [Connectors](./connectors) for the full base-vs-connectors architecture, dual-door exports, and how to add a new engine. This page documents the neutral contract plus the PostgreSQL connector in depth; see [Search & Typesense](/guides/core-concepts/persistent/search-typesense) and [Memory Connector](/guides/core-concepts/persistent/memory-connector) for the other two engines.

**Files:** `packages/core/src/base/datasources/*.ts` (neutral) and `packages/core/src/connectors/postgres/datasources/*.ts` (PostgreSQL)

## Quick Reference

| Class/Interface | Purpose | Key Members |
|-----------------|---------|-------------|
| **IDataSource** | Engine-neutral contract for all datasources | `name`, `settings`, `schema`, `getSchema()`, `getSettings()`, `configure()` |
| **AbstractDataSource** | Engine-neutral base implementation with logging | Extends `BaseHelper`, `getCapabilities()` defaults to `{ transactions: false }`, `beginTransaction()` defaults to `throwNotSupported(...)` |
| **AbstractPostgresDataSource** | PostgreSQL-aware abstraction | Adds `connector`, `pool`, abstract `getConnectionString()`/`beginTransaction()` |
| **BasePostgresDataSource** | Concrete class to extend for PostgreSQL | Auto-discovery, real transaction support, constructor with config. Canonical name - `BaseDataSource` is a compatibility alias re-exporting the same class |
| **ITransaction** | Engine-neutral transaction contract | `isActive`, `commit()`, `rollback()` (no connector field) |
| **IDatabaseTransaction** | PostgreSQL transaction object | Extends `ITransaction`, adds `connector`, `isolationLevel` |
| **IsolationLevels** | Isolation level constants (PostgreSQL) | `READ_COMMITTED`, `REPEATABLE_READ`, `SERIALIZABLE` |

## `IDataSource` Interface

Engine-neutral contract implemented by every datasource in the framework, regardless of engine.

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
| `Schema` | `TAnyDataSourceSchema` | Combined schema type (shape depends on the connector - Drizzle tables for PostgreSQL, collection definitions for typesense/memory) |
| `ConfigurableOptions` | `{}` | Options passed to `configure()` |

### Properties & Methods

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Datasource name |
| `settings` | `Settings` | Configuration object |
| `schema` | `Schema` | Combined schema (auto-discovered or manual) |
| `getSchema()` | `Schema` | Returns combined schema |
| `getSettings()` | `Settings` | Returns connection settings |
| `configure(opts?)` | `ValueOrPromise<void>` | Initializes the underlying connection (from `IConfigurable`) |

> [!NOTE]
> `getCapabilities()` and `beginTransaction()` are not part of the `IDataSource` interface - they are declared on `AbstractDataSource` (below), which every connector extends.

## `AbstractDataSource` (Engine-Neutral Root)

**File:** `packages/core/src/base/datasources/abstract-datasource.ts`

Top-level abstract class implemented by every engine. Extends `BaseHelper` for scoped logging. Contains **no SQL, no Drizzle, and no connection-pool members** - those are added by each connector.

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
| `schema` | `Schema` | public | Combined schema |

**Abstract methods** (must be implemented by connectors):

| Method | Return Type | Description |
|--------|-------------|-------------|
| `configure(opts?)` | `ValueOrPromise<void>` | Initialize the underlying connection |
| `getConnectionString()` | `ValueOrPromise<string>` | Return the connection URL |

**Concrete methods (defaults, overridable by connectors):**

| Method | Return Type | Default Behavior |
|--------|-------------|-------------------|
| `getSettings()` | `Settings` | Returns `this.settings` |
| `getSchema()` | `Schema` | Returns `this.schema` (throws if not initialized) |
| `getCapabilities()` | `IDataSourceCapabilities` | Returns `{ transactions: false }` |
| `beginTransaction(opts?)` | `Promise<ITransaction>` | Calls `throwNotSupported({ scope: this.constructor.name, feature: 'Transactions', logger: this.logger })` - throws HTTP 501 with `messageCode: 'core.not_supported'` |

> [!NOTE] NotSupported convention
> Every capability an engine doesn't implement - transactions, row-level locking - uses the same `throwNotSupported` utility (`packages/core/src/utilities/error.utility.ts`), producing a consistent `501 Not Implemented` with `messageCode: 'core.not_supported'`. This is how `MemoryDataSource` and the typesense connector signal "not applicable to this engine" instead of silently no-op-ing.

### `IDataSourceCapabilities`

```typescript
interface IDataSourceCapabilities {
  transactions: boolean;
}
```

Only `BasePostgresDataSource` overrides `getCapabilities()` to return `{ transactions: true }`. `MemoryDataSource` and the typesense datasources inherit the neutral default.

## PostgreSQL Connector: `AbstractPostgresDataSource` & `BasePostgresDataSource`

**Files:** `packages/core/src/connectors/postgres/datasources/abstract-datasource.ts`, `packages/core/src/connectors/postgres/datasources/base-datasource.ts`

### `AbstractPostgresDataSource`

Extends `AbstractDataSource` with PostgreSQL/Drizzle-specific members.

```typescript
abstract class AbstractPostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
```

**Additional properties:**

| Property | Type | Visibility | Description |
|----------|------|------------|-------------|
| `connector` | `TNodePostgresConnector<Schema>` | public | Drizzle ORM instance |
| `pool` | `Pool` | protected | node-postgres connection pool |

**Additional abstract method:**

| Method | Return Type | Description |
|--------|-------------|-------------|
| `beginTransaction(opts?)` | `Promise<IDatabaseTransaction<Schema>>` | Start a new PostgreSQL transaction |

### `BasePostgresDataSource` (canonical name; `BaseDataSource` is a compatibility alias)

Extends `AbstractPostgresDataSource` with a constructor, **schema auto-discovery**, and a real `beginTransaction()` implementation backed by the connection pool.

```typescript
abstract class BasePostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends AbstractPostgresDataSource<Settings, Schema, ConfigurableOptions>
```

> [!TIP] Naming
> `BasePostgresDataSource` is the canonical, engine-carrying name - prefer it in new code. `import { BaseDataSource } from '@venizia/ignis'` (or `@venizia/ignis/postgres`) still resolves to the exact same class via a re-export in `connectors/postgres/datasources/index.ts` (`export { BasePostgresDataSource as BaseDataSource } from './base-datasource'`), so existing code is unaffected.

#### Key Features

| Feature | Description |
|---------|--------------|
| **Schema Auto-Discovery** | Schema is automatically built from registered `@repository` decorators |
| **Manual Override** | You can manually provide schema in constructor for full control |
| **Built-in Transaction Support** | `beginTransaction()` implemented using the `pool` property; overrides `getCapabilities()` to return `{ transactions: true }` |

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
import { BasePostgresDataSource, datasource } from '@venizia/ignis';
import { applicationEnvironment, int, ValueOrPromise } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
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
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
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

    const dataSourceSchema = Object.keys(schema);
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      dataSourceSchema.length,
      dataSourceSchema,
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
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
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
| `driver` | `TDataSourceDriver` | - | Driver name - `'node-postgres'` (PostgreSQL) and `'typesense'` are the known `DataSourceDrivers` constants; any other engine-driver string is also accepted |
| `autoDiscovery` | `boolean` | `true` | Enable/disable schema auto-discovery |

### Abstract Methods

When extending `BasePostgresDataSource`, these methods must be implemented:

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

**File:** `packages/core/src/connectors/postgres/datasources/common/types.ts`

| Type | Description |
|------|-------------|
| `TNodePostgresConnector<Schema>` | Drizzle connector using `NodePgClient` (Pool or PoolClient) |
| `TNodePostgresTransactionConnector<Schema>` | Drizzle connector using `PoolClient` specifically (for transaction isolation) |
| `TAnyConnector<Schema>` | Union of both connector types |
| `TAnyDataSourceSchema` | `Record<string, any>` - base type for all schema objects (defined in `src/base/datasources/common/types.ts`, shared across engines) |

### `DataSourceDrivers`

Static class for driver validation (defined in `src/base/datasources/common/types.ts`, shared across engines):

```typescript
DataSourceDrivers.NODE_POSTGRES  // 'node-postgres'
DataSourceDrivers.TYPESENSE      // 'typesense'
DataSourceDrivers.isValid('node-postgres')  // true
```

## Transaction Support

Only engines that declare `getCapabilities().transactions === true` implement real transactions - currently just the PostgreSQL connector. Calling `beginTransaction()` on the typesense or memory connectors throws `NotSupported` (HTTP 501).

### How It Works

`BasePostgresDataSource.beginTransaction()` does the following:

1. Acquires a `PoolClient` from `this.pool`
2. Executes `BEGIN TRANSACTION ISOLATION LEVEL <level>` on the client
3. Creates a separate Drizzle connector scoped to that client
4. Returns an `IDatabaseTransaction` object with `commit()`, `rollback()`, and the scoped `connector`

When `commit()` or `rollback()` is called, the client is released back to the pool.

### Neutral vs. PostgreSQL Transaction Types

`src/base` declares the engine-neutral shape; the PostgreSQL connector narrows it with connection details.

```typescript
// packages/core/src/base/datasources/common/types.ts - engine-neutral
interface ITransaction<_Schema = unknown> {
  isActive: boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// packages/core/src/connectors/postgres/datasources/common/types.ts - PostgreSQL
interface IDatabaseTransaction<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema>
  extends ITransaction<Schema> {
  connector: TNodePostgresTransactionConnector<Schema>;
  isolationLevel: TIsolationLevel;
}
```

| Type | Description |
|------|-------------|
| `ITransaction<Schema>` | Engine-neutral contract - `isActive`, `commit()`, `rollback()`. No connector field. |
| `IDatabaseTransaction<Schema>` | PostgreSQL transaction object - extends `ITransaction` with `connector` and `isolationLevel` |
| `IDatabaseTransactionOptions` | Options for starting a PostgreSQL transaction (`isolationLevel`); extends the neutral `ITransactionOptions` |
| `IDatabaseExtraOptions` | Extends the neutral `IExtraOptions`, narrowing `transaction?: IDatabaseTransaction` |
| `TIsolationLevel` | Union type: `'READ COMMITTED'` \| `'REPEATABLE READ'` \| `'SERIALIZABLE'` |
| `IsolationLevels` | Static class with isolation level constants and validation |

> [!NOTE]
> `AbstractRepository`, `PersistableRepository`, and every other engine-neutral repository type parameter is named `TOptions`/`IExtraOptions` in `src/base`. The PostgreSQL connector's `PostgresBaseRepository` narrows `ExtraOptions` to default to `IDatabaseExtraOptions`, so repository code written against a `PostgresBaseRepository` subclass sees `IDatabaseTransaction` (with `connector`/`isolationLevel`) rather than the bare neutral `ITransaction`.

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
  - [Connectors](./connectors) - Base-vs-connectors architecture, dual-door exports, aliases
  - [DataSources Guide](/guides/core-concepts/persistent/datasources) - Creating DataSources tutorial
  - [Repositories](/guides/core-concepts/persistent/repositories) - Using DataSources for database access
  - [Models](/guides/core-concepts/persistent/models) - Entity schemas loaded by DataSource
  - [Transactions](/guides/core-concepts/persistent/transactions) - Multi-operation database transactions
  - [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - The typesense connector
  - [Memory Connector](/guides/core-concepts/persistent/memory-connector) - The zero-dependency in-memory connector

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
