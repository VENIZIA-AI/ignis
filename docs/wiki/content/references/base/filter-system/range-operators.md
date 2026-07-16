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
> The value MUST be an array with exactly 2 elements `[min, max]`. Invalid values throw an error:
> ```
> Error: [BETWEEN] Invalid value: expected array of 2 elements, got ...
> ```


## notBetween

Find values outside a range:

```typescript
{ where: { score: { notBetween: [40, 60] } } }
// SQL: WHERE NOT ("score" BETWEEN 40 AND 60)
// Matches: scores < 40 OR scores > 60
```

> [!WARNING]
> Same validation as `between` -- the value MUST be an array with exactly 2 elements.


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

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Comparison Operators](./comparison-operators) - `gt`/`gte`/`lt`/`lte`, the building blocks of the `gte`/`lte` equivalent above
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `QueryOperators` constants
