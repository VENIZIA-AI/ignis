---
title: A Model Declares Each Fact Once
description: "ModelFactory.defineEntity builds the table and the class together, relations are declared as data, and TEntityObject infers the row type - relations included."
---

# Changelog - 2026-09-19

## `ModelFactory.defineEntity`

<Badge type="tip" text="New Feature" />

**In one line.** A model used to state its table name three times, wire its class and its table to
each other, and declare every relation twice - once for the runtime and once for the type. Now it
states each fact once.

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
@model({ type: 'entity' })
export class Note extends ModelFactory.defineEntity({
  name: 'notes',
  columns: { title: varchar('title', { length: 200 }).notNull() },
}) {}

export type TNote = TEntityObject<typeof Note>;
```

The table name is given once, the id column is added for you - a UUID v7 text key - and the class
and the table no longer reference each other, so the `no-use-before-define` suppression goes too.

## Relations are declared once

Keyed by name, each pointing at a schema. The runtime configuration and the row type both come from
that one declaration, so a renamed relation cannot leave a stale hand-written type behind:

```typescript
@model({ type: 'entity' })
export class Policy extends ModelFactory.defineEntity({
  name: 'Policy',
  columns: { title: text('title').notNull() },
  relations: () => ({
    features: many(PolicyFeatureSchema),
    owner: one(MerchantSchema, { relationName: 'policies' }),
  }),
}) {}

export type TPolicy = TEntityObject<typeof Policy>;
// { id, title, features?: TPolicyFeature[], owner?: TMerchant }
```

`many` produces an array on the row, `one` a single object. Both are optional, because a row only
carries a relation the query asked to include.

> [!WARNING]
> A relation points at a **schema**, never at another entity. Two entities that import each other
> make TypeScript give up on both (TS7022) and infer `any` - silently, with the app still running.
> Passing an entity does not compile, so the rule enforces itself.

## What else comes with the class

| | |
|---|---|
| `Note.schema` | the drizzle table, precisely typed |
| `Note.TABLE_NAME` | the name, taken from the one you passed |
| `Note.relationDefinitions` | the keyed relations, for `TEntityObject` |
| `Note.relations` | the array form the query dialect reads |
| `new Note().getSchema({ type: 'create' })` | the zod schema - insert, update or select |

The zod schemas were always there; a model that builds its own `createInsertSchema` can drop it.

## Who is affected

- **Existing models.** No action needed, nothing was renamed or removed. `BaseEntity`,
  `BasePostgresEntity`, `generateIdColumnDefs` and the array form of `relations` all behave exactly
  as before. The new factory is a second way to write a model, not a replacement.
- **New models.** Use `defineEntity`.
- **Anyone hand-writing a row type with its relations.** `TEntityObject` replaces the hand-written
  intersection, and unlike it, cannot drift from the runtime declaration.

## Details

A custom id stays one call away, and indexes go where they always did:

```typescript
ModelFactory.defineEntity({
  name: 'Ledger',
  columns: { amount: numeric('amount').notNull() },
  id: generateIdColumnDefs({ id: { dataType: 'big-number' } }),
  extra: columns => [index('IDX_Ledger_amount').on(columns.amount)],
});
```

The type contract is tested by compiling real probe files: a correct row must compile clean, and
seven wrong shapes - an undeclared relation, a wrong column, a to-many given a single object, a
relation pointing at an entity - must each fail. That suite is what catches inference quietly
degrading to `any`, which no runtime test can see.

**Files:** [`packages/connectors/src/relational/postgres/models/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/models/factory.ts) ·
[`packages/connectors/src/relational/core/models/relations.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/relations.ts) ·
[`packages/connectors/src/relational/core/models/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/models/common/types.ts)
