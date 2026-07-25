---
title: PostgreSQL Array Operators
description: Operators for PostgreSQL array columns
difficulty: intermediate
---

# PostgreSQL Array Operators

Operators for PostgreSQL array columns (`varchar[]`, `text[]`, `integer[]`, etc.).

| Operator | PostgreSQL | Description |
|----------|------------|-------------|
| `contains` | `@>` | Array contains **ALL** specified elements |
| `containedBy` | `<@` | Array is a **subset** of specified elements |
| `overlaps` | `&&` | Array shares **ANY** element with specified |


## contains (@>)

Find rows where the array column contains **all** specified elements.

```typescript
// Schema: tags varchar(100)[]
// Data: Product A has ['electronics', 'featured', 'sale']

{ where: { tags: { contains: ['electronics', 'featured'] } } }
// SQL: "tags"::text[] @> ARRAY['electronics', 'featured']::text[]
```

> [!NOTE]
> A single value is wrapped in an array automatically: `{ contains: 'featured' }` is treated as `{ contains: ['featured'] }`.


## containedBy (<@)

Find rows where **all** array elements are within the specified set.

```typescript
{ where: { tags: { containedBy: ['sale', 'featured', 'new', 'popular'] } } }
// SQL: "tags"::text[] <@ ARRAY['sale', 'featured', 'new', 'popular']::text[]
```

> [!NOTE]
> An empty array is a subset of every set, so `tags: []` always matches `containedBy`.


## overlaps (&&)

Find rows where the arrays share at least one common element.

```typescript
{ where: { tags: { overlaps: ['premium', 'sale'] } } }
// SQL: "tags"::text[] && ARRAY['premium', 'sale']::text[]
```


## Visual Comparison

| Product | tags | `contains ['featured']` | `containedBy ['a','b','featured']` | `overlaps ['sale','premium']` |
|---------|------|------------------------|-----------------------------------|------------------------------|
| A | `['featured', 'sale']` | Yes | No (has 'sale') | Yes (has 'sale') |
| B | `['featured']` | Yes | Yes | No |
| C | `['a', 'b']` | No | Yes | No |
| D | `['premium']` | No | No | Yes (has 'premium') |
| E | `[]` | No | Yes (empty subset) | No |


## Decision Guide

| Question | Use |
|----------|-----|
| "Must have ALL these tags" | `contains` |
| "Tags must only be from this list" | `containedBy` |
| "Must have AT LEAST ONE of these tags" | `overlaps` |


## Type Handling

The element type of the array column decides the cast in the generated SQL.

```typescript
// String arrays (varchar[], text[], char[]) - both sides cast to text[]
{ where: { tags: { contains: ['a', 'b'] } } }
// SQL: "tags"::text[] @> ARRAY['a', 'b']::text[]

// Numeric arrays (integer[], numeric[]) - no cast needed
{ where: { scores: { contains: [100, 200] } } }
// SQL: "scores" @> ARRAY[100, 200]

// Boolean arrays - no cast needed
{ where: { flags: { contains: [true, false] } } }
// SQL: "flags" @> ARRAY[true, false]
```


## Empty Array Behavior

| Operator | SQL generated | Behavior |
|----------|---------------|----------|
| `contains: []` | `WHERE true` | Returns **ALL** rows |
| `containedBy: []` | `WHERE "col" = '{}'` | Returns only rows with **empty arrays** |
| `overlaps: []` | `WHERE false` | Returns **NO** rows |


## Security: Parameterized Values

Every element of `contains`/`containedBy`/`overlaps` is bound as a query parameter - only the operator token (`@>`/`<@`/`&&`) is raw SQL. See [The Hardening Round](../../../changelogs/2026-07-13-hardening-round) for the prior injection this closed.


## Defining Array Columns

```typescript
import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';

export const productTable = pgTable('Product', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  tags: varchar('tags', { length: 100 }).array(),      // varchar(100)[]
  categories: text('categories').array(),              // text[]
  scores: integer('scores').array(),                   // integer[]
});
```

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [List Operators](./list-operators) - `in`/`nin` match scalar values against an array, the operators these are not to be confused with
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, `buildPgArrayComparison`
- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
