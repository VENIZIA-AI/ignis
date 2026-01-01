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
```


## ne / neq - Not Equal To

Matches records where field does NOT equal the value.

```typescript
{ where: { status: { ne: 'deleted' } } }
{ where: { status: { neq: 'deleted' } } }  // Alias

// SQL: WHERE "status" != 'deleted'

// Null handling
{ where: { deletedAt: { ne: null } } }
// SQL: WHERE "deleted_at" IS NOT NULL
```


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
| `eq` | `=` | Equal to |
| `ne` / `neq` | `!=` | Not equal to |
| `gt` | `>` | Greater than |
| `gte` | `>=` | Greater than or equal |
| `lt` | `<` | Less than |
| `lte` | `<=` | Less than or equal |
