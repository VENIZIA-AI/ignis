# Persistent Layer: Models, DataSources, and Repositories

The persistent layer is the foundation of your application's data management. Ignis uses [Drizzle ORM](https://orm.drizzle.team/) for type-safe database access and provides a structured repository pattern for abstracting data logic. This guide covers the three main parts: Models, DataSources, and Repositories.

## 1. Models: Defining Your Data Structure

A model in Ignis consists of two parts: a **Drizzle schema** that defines the database table and an **Entity class** that wraps it for use within the framework.

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
} from '@vez/ignis';
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
} from '@vez/ignis';
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
- **`createRelations`**: This helper function from Ignis simplifies defining Drizzle ORM relations. It creates both a Drizzle `relations` object (for querying) and a `definitions` object (for repository configuration). Here, we define `creator` and `modifier` relations from `Configuration` to `User`. The names (`creator`, `modifier`) are important, as they will be used when querying.

> **Deep Dive:**
> - Explore the [**`BaseEntity`**](../../references/base/models.md#baseentity-class) class.
> - See all available [**Enrichers**](../../references/base/models.md#schema-enrichers) for schema generation.

---

## 2. DataSources: Connecting to Your Database

A DataSource is a class responsible for managing the connection to your database and making the Drizzle ORM instance available to your application.

### Creating and Configuring a DataSource

A `DataSource` must be decorated with `@datasource`. The most critical part is to provide a complete `schema` object to the `drizzle` function, which includes **both the tables and their relations**.

```typescript
// src/datasources/postgres.datasource.ts
import {
  Configuration,
  configurationTable,
  configurationRelations, // 1. Import relations object
  User,
  userTable,
  userRelations, // Import relations for all models
} from '@/models/entities';
import {
  BaseDataSource,
  datasource,
  TNodePostgresConnector,
} from '@vez/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// ... interface IDSConfigs ...

@datasource({})
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  // ... constructor and config setup ...
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: { /* ... connection details from environment ... */ },

      // 2. This is the place to define which models AND relations belong to this datasource
      schema: Object.assign(
        {},
        {
          [User.TABLE_NAME]: userTable,
          [Configuration.TABLE_NAME]: configurationTable,
        },
        // 3. Destructure the relations object from `createRelations`
        userRelations.relations,
        configurationRelations.relations,
      ),
    });
  }

  override configure(): void {
    // The `drizzle` function receives the schema with tables and relations
    this.connector = drizzle({
      client: new Pool(this.settings),
      schema: this.schema,
    });
  }
  // ...
}
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
import { IDataSource, inject, repository, DefaultCRUDRepository } from '@vez/ignis';

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