---
title: Range Operators
description: Operators for matching values within or outside a range
difficulty: intermediate
---

# Range Operators

Operators for matching values within or outside a range.


## between

Find values within a range (inclusive):

```typescript
// Numeric range
{ where: { price: { between: [100, 500] } } }
// SQL: WHERE "price" BETWEEN 100 AND 500

// Date range
{
  where: {
    createdAt: {
      between: [new Date('2024-01-01'), new Date('2024-12-31')]
    }
  }
}
// SQL: WHERE "created_at" BETWEEN '2024-01-01' AND '2024-12-31'

// String range (lexicographic)
{ where: { lastName: { between: ['A', 'M'] } } }
// SQL: WHERE "last_name" BETWEEN 'A' AND 'M'
```

> [!WARNING]
> The value MUST be an array with exactly 2 elements `[min, max]`. Invalid values throw an error.


## notBetween

Find values outside a range:

```typescript
{ where: { score: { notBetween: [40, 60] } } }
// SQL: WHERE NOT ("score" BETWEEN 40 AND 60)
// Matches: scores < 40 OR scores > 60
```


## Alternative: Using gte/lte

You can also express ranges using comparison operators:

```typescript
// Equivalent to between: [100, 500]
{ where: { price: { gte: 100, lte: 500 } } }
// SQL: WHERE "price" >= 100 AND "price" <= 500

// Exclusive range (not including boundaries)
{ where: { price: { gt: 100, lt: 500 } } }
// SQL: WHERE "price" > 100 AND "price" < 500
```
