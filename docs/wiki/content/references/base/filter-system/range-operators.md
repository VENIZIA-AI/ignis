---
title: Range Operators
description: Operators for matching values within or outside a range
difficulty: intermediate
---

# Range Operators

Matches a field against a `[min, max]` range.

| Operator | SQL | Meaning |
|----------|-----|---------|
| `between` | `BETWEEN ... AND ...` | Value is within the range (inclusive) |
| `notBetween` | `NOT (... BETWEEN ... AND ...)` | Value is outside the range |

## between

```typescript
{ where: { price: { between: [100, 500] } } }
// SQL: WHERE "price" BETWEEN 100 AND 500
```

**Notice:** both bounds are inclusive.

**Edge cases:**
- The value must be a 2-element array `[min, max]`; anything else throws `[PostgresQueryOperators][BETWEEN] Invalid value: expected array of 2 elements, got ...`.
- If either bound is `null`, the condition matches no rows (SQL `NULL` comparison).
- If `min > max`, the condition matches no rows.

## notBetween

```typescript
{ where: { score: { notBetween: [40, 60] } } }
// SQL: WHERE NOT ("score" BETWEEN 40 AND 60)
```

**Notice:** matches values strictly outside the range.

**Edge cases:**
- Same 2-element array validation as `between`, throwing `[PostgresQueryOperators][NOT_BETWEEN] Invalid value: expected array of 2 elements, got ...`.
- A `NULL` column matches neither `between` nor `notBetween`.

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Comparison Operators](./comparison-operators) - `gt`/`gte`/`lt`/`lte`, which can express the same range as an alternative to `between`/`notBetween`
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core-server/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/core-server/src/connectors/relational/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/relational/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
