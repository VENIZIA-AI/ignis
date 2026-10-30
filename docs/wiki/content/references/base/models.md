---
title: Models
description: Declare a database table's schema and behavior with a model class
difficulty: intermediate
---

# Models

A model is a class that declares a database table's schema and behavior in one place.

## In one example

The smallest real model: a Drizzle table, and an entity class built from it with `@model`.

```typescript
import { model } from '@venizia/ignis';
import { PostgresIdEnricher, ModelFactory } from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('User', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  email: text('email').notNull(),
});

@model()
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
```

A `@repository` binds this model to a datasource, and the datasource auto-discovers the schema from that binding - no manual schema registration.

## How it works

- **Table first.** The table is a plain Drizzle table (`pgTable`, `pgSchema(...).table` or `sqliteTable`), exported so drizzle-kit sees it. `defineEntity` reads `TABLE_NAME` off it, so the name is written once.
- **Registration.** The `@model` decorator registers the class in the framework's metadata registry, keyed by table name (resolved as `tableName` > static `TABLE_NAME` > class name).
- **Validation at decoration time.** It validates `settings.query.limit.default` and, when you declare an authorization principal, copies it onto the static `AUTHORIZATION_SUBJECT` property.
- **Enrichers.** `PostgresIdEnricher.generateColumnDefs` and its siblings return column definitions you spread into the table, so common columns (id, timestamps, audit, principal) stay standardized across models.
- **Zod on demand.** The entity generates Zod schemas from the table via `getSchema({ type })` - `'select'`, `'create'`, and `'update'` variants for validating query results, inserts, and updates.
  - The generator is a shared lazy singleton, so there is no per-entity cost.

**Two layers**

| Layer | Class | Carries |
|-------|-------|---------|
| Engine-neutral root | `AbstractEntity` | A name, `getSchema()`, `getIdType()`, and `toObject()`/`toJSON()` |
| Relational connector | `BaseRelationalEntity` (aliases `BaseEntity`, `BasePostgresEntity`) | Adds the Drizzle-backed schema and Zod generation. `defineEntity` returns a subclass of it |

Everything on this page is the relational connector - see the [Full reference](/references/base/models-reference) and [Connectors](/references/base/connectors) for the base-vs-connector split.

## Common tasks

### Add id and timestamp columns

Enrichers return column definitions - spread them into the table. `PostgresIdEnricher.generateColumnDefs` adds the primary key; `PostgresTzEnricher.generateColumnDefs` adds `createdAt` and `modifiedAt`. The old function names (`generateIdColumnDefs`, `generateTzColumnDefs`, ...) are deprecated aliases until 0.5.

```typescript
import { model } from '@venizia/ignis';
import { PostgresIdEnricher, PostgresTzEnricher, ModelFactory } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const articleTable = pgTable('Article', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  ...PostgresTzEnricher.generateColumnDefs(),
  title: text('title').notNull(),
});

@model()
export class Article extends ModelFactory.defineEntity({ table: articleTable }) {}
```

### Declare relations

Point each relation at a **table**, never at another entity class. `one` reads its columns off the table's foreign key; `many` names the `one` it pairs with.

```typescript
import { model } from '@venizia/ignis';
import { PostgresIdEnricher, many, ModelFactory, one } from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const authorTable = pgTable('Author', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
});

export const postTable = pgTable('Post', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  authorId: text('author_id').notNull().references((): AnyPgColumn => authorTable.id),
  title: text('title').notNull(),
});

@model()
export class Author extends ModelFactory.defineEntity({
  table: authorTable,
  relations: () => ({ posts: many(postTable, { relationName: 'author' }) }),
}) {}

@model()
export class Post extends ModelFactory.defineEntity({
  table: postTable,
  relations: () => ({ author: one(authorTable) }),
}) {}

export type TAuthor = TEntityObject<typeof Author>;
// { id, name, posts?: Array<{ id, authorId, title }> }
```

`one(authorTable)` needs no `fields` because `postTable` has exactly one foreign key to `authorTable`. With two keys to the same table, write `fields` and `references` - see [How `one` finds its columns](/references/base/models-reference#how-one-finds-its-columns).

A `one` to a table that keys back to it - `profile: one(profileTable)` on an author - is the inverse side of a one-to-one. The entity that owns the key must declare the `one()` back, or schema discovery fails - see [Pairing the inverse side](/references/base/models-reference#pairing-the-inverse-side).

### Hide a field

List a column in `settings.hiddenProperties`. Hidden columns are excluded at the SQL level - never selected or returned through repositories.

```typescript
export const accountTable = pgTable('Account', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  email: text('email').notNull(),
  password: text('password'),
});

@model({
  settings: { hiddenProperties: ['password'] },
})
export class Account extends ModelFactory.defineEntity({ table: accountTable }) {}
```

### Apply a default filter

`settings.query.filter` is merged into every repository read, count, update, and delete for the model. A common use is soft delete.

```typescript
@model({
  settings: { query: { filter: { where: { isDeleted: false } } } },
})
export class Note extends ModelFactory.defineEntity({ table: noteTable }) {} // noteTable has an isDeleted column
```

Pass `options: { shouldSkipDefaultFilter: true }` on a query to bypass it. See [Default Filter](/references/base/filter-system/default-filter).

### Set a default limit

`settings.query.limit.default` caps queries that omit `limit`. It must be a positive integer (validated at decoration time) and falls back to the global `DEFAULT_LIMIT` (10).

```typescript
@model({
  settings: { query: { limit: { default: 50 } } },
})
export class Event extends ModelFactory.defineEntity({ table: eventTable }) {}
```

See [Pagination](/references/base/filter-system/fields-order-pagination#default-limit-resolution).

### Declare an authorization principal

`settings.authorize.principal` names the model as an authorization subject. The decorator auto-populates the static `AUTHORIZATION_SUBJECT` from it.

```typescript
@model({
  settings: { authorize: { principal: 'User' } },
})
export class User extends ModelFactory.defineEntity({ table: userTable }) {}
```

See [Authorization](/extensions/components/authorization/usage#model-based-resource-references).

### Write the class by hand

The class form still works, and existing models need no change. Hand-written `BaseEntity` subclasses are the compatibility path; new code uses `ModelFactory.defineEntity` (see the [models guide](/guides/core-concepts/persistent/models)). Assign the table to a static `schema` on `BaseEntity`:

```typescript
import { BaseEntity, PostgresIdEnricher, model } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const tagTable = pgTable('Tag', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  label: text('label').notNull(),
});

@model()
export class Tag extends BaseEntity<typeof tagTable> {
  static override schema = tagTable;
}
```

See [Definition patterns](/references/base/models-reference#definition-patterns) for relations in this form.

## See also

- [Full reference](/references/base/models-reference) - every `@model` option, entity member, enricher, and edge case
- [Tutorial](/guides/core-concepts/persistent/models) - creating models step by step
- [Relations](/references/base/repositories/relations) - including related rows in a query
- [Connectors](/references/base/connectors) - the base-vs-connector architecture
- [DataSources](/references/base/datasources) - binding a model's schema to a connection
- [Repositories](/references/base/repositories/) - the CRUD layer built on top of a model
- [Filter System](/references/base/filter-system/) - querying the model through a repository

**Files:**

- [`packages/kernel/src/base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/models/base.ts) - neutral `AbstractEntity`
- [`packages/connectors/src/relational/core/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/base.ts) - `BaseRelationalEntity`
- [`packages/connectors/src/relational/core/models/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/factory.ts) - `ModelFactory.defineEntity`
- [`packages/connectors/src/relational/core/models/relations.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/relations.ts) - `one`, `many`
