# Data Modeling

Ignis streamlines data modeling with Drizzle ORM by providing powerful helpers and "enrichers" that reduce boilerplate code for common schema patterns.

## 1. Base Entity

All entity models should extend `BaseEntity`. This provides integration with the framework's repository layer and automatic schema generation support.

The recommended pattern is to define the schema and relations as **static properties** on the class. This keeps the definition self-contained and enables powerful type inference.

**Example (`src/models/entities/user.model.ts`):**

```typescript
import { BaseEntity, extraUserColumns, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
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

Instead of manually defining common columns like primary keys, timestamps, or audit fields in every table, use Ignis "enrichers".

**Available Enrichers:**

| Enricher | Description | Columns Added |
|----------|-------------|---------------|
| `generateIdColumnDefs` | Adds a Primary Key | `id` (text, number, or big-number) |
| `generatePrincipalColumnDefs` | Adds polymorphic relation fields | `{discriminator}Id`, `{discriminator}Type` |
| `generateTzColumnDefs` | Adds timestamps | `createdAt`, `modifiedAt` (auto-updating) |
| `generateUserAuditColumnDefs` | Adds audit fields | `createdBy`, `modifiedBy` |
| `generateDataTypeColumnDefs` | Adds generic value fields | `nValue` (number), `tValue` (text), `jValue` (json), etc. |
| `extraUserColumns` | Comprehensive user fields | Combines audit, timestamps, status, and type fields |

**Usage Example:**

```typescript
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
} from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

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
| `big-number` (mode: `number`) | `BIGINT GENERATED ALWAYS AS IDENTITY` | `number` | Large sequences (up to 2^53) |
| `big-number` (mode: `bigint`) | `BIGINT GENERATED ALWAYS AS IDENTITY` | `bigint` | Very large sequences (up to 2^64) |

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
const comments = await commentRepo.find({
  filter: {
    where: {
      commentableType: 'Post',
      commentableId: postId,
    },
  },
});

// Find all comments on a product
const productComments = await commentRepo.find({
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
import { BaseEntity, model, RelationTypes, TRelationConfig } from '@venizia/ignis';
import { User } from './user.model';

@model({ type: 'entity' })
export class Configuration extends BaseEntity<typeof Configuration.schema> {
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
```typescript
@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
  });

  static override relations = (): TRelationConfig[] => [
    {
      name: 'posts',                 // User.posts
      type: RelationTypes.MANY,      // One User → Many Posts
      schema: Post.schema,
      metadata: {
        fields: [User.schema.id],
        references: [Post.schema.authorId],
      },
    },
    {
      name: 'comments',              // User.comments
      type: RelationTypes.MANY,
      schema: Comment.schema,
      metadata: {
        fields: [User.schema.id],
        references: [Comment.schema.userId],
      },
    },
  ];
}
```

### Using Relations in Queries

```typescript
// Eager load single relation
const configs = await configRepo.find({
  filter: {
    include: [{ relation: 'creator' }],
  },
});
// Result: [{ id, code, ..., creator: { id, name, email } }]

// Eager load multiple relations
const users = await userRepo.find({
  filter: {
    include: [
      { relation: 'posts' },
      { relation: 'comments' },
    ],
  },
});

// Nested relations (up to 2 levels recommended)
const users = await userRepo.find({
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

Ignis simplifies the connection between models, repositories, and datasources.

### DataSource Auto-Discovery

DataSources automatically discover their schema from the repositories that bind to them. You **do not** need to manually register schemas in the DataSource constructor.

```typescript
// src/datasources/postgres.datasource.ts
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: { /* connection config */ },
      // NO schema property needed - auto-discovered!
    });
  }

  override configure(): ValueOrPromise<void> {
    // This method automatically collects all schemas from bound repositories
    const schema = this.getSchema();
    this.connector = drizzle({ client: new Pool(this.settings), schema });
  }
}
```

### Repository Binding

Repositories use the `@repository` decorator to bind a **Model** to a **DataSource**. This binding is what powers the auto-discovery mechanism.

**Pattern 1: Zero Boilerplate (Recommended)**

For most repositories, you don't need a constructor. The DataSource is automatically injected.

```typescript
@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {
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
export class User extends BaseEntity<typeof User.schema> {
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