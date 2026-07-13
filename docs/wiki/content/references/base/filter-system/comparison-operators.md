---
title: Comparison Operators
description: Equality and comparison operators for filtering records
difficulty: intermediate
---

# Comparison Operators

Equality and comparison operators for filtering records.


## eq - Equal To

Matches records where field equals the value.

```typescript
// Implicit equality
{ where: { status: 'active' } }

// Explicit form
{ where: { status: { eq: 'active' } } }

// SQL: WHERE "status" = 'active'
```

**Special Cases:**
```typescript
// Null equality
{ where: { deletedAt: null } }
{ where: { deletedAt: { eq: null } } }
// SQL: WHERE "deleted_at" IS NULL

// Array shorthand (becomes IN)
{ where: { id: [1, 2, 3] } }
// SQL: WHERE "id" IN (1, 2, 3)

// Empty array shorthand
{ where: { id: [] } }
// SQL: WHERE false (no results)
```


## ne / neq - Not Equal To

Matches records where field does NOT equal the value. Both `ne` and `neq` are aliases and behave identically.

```typescript
{ where: { status: { ne: 'deleted' } } }
{ where: { status: { neq: 'deleted' } } }  // Alias

// SQL: WHERE "status" != 'deleted'

// Null handling
{ where: { deletedAt: { ne: null } } }
{ where: { deletedAt: { neq: null } } }
// SQL: WHERE "deleted_at" IS NOT NULL
```

> [!NOTE]
> When compared against a **real value** (not `null`), `ne`/`neq` follow SQL three-valued logic: a row whose field is `NULL` never matches `{ field: { neq: value } }`, because `NULL <> value` evaluates to UNKNOWN rather than TRUE. To include NULL rows, add an explicit branch: `{ or: [{ field: { neq: value } }, { field: null }] }`.


## gt - Greater Than

```typescript
// Numbers
{ where: { price: { gt: 100 } } }
// SQL: WHERE "price" > 100

// Dates
{ where: { createdAt: { gt: new Date('2024-01-01') } } }
// SQL: WHERE "created_at" > '2024-01-01'

// Strings (lexicographic)
{ where: { name: { gt: 'M' } } }
// SQL: WHERE "name" > 'M'
```


## gte - Greater Than or Equal

```typescript
{ where: { quantity: { gte: 10 } } }
// SQL: WHERE "quantity" >= 10

// Combined with other operators
{ where: { age: { gte: 18, lt: 65 } } }
// SQL: WHERE "age" >= 18 AND "age" < 65
```


## lt - Less Than

```typescript
{ where: { stock: { lt: 5 } } }
// SQL: WHERE "stock" < 5
```


## lte - Less Than or Equal

```typescript
{ where: { rating: { lte: 3 } } }
// SQL: WHERE "rating" <= 3
```


## Summary

| Operator | SQL | Description |
|----------|-----|-------------|
| `eq` | `=` / `IS NULL` | Equal to (handles null) |
| `ne` | `!=` / `IS NOT NULL` | Not equal to (handles null) |
| `neq` | `!=` / `IS NOT NULL` | Alias for `ne` |
| `gt` | `>` | Greater than |
| `gte` | `>=` | Greater than or equal |
| `lt` | `<` | Less than |
| `lte` | `<=` | Less than or equal |
