---
title: A Model Declares Each Fact Once
description: "ModelFactory.defineEntity builds the entity class from a plain drizzle table, relations point at tables, and TEntityObject infers the row type - relations included."
---

# Changelog - 2026-09-19

## `ModelFactory.defineEntity`

<Badge type="tip" text="New Feature" />

**In one line.** The table comes first and the entity class is built from it, so the table name, the id and every relation are stated once.

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

The table is a plain drizzle table: `pgTable`, `pgSchema(...).table` or `sqliteTable`. `TABLE_NAME` is read off it, and the class and the table no longer reference each other, so the `no-use-before-define` suppression goes too. drizzle-kit keeps seeing the table, because it is still an exported constant.

## Relations point at tables

Relations are keyed by name, and each one points at a **table**, never at another entity class:

```typescript
export const policyTable = pgTable('Policy', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
});

export const featureTable = pgTable('Feature', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  policyId: text('policy_id').notNull().references((): AnyPgColumn => policyTable.id),
  parentId: text('parent_id').references((): AnyPgColumn => featureTable.id),
  code: text('code').notNull(),
});

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

export type TPolicy = TEntityObject<typeof Policy>;
// { id, title, features?: Array<{ id, policyId, parentId, code }> }
```

What to notice:

- **`one(table)` needs no `fields`.** The source table has exactly one foreign key to the target, so the columns are read off it.
- **`many(table, { relationName })` pairs with the `one` whose key is that name.** `features` pairs with `policy`; `children` pairs with `parent`.
- **Two entities that relate both ways compile, across files.** Neither imports the other's class, so neither row type collapses to `any` (TS7022). A self relation works the same way.
- **The thunk runs lazily, once.** It is read on first use, so it may name a table declared later in the file.

`many` produces an array on the row, `one` a single object. Both are optional, because a row only carries a relation the query asked to include.

## How `one` finds its columns

| The source table has | `one(target)` resolves to |
|---|---|
| `fields` and `references` written out | Those, as written |
| Only one of `fields` and `references` | An error at relation build |
| Exactly one foreign key to the target | That key's columns |
| Two or more foreign keys to the target, one not claimed by a `one` written out on the same entity | That key's columns |
| Two or more foreign keys to the target, otherwise | An error at relation build, naming the columns left - write `fields` and `references` |
| No key, but the target has one back | The inverse side of a one-to-one - the target's entity must declare a `one()` back |
| No key, but the target has two or more back | An error at relation build, naming the columns - write `fields` and `references` on this side, reversed |
| No key either way | An error at relation build |

A `one` to its own table follows the same rules, plus one: only one such `one` per entity may leave out `fields`. One self key cannot back both `previous` and `next`, so the second writes its columns.

The same rules apply to a hand-written `relations` array. They change behaviour only where a relation could not be queried, or returned the wrong row.

## The inverse side needs a `one()` back

The inverse side carries no columns. drizzle reads them off the `one()` on the table that owns the key, so that entity must declare one:

```typescript
// profileTable.userId references userTable.id
@model({ type: 'entity' })
export class User extends ModelFactory.defineEntity({
  table: userTable,
  relations: () => ({ profile: one(profileTable) }),
}) {}

@model({ type: 'entity' })
export class Profile extends ModelFactory.defineEntity({
  table: profileTable,
  relations: () => ({ user: one(userTable) }), // owns the key - `profile` pairs with it
}) {}
```

The inverse side takes no `relationName`. When the key's table has more than one key or relation back, or you cannot declare the `one()` back, write the columns on this side, reversed:

```typescript
profile: one(profileTable, { fields: [userTable.id], references: [profileTable.userId] }),
```

The datasource now pairs every relation once, when it builds its schema - at boot when `configure()` reads `getSchema()`, otherwise on its first query. An inverse `one` with nothing back fails there, with the entity and the relation named. Any other relation drizzle cannot pair logs a warning there instead, and still fails the queries that include it, as before. A relation to a table that no model on this datasource uses is not a defect - a datasource may carry a subset of models on purpose - so those collapse into one debug line per datasource.

## What else comes with the class

| Member | What it is |
|---|---|
| `Policy.schema` | The drizzle table, precisely typed |
| `Policy.TABLE_NAME` | `getTableName(table)` |
| `Policy.relationDefinitions` | The keyed relations, for `TEntityObject` - `undefined` when there are none |
| `Policy.relations` | The array form the query dialect reads |
| `Policy.AUTHORIZATION_SUBJECT` | As on any entity - the returned class is a `BaseRelationalEntity` subclass |
| `new Policy().getSchema({ type: 'create' })` | The zod schema - `'create'`, `'update'` or `'select'` |

The returned class type is `TDefinedEntityClass<Schema, Relations>`, a named type, so a consumer's declaration build can reference it.

## Who is affected

- **Existing models.** No action needed, unless a relation cannot pair (next bullet). `BaseEntity`, `BasePostgresEntity`, hand-written `static schema` and `relations`, and `generateIdColumnDefs` behave as before.
- **Anyone with a relation drizzle cannot pair.** Schema discovery now logs a warning that names the entity, the relation and the fix. Nothing that boots today stops booting. Relations that point outside a narrow datasource log one debug line, not a warning each.
- **New models.** Use `defineEntity`. It ships from `@venizia/ignis/postgres`, and from `@venizia/ignis-connectors/relational`, `/postgres` and `/sqlite`.
- **Anyone hand-writing a row type with its relations.** `TEntityObject` replaces the hand-written intersection, and it cannot drift from the runtime declaration.
- **Anyone who tried the `{ name, columns, relations, id, extra }` shape** from an unreleased commit. It never shipped, so there is nothing to migrate.

## Details

- **`TRelationConfig`'s `one` metadata is now optional and partial,** from every entry: `/postgres` re-exports the core type instead of keeping its own copy. Every existing configuration still type-checks.
- **`BaseRelationalEntity`'s static `schema` is typed `Table`,** widened so a factory-built class can carry its precise table. A subclass that assigns `static override schema = someTable` keeps its precise type. Code that read `.schema.id` off the base class type (`typeof BaseEntity`) reads it off the concrete class or the instance instead.
- **The protected static `schemaFactory` getter is gone.** The zod generator is a private module-level singleton now. A subclass that called it calls `this.getSchema({ type })` instead.

The type contract is tested by compiling real probe files with declarations emitted. A correct row compiles clean, and every wrong shape fails: a wrong column type, an unknown key, a to-many given one object, a relation pointing at an entity class. Two files that import each other keep both row types.

**Files:** [`packages/connectors/src/relational/core/models/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/factory.ts) ·
[`packages/connectors/src/relational/core/models/relations.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/relations.ts) ·
[`packages/connectors/src/relational/core/models/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/common/types.ts) ·
[`packages/connectors/src/relational/core/repositories/dialect/relations/one.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/relations/one.ts) ·
[`packages/connectors/src/relational/core/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/datasources/base.ts)

See the [Models reference](/references/base/models-reference#modelfactory-defineentity) for every option.
