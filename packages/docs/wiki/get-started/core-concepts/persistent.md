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

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  static readonly TABLE_NAME = Configuration.name;

  constructor() {
    super({ name: Configuration.TABLE_NAME, schema: configurationTable });
  }
}
```
**Key Concepts:**
- **`createRelations`**: A helper function from Ignis (`@vez/ignis`) that simplifies defining Drizzle ORM relations. It creates both the Drizzle `relations` object and a `definitions` object for use in repositories. Here, we define a `creator` and `modifier` relation from `Configuration` to `User`. The names (`creator`, `modifier`) are important, as they will be used later when querying.

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
} from '@/models/entities';
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

@datasource({})
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  private readonly protocol = 'postgresql';

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
        configurationRelations.relations,
      ),
    });
  }

  override configure(): ValueOrPromise<void> {
    // The `drizzle` function receives the schema with tables and relations
    this.connector = drizzle({
      client: new Pool(this.settings),
      schema: this.schema,
    });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
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

A repository extends `DefaultCRUDRepository` (for full read/write operations) or `ReadableRepository` (for read-only access), is decorated with `@repository`, and injects the `DataSource`.

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

  // You can add custom data access methods here
  async findByCode(code: string): Promise<Configuration | undefined> {
    // 'this.connector' gives you direct access to the Drizzle instance
    const result = await this.connector.query.Configuration.findFirst({
      where: (table, { eq }) => eq(table.code, code)
    });
    return result;
  }
}
```
You would then register this repository in your `application.ts`: `this.repository(ConfigurationRepository);`

### Querying with Relations

To query related data, use the `include` property in the filter object. The `relation` name must match one of the keys you defined in the `relations` object (e.g., `creator`) or in `createRelations` definition.

```typescript
// Example usage in application.ts or a service
const configurationRepository = this.get<ConfigurationRepository>({
  key: 'repositories.ConfigurationRepository',
});

const results = await configurationRepository.find({
  filter: {
    where: { code: 'some_code' },
    include: [{ relation: 'creator' }], // Fetch the related user (name must match relation key)
  },
});

if (results.length > 0) {
  // `results[0].creator` will contain the full User object
  console.log('Configuration created by:', results[0].creator.name);
}
```
