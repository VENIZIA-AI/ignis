# Persistent Layer: Models, Repositories, and DataSources

In Ignis, the persistence layer is composed of three key concepts: **Models**, **DataSources**, and **Repositories**. This structure provides a powerful, type-safe, and organized way to define your data schema, manage database connections, and abstract data access logic.

This guide will walk you through each component using a practical example: a `User` model and a `Configuration` model, where each configuration is created and modified by a user.

## 1. Models: Defining Your Data Structure

Models define the structure of your data using [Drizzle ORM's](https://orm.drizzle.team/) schema syntax. They are the single source of truth for your database schema.

### Creating a Basic Model

First, let's define a simple `User` model.

```typescript
// src/models/entities/user.model.ts
import {
  BaseEntity,
  extraUserColumns,
  generateIdColumnDefs,
  model,
  TTableObject,
} from '@vez/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

// 1. Define the Drizzle schema using `pgTable`
export const usersTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...extraUserColumns({ idType: 'string' }),
});

// 2. Define TypeScript types from the schema
export type TUserSchema = typeof usersTable;
export type TUser = TTableObject<TUserSchema>;

// 3. Create an Entity class decorated with `@model`
@model({ type: 'entity', skipMigrate: false })
export class User extends BaseEntity<TUserSchema> {
  static readonly TABLE_NAME = 'User'; // Used for easy reference

  constructor() {
    super({ name: User.TABLE_NAME, schema: usersTable });
  }
}
```

**Key Concepts:**
- **`pgTable`**: A function from Drizzle ORM to define a table schema.
- **Enrichers**: Ignis provides helper functions like `generateIdColumnDefs` and `extraUserColumns` to quickly add common sets of columns (like `id`, `status`, `realm`, etc.) to your schemas.
- **`@model` Decorator**: Marks the class as a data model for Ignis, used internally by repositories.
- **`BaseEntity`**: A base class that wraps the Drizzle schema, providing a consistent structure that repositories can work with.

### Creating a Model with Relations

Now, let's create a `Configuration` model that has a relationship with the `User` model.

```typescript
// src/models/entities/configuration.model.ts
import { BaseEntity, model, ... } from '@vez/ignis';
import { relations } from 'drizzle-orm';
import { pgTable, text, foreignKey, uuid } from 'drizzle-orm/pg-core';
import { User, usersTable } from './user.model';

// 1. Define the Drizzle schema for the 'Configuration' table
export const configurationTable = pgTable('Configuration', {
  id: uuid('id').primaryKey(),
  // ... other columns like code, group, etc.
  createdBy: uuid('created_by').references(() => usersTable.id),
  modifiedBy: uuid('modified_by').references(() => usersTable.id),
});

// 2. Define the relations using Drizzle's `relations` function
export const configurationRelations = relations(configurationTable, ({ one }) => ({
  creator: one(usersTable, {
    fields: [configurationTable.createdBy],
    references: [usersTable.id],
  }),
  modifier: one(usersTable, {
    fields: [configurationTable.modifiedBy],
    references: [usersTable.id],
  }),
}));

// 3. Define types and the Entity class as before
export type TConfigurationSchema = typeof configurationTable;
// ...

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  // ...
}
```
**Key Concepts:**
- **`relations`**: A Drizzle ORM function used to define relationships between tables. Here, we define a `creator` and `modifier` relation from `Configuration` to `User`. The keys (`creator`, `modifier`) are important, as they will be used later when querying.

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
  configurationRelations, // 1. Import relations
  User,
  usersTable,
} from '@/models/entities';
import { BaseDataSource, datasource, ... } from '@vez/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@datasource()
export class PostgresDataSource extends BaseDataSource<...> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: { /* ... connection details ... */ },

      // 2. This is the place to define which models AND relations belong to this datasource
      schema: {
        [User.TABLE_NAME]: usersTable,
        [Configuration.TABLE_NAME]: configurationTable,

        // 3. Imported relations into the schema object
        configurationRelations,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
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

A repository extends `ViewRepository` (for read-only operations) or a future `CrudRepository` (for read/write), is decorated with `@repository`, and injects the `DataSource`.

```typescript
// src/repositories/configuration.repository.ts
import { Configuration, TConfigurationSchema } from '@/models/entities';
import { IDataSource, inject, repository, ViewRepository } from '@vez/ignis';

@repository({})
export class ConfigurationRepository extends ViewRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({ dataSource, entityClass: Configuration });
  }
}
```
You would then register this repository in your `application.ts`: `this.repository(ConfigurationRepository);`

### Querying with Relations

To query related data, use the `include` property in the filter object. The `relation` name must match one of the keys you defined in the `relations` object in your model file (e.g., `creator`).

```typescript
// Example usage in application.ts or a service
const configurationRepository = this.get<ConfigurationRepository>({
  key: 'repositories.ConfigurationRepository',
});

const results = await configurationRepository.find({
  filter: {
    where: { code: 'some_code' },
    include: [{ relation: 'creator' }], // Fetch the related user
  },
});

if (results.length > 0) {
  // `results[0].creator` will contain the full User object
  console.log('Configuration created by:', results[0].creator.name);
}
```

This structured and declarative approach ensures that your data layer is organized, type-safe, and easy to maintain.

> **Deep Dive:**
> - Explore the [**`ViewRepository`**](../../references/base/repositories.md) class and its methods.
