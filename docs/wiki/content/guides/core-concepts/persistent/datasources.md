# DataSources

A DataSource manages database connections and supports **schema auto-discovery** from repositories.

> [!NOTE] Connectors
> This guide covers the **PostgreSQL connector** (`BasePostgresDataSource`, aliased as `BaseDataSource` for backward compatibility). It's the primary relational engine and the one used by most applications. IGNIS also ships a **SQLite connector** (`BaseSqliteDataSource`, see [SQLite](./sqlite)), an embedded **PGlite** driver (see [PGlite](./pglite)), and two search connectors, **Typesense** (see [Search and Typesense](./search-typesense)) and **Meilisearch** (see [Search and Meilisearch](./search-meilisearch)). They all implement the same engine-neutral `AbstractDataSource` contract - see [Connectors](/references/base/connectors) for the architecture.

## Creating a DataSource

```typescript
// src/datasources/postgres.datasource.ts
import {
  BasePostgresDataSource,
  datasource,
  ValueOrPromise,
} from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

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
      // No schema needed - auto-discovered from @repository bindings!
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = Object.keys(this.getSchema());
    this.logger.debug('[configure] Auto-discovered schema | Keys: %o', schema);

    // That is all - naming NodePostgresDriver above is what wires the driver and connector.
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

> [!NOTE] Driver seam: the raw client goes on `this.client`
> `this.client = new Pool(...)` is the short path: `configure()` builds only the client. `getConnector()`/`beginTransaction()` lazily instantiate the class named in `@datasource({ driver })` over it - `NodePostgresDriver` here. There is no `pool` field - the raw-client slot is `client`, whatever the client happens to be. Naming the driver class (rather than a driver-name string) is what carries `pg` into the app's bundle. A bundler only packages a real value reference, never text. The alternative is to wire a driver yourself for a custom or third-party driver: `configure()` calls `this.useDriver({ driver, schema? })`. That assigns `this.driver` **and** builds `this.connector` in one step (so the half-wired state cannot exist), bypassing `@datasource({ driver })` entirely. See [Postgres Drivers & Supabase](./postgres-drivers) for `postgres-js` and Supabase.

**How auto-discovery works:**

1. `@repository` decorators register model-datasource bindings in the `MetadataRegistry`
2. `getSchema()` invokes `discoverSchema()` which calls `MetadataRegistry.buildSchema({ dataSource })` to collect all bound models and their relations
3. The lazily-built Drizzle connector is initialized with the complete schema (tables + Drizzle relations)

You can disable auto-discovery per datasource via `@datasource({ driver: NodePostgresDriver, autoDiscovery: false })`.

## Manual Schema (Optional)

If you need explicit control, you can still provide schema manually:

```typescript
@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: { /* ... */ },
      schema: {
        User: User.schema,
        Configuration: Configuration.schema,
        // Add relations if using Drizzle's relational queries
      },
    });
  }
}
```

## DataSource Hierarchy

```
AbstractDataSource extends BaseHelper             # engine-neutral - no client, no Drizzle
  └── AbstractRelationalDataSource                # SQL branch root - client, driver, connector slots
        │                                           wireDriverFromMetadata(), useDriver()
        │                                           getConnectionString() is abstract here
        └── BaseRelationalDataSource              # still engine-neutral
              │                                     getSchema(), discoverSchema()
              │                                     hasDiscoverableModels()
              │                                     getCapabilities() -> { transactions: true }
              │                                     beginTransaction(opts?)
              ├── AbstractPostgresDataSource      # Postgres dialect + executor
              │     └── BasePostgresDataSource (alias: BaseDataSource)
              │           ├── configure()               # you assign this.client (abstract)
              │           ├── getConnectionString()     # still abstract - you implement it
              │           └── buildBeginStatement()     # BEGIN with isolation level
              └── AbstractSqliteDataSource        # SQLite dialect + executor
                    └── BaseSqliteDataSource
                          ├── configure()               # you assign this.client (abstract)
                          ├── getConnectionString()     # inherited - returns settings.url
                          └── buildBeginStatement()     # BEGIN with begin mode
```

`getCapabilities()` and `beginTransaction()` sit on the neutral `BaseRelationalDataSource`, so both SQL engines get transactions. `getConnectionString()` is abstract on the Postgres branch because no framework code can guess a `postgresql://` URL; SQLite inherits one because the libsql url is the connection string.

## Registering a DataSource

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PostgresDataSource);
  }
}
```

DataSources are bound as **singletons** to ensure connection pool sharing across the application.

## Supported Engines

| Engine | Driver/Package | Import | Status |
|--------|---------|--------|--------|
| PostgreSQL | `node-postgres` (`pg`) or `postgres` | `@venizia/ignis` or `@venizia/ignis/postgres` | Supported, transactions + 3 isolation levels. See [Postgres Drivers](./postgres-drivers) |
| PGlite (embedded Postgres) | `@electric-sql/pglite` (optional peer) | `@venizia/ignis/postgres/pglite` | Supported. See [PGlite](./pglite) |
| SQLite | `@libsql/client` (optional peer) | `@venizia/ignis/sqlite` and `@venizia/ignis/sqlite/libsql` | Supported, transactions with begin modes. See [SQLite](./sqlite) |
| Typesense (search) | `typesense` (optional peer) | `@venizia/ignis/typesense` (subpath-only) | Supported, no transactions/locks. See [Search and Typesense](./search-typesense) |
| Meilisearch (search) | `meilisearch` (optional peer) | `@venizia/ignis/meilisearch` (subpath-only) | Supported, no transactions/locks. See [Search and Meilisearch](./search-meilisearch) |
| MySQL | - | - | Not planned; would be a new connector under `packages/connectors/src/relational/` |

## DataSource Template

```typescript
import { BasePostgresDataSource, datasource, ValueOrPromise } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

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
    });
  }

  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

> **Deep Dive:** See [BaseDataSource Reference](../../../references/base/datasources.md) for connection pooling and advanced configuration.

## See Also

- **Related Concepts:**
  - [Repositories](/guides/core-concepts/persistent/repositories) - Use DataSources for database access
  - [Models](/guides/core-concepts/persistent/models) - Entity schemas loaded by DataSource
  - [Transactions](/guides/core-concepts/persistent/transactions) - Multi-operation database transactions
  - [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - The typesense connector
  - [Application](/guides/core-concepts/application/) - Registering DataSources

- **References:**
  - [BaseDataSource API](/references/base/datasources) - Complete API reference
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
