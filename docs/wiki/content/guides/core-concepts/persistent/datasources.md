# DataSources

A DataSource manages database connections and supports **schema auto-discovery** from repositories.

> [!NOTE] Connectors
> This guide covers the **PostgreSQL connector** (`BasePostgresDataSource`, aliased as `BaseDataSource` for backward compatibility) - the primary relational engine and the one used by most applications. IGNIS also ships a **typesense connector** for full-text/vector search (see [Search & Typesense](./search-typesense)). Both implement the same engine-neutral `AbstractDataSource` contract - see [Connectors](/references/base/connectors) for the architecture.

## Creating a DataSource

```typescript
// src/datasources/postgres.datasource.ts
import {
  BasePostgresDataSource,
  datasource,
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

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
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
    // getSchema() auto-discovers models from @repository bindings
    const schema = this.getSchema();

    this.logger.debug(
      '[configure] Auto-discovered schema | Keys: %o',
      Object.keys(schema),
    );

    this.client = new Pool(this.settings);
    this.connector = drizzle({ client: this.client, schema });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

> [!NOTE] Driver seam: the raw client goes on `this.client`
> `this.client = new Pool(...)` is the short path: IGNIS resolves a `node-postgres` driver from that client on first use. There is no `pool` field - the raw-client slot is `client`, whatever the client happens to be. The alternative is to wire a driver yourself: `configure()` calls `this.useDriver({ driver, schema? })`, which assigns `this.driver` **and** builds `this.connector` in one step (so the half-wired state cannot exist). That is also how you select the `postgres-js` driver or run on Supabase. See [Postgres Drivers & Supabase](./postgres-drivers).

**How auto-discovery works:**

1. `@repository` decorators register model-datasource bindings in the `MetadataRegistry`
2. When `configure()` is called, `getSchema()` invokes `discoverSchema()` which calls `MetadataRegistry.buildSchema({ dataSource })` to collect all bound models and their relations
3. Drizzle is initialized with the complete schema (tables + Drizzle relations)

You can disable auto-discovery per datasource via `@datasource({ driver: 'node-postgres', autoDiscovery: false })`.

## Manual Schema (Optional)

If you need explicit control, you can still provide schema manually:

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
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
AbstractDataSource extends BaseHelper        # engine-neutral, src/base - no pool, no Drizzle
  └── AbstractPostgresDataSource              # connectors/postgres - adds pool, connector
        └── BasePostgresDataSource (alias: BaseDataSource)
              ├── configure()               # Setup pool + Drizzle connector (abstract)
              ├── getConnectionString()     # Build connection URL (abstract)
              ├── getSchema()               # Auto-discover from @repository bindings
              ├── discoverSchema()          # Internal: reads MetadataRegistry
              ├── hasDiscoverableModels()   # Check if any repos reference this DS
              ├── getCapabilities()         # Returns { transactions: true }
              ├── beginTransaction(opts?)   # Start transaction with isolation level
              ├── getConnector()            # Get Drizzle connector
              └── getSettings()            # Get connection config
```

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
| PostgreSQL | `node-postgres` (`pg`) | `@venizia/ignis` or `@venizia/ignis/postgres` | Supported, transactions + 3 isolation levels |
| Typesense (search) | `typesense` (optional peer) | `@venizia/ignis/typesense` (subpath-only) | Supported, no transactions/locks |
| MySQL / SQLite | - | - | Not planned; would be a new connector under `src/connectors/` |

## DataSource Template

```typescript
import { BasePostgresDataSource, datasource, ValueOrPromise } from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
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
    const schema = this.getSchema();
    this.client = new Pool(this.settings);
    this.connector = drizzle({ client: this.client, schema });
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
