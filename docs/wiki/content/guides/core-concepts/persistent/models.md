# Models

Models define your data structure using Drizzle ORM schemas. A model is a single class with static properties for schema and relations.

## Creating a Basic Model

```typescript
// src/models/entities/user.model.ts
import { BasePostgresEntity, generateIdColumnDefs, generateTzColumnDefs, model } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class User extends BasePostgresEntity<typeof User.schema> {
  // Define schema as static property
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    name: text('name').notNull(),
    email: text('email').notNull(),
  });

  // Relations (empty array if none)
  static override relations = () => [];
}
```

**Key points:**

- Schema is defined inline as `static override schema`
- Relations are defined as `static override relations`
- No constructor needed - BasePostgresEntity auto-discovers from static properties
- Type parameter uses `typeof User.schema` (self-referencing)

## Creating a Model with Relations

```typescript
// src/models/entities/configuration.model.ts
import {
  BasePostgresEntity,
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
export class Configuration extends BasePostgresEntity<typeof Configuration.schema> {
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by'),
  modifiedBy: text('modified_by'),
  // ... your fields
});
```

**With enrichers:**

```typescript
static override schema = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),   // id (text with UUID default)
  ...generateTzColumnDefs(),                                 // createdAt, modifiedAt
  ...generateUserAuditColumnDefs({
    created: { dataType: 'string', columnName: 'created_by' },
    modified: { dataType: 'string', columnName: 'modified_by' },
  }),                                                        // createdBy, modifiedBy
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

:::note User Audit Options
The `generateUserAuditColumnDefs` enricher defaults both columns to `dataType: 'number'` (integer user ids) - pass `dataType: 'string'` for text ids. It also supports an `allowAnonymous` option (default: `true`). Set to `false` to require authenticated user context and throw errors for anonymous operations:
```typescript
...generateUserAuditColumnDefs({
  created: { dataType: 'string', columnName: 'created_by', allowAnonymous: false },
  modified: { dataType: 'string', columnName: 'modified_by', allowAnonymous: false },
})
```
:::

:::tip
For a complete list of enrichers and options, see the [Schema Enrichers Reference](../../../references/base/models.md#schema-enrichers).
:::

## Hidden Properties

Protect sensitive data by configuring properties that are **never returned** through repository queries. Hidden properties are excluded at the SQL level for maximum security and performance.

```typescript
import { BasePostgresEntity, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],  // Never returned via repository
  },
})
export class User extends BasePostgresEntity<typeof User.schema> {
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

## Default Filter

Apply automatic filters to all repository queries. This is commonly used for soft-delete patterns:

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: { where: { isDeleted: false } },
    hiddenProperties: ['deletedAt'],
  },
})
export class Article extends BasePostgresEntity<typeof Article.schema> {
  // ...
}
```

The default filter is applied automatically to all read operations. Bypass it with `shouldSkipDefaultFilter: true` in the options:

```typescript
// Normal query - auto-filters out soft-deleted records
const articles = await articleRepo.find({ filter: {} });

// Include deleted records
const allArticles = await articleRepo.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});
```

## Authorization Settings

Declare your model's authorization principal directly in `@model` settings. The decorator auto-populates `AUTHORIZATION_SUBJECT` for type-safe references in route configs:

```typescript
import { BasePostgresEntity, generateIdColumnDefs, model, AuthorizationActions } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    authorize: { principal: 'article' },
  },
})
export class Article extends BasePostgresEntity<typeof Article.schema> {
  static override schema = pgTable('Article', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    title: text('title').notNull(),
  });
}

// Use in route configs - no hardcoded strings
authorize: {
  action: AuthorizationActions.READ,
  resource: Article.AUTHORIZATION_SUBJECT, // 'article'
}
```

:::tip
For full authorization integration details, see the [Authorization Usage Reference](../../../extensions/components/authorization/usage#model-based-resource-references).
:::

## Model Metadata Types

The `@model` decorator accepts the following metadata:

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | `'entity' \| 'view'` | Whether this is a table or a database view |
| `tableName` | `string` | Optional explicit table name |
| `skipMigrate` | `boolean` | Skip this model during migrations |
| `settings.hiddenProperties` | `string[]` | Properties excluded from all query results |
| `settings.defaultFilter` | `TFilter` | Default filter auto-applied to all queries |
| `settings.defaultLimit` | `number` | Default row limit when a query omits `limit` (must be a positive integer; falls back to `10`) |
| `settings.authorize.principal` | `string` | Authorization subject name for this model |

## Model Template

```typescript
import { BasePostgresEntity, generateIdColumnDefs, model, TRelationConfig } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class MyModel extends BasePostgresEntity<typeof MyModel.schema> {
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
