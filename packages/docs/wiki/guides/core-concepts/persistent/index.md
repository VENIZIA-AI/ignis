# Persistent Layer

The persistent layer manages data using [Drizzle ORM](https://orm.drizzle.team/) for type-safe database access and the Repository pattern for data abstraction.

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
| **Transactions** | Handle atomic multi-step operations | [Transactions Guide](./transactions.md) |

## Quick Example

```typescript
// 1. Define a Model
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
    email: text('email').notNull(),
  });

  static override relations = () => [];
}

// 2. Create a DataSource
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

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Use repositories for business logic
  - [Application](/guides/core-concepts/application/) - Registering persistent resources

- **References:**
  - [Models API](/references/base/models) - Complete models reference
  - [DataSources API](/references/base/datasources) - Complete datasources reference
  - [Repositories API](/references/base/repositories/) - Complete repositories reference
  - [Filter System](/references/base/filter-system/) - Query operators

- **External Resources:**
  - [Drizzle ORM Documentation](https://orm.drizzle.team/) - ORM guide

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Complete persistence example
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Advanced persistence patterns
