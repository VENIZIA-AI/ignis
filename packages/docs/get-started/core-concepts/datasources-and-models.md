# DataSources and Models

In Ignis, **Models** define the structure of your data using Drizzle ORM schemas, and **DataSources** manage the connection to your databases. This schema-first approach provides a powerful and type-safe way to interact with your database.

## Models: Defining Your Data Structure

Models are defined using Drizzle ORM's schema definition syntax. Ignis provides helper functions (`generateIdColumnDefs`, `generateTzColumnDefs`, `generateDataTypeColumnDefs`) to quickly add common fields like `id`, `createdAt`, `modifiedAt`, and data type columns.

### Creating a Model

Here is an example of a `Configuration` model, which uses Ignis's schema generation helpers:

```typescript
// src/models/entities/configuration.model.ts
import {
  BaseEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@vez/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';

export const configurationTable = pgTable('Configuration', {
  ...generateIdColumnDefs(),
  ...generateTzColumnDefs(),
  ...generateDataTypeColumnDefs(),
  code: text('code').unique(),
});

export type TConfigurationSchema = typeof configurationTable;
export type TConfiguration = InferSelectModel<TConfigurationSchema>;

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  constructor() {
    super({ name: Configuration.name, schema: configurationTable });
  }
}
```

In this example:
- `configurationTable` is the Drizzle schema definition, including generated ID, timestamp, and data type columns, plus a unique `code` field.
- `TConfigurationSchema` and `TConfiguration` are TypeScript types inferred from the Drizzle schema.
- The `@model` decorator marks the `Configuration` class as a data model, extending `BaseEntity` and wrapping the `configurationTable` schema. This class is used in repositories to define the entity type.

## DataSources: Connecting to Your Database

A DataSource is a class responsible for connecting to a database. You extend the `BaseDataSource` class to create your own.

### Creating a DataSource

Decorate your class with `@datasource`. In the constructor, you'll define the configuration and, importantly, register your Drizzle schemas that this datasource will manage.

```typescript
// src/datasources/postgres.datasource.ts
import { Configuration, configurationTable } from '../models/entities';
import {
  applicationEnvironment,
  BaseDataSource,
  datasource,
  int,
  TNodePostgresConnector,
  ValueOrPromise,
} from '@vez/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

@datasource()
export class PostgresDataSource extends BaseDataSource<
  TNodePostgresConnector,
  IDSConfigs
> {
  private readonly protocol = 'postgresql';

  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {
        host: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST),
        port: int(
          applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_PORT),
        ),
        database: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_POSTGRES_DATABASE,
        ),
        user: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_POSTGRES_USERNAME,
        ),
        password: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_POSTGRES_PASSWORD,
        ),
        ssl: false,
      },

      // This is the place to define which models belonged to this datasource
      schema: {
        // The schema key will be used by DrizzleORM's Query API
        [Configuration.name]: configurationTable,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.connector = drizzle({
      client: new Pool(this.settings.config),
      schema: this.settings.schema,
    });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings.config;
    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

### DataSource Lifecycle

1.  **`constructor()`**: The datasource is instantiated. Here you define its name, driver, connection configuration, and register the Drizzle schemas it will manage.
2.  **`configure()`**: This method is called by the application during startup. It's where you should initialize the Drizzle ORM instance with your database connection pool and the registered schemas.

### Registering a DataSource

You need to register your DataSource with your application, typically in the `preConfigure` method of `src/application.ts`:

```typescript
// src/application.ts
import { PostgresDataSource } from './datasources/postgres.datasource';

// ... in your Application class
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.dataSource(PostgresDataSource);
  }
```

## How They Work with Repositories

Repositories use the configured DataSources to get a Drizzle instance and perform type-safe queries against the database using the registered schemas. When you create a repository, you inject the DataSource to get access to the Drizzle connector and specify the associated entity class.

```typescript
// src/repositories/configuration.repository.ts
import { Configuration, TConfigurationSchema } from '../models/entities';
import { IDataSource, inject, repository, ViewRepository } from '@vez/ignis';

@repository({})
export class ConfigurationRepository extends ViewRepository<TConfigurationSchema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource,
  ) {
    super({ dataSource, entityClass: Configuration });
  }

  // You can add custom data access methods here
  async findByCode(code: string): Promise<Configuration | undefined> {
    // ... logic to find a configuration by code using Drizzle
    // Example: this.queryApi.select().from(this.schema).where(eq(this.schema.code, code));
    return undefined; // Placeholder
  }
}
```
By using this pattern, Ignis provides a clear and organized way to manage your data layer, from defining your data structures to connecting to your database and performing queries.
