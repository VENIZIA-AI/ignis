# Models

Models define your data structure with Drizzle ORM tables. You declare the table, then build the model class from it with `ModelFactory.defineEntity`.

## Creating a Basic Model

```typescript
// src/models/entities/user.model.ts
import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
} from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

@model({ type: 'entity' })
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
```

**Key points:**

- The table is a plain, exported drizzle table - drizzle-kit reads it for migrations
- `TABLE_NAME` is read off the table, so the name `'User'` is written once
- The id is a UUID v7 text key, from `generateIdColumnDefs({ id: { dataType: 'string' } })`
- `TEntityObject<typeof User>` is the row type

## Creating a Model with Relations

```typescript
// src/models/entities/configuration.model.ts
import { model } from '@venizia/ignis';
import {
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  ModelFactory,
  one,
} from '@venizia/ignis/postgres';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { userTable } from './user.model';

export const configurationTable = pgTable(
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
      foreignColumns: [userTable.id],
      name: 'FK_Configuration_createdBy_User_id',
    }),
  ],
);

@model({ type: 'entity' })
export class Configuration extends ModelFactory.defineEntity({
  table: configurationTable,
  relations: () => ({
    creator: one(userTable, {
      fields: [configurationTable.createdBy],
      references: [userTable.id],
    }),
    modifier: one(userTable, {
      fields: [configurationTable.modifiedBy],
      references: [userTable.id],
    }),
  }),
}) {}
```

**Key points:**

- Relations are keyed by name - `creator` and `modifier` are the names you pass to `include`
- Each relation points at a **table** (`userTable`), never at another model class, so two models that relate both ways never import each other
- Both relations point at `userTable` through two different columns, so each names its `fields` and `references`. A `one` with exactly one foreign key to its target needs neither - see [How `one` finds its columns](/references/base/models-reference#how-one-finds-its-columns)

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
For a complete list of enrichers and options, see the [Schema Enrichers Reference](../../../references/base/models-reference.md#schema-enrichers).
:::

## Hidden Properties

Protect sensitive data by configuring properties that are **never returned** through repository queries. Hidden properties are excluded at the SQL level for maximum security and performance.

```typescript
import { model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  email: text('email').notNull(),
  password: text('password'), // Hidden from queries
  secret: text('secret'), // Hidden from queries
});

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'], // Never returned via repository
  },
})
export class User extends ModelFactory.defineEntity({ table: userTable }) {}
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
const connector = userRepo.connector;
const [fullUser] = await connector
  .select()
  .from(userTable)
  .where(eq(userTable.id, '123'));
// { id: '123', email: 'john@example.com', password: '...', secret: '...' }
```

:::tip
For complete hidden properties documentation, see the [Models Reference](../../../references/base/models-reference.md#hidden-properties).
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
export class Article extends ModelFactory.defineEntity({ table: articleTable }) {}
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
import { AuthorizationActions, model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const articleTable = pgTable('Article', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
});

@model({
  type: 'entity',
  settings: {
    authorize: { principal: 'article' },
  },
})
export class Article extends ModelFactory.defineEntity({ table: articleTable }) {}

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
import { model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory } from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const myModelTable = pgTable('MyModel', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
});

@model({ type: 'entity' })
export class MyModel extends ModelFactory.defineEntity({ table: myModelTable }) {}

export type TMyModel = TEntityObject<typeof MyModel>;
```

The class form - `BaseEntity` with a static `schema` - still works. See [Definition patterns](../../../references/base/models-reference.md#definition-patterns) and the [`defineEntity` reference](../../../references/base/models-reference.md#modelfactory-defineentity).