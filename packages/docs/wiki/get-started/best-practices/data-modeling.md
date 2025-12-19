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
| `generateIdColumnDefs` | Adds a Primary Key | `id` (string/UUID or number/Serial) |
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
    // 1. Auto-generate UUID Primary Key
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

## 3. Defining Relations

Relations are defined using the `TRelationConfig` structure within the static `relations` method of your model.

**Example (`src/models/entities/configuration.model.ts`):**

```typescript
import {
  BaseEntity,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { User } from './user.model';

@model({ type: 'entity' })
export class Configuration extends BaseEntity<typeof Configuration.schema> {
  // ... schema definition ...

  // Define relations
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
  ];
}
```

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