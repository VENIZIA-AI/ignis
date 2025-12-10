# Persistent Layer: Models, DataSources, and Repositories

The persistent layer manages data using [Drizzle ORM](https://orm.drizzle.team/) for type-safe database access and the Repository pattern for data abstraction.

**Three main components:**
- **Models** - Define data structure (Drizzle schemas + Entity classes)
- **DataSources** - Manage database connections
- **Repositories** - Provide CRUD operations

## 1. Models: Defining Your Data Structure

A model in `Ignis` consists of two parts: a **Drizzle schema** that defines the database table and an **Entity class** that wraps it for use within the framework.

### Creating a Basic Model

Here's how to create a simple `User` model.

```typescript
// src/models/entities/user.model.ts
import {
  BaseEntity,
  createRelations,
  extraUserColumns,
  generateIdColumnDefs,
  model,
  TTableObject,
} from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

// 1. Define the Drizzle schema for the 'User' table
export const userTable = pgTable(User.name, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...extraUserColumns({ idType: 'string' }),
});

// 2. Define relations (empty for now, but required)
export const userRelations = createRelations({
  source: userTable,
  relations: [],
});

// 3. Define the TypeScript type for a User object
export type TUserSchema = typeof userTable;
export type TUser = TTableObject<TUserSchema>;

// 4. Create the Entity class, decorated with @model
@model({ type: 'entity' })
export class User extends BaseEntity<TUserSchema> {
  static readonly TABLE_NAME = User.name;

  constructor() {
    super({ name: User.name, schema: userTable });
  }
}
```

### Understanding Enrichers: The Smart Column Generators

You might have noticed functions like `generateIdColumnDefs()` and `extraUserColumns()` in the model definition. These are **Enrichers**—powerful helper functions that generate common database columns automatically.

#### Why Enrichers Exist

**Without enrichers (the hard way):**
```typescript
export const userTable = pgTable('User', {
  // Manually define every common column in every table
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  status: text('status').notNull().default('ACTIVE'),
  type: text('type'),
  createdBy: text('created_by'),
  modifiedBy: text('modified_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
  // ... your actual user-specific fields
  email: text('email').notNull(),
  name: text('name'),
});
```

**With enrichers (the smart way):**
```typescript
export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),        // Adds: id (UUID)
  ...extraUserColumns({ idType: 'string' }),                      // Adds: status, type, createdBy, modifiedBy, createdAt, modifiedAt
  // Just your actual user-specific fields
  email: text('email').notNull(),
  name: text('name'),
});
```

**Result:** Same table structure, but with:
- 7 fewer lines of code
- Guaranteed consistency across all tables
- Less chance of typos or mistakes
- Easier to maintain

#### Common Enrichers

| Enricher | What It Adds | Use Case |
| :--- | :--- | :--- |
| `generateIdColumnDefs()` | Primary key `id` column (UUID or number) | Every table needs an ID |
| `generateTzColumnDefs()` | `createdAt` and `modifiedAt` timestamps | Track when records are created/updated |
| `generateUserAuditColumnDefs()` | `createdBy` and `modifiedBy` foreign keys | Track which user created/updated records |
| `generateDataTypeColumnDefs()` | `dataType` and type-specific value columns (`tValue`, `nValue`, etc.) | Configuration tables with mixed data types |
| `extraUserColumns()` | Combination of audit + status + type fields | Full-featured entity tables |

#### Practical Example: Building a Post Model

Let's create a blog post model using enrichers:

```typescript
// src/models/post.model.ts
import {
  BaseEntity,
  createRelations,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  RelationTypes,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, text, boolean } from 'drizzle-orm/pg-core';
import { userTable } from './user.model';

export const postTable = pgTable('Post', {
  // Use enrichers for common columns
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),      // id: UUID primary key
  ...generateTzColumnDefs(),                                     // createdAt, modifiedAt
  ...generateUserAuditColumnDefs({                              // createdBy, modifiedBy
    created: { dataType: 'string', columnName: 'created_by' },
    modified: { dataType: 'string', columnName: 'modified_by' },
  }),

  // Your post-specific fields
  title: text('title').notNull(),
  content: text('content').notNull(),
  isPublished: boolean('is_published').default(false),
  slug: text('slug').notNull().unique(),
});

export const postRelations = createRelations({
  source: postTable,
  relations: [
    {
      name: 'author',
      type: RelationTypes.ONE,
      schema: userTable,
      metadata: {
        fields: [postTable.createdBy],
        references: [userTable.id],
      },
    },
  ],
});

export type TPostSchema = typeof postTable;
export type TPost = TTableObject<TPostSchema>;

@model({ type: 'entity' })
export class Post extends BaseEntity<TPostSchema> {
  static readonly TABLE_NAME = 'Post';

  constructor() {
    super({ name: Post.TABLE_NAME, schema: postTable });
  }
}
```

**What this gives you:**
```typescript
interface Post {
  id: string;                    // From generateIdColumnDefs
  createdAt: Date;              // From generateTzColumnDefs
  modifiedAt: Date;             // From generateTzColumnDefs
  createdBy: string;            // From generateUserAuditColumnDefs
  modifiedBy: string;           // From generateUserAuditColumnDefs
  title: string;                // Your field
  content: string;              // Your field
  isPublished: boolean;         // Your field
  slug: string;                 // Your field
}
```

#### When NOT to Use Enrichers

You can always define columns manually if:
- You need a custom ID strategy (e.g., integer auto-increment)
- You don't need audit fields for a specific table
- You have very specific timestamp requirements

```typescript
// Mixing enrichers with manual columns is perfectly fine
export const simpleTable = pgTable('Simple', {
  ...generateIdColumnDefs({ id: { dataType: 'number' } }), // Use enricher for ID
  // But manually define everything else
  name: text('name').notNull(),
  value: integer('value'),
});
```

:::tip
For a complete list of available enrichers and their options, see the [**Schema Enrichers Reference**](../../references/base/models.md#schema-enrichers).
:::

**Key Concepts:**
- **`pgTable`**: The standard function from Drizzle ORM to define a table schema.
- **Enrichers**: Ignis provides helper functions like `generateIdColumnDefs()` and `extraUserColumns()` that add common, pre-configured columns (like `id`, `status`, `type`, etc.) to your schema, reducing boilerplate.
- **`createRelations`**: A helper for defining relationships between models. Even if there are no relations, you must call it.
- **`BaseEntity`**: The class your model extends. It wraps the Drizzle schema and provides utilities for the framework.
- **`@model`**: A decorator that registers the class with the framework as a database model.

### Creating a Model with Relations

Now, let's create a `Configuration` model that has a relationship with the `User` model.

```typescript
// src/models/entities/configuration.model.ts
import {
  BaseEntity,
  createRelations, // Import createRelations
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  RelationTypes,
  TTableObject,
} from '@venizia/ignis';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { User, userTable } from './user.model';

// 1. Define the Drizzle schema for the 'Configuration' table
export const configurationTable = pgTable(
  Configuration.name,
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
  (def) => [
    unique(`UQ_${Configuration.name}_code`).on(def.code),
    index(`IDX_${Configuration.name}_group`).on(def.group),
    foreignKey({
      columns: [def.createdBy],
      foreignColumns: [userTable.id],
      name: `FK_${Configuration.name}_createdBy_${User.name}_id`,
    }),
  ],
);

// 2. Define the relations using Ignis's `createRelations` helper
export const configurationRelations = createRelations({
  source: configurationTable,
  relations: [
    {
      name: 'creator',
      type: RelationTypes.ONE,
      schema: userTable,
      metadata: {
        fields: [configurationTable.createdBy],
        references: [userTable.id],
      },
    },
    {
      name: 'modifier',
      type: RelationTypes.ONE,
      schema: userTable,
      metadata: {
        fields: [configurationTable.modifiedBy],
        references: [userTable.id],
      },
    },
  ],
});

// 3. Define types and the Entity class as before
export type TConfigurationSchema = typeof configurationTable;
export type TConfiguration = TTableObject<TConfigurationSchema>;

@model({ type: 'entity' })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  static readonly TABLE_NAME = Configuration.name;

  constructor() {
    super({ name: Configuration.TABLE_NAME, schema: configurationTable });
  }
}
```
**Key Concepts:**
- **`createRelations`**: This helper function from `Ignis` simplifies defining Drizzle ORM relations. It creates both a Drizzle `relations` object (for querying) and a `definitions` object (for repository configuration). Here, we define `creator` and `modifier` relations from `Configuration` to `User`. The names (`creator`, `modifier`) are important, as they will be used when querying.

> **Deep Dive:**
> - Explore the [**`BaseEntity`**](../../references/base/models.md#baseentity-class) class.
> - See all available [**Enrichers**](../../references/base/models.md#schema-enrichers) for schema generation.

---

## 2. DataSources: Connecting to Your Database

A DataSource is a class responsible for managing the connection to your database and making the Drizzle ORM instance available to your application.

### Creating and Configuring a DataSource

A `DataSource` must be decorated with `@datasource`. **The most critical part** is correctly merging your table schemas and relations into a single object that Drizzle ORM can understand.

#### ⚠️ Understanding Schema Merging (CRITICAL CONCEPT)

This is one of the most important concepts in Ignis. If you don't get this right, your relations won't work.

**The Problem:**
Drizzle ORM needs to know about:
1. Your table structures (e.g., `userTable`, `configurationTable`)
2. The relationships between them (e.g., "Configuration belongs to User")

**The Solution:**
You must merge both into a single `schema` object in your DataSource constructor.

#### Step-by-Step Example

Let's say you have two models: `User` and `Configuration`. Here's how to set up the DataSource:

```typescript
// src/datasources/postgres.datasource.ts
import {
  Configuration,
  configurationTable,        // The table structure
  configurationRelations,    // The relationships
  User,
  userTable,                 // The table structure
  userRelations,             // The relationships
} from '@/models/entities';
import {
  BaseDataSource,
  datasource,
  TNodePostgresConnector,
  ValueOrPromise,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Configuration interface for database connection
interface IDSConfigs {
  connection: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
}

@datasource()
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {
        connection: {
          host: process.env.APP_ENV_POSTGRES_HOST,
          port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
          user: process.env.APP_ENV_POSTGRES_USERNAME,
          password: process.env.APP_ENV_POSTGRES_PASSWORD,
          database: process.env.APP_ENV_POSTGRES_DATABASE,
        },
      },

      // 🔥 CRITICAL: This is where you merge tables and relations
      schema: Object.assign(
        {},
        // Step 1: Add your table schemas
        {
          [User.TABLE_NAME]: userTable,
          [Configuration.TABLE_NAME]: configurationTable,
        },
        // Step 2: Spread the relations objects
        userRelations.relations,
        configurationRelations.relations,
      ),
    });
  }

  override configure(): ValueOrPromise<void> {
    // Pass the merged schema to Drizzle
    this.connector = drizzle({
      client: new Pool(this.settings.connection),
      schema: this.schema, // This now contains both tables AND relations
    });
  }

  override async connect(): Promise<TNodePostgresConnector | undefined> {
    await (this.connector.client as Pool).connect();
    return this.connector;
  }

  override async disconnect(): Promise<void> {
    await (this.connector.client as Pool).end();
  }
}
```

#### Why This Pattern?

**Without the relations merged in:**
```typescript
// ❌ WRONG - Relations won't work!
schema: {
  [User.TABLE_NAME]: userTable,
  [Configuration.TABLE_NAME]: configurationTable,
}
```

**Result:** Your repository's `include` queries will fail. You won't be able to fetch related data.

**With tables and relations merged:**
```typescript
// ✅ CORRECT - Relations work perfectly!
schema: Object.assign(
  {},
  {
    [User.TABLE_NAME]: userTable,
    [Configuration.TABLE_NAME]: configurationTable,
  },
  userRelations.relations,
  configurationRelations.relations,
)
```

**Result:** You can now do:
```typescript
const config = await configRepo.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'creator' }], // This works!
  },
});
console.log(config.creator.name); // Access related User data
```

#### Adding New Models to Your DataSource

Every time you create a new model, you need to:

1. Import its table and relations
2. Add them to the schema object

**Example - Adding a `Post` model:**
```typescript
import {
  Post,
  postTable,
  postRelations,
  // ... other models
} from '@/models/entities';

// In your constructor:
schema: Object.assign(
  {},
  {
    [User.TABLE_NAME]: userTable,
    [Configuration.TABLE_NAME]: configurationTable,
    [Post.TABLE_NAME]: postTable, // Add the table
  },
  userRelations.relations,
  configurationRelations.relations,
  postRelations.relations, // Add the relations
),
```

**Pro tip:** As your app grows, consider using a helper function to reduce boilerplate:

```typescript
function buildSchema(models: Array<{ table: any; relations: any; name: string }>) {
  const tables = models.reduce((acc, m) => ({ ...acc, [m.name]: m.table }), {});
  const relations = models.map(m => m.relations.relations);
  return Object.assign({}, tables, ...relations);
}

// Usage:
schema: buildSchema([
  { name: User.TABLE_NAME, table: userTable, relations: userRelations },
  { name: Configuration.TABLE_NAME, table: configurationTable, relations: configurationRelations },
  { name: Post.TABLE_NAME, table: postTable, relations: postRelations },
])
```

### Registering a DataSource

Finally, register your `DataSource` with the application in `src/application.ts`.

```typescript
// src/application.ts
import { PostgresDataSource } from './datasources';

export class Application extends BaseApplication {
  // ...
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PostgresDataSource);
    // ...
  }
}
```

> **Deep Dive:**
> - Explore the [**`BaseDataSource`**](../../references/base/datasources.md) class.

---

## 3. Repositories: The Data Access Layer

Repositories abstract the data access logic. They use the configured `DataSource` to perform type-safe queries against the database.

### Creating a Repository

A repository extends `DefaultCRUDRepository` (for full read/write operations), is decorated with `@repository`, and injects the `DataSource`.

```typescript
// src/repositories/configuration.repository.ts
import {
  Configuration,
  configurationRelations, // Import configurationRelations
  TConfigurationSchema,
} from '@/models/entities';
import { IDataSource, inject, repository, DefaultCRUDRepository } from '@venizia/ignis';

// Decorator to mark this class as a repository for DI
@repository({})
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(
    // Inject the configured datasource
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    // Pass the datasource, the model's Entity class, AND the relations definitions to the super constructor
    super({ dataSource, entityClass: Configuration, relations: configurationRelations.definitions });
  }
}
```
You would then register this repository in your `application.ts`: `this.repository(ConfigurationRepository);`

### Querying Data

Repositories provide a full suite of type-safe methods for CRUD operations using a standardized `filter` object.

```typescript
// Example usage in application.ts or a service
const repo = this.get<ConfigurationRepository>({ key: 'repositories.ConfigurationRepository' });

// Find multiple records
const someConfigs = await repo.find({
  filter: {
    where: { group: 'SYSTEM' },
    limit: 10,
    order: ['createdAt DESC'],
  }
});

// Create a new record
const newConfig = await repo.create({
  data: {
    code: 'NEW_CODE',
    group: 'SYSTEM',
    // ... other fields
  }
});
```

### Querying with Relations

To query related data, use the `include` property in the filter object. The `relation` name must match one of the names you defined in `createRelations` (e.g., `creator`).

```typescript
const resultsWithCreator = await repo.find({
  filter: {
    where: { code: 'some_code' },
    include: [{ relation: 'creator' }], // Fetch the related user
  },
});

if (resultsWithCreator.length > 0) {
  // `resultsWithCreator[0].creator` will contain the full User object
  console.log('Configuration created by:', resultsWithCreator[0].creator.name);
}
```
