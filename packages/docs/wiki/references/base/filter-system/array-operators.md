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

// Find products with BOTH 'electronics' AND 'featured'
{ where: { tags: { contains: ['electronics', 'featured'] } } }
// SQL: "tags"::text[] @> ARRAY['electronics', 'featured']::text[]

// Single element
{ where: { tags: { contains: ['featured'] } } }
// Matches: ['featured'], ['featured', 'sale'], ['a', 'featured', 'b']
```


## containedBy (<@)

Find rows where **all** array elements are within the specified set.

```typescript
// Find products where ALL tags are in the allowed list
{ where: { tags: { containedBy: ['sale', 'featured', 'new', 'popular'] } } }
// SQL: "tags"::text[] <@ ARRAY['sale', 'featured', 'new', 'popular']::text[]

// Product A ['featured', 'sale'] -> matches (all in list)
// Product B ['featured', 'clearance'] -> no match ('clearance' not in list)
// Product C [] -> matches (empty is subset of everything)
```


## overlaps (&&)

Find rows where the arrays share at least one common element.

```typescript
// Find products with 'premium' OR 'sale' tag
{ where: { tags: { overlaps: ['premium', 'sale'] } } }
// SQL: "tags"::text[] && ARRAY['premium', 'sale']::text[]

// Product A ['featured', 'sale'] -> matches (has 'sale')
// Product B ['premium', 'luxury'] -> matches (has 'premium')
// Product C ['new', 'featured'] -> no match (no overlap)
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


## Empty Array Behavior

| Operator | Empty Value `[]` | Behavior |
|----------|------------------|----------|
| `contains: []` | Returns **ALL** rows | Everything contains empty set |
| `containedBy: []` | Returns only rows with **empty arrays** | Only `[]` is subset of `[]` |
| `overlaps: []` | Returns **NO** rows | Nothing overlaps with empty |


## Type Handling

**String Arrays** (`varchar[]`, `text[]`, `char[]`):
```typescript
{ where: { tags: { contains: ['a', 'b'] } } }
// SQL: "tags"::text[] @> ARRAY['a', 'b']::text[]
```

**Numeric Arrays** (`integer[]`, `numeric[]`):
```typescript
{ where: { scores: { contains: [100, 200] } } }
// SQL: "scores" @> ARRAY[100, 200]
```

**Boolean Arrays**:
```typescript
{ where: { flags: { contains: [true, false] } } }
// SQL: "flags" @> ARRAY[true, false]
```


## Defining Array Columns

In your Drizzle schema:

```typescript
import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';

export const productTable = pgTable('Product', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  // Array columns
  tags: varchar('tags', { length: 100 }).array(),      // varchar(100)[]
  categories: text('categories').array(),              // text[]
  scores: integer('scores').array(),                   // integer[]
});
```
