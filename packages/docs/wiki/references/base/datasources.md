# Deep Dive: DataSources

Technical reference for DataSource classes - managing database connections in Ignis.

**Files:** `packages/core/src/base/datasources/*.ts`

## Quick Reference

| Class/Interface | Purpose | Key Members |
|-----------------|---------|-------------|
| **IDataSource** | Contract for all datasources | `name`, `settings`, `connector`, `getSchema()`, `configure()` |
| **AbstractDataSource** | Base implementation with logging | Extends `BaseHelper` |
| **BaseDataSource** | Concrete class to extend | Auto-discovery, driver from decorator |

## `IDataSource` Interface

Contract for all datasource classes in the framework.

**File:** `packages/core/src/base/datasources/types.ts`

### Properties & Methods

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Datasource name |
| `settings` | `object` | Configuration object |
| `connector` | `TDatabaseConnector` | Database connector instance (e.g., Drizzle) |
| `getSchema()` | Method | Returns combined Drizzle schema (auto-discovered or manual) |
| `configure()` | Method | Initializes the `connector` |
| `getConnectionString()` | Method | Returns connection string |

## `AbstractDataSource` & `BaseDataSource`

**File:** `packages/core/src/base/datasources/base.ts`

### `AbstractDataSource`

This is the top-level abstract class that implements the `IDataSource` interface. It initializes the `BaseHelper` for logging and sets up the basic properties.

### `BaseDataSource`

This class extends `AbstractDataSource` and provides a constructor with **auto-discovery** support. When you create your own datasource, you extend `BaseDataSource`.

#### Key Features

| Feature | Description |
|---------|-------------|
| **Driver Auto-Read** | Driver is read from `@datasource` decorator - no need to pass in constructor |
| **Schema Auto-Discovery** | Schema is automatically built from registered `@repository` decorators |
| **Manual Override** | You can still manually provide schema in constructor for full control |

### Constructor Options

```typescript
constructor(opts: {
  name: string;           // DataSource name (usually class name)
  config: Settings;       // Database connection settings
  driver?: TDataSourceDriver;  // Optional - read from @datasource if not provided
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
    -   Driver is automatically read from `@datasource` decorator
    -   Schema is auto-discovered from `@repository` bindings (or manually provided)

2.  **`Application.registerDataSources()` is called during startup**:
    -   The application gets your `DataSource` instance from the DI container
    -   It calls the `configure()` method on your instance

3.  **Your `configure()` method runs**:
    -   This is where you instantiate the Drizzle ORM
    -   Use `this.getSchema()` to get the auto-discovered schema and pass to Drizzle

### Example Implementations

#### Pattern 1: Auto-Discovery (Recommended)

Simplest approach - schema is auto-discovered from repositories:

```typescript
// src/datasources/postgres.datasource.ts
import {
  BaseDataSource,
  datasource,
  TNodePostgresConnector,
  ValueOrPromise,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
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
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      // Driver is read from @datasource decorator - no need to pass here!
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'mydb',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
      // NO schema property - auto-discovered from @repository bindings!
    });
  }

  override configure(): ValueOrPromise<void> {
    // getSchema() auto-discovers models from @repository bindings
    const schema = this.getSchema();

    // Log discovered schema for debugging
    const schemaKeys = Object.keys(schema);
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schemaKeys.length,
      schemaKeys,
    );

    const client = new Pool(this.settings);
    this.connector = drizzle({ client, schema });
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
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
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
    const client = new Pool(this.settings);
    this.connector = drizzle({ client, schema: this.getSchema() });
  }
}
```

### @datasource Decorator

The `@datasource` decorator registers datasource metadata:

```typescript
@datasource({
  driver: 'node-postgres',       // Required - database driver
  autoDiscovery?: true           // Optional - defaults to true
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `TDataSourceDriver` | - | Database driver name |
| `autoDiscovery` | `boolean` | `true` | Enable/disable schema auto-discovery |

### Abstract Methods

These methods must be implemented in your datasource class:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `configure(opts?)` | `ValueOrPromise<void>` | Initialize the Drizzle ORM connector. Called during application startup. |
| `getConnectionString()` | `ValueOrPromise<string>` | Return the database connection string. |

### Optional Override Methods

These methods can be optionally overridden for connection lifecycle management:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `connect()` | `Promise<Connector \| undefined>` | Establish database connection. Useful for connection pooling. |
| `disconnect()` | `Promise<void>` | Close database connection gracefully. |

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  // ... constructor and configure() ...

  override async connect(): Promise<TNodePostgresConnector | undefined> {
    await (this.connector.client as Pool).connect();
    return this.connector;
  }

  override async disconnect(): Promise<void> {
    await (this.connector.client as Pool).end();
  }
}
```

### Helper Methods

| Method | Description |
|--------|-------------|
| `getSchema()` | Returns the schema (auto-discovers if not manually provided) |
| `getSettings()` | Returns connection settings |
| `getConnector()` | Returns the Drizzle connector |
| `hasDiscoverableModels()` | Returns `true` if there are models registered for this datasource |

This architecture ensures that datasources are configured consistently and that the fully-initialized Drizzle connector, aware of all schemas and relations, is available to repositories for querying.
