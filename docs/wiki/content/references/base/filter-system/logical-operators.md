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


## Empty Groups

An empty `and`/`or` array is not a no-op -- each empty case resolves to what the operator means with zero conditions:

```typescript
// Empty AND is vacuously TRUE - dropped from the query entirely
{ where: { and: [] } }
// SQL: (no condition added)

// Empty OR is vacuously FALSE - compiles to a condition that matches nothing
{ where: { or: [] } }
// SQL: WHERE false
```

This matters when the array is built from a caller-supplied list, e.g. `{ or: permittedOrgIds.map(id => ({ orgId: id })) }`: an empty permission list must return zero rows, not every row, so `or: []` matching nothing is the safe default.


## NOT Logic

IGNIS has a general-purpose `not` operator that negates whatever condition it wraps - a bare value negates `eq`, and a nested operator object negates that operator. It is supported on the PostgreSQL connector:

```typescript
// NOT equal (bare value negates eq)
{ where: { status: { not: 'archived' } } }
// SQL: WHERE NOT ("status" = 'archived')

// Negate a nested operator condition
{ where: { views: { not: { gt: 100 } } } }
// SQL: WHERE NOT ("views" > 100)
```

The dedicated negation operators remain available and are often clearer for a single condition:

```typescript
// NOT equal
{ where: { status: { ne: 'deleted' } } }
{ where: { status: { neq: 'deleted' } } }

// NOT IN
{ where: { status: { nin: ['deleted', 'banned'] } } }

// NOT LIKE
{ where: { email: { nlike: '%@test.com' } } }

// NOT ILIKE
{ where: { email: { nilike: '%@test.com' } } }

// IS NOT NULL
{ where: { verifiedAt: { isn: null } } }
{ where: { verifiedAt: { ne: null } } }

// NOT BETWEEN
{ where: { score: { notBetween: [40, 60] } } }
```

> [!NOTE]
> `ne`/`neq`/`nin` follow SQL three-valued logic - a row whose field is `NULL` never matches them (`NULL <> value` is UNKNOWN, not TRUE). Use `exists`/`notExists` or an explicit `{ field: null }` branch when you need NULL rows in the result.


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
