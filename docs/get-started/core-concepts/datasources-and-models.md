# DataSources and Models

In Ignis, **Models** define the structure of your data, and **DataSources** manage the connection to your databases. The framework uses [Drizzle ORM](https://orm.drizzle.team/) to provide a powerful and type-safe way to interact with your database.

## Models: Defining Your Data Structure

Models are classes that describe your database tables and their columns. Ignis provides base classes like `BaseStringIdEntity` and `BaseNumberIdEntity` that you can extend to quickly create your models. These base classes automatically add common fields like `id`, `createdAt`, and `modifiedAt`.

### Creating a Model

To create a model, you create a class that extends one of the base entity classes and decorate it with `@model`.

Here is an example of a `User` model:

```typescript
// src/models/user.model.ts
import { BaseStringUserAuditTzEntity, model } from '@vez/ignis';
import { text, varchar } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class User extends BaseStringUserAuditTzEntity {
  constructor() {
    super({
      name: 'users',
      columns: {
        email: varchar('email', { length: 255 }).notNull().unique(),
        password: text('password').notNull(),
        // other fields...
      },
    });
  }
}
```

In this example:
- `User` extends `BaseStringUserAuditTzEntity`, so it will automatically have `id` (string), `createdAt`, `modifiedAt`, `createdBy`, and `modifiedBy` fields.
- The `@model` decorator marks this class as a data model.
- The constructor defines the table name (`users`) and the additional columns (`email`, `password`) using Drizzle ORM's schema definition syntax.

## DataSources: Connecting to Your Database

A DataSource is a class responsible for connecting to a database. Ignis provides a `BaseDataSource` class that you can extend to create your own datasources.

### Creating a DataSource

To create a DataSource, you create a class that extends `BaseDataSource` and is decorated with `@datasource`.

Here is an example of a `PostgresDataSource`:

```typescript
// src/datasources/postgres.datasource.ts
import { BaseDataSource, datasource, ValueOrPromise } from '@vez/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@datasource()
export class PostgresDataSource extends BaseDataSource {
  constructor() {
    super({
      name: 'PostgresDataSource',
      driver: 'node-postgres',
      config: {
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.dataSource = drizzle(new Pool(this.settings));
  }
  
  override getConnectionString(): ValueOrPromise<string> {
    // ...
  }
}
```
In the `configure` method, you initialize the Drizzle ORM instance with your database connection.

### DataSource Lifecycle

1.  **`constructor()`**: The datasource is instantiated with its configuration.
2.  **`configure()`**: This method is called by the application during startup. It's where you should initialize the database connection and assign it to the `dataSource` property.

### Registering a DataSource

You need to register your DataSource with your application in `src/application.ts`:

```typescript
// src/application.ts
import { PostgresDataSource } from './datasources/postgres.datasource';

// ... in your Application class's preConfigure method
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.dataSource(PostgresDataSource);
  }
```

## How They Work with Repositories

Repositories use DataSources and Models to perform CRUD operations. When you create a repository, you typically inject the DataSource to get a database connection.

```typescript
import { DefaultCrudRepository, inject } from '@vez/ignis';
import { PostgresDataSource } from '../datasources/postgres.datasource';
import { User, usersTable } from '../models/user.model';

export class UserRepository extends DefaultCrudRepository<typeof usersTable, User> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: PostgresDataSource,
  ) {
    super(usersTable, dataSource);
  }
}
```

By using this pattern, Ignis provides a clear and organized way to manage your data layer, from defining your data structures to connecting to your database and performing queries.
