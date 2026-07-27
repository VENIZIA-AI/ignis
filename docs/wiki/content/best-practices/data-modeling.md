# Data Modeling

IGNIS streamlines data modeling with Drizzle ORM by providing powerful helpers and "enrichers" that reduce boilerplate code for common schema patterns.

> [!NOTE] Scope: PostgreSQL connector
> This page covers Drizzle-backed models (`BaseRelationalEntity`; the legacy `BasePostgresEntity` and `BaseEntity` exports are compatibility aliases for the same class) and enrichers, which are specific to relational tables. Search documents (typesense connector) use `defineSearchCollection` instead - see [Search & Typesense](/guides/core-concepts/persistent/search-typesense). See [Connectors](/references/base/connectors) for how the engine-neutral `AbstractEntity` relates to each connector's concrete entity class.

## 1. Base Entity

All PostgreSQL entity models should extend `BaseRelationalEntity`. This provides integration with the framework's repository layer and automatic schema generation support.

The recommended pattern is to define the schema and relations as **static properties** on the class. This keeps the definition self-contained and enables powerful type inference.

**Example (`src/models/entities/user.model.ts`):**

```typescript
import { BaseRelationalEntity, extraUserColumns, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class User extends BaseRelationalEntity<typeof User.schema> {
  // 1. Define schema as a static property
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...extraUserColumns({ idType: 'string' }),
  });

  // 2. Define relations as a static method (return empty array if none)
  static override relations = () => [];
}
```

## 2. Schema Enrichers

Instead of manually defining common columns like primary keys, timestamps, or audit fields in every table, use IGNIS "enrichers".

**Available Enrichers:**

| Enricher | Description | Columns Added |
|----------|-------------|---------------|
| `generateIdColumnDefs` | Adds a Primary Key | `id` (text, number, or big-number) |
| `generatePrincipalColumnDefs` | Adds polymorphic relation fields | `{discriminator}Id`, `{discriminator}Type` |
| `generateTzColumnDefs` | Adds timestamps | `createdAt`, `modifiedAt` (auto-updating); `deletedAt` via `{ deleted: { enable: true, ... } }` |
| `generateUserAuditColumnDefs` | Adds audit fields | `createdBy`, `modifiedBy` (supports `allowAnonymous` option) |
| `generateDataTypeColumnDefs` | Adds generic value fields | `dataType`, `nValue` (number), `tValue` (text), `bValue` (bytea), `jValue` (jsonb), `boValue` (boolean) |
| `extraUserColumns` | Auth user fields | `realm`, `status`, `type`, `activatedAt`, `lastLoginAt`, `parentId` |

**Usage Example:**

```typescript
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
} from '@venizia/ignis';
import { pgTable, text, unique } from 'drizzle-orm/pg-core';

export const configurationTable = pgTable(
  'Configuration',
  {
    // 1. Auto-generate text Primary Key with UUID default
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),

    // 2. Auto-generate createdAt / modifiedAt
    ...generateTzColumnDefs(),

    // 3. Auto-generate createdBy / modifiedBy
    ...generateUserAuditColumnDefs({
      created: { dataType: 'string', columnName: 'created_by' },
      modified: { dataType: 'string', columnName: 'modified_by' },
    }),

    // 4. Your custom columns
    code: text('code').notNull(),
    description: text('description'),
    group: text('group').notNull(),
  },
  (table) => [
    // Define indexes/constraints here
    unique('UQ_code').on(table.code),
  ]
);
```

### ID Type Options

The `generateIdColumnDefs` enricher supports multiple ID strategies:

| Data Type | PostgreSQL Type | JavaScript Type | Use Case |
|-----------|-----------------|-----------------|----------|
| `string` | `TEXT` | `string` | UUIDs, custom IDs, distributed systems |
| `number` | `INTEGER GENERATED ALWAYS AS IDENTITY` | `number` | Auto-increment, simple sequences |
| `big-number` (`numberMode: 'number'`, default) | `BIGINT GENERATED ALWAYS AS IDENTITY` | `number` | Large sequences (up to 2^53) |
| `big-number` (`numberMode: 'bigint'`) | `BIGINT GENERATED ALWAYS AS IDENTITY` | `bigint` | Very large sequences (up to 2^64) |

**Examples:**

```typescript
// String ID with default UUID generator
...generateIdColumnDefs({ id: { dataType: 'string' } })
// Result: id TEXT PRIMARY KEY DEFAULT crypto.randomUUID()

// String ID with custom generator (e.g., nanoid, ulid)
import { nanoid } from 'nanoid';
...generateIdColumnDefs({ id: { dataType: 'string', generator: () => nanoid() } })

// Auto-increment integer
...generateIdColumnDefs({ id: { dataType: 'number' } })
// Result: id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY

// Big integer for large datasets (JavaScript number - up to 2^53)
...generateIdColumnDefs({ id: { dataType: 'big-number', numberMode: 'number' } })

// Big integer with native BigInt (up to 2^64)
...generateIdColumnDefs({ id: { dataType: 'big-number', numberMode: 'bigint' } })

// With sequence options
...generateIdColumnDefs({
  id: {
    dataType: 'number',
    sequenceOptions: { startWith: 1000, increment: 1 },
  },
})
```

### Principal Enricher (Polymorphic Relations)

Use `generatePrincipalColumnDefs` when a record can belong to different entity types (polymorphic relationship).

**Use Case:** A `Comment` can belong to either a `Post` or a `Product`.

```typescript
import { generateIdColumnDefs, generatePrincipalColumnDefs } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const commentTable = pgTable('Comment', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),

  // Polymorphic relation: commentable can be Post or Product
  ...generatePrincipalColumnDefs({
    discriminator: 'commentable',      // Field prefix
    polymorphicIdType: 'string',       // ID type of related entities
    defaultPolymorphic: 'Post',        // Default type
  }),

  content: text('content').notNull(),
});

// Generated columns:
// - commentableId: TEXT NOT NULL
// - commentableType: TEXT DEFAULT 'Post'
```

**Querying polymorphic relations:**
```typescript
// Find all comments on a specific post
const comments = await commentRepository.find({
  filter: {
    where: {
      commentableType: 'Post',
      commentableId: postId,
    },
  },
});

// Find all comments on a product
const productComments = await commentRepository.find({
  filter: {
    where: {
      commentableType: 'Product',
      commentableId: productId,
    },
  },
});
```

## 3. Defining Relations

Relations are defined using the `TRelationConfig` structure within the static `relations` method of your model.

### Relation Types

| Type | Constant | Description | Example |
|------|----------|-------------|---------|
| One-to-One | `RelationTypes.ONE` | Single related record | User → Profile |
| One-to-Many | `RelationTypes.MANY` | Multiple related records | User → Posts |

### Basic Relations

**One-to-One (belongsTo):**
```typescript
import { BaseRelationalEntity, model, RelationTypes, TRelationConfig } from '@venizia/ignis';
import { User } from './user.model';

@model({ type: 'entity' })
export class Configuration extends BaseRelationalEntity<typeof Configuration.schema> {
  static override schema = pgTable('Configuration', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    createdBy: text('created_by'),
    // ...
  });

  // Define relations
  static override relations = (): TRelationConfig[] => [
    {
      name: 'creator',               // Relation name used in include
      type: RelationTypes.ONE,       // One Configuration → One User
      schema: User.schema,           // Related entity's schema
      metadata: {
        fields: [Configuration.schema.createdBy],  // Foreign key
        references: [User.schema.id],              // Primary key
      },
    },
  ];
}
```

**One-to-Many (hasMany):**

The foreign key lives on the **`ONE` side only**. A `MANY` relation carries no `fields`/`references` - Drizzle's `many()` takes just `relationName`, pointing back at the `ONE` relation that owns the key.

```typescript
// Owning side: Post declares the FK
@model({ type: 'entity' })
export class Post extends BaseRelationalEntity<typeof Post.schema> {
  static override schema = pgTable('Post', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    authorId: text('author_id').notNull(),
  });

  static override relations = (): TRelationConfig[] => [
    {
      name: 'author',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Post.schema.authorId],
        references: [User.schema.id],
      },
    },
  ];
}

// Inverse side: User just names the relation back
@model({ type: 'entity' })
export class User extends BaseRelationalEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
  });

  static override relations = (): TRelationConfig[] => [
    {
      name: 'posts',                          // User.posts
      type: RelationTypes.MANY,               // One User -> Many Posts
      schema: Post.schema,
      metadata: { relationName: 'author' },   // The ONE relation on Post
    },
  ];
}
```

### Using Relations in Queries

```typescript
// Eager load single relation
const configs = await configurationRepository.find({
  filter: {
    include: [{ relation: 'creator' }],
  },
});
// Result: [{ id, code, ..., creator: { id, name, email } }]

// Eager load multiple relations
const users = await userRepository.find({
  filter: {
    include: [
      { relation: 'posts' },
      { relation: 'comments' },
    ],
  },
});

// Nested relations (up to 2 levels recommended)
const users = await userRepository.find({
  filter: {
    include: [{
      relation: 'posts',
      scope: {
        include: [{ relation: 'comments' }],
      },
    }],
  },
});
```

> [!TIP]
> Avoid deeply nested includes (more than 2 levels). Each level adds query complexity. For complex data fetching, consider separate queries.

## 4. Repositories and Auto-Discovery

IGNIS simplifies the connection between models, repositories, and datasources.

### DataSource Auto-Discovery

DataSources automatically discover their schema from the repositories that bind to them. You **do not** need to manually register schemas in the DataSource constructor.

```typescript
// src/datasources/postgres.datasource.ts
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BaseRelationalDataSource } from '@venizia/ignis/postgres';
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
export class PostgresDataSource extends BaseRelationalDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: { /* connection config */ },
      // NO schema property needed - auto-discovered!
    });
  }

  override configure(): ValueOrPromise<void> {
    // getSchema() automatically collects all schemas from bound repositories
    this.logger.debug('[configure] Auto-discovered schema | Keys: %o', Object.keys(this.getSchema()));

    // Keep the pool on this.client - naming NodePostgresDriver above is what wires the driver
    // and Drizzle connector; beginTransaction() resolves its driver from this.client lazily.
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

### Repository Binding

Repositories use the `@repository` decorator to bind a **Model** to a **DataSource**. This binding is what powers the auto-discovery mechanism.

**Pattern 1: Zero Boilerplate (Recommended)**

For most repositories, you don't need a constructor. The DataSource is automatically injected.

```typescript
@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultRelationalRepository<typeof Configuration.schema> {
  // No constructor needed!
}
```

**Pattern 2: Explicit Injection (Advanced)**

If you need to perform custom initialization or inject additional dependencies, you can define a constructor. **Important:** The first parameter must be the DataSource.

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }

  // Custom methods
  async findByRealm(realm: string) {
    return this.findOne({ filter: { where: { realm } } });
  }
}
```

## 5. Hidden Properties

Protect sensitive data by configuring properties that are excluded at the SQL level. Hidden properties are **never returned** through repository queries.

```typescript
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],
  },
})
export class User extends BaseRelationalEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),  // Never returned via repository
    secret: text('secret'),      // Never returned via repository
  });
}
```

**Key points:**

- Hidden properties are excluded from SELECT, INSERT RETURNING, UPDATE RETURNING, DELETE RETURNING
- You can still **filter by** hidden properties in where clauses
- Hidden properties are **recursively excluded** from included relations
- Use the connector directly when you need to access hidden data (e.g., password verification)

> **Reference:** See [Hidden Properties](../references/base/models.md#hidden-properties) for complete documentation.

## 6. Authorization Settings

Declare your model's authorization principal in `@model` settings to make the model the single source of truth for permission subjects:

```typescript
@model({
  type: 'entity',
  settings: {
    authorize: { principal: 'user' },
    hiddenProperties: ['password'],
  },
})
export class User extends BaseRelationalEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),
  });
}

// User.AUTHORIZATION_SUBJECT === 'user' (auto-populated)
```

**Key points:**

- `AUTHORIZATION_SUBJECT` is auto-set from `authorize.principal` by the `@model` decorator
- Use `Model.AUTHORIZATION_SUBJECT` in route configs instead of hardcoded strings
- Explicit `static AUTHORIZATION_SUBJECT = '...'` on the class takes precedence
- The `authorize` settings are extensible via index signature for custom metadata

> **Reference:** See [Model-Based Resource References](../extensions/components/authorization/usage#model-based-resource-references) for full authorization integration.

## 7. Database Migrations

Drizzle Kit handles schema migrations. Follow these best practices for safe migrations.

### Generate Migrations

Wire these as scripts in your app's `package.json`, pointing at your Drizzle config:

```json
{
  "scripts": {
    "migrate:generate": "drizzle-kit generate --config=src/migration.ts",
    "migrate:dev": "drizzle-kit migrate --config=src/migration.ts",
    "migrate:push": "drizzle-kit push --config=src/migration.ts"
  }
}
```

```bash
bun run migrate:generate   # Generate migration from schema changes
bun run migrate:dev        # Apply pending migrations
bun run migrate:push       # Push schema directly (development only)
```

> [!NOTE]
> Boot does nothing to your schema. Migrations are an explicit step you run - never a side effect of starting the application.

### Migration Best Practices

| Practice | Description |
|----------|-------------|
| **One change per migration** | Keep migrations focused and reversible |
| **Never edit applied migrations** | Create new migration instead |
| **Test on staging first** | Always test migrations before production |
| **Backup before migrate** | `pg_dump` before running in production |
| **Use transactions** | Drizzle wraps migrations in transactions by default |

### Safe Schema Changes

**Adding columns (safe):**
```typescript
// Add with default value to avoid nulls in existing rows
newField: text('new_field').default(''),

// Or allow null initially, then backfill and set notNull
newField: text('new_field'),  // Initially nullable
```

**Renaming columns (requires care):**
```sql
-- In custom migration SQL
ALTER TABLE "User" RENAME COLUMN "old_name" TO "new_name";
```

**Dropping columns (dangerous):**
```typescript
// 1. First, remove all code references
// 2. Deploy code changes
// 3. Then drop in separate migration
```

### Custom Migration SQL

Drizzle Kit emits plain `.sql` files. For anything it cannot infer - backfills, concurrent indexes, data reshaping - edit the generated file or add your own:

```sql
-- drizzle/migrations/0005_custom_migration.sql

-- Backfill before enforcing the constraint
UPDATE "User"
SET normalized_email = LOWER(email)
WHERE normalized_email IS NULL;
--> statement-breakpoint

-- CONCURRENTLY cannot run inside a transaction - keep it in its own migration
CREATE INDEX CONCURRENTLY idx_user_email
ON "User" (email)
WHERE status = 'ACTIVE';
```

> [!WARNING]
> Drizzle wraps each migration in a transaction. `CREATE INDEX CONCURRENTLY` is rejected inside one - isolate it in its own migration and apply it out of band.

### Migration Checklist

| Step | Action |
|------|--------|
| 1 | Review generated SQL before applying |
| 2 | Test migration on staging database |
| 3 | Backup production database |
| 4 | Run during low-traffic period |
| 5 | Monitor for errors after migration |
| 6 | Have rollback plan ready |

> [!WARNING]
> Never run migrations directly on production without testing. Use staging environments that mirror production data structure.

## See Also

- [API Usage Examples](./api-usage-examples) - Query patterns
- [Performance Optimization](./performance-optimization) - Index design
- [Common Pitfalls](./common-pitfalls) - Migration mistakes to avoid