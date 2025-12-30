---
title: Persistent Layer
description: Models, DataSources, and Repositories in Ignis
---

# Persistent Layer: Models, DataSources, and Repositories

The persistent layer manages data using [Drizzle ORM](https://orm.drizzle.team/) for type-safe database access and the Repository pattern for data abstraction.

**Three main components:**

- **Models** - Define data structure (static schema + relations on Entity class)
- **DataSources** - Manage database connections with auto-discovery
- **Repositories** - Provide CRUD operations with zero boilerplate

## 1. Models: Defining Your Data Structure

A model in Ignis is a single class with static properties for schema and relations. No separate variables needed.

### Creating a Basic Model

```typescript
// src/models/entities/user.model.ts
import { BaseEntity, extraUserColumns, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  // Define schema as static property
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...extraUserColumns({ idType: 'string' }),
  });

  // Relations (empty array if none)
  static override relations = () => [];
}
```

**Key points:**

- Schema is defined inline as `static override schema`
- Relations are defined as `static override relations`
- No constructor needed - BaseEntity auto-discovers from static properties
- Type parameter uses `typeof User.schema` (self-referencing)

### Creating a Model with Relations

```typescript
// src/models/entities/configuration.model.ts
import {
  BaseEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { User } from './user.model';

@model({ type: 'entity' })
export class Configuration extends BaseEntity<typeof Configuration.schema> {
  static override schema = pgTable(
    'Configuration',
    {
      ...generateIdColumnDefs({ id: { dataType: 'string' } }),
      ...generateTzColumnDefs(),
      ...generateDataTypeColumnDefs(),
      ...generateUserAuditColumnDefs({
        created: { dataType: 'string', columnName: 'created_by' },
        modified: { dataType: 'string', columnName: 'modified_by' },
      }),
      code: text('code').notNull(),
      description: text('description'),
      group: text('group').notNull(),
    },
    def => [
      unique('UQ_Configuration_code').on(def.code),
      index('IDX_Configuration_group').on(def.group),
      foreignKey({
        columns: [def.createdBy],
        foreignColumns: [User.schema.id], // Reference User.schema, not a separate variable
        name: 'FK_Configuration_createdBy_User_id',
      }),
    ],
  );

  // Define relations using TRelationConfig array
  static override relations = (): TRelationConfig[] => [
    {
      name: 'creator',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Configuration.schema.createdBy],
        references: [User.schema.id],
      },
    },
    {
      name: 'modifier',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Configuration.schema.modifiedBy],
        references: [User.schema.id],
      },
    },
  ];
}
```

**Key points:**

- Relations use `TRelationConfig[]` format directly
- Reference other models via `Model.schema` (e.g., `User.schema.id`)
- Relation names (`creator`, `modifier`) are used in queries with `include`

### Understanding Enrichers

Enrichers are helper functions that generate common database columns automatically.

**Without enrichers:**

```typescript
static override schema = pgTable('User', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').notNull().default('ACTIVE'),
  createdBy: text('created_by'),
  modifiedBy: text('modified_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
  // ... your fields
});
```

**With enrichers:**

```typescript
static override schema = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),  // id (UUID)
  ...extraUserColumns({ idType: 'string' }),                 // status, audit fields, timestamps
  // ... your fields
});
```

#### Available Enrichers

| Enricher | Columns Added | Use Case |
|----------|---------------|----------|
| `generateIdColumnDefs()` | `id` (UUID or number) | Every table |
| `generateTzColumnDefs()` | `createdAt`, `modifiedAt` | Track timestamps |
| `generateUserAuditColumnDefs()` | `createdBy`, `modifiedBy` | Track who created/updated |
| `generateDataTypeColumnDefs()` | `dataType`, `tValue`, `nValue`, etc. | Configuration tables |
| `extraUserColumns()` | Combines audit + status + type | Full-featured entities |

:::tip
For a complete list of enrichers and options, see the [Schema Enrichers Reference](../../references/base/models.md#schema-enrichers).
:::

### Hidden Properties

Protect sensitive data by configuring properties that are **never returned** through repository queries. Hidden properties are excluded at the SQL level for maximum security and performance.

```typescript
import { BaseEntity, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],  // Never returned via repository
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),  // Hidden from queries
    secret: text('secret'),      // Hidden from queries
  });
}
```

**Behavior:**

| Operation | Behavior |
|-----------|----------|
| `find()`, `findOne()`, `findById()` | Hidden excluded from SELECT |
| `create()`, `updateById()`, `deleteById()` | Hidden excluded from RETURNING |
| Where clause filtering | Hidden fields **can** be used in filters |
| Direct connector query | Hidden fields **included** (bypasses repository) |

When you need to access hidden data, use the connector directly:

```typescript
// Repository query - excludes hidden
const user = await userRepo.findById({ id: '123' });
// { id: '123', email: 'john@example.com' }

// Connector query - includes all fields
const connector = userRepo.getConnector();
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.id, '123'));
// { id: '123', email: 'john@example.com', password: '...', secret: '...' }
```

:::tip
For complete hidden properties documentation, see the [Models Reference](../../references/base/models.md#hidden-properties).
:::

---

## 2. DataSources: Connecting to Your Database

A DataSource manages database connections and supports **schema auto-discovery** from repositories.

### Creating a DataSource

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

    const client = new Pool(this.settings);
    this.connector = drizzle({ client, schema });
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

### Manual Schema (Optional)

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

### Registering a DataSource

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PostgresDataSource);
  }
}
```

---

## 3. Repositories: The Data Access Layer

Repositories provide type-safe CRUD operations. Use `@repository` decorator with both `model` and `dataSource` for auto-discovery.

### Pattern 1: Zero Boilerplate (Recommended)

The simplest approach - everything is auto-resolved:

```typescript
// src/repositories/configuration.repository.ts
import { Configuration } from '@/models/entities';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({
  model: Configuration,
  dataSource: PostgresDataSource,
})
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {
  // No constructor needed!

  async findByCode(code: string) {
    return this.findOne({ filter: { where: { code } } });
  }

  async findByGroup(group: string) {
    return this.find({ filter: { where: { group } } });
  }
}
```

### Pattern 2: Explicit @inject

When you need constructor control (e.g., read-only repository or additional dependencies):

```typescript
// src/repositories/user.repository.ts
import { User } from '@/models/entities';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { inject, ReadableRepository, repository } from '@venizia/ignis';
import { CacheService } from '@/services/cache.service';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<typeof User.schema> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource, // Must be concrete type, not 'any'

    // After first arg, you can inject any additional dependencies
    @inject({ key: 'some.cache' })
    private cache: SomeCache,
  ) {
    super(dataSource);
  }

  async findByRealm(realm: string) {
    // Use injected dependencies
    const cached = await this.cacheService.get(`user:realm:${realm}`);
    if (cached) {
      return cached;
    }

    return this.findOne({ filter: { where: { realm } } });
  }
}
```

> **Important:**
> - First constructor parameter **MUST** be the DataSource injection
> - After the first argument, you can inject any additional dependencies you need
> - When `@inject` is at param index 0, auto-injection is skipped

### Repository Types

| Type | Description |
|------|-------------|
| `DefaultCRUDRepository` | Full read/write operations |
| `ReadableRepository` | Read-only operations |
| `PersistableRepository` | Write operations only |

### Querying Data

```typescript
const repo = this.get<ConfigurationRepository>({ key: 'repositories.ConfigurationRepository' });

// Find multiple records
const configs = await repo.find({
  filter: {
    where: { group: 'SYSTEM' },
    limit: 10,
    order: ['createdAt DESC'],
  }
});

// Find one record
const config = await repo.findOne({
  filter: { where: { code: 'APP_NAME' } }
});

// Select specific fields (array format)
const configCodes = await repo.find({
  filter: {
    fields: ['id', 'code', 'group'],  // Only these fields returned
    limit: 100,
  }
});

// Order by JSON/JSONB nested fields
const sorted = await repo.find({
  filter: {
    order: ['metadata.priority DESC', 'createdAt ASC'],
  }
});

// Create a record
const newConfig = await repo.create({
  data: {
    code: 'NEW_SETTING',
    group: 'SYSTEM',
    description: 'A new setting',
  }
});

// Update by ID
await repo.updateById({
  id: 'uuid-here',
  data: { description: 'Updated description' }
});

// Delete by ID
await repo.deleteById({ id: 'uuid-here' });
```

### Querying with Relations

Use `include` to fetch related data. The relation name must match what you defined in `static relations`:

```typescript
const configWithCreator = await repo.findOne({
  filter: {
    where: { code: 'APP_NAME' },
    include: [{ relation: 'creator' }],
  },
});

console.log('Created by:', configWithCreator.creator.name);
```

### Registering Repositories

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);
    this.repository(ConfigurationRepository);
  }
}
```

---

## 4. Advanced Topics

### Performance: Core API Optimization

Ignis automatically optimizes "flat" queries (no relations, no field selection) by using Drizzle's Core API. This provides **~15-20% faster** queries for simple reads.

### Modular Persistence with Components

Bundle related persistence resources into Components for better organization:

```typescript
export class UserManagementComponent extends BaseComponent {
  override binding() {
    this.application.dataSource(PostgresDataSource);
    this.application.repository(UserRepository);
    this.application.repository(ProfileRepository);
  }
}
```

---

## 5. Transactions

Ignis supports explicit transaction objects that can be passed across multiple services and repositories, allowing for complex, multi-step business logic to be atomic.

### Using Transactions

To use transactions, start one from a repository or datasource, and then pass it to subsequent operations via the `options` parameter.

```typescript
// 1. Start a transaction
const tx = await userRepo.beginTransaction({
  isolationLevel: 'SERIALIZABLE' // Optional, defaults to 'READ COMMITTED'
});

try {
  // 2. Pass transaction to operations
  // Create user
  const user = await userRepo.create({ 
    data: userData, 
    options: { transaction: tx } 
  });

  // Create profile (using same transaction)
  await profileRepo.create({ 
    data: { userId: user.id, ...profileData }, 
    options: { transaction: tx } 
  });

  // Call a service method (passing the transaction)
  await orderService.createInitialOrder(user.id, { transaction: tx });

  // 3. Commit the transaction
  await tx.commit();
} catch (err) {
  // 4. Rollback on error
  await tx.rollback();
  throw err;
}
```

### Isolation Levels

Ignis supports standard PostgreSQL isolation levels:

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | (Default) Queries see only data committed before the query began. | General use, prevents dirty reads. |
| `REPEATABLE READ` | Queries see a snapshot as of the start of the transaction. | Reports, consistent reads across multiple queries. |
| `SERIALIZABLE` | Strictest level. Emulates serial execution. | Financial transactions, critical data integrity. |

### Best Practices

1.  **Always use `try...catch...finally`**: Ensure `rollback()` is called on error to release the connection.
2.  **Keep it short**: Long-running transactions hold database locks and connections.
3.  **Pass explicit options**: When calling other services inside a transaction, ensure they accept and use the `transaction` option.

```typescript
// Service method supporting transactions
async createInitialOrder(userId: string, opts?: { transaction?: ITransaction }) {
  return this.orderRepository.create({
    data: { userId, status: 'PENDING' },
    options: { transaction: opts?.transaction } // Forward the transaction
  });
}
```

---

## Quick Reference

### Model Template

```typescript
import { BaseEntity, generateIdColumnDefs, model, TRelationConfig } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class MyModel extends BaseEntity<typeof MyModel.schema> {
  static override schema = pgTable('MyModel', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
  });

  static override relations = (): TRelationConfig[] => [];
}
```

### Repository Template

```typescript
import { DefaultCRUDRepository, repository } from '@venizia/ignis';
import { MyModel } from '@/models/entities';
import { PostgresDataSource } from '@/datasources/postgres.datasource';

@repository({ model: MyModel, dataSource: PostgresDataSource })
export class MyModelRepository extends DefaultCRUDRepository<typeof MyModel.schema> {}
```

> **Deep Dive:**
> - [BaseEntity Reference](../../references/base/models.md#baseentity-class)
> - [Schema Enrichers](../../references/base/models.md#schema-enrichers)
> - [BaseDataSource Reference](../../references/base/datasources.md)
> - [Repository Reference](../../references/base/repositories.md)
