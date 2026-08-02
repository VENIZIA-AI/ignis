# Persistent Layer

The persistent layer manages data using [Drizzle ORM](https://orm.drizzle.team/) for type-safe database access and the Repository pattern for data abstraction.

> [!NOTE] Connectors
> This page and the ones below it focus on the **PostgreSQL connector** (Drizzle + relational tables), the default and most common engine. The persistence layer also ships a **SQLite connector** (see [SQLite](./sqlite)) and a **typesense connector** for search (see [Search & Typesense](./search-typesense)). All three share the same engine-neutral `AbstractRepository`/`AbstractDataSource`/`AbstractEntity` contracts - see [Connectors](/references/base/connectors) for the architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Application                          │
├─────────────────────────────────────────────────────────┤
│  Controllers  →  Services  →  Repositories  →  Database │
└─────────────────────────────────────────────────────────┘
                                     ▲
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
              ┌─────┴─────┐                   ┌───────┴───────┐
              │  Models   │                   │  DataSources  │
              │ (Schema)  │                   │ (Connection)  │
              └───────────┘                   └───────────────┘
```

## Core Components

| Component | Description | Learn More |
|-----------|-------------|------------|
| **Models** | Define data structure with Drizzle schemas and relations | [Models Guide](./models.md) |
| **DataSources** | Manage database connections with auto-discovery | [DataSources Guide](./datasources.md) |
| **Repositories** | Provide type-safe CRUD operations | [Repositories Guide](./repositories.md) |
| **Transactions** | Handle atomic multi-step operations (PostgreSQL connector only) | [Transactions Guide](./transactions.md) |
| **Search & Typesense** | Full-text/faceted search over documents | [Search & Typesense Guide](./search-typesense.md) |
| **PGlite** | Postgres compiled to WebAssembly, running in-process | [PGlite Guide](./pglite.md) |
| **SQLite** | The second SQL engine, via libsql | [SQLite Guide](./sqlite.md) |

## Quick Example

```typescript
// 1. Define a Model
@model({ type: 'entity' })
export class User extends BasePostgresEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
    email: text('email').notNull(),
  });

  static override relations = () => [];
}

// 2. Create a DataSource
@datasource({ driver: NodePostgresDriver })
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
    this.client = new Pool(this.settings); // NodePostgresDriver above wires the driver + connector
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}

// 3. Create a Repository
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  async findByEmail(opts: { email: string }) {
    return this.findOne({ filter: { where: { email: opts.email } } });
  }
}

// 4. Use in Application
export class Application extends BaseApplication {
  preConfigure() {
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);
  }
}
```

## Next Steps

1. **[Models](./models.md)** - Learn how to define your data structure
2. **[DataSources](./datasources.md)** - Configure database connections
3. **[Repositories](./repositories.md)** - Master CRUD operations and queries
4. **[Transactions](./transactions.md)** - Handle atomic operations

> **Deep Dive:** See [Repository Reference](../../../references/base/repositories/) for advanced filtering, relations, and operators.

## See Also

- **Persistent Layer Topics:**
  - [Models](./models) - Entity definitions and schemas
  - [DataSources](./datasources) - Database connections
  - [Repositories](./repositories) - Data access layer
  - [Transactions](./transactions) - Atomic operations
  - [PGlite](./pglite) - Postgres in-process, for tests and embedded deployment
  - [SQLite](./sqlite) - The second SQL engine, and what it refuses
  - [Search & Typesense](./search-typesense) - The typesense connector

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Use repositories for business logic
  - [Application](/guides/core-concepts/application/) - Registering persistent resources

- **References:**
  - [Connectors API](/references/base/connectors) - Base-vs-connectors architecture
  - [Models API](/references/base/models) - Complete models reference
  - [DataSources API](/references/base/datasources) - Complete datasources reference
  - [Repositories API](/references/base/repositories/) - Complete repositories reference
  - [Filter System](/references/base/filter-system/) - Query operators

- **External Resources:**
  - [Drizzle ORM Documentation](https://orm.drizzle.team/) - ORM guide

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Complete persistence example
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Advanced persistence patterns
