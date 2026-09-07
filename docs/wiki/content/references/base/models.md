---
title: Models
description: Declare a database table's schema and behavior with a model class
difficulty: intermediate
---

# Models

A model is a class that declares a database table's schema and behavior in one place.

## In one example

The smallest real model: a Drizzle table wrapped in a class, registered with `@model`.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs } from '@venizia/ignis';

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
  });
}
```

A `@repository` binds this model to a datasource, and the datasource auto-discovers the schema from that binding - no manual schema registration.

## How it works

- **Registration.** The `@model` decorator registers the class in the framework's metadata registry, keyed by table name (resolved as `tableName` > static `TABLE_NAME` > class name).
- **Validation at decoration time.** It validates `settings.defaultLimit` and, when you declare an authorization principal, copies it onto the static `AUTHORIZATION_SUBJECT` property.
- **Plain Drizzle schema.** The static `schema` is a plain Drizzle `pgTable`. Enrichers such as `generateIdColumnDefs` return column definitions you spread into that table, so common columns (id, timestamps, audit, principal) stay standardized across models.
- **Zod on demand.** `BaseEntity` generates Zod schemas from the Drizzle schema via `getSchema({ type })` - `'select'`, `'create'`, and `'update'` variants for validating query results, inserts, and updates.
  - The generator is a shared lazy singleton, so there is no per-entity cost.

**Two layers**

| Layer | Class | Carries |
|-------|-------|---------|
| Engine-neutral root | `AbstractEntity` | A name, `getSchema()`, `getIdType()`, and `toObject()`/`toJSON()` |
| PostgreSQL connector | `BaseEntity` (canonical class `BaseRelationalEntity`) | Adds the Drizzle-backed schema and Zod generation |

Everything on this page is the PostgreSQL connector - see the [Full reference](/references/base/models-reference) and [Connectors](/references/base/connectors) for the base-vs-connector split.

## Common tasks

### Add id and timestamp columns

Enrichers return column definitions - spread them into the `pgTable`. `generateIdColumnDefs` adds the primary key; `generateTzColumnDefs` adds `createdAt` and `modifiedAt`.

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { BaseEntity, model, generateIdColumnDefs, generateTzColumnDefs } from '@venizia/ignis';

@model({ type: 'entity' })
export class Article extends BaseEntity<typeof Article.schema> {
  static override schema = pgTable('Article', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    title: text('title').notNull(),
  });
}
```

### Hide a field

List a column in `settings.hiddenProperties`. Hidden columns are excluded at the SQL level - never selected or returned through repositories.

```typescript
@model({
  type: 'entity',
  settings: { hiddenProperties: ['password'] },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    email: text('email').notNull(),
    password: text('password'),
  });
}
```

### Apply a default filter

`settings.defaultFilter` is merged into every repository read, count, update, and delete for the model. A common use is soft delete.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { postTable } from '@/schemas';

@model({
  type: 'entity',
  settings: { defaultFilter: { where: { isDeleted: false } } },
})
export class Post extends BaseEntity<typeof Post.schema> {
  static override schema = postTable;
}
```

Pass `options: { shouldSkipDefaultFilter: true }` on a query to bypass it. See [Default Filter](/references/base/filter-system/default-filter).

### Set a default limit

`settings.defaultLimit` caps queries that omit `limit`. It must be a positive integer (validated at decoration time) and falls back to the global `DEFAULT_LIMIT` (10).

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { eventTable } from '@/schemas';

@model({
  type: 'entity',
  settings: { defaultLimit: 50 },
})
export class Event extends BaseEntity<typeof Event.schema> {
  static override schema = eventTable;
}
```

See [Pagination](/references/base/filter-system/fields-order-pagination#default-limit).

### Declare an authorization principal

`settings.authorize.principal` names the model as an authorization subject. The decorator auto-populates the static `AUTHORIZATION_SUBJECT` from it.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { userTable } from '@/schemas';

@model({
  type: 'entity',
  settings: { authorize: { principal: 'User' } },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}
```

See [Authorization](/extensions/components/authorization/usage#model-based-resource-references).

## See also

- [Full reference](/references/base/models-reference) - every `@model` option, entity member, enricher, and edge case
- [Tutorial](/guides/core-concepts/persistent/models) - creating models step by step
- [Connectors](/references/base/connectors) - the base-vs-connector architecture
- [DataSources](/references/base/datasources) - binding a model's schema to a connection
- [Repositories](/references/base/repositories/) - the CRUD layer built on top of a model
- [Filter System](/references/base/filter-system/) - querying the model through a repository

**Files:**

- [`packages/kernel/src/base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/models/base.ts) - neutral `AbstractEntity`
- [`packages/connectors/src/relational/postgres/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/models/base.ts) - PostgreSQL `BaseEntity`
