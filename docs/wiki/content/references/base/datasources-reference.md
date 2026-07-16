---
title: DataSources - Full Reference
description: Complete reference for the engine-neutral DataSource contract, the PostgreSQL connector, driver seam, and transaction API
difficulty: intermediate
---

# DataSources - Full Reference

Exhaustive reference for `IDataSource`, `AbstractDataSource`, the PostgreSQL connector (`AbstractPostgresDataSource`/`BasePostgresDataSource`), the driver seam, and transactions. For a readable introduction and the common tasks, start with the [DataSources overview](/references/base/datasources).

**Files:**

- [`packages/core/src/base/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/datasources/abstract.ts) - neutral `AbstractDataSource`
- [`packages/core/src/base/datasources/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/datasources/common/types.ts) - `IDataSource`, `DataSourceDrivers`, neutral transaction types
- [`packages/core/src/connectors/postgres/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/abstract.ts) - `AbstractPostgresDataSource`
- [`packages/core/src/connectors/postgres/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/base.ts) - `BasePostgresDataSource`
- [`packages/core/src/connectors/postgres/datasources/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/common/types.ts) - PostgreSQL connector types, `IsolationLevels`
- [`packages/core/src/connectors/postgres/drivers`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/drivers) - `IRelationalDriver`, `NodePostgresDriver`, `PostgresJsDriver`

> [!IMPORTANT] Base vs. connectors
> - **Split.** Engine-neutral root at `src/base/datasources/`; per-engine connectors at `src/connectors/{postgres,typesense}/datasources/`.
> - **`AbstractDataSource` has no SQL, no Drizzle, no `pool`.** Those live only in the PostgreSQL connector. See [Connectors](/references/base/connectors) for the full base-vs-connectors architecture, dual-door exports, and how to add a new engine.
> - **Scope of this page.** The neutral contract plus the PostgreSQL connector in depth; see [Search & Typesense](/guides/core-concepts/persistent/search-typesense) for the other engine.

## Quick reference

| Class / interface | Purpose | Key members |
|---|---|---|
| `IDataSource` | Engine-neutral contract for all datasources | `name`, `settings`, `schema`, `getSchema()`, `getSettings()`, `configure()` |
| `AbstractDataSource` | Engine-neutral base implementation with logging | Extends `BaseHelper`; `getCapabilities()` defaults to `{ transactions: false }`; `beginTransaction()` defaults to `throwNotSupported(...)` |
| `AbstractPostgresDataSource` | PostgreSQL-aware abstraction | Adds `connector`, `client`, `driver`; abstract `getConnectionString()` / `beginTransaction()` |
| `BasePostgresDataSource` | Concrete class to extend for PostgreSQL | Constructor, schema auto-discovery, real transaction support. Canonical name - `BaseDataSource` is a compatibility alias re-exporting the same class |
| `IRelationalDriver` | Driver seam - connection acquisition + control statements | `createConnector()`, `acquire()`, `getClient()`, `end()` |
| `ITransaction` | Engine-neutral transaction contract | `isActive`, `commit()`, `rollback()` (no `connector` field) |
| `IDatabaseTransaction` | PostgreSQL transaction object | Extends `ITransaction`, adds `connector`, `isolationLevel` |
| `IsolationLevels` | Isolation level constants (PostgreSQL) | `READ_COMMITTED`, `REPEATABLE_READ`, `SERIALIZABLE` |

## `IDataSource` interface

Engine-neutral contract implemented by every datasource in the framework, regardless of engine.

`Source ->` [`packages/core/src/base/datasources/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/datasources/common/types.ts)

```typescript
interface IDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  name: string;
  settings: Settings;
  schema: Schema;

  getSettings(): Settings;
  getSchema(): Schema;
}
```

### Type parameters

| Type parameter | Default | Description |
|---|---|---|
| `Settings` | `{}` | Connection configuration type (host, port, etc.) |
| `Schema` | `TAnyDataSourceSchema` | Combined schema type - shape depends on the connector: Drizzle tables for PostgreSQL, collection definitions for typesense |
| `ConfigurableOptions` | `{}` | Options passed to `configure()` |

### Members

| Member | Type | Description |
|---|---|---|
| `name` | `string` | Datasource name |
| `settings` | `Settings` | Configuration object |
| `schema` | `Schema` | Combined schema - auto-discovered or manual |
| `getSchema()` | `Schema` | Returns the combined schema |
| `getSettings()` | `Settings` | Returns connection settings |
| `configure(opts?)` | `ValueOrPromise<void>` | Initializes the underlying connection - inherited from `IConfigurable` |

> [!NOTE]
> `getCapabilities()` and `beginTransaction()` are not part of `IDataSource` - they are declared on `AbstractDataSource` (below), which every connector extends.

## `AbstractDataSource` (engine-neutral root)

Top-level abstract class extended by every engine. Extends `BaseHelper` for scoped logging. Contains **no SQL, no Drizzle, and no connection-pool members** - those are added by each connector.

`Source ->` [`packages/core/src/base/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/datasources/abstract.ts)

```typescript
abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends BaseHelper implements IDataSource<Settings, Schema, ConfigurableOptions>
```

**Properties:**

| Property | Type | Visibility | Description |
|---|---|---|---|
| `name` | `string` | public | Datasource identifier |
| `settings` | `Settings` | public | Connection configuration |
| `schema` | `Schema` | public | Combined schema |

**Abstract methods** (must be implemented by connectors):

| Method | Return type | Description |
|---|---|---|
| `configure(opts?)` | `ValueOrPromise<void>` | Initialize the underlying connection. This is the **only** abstract member of the neutral root - `getConnectionString()` is not part of it; it is declared one level down, on `AbstractPostgresDataSource` (see below) |

**Concrete methods** (defaults, overridable by connectors):

| Method | Return type | Default behavior |
|---|---|---|
| `getSettings()` | `Settings` | Returns `this.settings` |
| `getSchema()` | `Schema` | Returns `this.schema`; throws if not initialized |
| `getCapabilities()` | `IDataSourceCapabilities` | Returns `{ transactions: false }` |
| `beginTransaction(opts?)` | `Promise<ITransaction>` | Calls `throwNotSupported({ scope: this.constructor.name, feature: 'Transactions', logger: this.logger })` - throws HTTP 501 with `messageCode: 'core.not_supported'` |

**Protected helpers:**

| Method | Description |
|---|---|
| `getBoundModelClasses()` | Returns the model classes bound to this datasource via `@repository` metadata, read from `MetadataRegistry` |
| `discoverDefinitions({ read, kind })` | Walks the bound model classes, reads a connector-specific artifact via `read`, and returns a name-keyed registry. Skips undefined reads, throws on duplicate names, honors `autoDiscovery: false`. Shared plumbing every connector's own `discoverSchema()`-equivalent builds on |

> [!NOTE] NotSupported convention
> Every capability an engine does not implement - transactions, row-level locking - uses the same `throwNotSupported` utility ([`packages/core/src/utilities/error.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/utilities/error.utility.ts)), producing a consistent `501 Not Implemented` with `messageCode: 'core.not_supported'`. This is how the typesense connector signals "not applicable to this engine" instead of silently no-op-ing.

### `IDataSourceCapabilities`

```typescript
interface IDataSourceCapabilities {
  transactions: boolean;
}
```

Only `BasePostgresDataSource` overrides `getCapabilities()` to return `{ transactions: true }`. The typesense datasources inherit the neutral default (`{ transactions: false }`).

## PostgreSQL connector: `AbstractPostgresDataSource` and `BasePostgresDataSource`

`Source ->` [`packages/core/src/connectors/postgres/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/abstract.ts), [`packages/core/src/connectors/postgres/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/base.ts)

### `AbstractPostgresDataSource`

Extends `AbstractDataSource` with PostgreSQL/Drizzle-specific members. Internally named `AbstractRelationalDataSource`; `AbstractPostgresDataSource` is the exported, engine-carrying name.

```typescript
abstract class AbstractRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
  implements IPostgresDataSource<Settings, Schema, ConfigurableOptions, Client>
```

**Additional properties:**

| Property | Type | Visibility | Description |
|---|---|---|---|
| `connector` | `TRelationalConnector<Schema>` | public | Drizzle ORM instance - any Drizzle pg driver satisfies this |
| `client` | `Client` (`Pool` by default) | protected, optional | The raw driver client `configure()` builds - a `pg.Pool`, or a postgres-js `Sql`. Assigning it is enough: `wireDriverFromMetadata()` instantiates the `@datasource({ driver })` class over it on first use. Absent once `useDriver()` wired a driver instead |
| `driver` | `IRelationalDriver<Schema>` | protected, optional | The connection driver (`node-postgres` or `postgres-js`); built lazily by `wireDriverFromMetadata()` from the class named in `@datasource({ driver })`, or explicitly by `useDriver()` |

The fourth generic, `Client = Pool`, is what lets a postgres-js datasource declare `Client = Sql` and keep `getClient()` honestly typed.

**Abstract methods:**

| Method | Return type | Description |
|---|---|---|
| `getConnectionString()` | `ValueOrPromise<string>` | Return the connection URL. Declared here, not on the neutral root - only a connector that has a notion of "connection string" needs it |
| `beginTransaction(opts?)` | `Promise<IDatabaseTransaction<Schema>>` | Start a new PostgreSQL transaction; overrides the neutral `beginTransaction()` |

**Concrete methods:**

| Method | Return type | Description |
|---|---|---|
| `getConnector()` | `TRelationalConnector<Schema>` | Wires the driver on first use (via `wireDriverFromMetadata()`), then returns `this.connector` |
| `getClient()` | `Client` | Raw driver client escape hatch - `pg.Pool` for node-postgres, `Sql` for postgres-js. Reads `this.driver.getClient()` if a driver is resolved, else `this.client` directly. Throws if neither is set |
| `getQueryDialect()` | `IRelationalQueryDialect` | Returns a shared, lazily-constructed `FilterBuilder` instance (static, one per process) |
| `onSecretRotated(opts)` | `Promise<void>` | Applies rotated credentials to `this.settings`, rebuilds the driver/connector/client against a fresh pool, calls `this.configure()` and `this.resolveDriver()`, then drains the old pool once the new one is in place. See [Secrets & Vault](/guides/core-concepts/secrets-vault) |

**Protected methods:**

| Method | Description |
|---|---|
| `wireDriverFromMetadata()` | Idempotent, lazy. If `this.connector` already exists, no-ops. If `this.driver` exists but `this.connector` does not, builds the connector from it. Otherwise reads the class named in `@datasource({ driver })` from `MetadataRegistry`, instantiates it over `this.client`, and calls `useDriver()`. Throws if neither `client` nor `driver` is set, or if the named `driver` metadata is not a class (a string, historically valid for search engines, is rejected here with a message pointing at `NodePostgresDriver`) |
| `resolveDriver()` | Calls `wireDriverFromMetadata()`, then returns `this.driver` |
| `useDriver({ driver, schema? })` | Assigns `this.driver` **and** builds `this.connector` from it in one step - the two-step form (driver set, connector forgotten) is unrepresentable. `schema` defaults to `getSchema()`. The public escape hatch for a custom or third-party driver, bypassing `@datasource({ driver })` entirely |
| `mapSecretToSettings({ secret })` | Maps Vault's `{ username, password }` secret shape to `pg`'s `{ user, password }` settings shape, for `onSecretRotated()` |

> [!NOTE] Driver seam
> - **Class, not a string.** `@datasource({ driver })` names the driver **class** (`NodePostgresDriver` or `PostgresJsDriver`) - a driver-name string cannot carry `pg`/`postgres` into the app's bundle, only a real class reference can.
> - **`configure()` only assigns `this.client`.** The protected `wireDriverFromMetadata()` (called internally by `getConnector()`/`resolveDriver()`) instantiates the named class over it and builds `this.connector`, lazily and idempotently.
> - **Where the drivers live.** `pg` and `postgres` are both optional peer dependencies; concrete drivers live at `@venizia/ignis/postgres/node-postgres` and `@venizia/ignis/postgres/postgres-js`, and Supabase support at `@venizia/ignis/postgres/supabase`. See [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers).

### `BasePostgresDataSource` (canonical name; `BaseDataSource` is a compatibility alias)

Extends `AbstractPostgresDataSource` with a constructor, **schema auto-discovery**, and a real `beginTransaction()` implementation backed by the connection pool. Internally named `BaseRelationalDataSource`.

`Source ->` [`packages/core/src/connectors/postgres/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/base.ts)

```typescript
abstract class BaseRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends AbstractRelationalDataSource<Settings, Schema, ConfigurableOptions, Client>
```

> [!TIP] Naming
> `BasePostgresDataSource` is the canonical, engine-carrying name - prefer it in new code. `import { BaseDataSource } from '@venizia/ignis'` (or `@venizia/ignis/postgres`) still resolves to the exact same class via a re-export in `connectors/postgres/datasources/index.ts`, so existing code is unaffected.

#### Key features

| Feature | Description |
|---|---|
| Schema auto-discovery | Schema is automatically built from registered `@repository` decorators |
| Manual override | You can pass `schema` in the constructor for full control |
| Built-in transaction support | `beginTransaction()` acquires its connection from the resolved driver; overrides `getCapabilities()` to return `{ transactions: true }` |

> [!TIP]
> Set `autoDiscovery: false` in the `@datasource` decorator to disable automatic schema discovery, when you want to provide the schema manually.

### Constructor options

```typescript
constructor(opts: {
  name: string;      // DataSource name (usually the class name)
  config: Settings;  // Database connection settings
  schema?: Schema;   // Optional - auto-discovered if not provided
})
```

### Schema auto-discovery

When a model is bound via `@repository({ model: YourModel, dataSource: YourDataSource })`, the framework automatically:

1. Registers the model-datasource binding in `MetadataRegistry`
2. When `getSchema()` is called and `this.schema` is not already set, calls `discoverSchema()`
3. `discoverSchema()` queries `MetadataRegistry.buildSchema({ dataSource })` for every model bound to this datasource and merges their tables and relations into a single schema object

This means tables and relations never need to be manually merged in the datasource constructor.

### Configuration flow

1. **Your DataSource's `constructor` runs.** You call `super()` with `name` and `config`. Schema is auto-discovered from `@repository` bindings unless `schema` is provided manually.
2. **`Application.registerDataSources()` runs during startup.** The application fetches your datasource instance from the DI container and calls `configure()` on it.
3. **Your `configure()` method runs.** Its only job is to create the raw client and assign it to `this.client` - `getConnector()`/`beginTransaction()` lazily instantiate the class named in `@datasource({ driver })` over it and build the Drizzle connector. `configure()` never touches `this.connector` directly.

### Example implementations

#### Pattern 1: auto-discovery (recommended)

```typescript
// src/datasources/postgres.datasource.ts
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

@datasource({ driver: NodePostgresDriver })
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
      // NO schema property - auto-discovered from @repository bindings.
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = Object.keys(this.getSchema());
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schema.length,
      schema,
    );

    // That is all - the base class wires the driver + connector from @datasource({ driver }).
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

With this pattern, defining repositories is enough for `PostgresDataSource.schema` to include their tables and relations:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {}
```

#### Pattern 2: manual schema (full control)

```typescript
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';
import { User, userTable, userRelations } from '@/models/user.model';
import { Configuration, configurationTable, configurationRelations } from '@/models/configuration.model';

@datasource({ driver: NodePostgresDriver })
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
      // Manually provide schema using spread syntax.
      schema: {
        [User.TABLE_NAME]: userTable,
        [Configuration.TABLE_NAME]: configurationTable,
        ...userRelations.relations,
        ...configurationRelations.relations,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    // Manually-provided schema is used as-is by the connector the base class builds from this.client.
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

> [!IMPORTANT]
> `configure()` must leave the datasource with a way to reach the database: either assign the raw client to `this.client` (paired with naming the driver class in `@datasource({ driver })`), or wire a driver directly with `this.useDriver({ driver })` for a custom or third-party driver. `getConnector()`/`beginTransaction()` resolve the driver lazily from whichever you provided. With neither, `wireDriverFromMetadata()` throws `No driver and no client`.

### `@datasource` decorator

`Source ->` [`packages/core/src/base/metadata/persistents.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/metadata/persistents.ts)

```typescript
@datasource({
  driver: NodePostgresDriver,   // Driver CLASS (relational), or a driver-name string (search)
  autoDiscovery?: true,         // Optional - defaults to true
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `driver` | `TDataSourceDriverClass` | - | The driver **class** - `NodePostgresDriver` or `PostgresJsDriver` (imported from `@venizia/ignis/postgres/node-postgres` / `.../postgres-js`), never a driver-name string on a **relational** datasource. A class reference is the only thing that carries `pg`/`postgres` into the app's bundle. **Omit it for a search datasource**: `extends TypesenseDataSource` already names the engine, and is what carries `typesense` into the bundle |
| `autoDiscovery` | `boolean` | `true` | Enable/disable schema auto-discovery. `false` makes `discoverSchema()`/`discoverDefinitions()` return an empty object instead of querying `MetadataRegistry` |

### Abstract methods (extending `BasePostgresDataSource`)

| Method | Return type | Description |
|---|---|---|
| `configure(opts?)` | `ValueOrPromise<void>` | Initialize the client. Must set `this.client` (the base class wires the driver and Drizzle connector from `@datasource({ driver })`), or call `this.useDriver()` directly for a custom driver |
| `getConnectionString()` | `ValueOrPromise<string>` | Return the database connection string |

### Helper methods

| Method | Description |
|---|---|
| `getSchema()` | Returns the schema, auto-discovering via `discoverSchema()` if not manually provided |
| `getSettings()` | Returns connection settings |
| `getConnector()` | Returns the Drizzle connector, wiring the driver first if needed |
| `hasDiscoverableModels()` | Returns `true` if there are models registered for this datasource via `@repository` |

### Protected methods

| Method | Description |
|---|---|
| `discoverSchema()` | Queries `MetadataRegistry` for all `@repository` bindings targeting this datasource, then calls `registry.buildSchema()` to merge tables and relations into a single schema object. Returns `{}` when `autoDiscovery: false` |

## Driver interface

`Source ->` [`packages/core/src/connectors/postgres/drivers`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/drivers)

`IRelationalDriver` owns connection acquisition and the raw control statements (`BEGIN`/`COMMIT`/`ROLLBACK`) - the only two places the connector is hard-wired to a specific client library.

```typescript
interface IRelationalDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, Client = unknown> {
  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema>;
  acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>>;
  getClient(): Client;
  end(): Promise<void>;
}

interface IRelationalConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> {
  connector: TRelationalConnector<Schema>;
  execute(opts: { statement: string }): Promise<IStatementResult>;
  release(opts?: { destroy?: boolean }): void;
}

interface IStatementResult {
  count: number;
}
```

| Member | Description |
|---|---|
| `createConnector({ schema })` | Builds the pooled Drizzle connector - what `wireDriverFromMetadata()` assigns to `this.connector` |
| `acquire({ schema })` | Checks out one dedicated physical connection for an explicit transaction, returning a connector bound to that connection plus `execute()`/`release()` |
| `getClient()` | Raw client escape - `pg.Pool` for node-postgres, `Sql` for postgres-js |
| `end()` | Closes the underlying client/pool |
| `IRelationalConnection.execute({ statement })` | Runs a control statement verbatim (never parameterized - `BEGIN TRANSACTION ISOLATION LEVEL $1` is not valid SQL) |
| `IRelationalConnection.release({ destroy? })` | Returns the connection to the pool, or discards it when `destroy: true` - required after a failed `COMMIT`/`ROLLBACK`, since the session may still hold an open transaction |

Two concrete drivers ship today, both satisfying `IRelationalDriver` and both proven by the same conformance suite:

| Driver | Package | Client shape validated in the constructor |
|---|---|---|
| `NodePostgresDriver` | `pg` | Rejects a client without `connect()` **and** `totalCount` (pool accounting) - catches a bare `pg.Client` |
| `PostgresJsDriver` | `postgres` | Rejects a client without `reserve()` **and** `unsafe()` - catches a `pg.Pool` passed to the wrong driver |

- **Driver asymmetry, deliberate.** After a failed `COMMIT`, `pg` can destroy the poisoned connection (`release(err)`); postgres-js has no destroy semantics (`ReservedSql.release()` takes no argument), so it returns the connection to the pool regardless.
- **Both drivers accept the same call.** `IRelationalConnection.release({ destroy: true })` is accepted by both drivers and honored by one. See [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers) for the full driver comparison and Supabase's transaction-pooler requirements.

## Connector types

`Source ->` [`packages/core/src/connectors/postgres/datasources/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/common/types.ts)

| Type | Description |
|---|---|
| `TRelationalConnector<Schema>` | Canonical connector type - a Drizzle `PgDatabase` that **every** pg driver (`node-postgres`, `postgres-js`) satisfies. Use this in new code |
| `TNodePostgresConnector<Schema>` | `@deprecated` compat alias for `TRelationalConnector<Schema>` |
| `TNodePostgresTransactionConnector<Schema>` | `@deprecated` compat alias - was the `PoolClient`-specific transaction connector; now aliases `TRelationalConnector<Schema>` |
| `TAnyConnector<Schema>` | Alias of `TRelationalConnector<Schema>` |
| `TAnyDataSourceSchema` | `Record<string, any>` - base type for all schema objects, defined in `src/base/datasources/common/types.ts`, shared across engines |

### `DataSourceDrivers`

`Source ->` [`packages/core/src/base/datasources/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/datasources/common/types.ts)

An identity-only const-class - the engine actually used is chosen by which driver **class** `@datasource({ driver })` names, not by this constant. `DataSourceDrivers` is read by nothing else in `src`; it never routes connector configuration.

```typescript
class DataSourceDrivers {
  static readonly NODE_POSTGRES = 'node-postgres';
  static readonly POSTGRES_JS = 'postgres-js';
  static readonly TYPESENSE = 'typesense';
  static readonly MEILISEARCH = 'meilisearch';

  static isValid(value: string): boolean;
}
```

```typescript
DataSourceDrivers.NODE_POSTGRES  // 'node-postgres'
DataSourceDrivers.POSTGRES_JS    // 'postgres-js'
DataSourceDrivers.TYPESENSE      // 'typesense'
DataSourceDrivers.MEILISEARCH    // 'meilisearch'
DataSourceDrivers.isValid('node-postgres')  // true
```

> [!NOTE]
> `NODE_POSTGRES`/`POSTGRES_JS` remain valid `TDataSourceDriver` string values, but `@datasource({ driver })` on a **relational** datasource no longer accepts them - it takes the `NodePostgresDriver`/`PostgresJsDriver` class instead (see [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers)). Search connectors (`TYPESENSE`, `MEILISEARCH`) still take the driver-name string form, because `extends TypesenseDataSource` already names the engine and is what carries the client into the bundle.

## Transaction support

Only engines that declare `getCapabilities().transactions === true` implement real transactions - currently just the PostgreSQL connector. Calling `beginTransaction()` on the typesense connector throws `NotSupported` (HTTP 501).

### How it works

`BasePostgresDataSource.beginTransaction()`:

1. Resolves a driver (via `resolveDriver()`) and calls `driver.acquire({ schema })` to check out a dedicated physical connection
2. Executes `BEGIN TRANSACTION ISOLATION LEVEL <level>` on that connection
3. On a failed `BEGIN`, destroys the connection (`release({ destroy: true })`) and rethrows - it is never leaked back to the pool in an unknown state
4. Returns an `IDatabaseTransaction` object exposing `isActive`, `commit()`, `rollback()`, and the connection-scoped `connector`

- **Shared `finish()`.** `commit()`/`rollback()` share one internal `finish()` that flips `isActive` to `false` **before** issuing the statement, so a commit racing a rollback cannot double-release the same connection - then runs `COMMIT`/`ROLLBACK`.
- **Outcome handling.** On success the connection is released back to the pool; on failure it is destroyed and the error is rethrown.

> [!WARNING] `commit()`/`rollback()` throw on failure
> - **A failed `COMMIT` or `ROLLBACK` throws** - a failed `COMMIT` never resolves as success.
> - **The poisoned connection is destroyed**, not returned to the pool, where the driver supports it: `node-postgres` can discard a connection; `postgres-js` has no destroy semantics and pools it anyway.
> - **Nest `rollback()` in its own `try...catch`.** It can throw and is normally called from a `catch`, so nesting keeps the rollback error from replacing the original cause.
> - **Calling `rollback()` twice is safe.** After a transaction already ended by failure, `rollback()` is a silent no-op (already torn down), so the canonical `catch { await tx.rollback(); throw error; }` pattern always works. See [Transactions](/guides/core-concepts/persistent/transactions) and [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers).

### Neutral vs. PostgreSQL transaction types

`src/base` declares the engine-neutral shape; the PostgreSQL connector narrows it with connection details.

```typescript
// packages/core/src/base/datasources/common/types.ts - engine-neutral
interface ITransaction {
  isActive: boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// packages/core/src/connectors/postgres/datasources/common/types.ts - PostgreSQL
interface IDatabaseTransaction<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema>
  extends ITransaction {
  connector: TRelationalConnector<Schema>;
  isolationLevel: TIsolationLevel;
}
```

| Type | Description |
|---|---|
| `ITransactionOptions` | Engine-neutral transaction options - `{ isolationLevel?: string }`. Loose on purpose: isolation levels are engine vocabulary, not universal |
| `ITransaction` | Engine-neutral contract - `isActive`, `commit()`, `rollback()`. No `connector` field |
| `IDatabaseTransactionOptions` | PostgreSQL transaction options - narrows `isolationLevel` to `TIsolationLevel`; extends the neutral `ITransactionOptions` |
| `IDatabaseTransaction<Schema>` | PostgreSQL transaction object - extends `ITransaction` with `connector` and `isolationLevel` |
| `TIsolationLevel` | Union type: `'READ COMMITTED'` \| `'REPEATABLE READ'` \| `'SERIALIZABLE'` |
| `IsolationLevels` | Const-class with isolation level constants and validation |

> [!NOTE]
> `AbstractRepository` and every other engine-neutral repository type parameter is named `TOptions` in `src/base`. The PostgreSQL connector's `PostgresBaseRepository` narrows it so repository code bound to a PostgreSQL repository sees `IDatabaseTransaction` (with `connector`/`isolationLevel`) rather than the bare neutral `ITransaction`.

### Isolation levels

```typescript
import { IsolationLevels } from '@venizia/ignis/postgres';

IsolationLevels.READ_COMMITTED   // 'READ COMMITTED' - default, prevents dirty reads
IsolationLevels.REPEATABLE_READ  // 'REPEATABLE READ' - consistent reads within the transaction
IsolationLevels.SERIALIZABLE     // 'SERIALIZABLE' - strictest isolation

IsolationLevels.isValid('READ COMMITTED'); // true
IsolationLevels.isValid('INVALID');        // false
```

> [!NOTE]
> `READ COMMITTED` is used when `beginTransaction()` is called without an `isolationLevel` option.

### Usage example

```typescript
import { IsolationLevels } from '@venizia/ignis/postgres';
import { userTable, profileTable } from '@/schemas';

const transaction = await postgresDataSource.beginTransaction({
  isolationLevel: IsolationLevels.SERIALIZABLE,
});

try {
  await transaction.connector.insert(userTable).values({ name: 'Alice' });
  await transaction.connector.insert(profileTable).values({ userId: '...', bio: 'Hello' });

  await transaction.commit();
} catch (error) {
  // rollback() throws if ROLLBACK itself fails - nest it so it never replaces the original cause.
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    console.error('Rollback failed | %s', rollbackError);
  }
  throw error;
}
```

> [!TIP]
> For most use cases, prefer `repository.beginTransaction()`, which provides a higher-level API. See [Repositories](/references/base/repositories/#run-inside-a-transaction).

This architecture ensures datasources are configured consistently and that the fully-initialized Drizzle connector, aware of all schemas and relations, is available to repositories for querying.

## See also

- [DataSources overview](/references/base/datasources) - introduction and common tasks
- [Tutorial](/guides/core-concepts/persistent/datasources) - creating datasources step by step
- [Connectors](/references/base/connectors) - the base-vs-connector architecture, dual-door exports
- [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers) - node-postgres vs. postgres-js, Supabase presets
- [Repositories](/references/base/repositories/) - the data access layer that consumes a DataSource
- [Transactions](/guides/core-concepts/persistent/transactions) - multi-operation database transactions
- [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - the typesense connector
- [Secrets & Vault](/guides/core-concepts/secrets-vault) - `onSecretRotated()` and credential rotation
