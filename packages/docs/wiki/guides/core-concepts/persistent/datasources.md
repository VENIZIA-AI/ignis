# DataSources

A DataSource manages database connections and supports **schema auto-discovery** from repositories.

::: info PostgreSQL First
IGNIS currently focuses on **PostgreSQL** as the primary database. Support for other database systems (MySQL, SQLite, etc.) is planned for future releases.
:::

## Creating a DataSource

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

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: +(process.env.POSTGRES_PORT ?? 5432),
        database: process.env.POSTGRES_DATABASE ?? 'mydb',
        user: process.env.POSTGRES_USER ?? 'postgres',
        password: process.env.POSTGRES_PASSWORD ?? '',
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

    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

**How auto-discovery works:**

1. `@repository` decorators register model-datasource bindings
2. When `configure()` is called, `getSchema()` collects all bound models
3. Drizzle is initialized with the complete schema

## Manual Schema (Optional)

If you need explicit control, you can still provide schema manually:

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
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

## Registering a DataSource

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PostgresDataSource);
  }
}
```

## Supported Drivers

| Driver | Package | Status |
|--------|---------|--------|
| `node-postgres` | `pg` | ✅ Supported |
| `mysql2` | `mysql2` | 🔜 Planned |
| `better-sqlite3` | `better-sqlite3` | 🔜 Planned |

## DataSource Template

```typescript
import { BaseDataSource, datasource, TNodePostgresConnector, ValueOrPromise } from '@venizia/ignis';
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
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: +(process.env.POSTGRES_PORT ?? 5432),
        database: process.env.POSTGRES_DATABASE ?? 'mydb',
        user: process.env.POSTGRES_USER ?? 'postgres',
        password: process.env.POSTGRES_PASSWORD ?? '',
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
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
