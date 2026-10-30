---
title: A Model Declares Each Fact Once
description: "ModelFactory.defineEntity builds the entity class from a plain drizzle table, relations point at tables, and TEntityObject infers the row type with its relations."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-09-19

## `ModelFactory.defineEntity`

<Badge type="tip" text="New Feature" />

**In one line.** Write the table first and build the entity class from it, so the table name, the id and every relation are stated once.

## What changed

- **The entity is built from a plain drizzle table** (`pgTable`, `pgSchema(...).table` or `sqliteTable`). `TABLE_NAME` is read off it, and the class and the table no longer reference each other.
- **Relations are keyed by name and point at tables**, never at another entity class. Two entities that relate both ways compile across files, and a self relation works the same way.
- **`TEntityObject<typeof Entity>` infers the row type, relations included.** It replaces a hand-written intersection and cannot drift from the declaration.
- **`one(table)` needs no `fields`** when the source table has one foreign key to the target. The columns are read off it.
- **`many(table, { relationName })`** pairs with the `one` whose key has that name.
- **Where it ships:** `@venizia/ignis/postgres`, and `@venizia/ignis-connectors/relational`, `/postgres` and `/sqlite`.

**Before:**

```typescript
@model({ type: 'entity' })
export class Note extends BasePostgresEntity<TNoteSchema> {
  static override readonly TABLE_NAME = 'notes';

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- table declared below
    super({ name: Note.TABLE_NAME, schema: notesTable });
  }
}

export const notesTable = pgTable(Note.TABLE_NAME, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: varchar('title', { length: 200 }).notNull(),
});

export type TNoteSchema = typeof notesTable;
export type TNote = TTableObject<TNoteSchema>;
```

**After:**

```typescript
import { model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory } from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const notesTable = pgTable('notes', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: varchar('title', { length: 200 }).notNull(),
});

@model({ type: 'entity' })
export class Note extends ModelFactory.defineEntity({ table: notesTable }) {}

export type TNote = TEntityObject<typeof Note>;
```

Relations:

```typescript
@model({ type: 'entity' })
export class Policy extends ModelFactory.defineEntity({
  table: policyTable,
  relations: () => ({ features: many(featureTable, { relationName: 'policy' }) }),
}) {}

@model({ type: 'entity' })
export class Feature extends ModelFactory.defineEntity({
  table: featureTable,
  relations: () => ({
    policy: one(policyTable),
    parent: one(featureTable),
    children: many(featureTable, { relationName: 'parent' }),
  }),
}) {}
```

`many` gives an array on the row, `one` a single object. Both are optional, because a row only carries a relation the query asked to include. The thunk runs lazily, once, so it may name a table declared later in the file.

## Who is affected

- **Existing models.** No action needed, unless a relation cannot pair (below). `BaseEntity`, `BasePostgresEntity`, hand-written `static schema` and `relations`, and `generateIdColumnDefs` behave as before.
- **Anyone with a relation drizzle cannot pair.** Schema discovery now logs a warning that names the entity, the relation and the fix. Nothing that boots today stops booting. Relations that point at a table no model on that datasource uses log one debug line, not a warning each.
- **New models.** Use `defineEntity`.
- **Anyone who tried the `{ name, columns, relations, id, extra }` shape** from an unreleased commit. It never shipped, so there is nothing to migrate.

## Breaking changes

> [!WARNING]
> These affect only code that touches the entity base class statics. Most models are untouched.

- **`BaseRelationalEntity`'s static `schema` is typed `Table`.** A subclass that assigns `static override schema = someTable` keeps its precise type. Code that read `.schema.id` off `typeof BaseEntity` reads it off the concrete class or the instance instead.
- **The protected static `schemaFactory` getter is gone.** A subclass that called it calls `this.getSchema({ type })` instead.

## Details

When `one(target)` has to find its columns:

- `fields` and `references` written out: used as written. Only one of them: an error at relation build.
- Exactly one foreign key to the target: that key's columns.
- Two or more foreign keys to the target: the one not claimed by a `one` written out on the same entity; if none is left, an error naming the columns. Write `fields` and `references`.
- No key, but the target has one back: the inverse side of a one-to-one. The target's entity must declare a `one()` back.
- No key, but the target has two or more back: an error naming the columns. Write `fields` and `references` on this side, reversed.
- No key either way: an error at relation build.
- A `one` to its own table follows the same rules, and only one such `one` per entity may leave out `fields`.

The same rules apply to a hand-written `relations` array. They change behaviour only where a relation could not be queried or returned the wrong row.

The inverse side carries no columns and takes no `relationName`. The entity that owns the key must declare a `one()` back:

```typescript
// profileTable.userId references userTable.id
export class User extends ModelFactory.defineEntity({
  table: userTable,
  relations: () => ({ profile: one(profileTable) }),
}) {}

export class Profile extends ModelFactory.defineEntity({
  table: profileTable,
  relations: () => ({ user: one(userTable) }), // owns the key
}) {}
```

If you cannot declare the `one()` back, write the columns on this side, reversed:

```typescript
profile: one(profileTable, { fields: [userTable.id], references: [profileTable.userId] }),
```

The datasource pairs every relation once, at boot when `configure()` reads `getSchema()`, otherwise on its first query. An inverse `one` with nothing back fails there, naming the entity and the relation. Any other relation drizzle cannot pair logs a warning and still fails the queries that include it, as before.

A defined class also carries `schema`, `TABLE_NAME`, `relationDefinitions` (`undefined` when there are none), `relations`, `AUTHORIZATION_SUBJECT`, and `new Policy().getSchema({ type })` for the zod schema (`'create'`, `'update'` or `'select'`). The class type is the named `TDefinedEntityClass<Schema, Relations>`. `TRelationConfig`'s `one` metadata is now optional and partial.

See the [Models reference](/references/base/models-reference#modelfactory-defineentity) for every option.
