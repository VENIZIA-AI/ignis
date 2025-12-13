# Data Modeling

Ignis streamlines data modeling with Drizzle ORM by providing powerful helpers and "enrichers" that reduce boilerplate code for common schema patterns.

## 1. Base Entity

All entity models should extend `BaseEntity`. This provides integration with the framework's repository layer and automatic schema generation support.

**Example (`src/models/entities/configuration.model.ts`):**

```typescript
import {
  BaseEntity,
  model,
  TTableObject,
} from '@venizia/ignis';
import { configurationTable } from './schema'; // Your Drizzle schema

// Define types for TypeScript inference
export type TConfigurationSchema = typeof configurationTable;
export type TConfiguration = TTableObject<TConfigurationSchema>;

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  static readonly TABLE_NAME = Configuration.name;

  constructor() {
    super({
      name: Configuration.TABLE_NAME,
      schema: configurationTable,
    });
  }
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
| `generatePrincipalColumnDefs` | Adds polymorphic relation fields | `principalType`, `principalId` |

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

Use the `createRelations` helper to define relationships cleanly. This abstracts the Drizzle `relations` function and makes it easy to bind to repositories.

**Example:**

```typescript
import { createRelations, RelationTypes } from '@venizia/ignis';
import { userTable } from './user.model';

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
  ],
});
```

This configuration is then passed directly to your Repository:

```typescript
@repository({})
export class ConfigurationRepository extends DefaultCRUDRepository<TConfigurationSchema> {
  constructor(@inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource) {
    super({
      dataSource,
      entityClass: Configuration,
      relations: configurationRelations.definitions, // <-- Injected here
    });
  }
}
```
