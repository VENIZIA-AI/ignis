# Models

Models define your data structure using Drizzle ORM schemas. A model is a single class with static properties for schema and relations.

## Creating a Basic Model

```typescript
// src/models/entities/user.model.ts
import { BaseEntity, extraUserColumns, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  // Define schema as static property
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...extraUserColumns({ idType: 'string' }),
  });

  // Relations (empty array if none)
  static override relations = () => [];
}
```

**Key points:**

- Schema is defined inline as `static override schema`
- Relations are defined as `static override relations`
- No constructor needed - BaseEntity auto-discovers from static properties
- Type parameter uses `typeof User.schema` (self-referencing)

## Creating a Model with Relations

```typescript
// src/models/entities/configuration.model.ts
import {
  BaseEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { User } from './user.model';

@model({ type: 'entity' })
export class Configuration extends BaseEntity<typeof Configuration.schema> {
  static override schema = pgTable(
    'Configuration',
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
    def => [
      unique('UQ_Configuration_code').on(def.code),
      index('IDX_Configuration_group').on(def.group),
      foreignKey({
        columns: [def.createdBy],
        foreignColumns: [User.schema.id], // Reference User.schema, not a separate variable
        name: 'FK_Configuration_createdBy_User_id',
      }),
    ],
  );

  // Define relations using TRelationConfig array
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
    {
      name: 'modifier',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Configuration.schema.modifiedBy],
        references: [User.schema.id],
      },
    },
  ];
}
```

**Key points:**

- Relations use `TRelationConfig[]` format directly
- Reference other models via `Model.schema` (e.g., `User.schema.id`)
- Relation names (`creator`, `modifier`) are used in queries with `include`

## Understanding Enrichers

Enrichers are helper functions that generate common database columns automatically.

**Without enrichers:**

```typescript
static override schema = pgTable('User', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  status: text('status').notNull().default('ACTIVE'),
  createdBy: text('created_by'),
  modifiedBy: text('modified_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
  // ... your fields
});
```

**With enrichers:**

```typescript
static override schema = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),  // id (text with UUID default)
  ...extraUserColumns({ idType: 'string' }),                 // status, audit fields, timestamps
  // ... your fields
});
```

### Available Enrichers

| Enricher | Columns Added | Use Case |
|----------|---------------|----------|
| `generateIdColumnDefs()` | `id` (text or number) | Every table |
| `generateTzColumnDefs()` | `createdAt`, `modifiedAt` | Track timestamps |
| `generateUserAuditColumnDefs()` | `createdBy`, `modifiedBy` | Track who created/updated |
| `generateDataTypeColumnDefs()` | `dataType`, `tValue`, `nValue`, etc. | Configuration tables |
| `extraUserColumns()` | Combines audit + status + type | Full-featured entities |

:::tip
For a complete list of enrichers and options, see the [Schema Enrichers Reference](../../../references/base/models.md#schema-enrichers).
:::

## Hidden Properties

Protect sensitive data by configuring properties that are **never returned** through repository queries. Hidden properties are excluded at the SQL level for maximum security and performance.

```typescript
import { BaseEntity, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],  // Never returned via repository
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),  // Hidden from queries
    secret: text('secret'),      // Hidden from queries
  });
}
```

**Behavior:**

| Operation | Behavior |
|-----------|----------|
| `find()`, `findOne()`, `findById()` | Hidden excluded from SELECT |
| `create()`, `updateById()`, `deleteById()` | Hidden excluded from RETURNING |
| Where clause filtering | Hidden fields **can** be used in filters |
| Direct connector query | Hidden fields **included** (bypasses repository) |

When you need to access hidden data, use the connector directly:

```typescript
// Repository query - excludes hidden
const user = await userRepo.findById({ id: '123' });
// { id: '123', email: 'john@example.com' }

// Connector query - includes all fields
const connector = userRepo.getConnector();
const [fullUser] = await connector
  .select()
  .from(User.schema)
  .where(eq(User.schema.id, '123'));
// { id: '123', email: 'john@example.com', password: '...', secret: '...' }
```

:::tip
For complete hidden properties documentation, see the [Models Reference](../../../references/base/models.md#hidden-properties).
:::

## Model Template

```typescript
import { BaseEntity, generateIdColumnDefs, model, TRelationConfig } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class MyModel extends BaseEntity<typeof MyModel.schema> {
  static override schema = pgTable('MyModel', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
  });

  static override relations = (): TRelationConfig[] => [];
}
```

> **Deep Dive:** See [BaseEntity Reference](../../../references/base/models.md#baseentity-class) for advanced patterns.

## See Also

- **Related Concepts:**
  - [Repositories](/guides/core-concepts/persistent/repositories) - Data access layer using models
  - [DataSources](/guides/core-concepts/persistent/datasources) - Database connections
  - [Persistent Layer Overview](/guides/core-concepts/persistent/) - Architecture overview

- **References:**
  - [Models & Enrichers API](/references/base/models) - Complete API reference
  - [Relations](/references/base/repositories/relations) - Defining model relationships
  - [Filter System](/references/base/filter-system/) - Querying models

- **External Resources:**
  - [Drizzle ORM Documentation](https://orm.drizzle.team/) - Schema definition guide
  - [PostgreSQL Data Types](https://www.postgresql.org/docs/current/datatype.html) - Column types reference

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - Schema design patterns

- **Tutorials:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Model examples
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Models with relations
