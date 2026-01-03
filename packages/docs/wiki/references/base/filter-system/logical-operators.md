---
title: Logical Operators
description: Combine multiple conditions with AND and OR logic
difficulty: intermediate
---

# Logical Operators

Combine multiple conditions with AND and OR logic.


## Implicit AND

Multiple conditions in the same object are combined with AND:

```typescript
{
  where: {
    status: 'active',
    role: 'admin',
    verified: true,
  }
}
// SQL: WHERE "status" = 'active' AND "role" = 'admin' AND "verified" = true
```


## Explicit AND

Use `and` array for explicit AND conditions:

```typescript
{
  where: {
    and: [
      { status: 'active' },
      { role: { in: ['admin', 'moderator'] } },
      { createdAt: { gte: new Date('2024-01-01') } },
    ]
  }
}
// SQL: WHERE ("status" = 'active')
//        AND ("role" IN ('admin', 'moderator'))
//        AND ("created_at" >= '2024-01-01')
```


## OR Operator

Use `or` array for OR conditions:

```typescript
{
  where: {
    or: [
      { status: 'active' },
      { isPublished: true },
      { featured: true },
    ]
  }
}
// SQL: WHERE ("status" = 'active')
//         OR ("is_published" = true)
//         OR ("featured" = true)
```


## Nested AND/OR

Combine AND and OR for complex logic:

```typescript
// (status = 'active' AND verified = true) OR (role = 'admin')
{
  where: {
    or: [
      {
        and: [
          { status: 'active' },
          { verified: true },
        ]
      },
      { role: 'admin' },
    ]
  }
}

// status = 'active' AND (role = 'admin' OR role = 'moderator')
{
  where: {
    status: 'active',
    or: [
      { role: 'admin' },
      { role: 'moderator' },
    ]
  }
}
// Equivalent to:
{
  where: {
    status: 'active',
    role: { in: ['admin', 'moderator'] },
  }
}
```


## NOT Logic

Use negation operators for NOT conditions:

```typescript
// NOT equal
{ where: { status: { ne: 'deleted' } } }

// NOT IN
{ where: { status: { nin: ['deleted', 'banned'] } } }

// NOT LIKE
{ where: { email: { nlike: '%@test.com' } } }

// NOT NULL
{ where: { verifiedAt: { isn: null } } }

// NOT BETWEEN
{ where: { score: { notBetween: [40, 60] } } }
```


## Complex Example

```typescript
// Find active products that are either:
// - Featured with high rating, OR
// - On sale with good stock
{
  where: {
    status: 'active',
    deletedAt: { is: null },
    or: [
      {
        and: [
          { featured: true },
          { rating: { gte: 4.5 } }
        ]
      },
      {
        and: [
          { onSale: true },
          { stock: { gte: 10 } }
        ]
      }
    ]
  }
}
```
