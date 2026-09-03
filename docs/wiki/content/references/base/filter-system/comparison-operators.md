---
title: Comparison Operators
description: Equality and comparison operators for filtering records
difficulty: intermediate
---

# Comparison Operators

Compares a field against a value: equality, inequality, and ordering.

| Operator | SQL | Meaning |
|----------|-----|---------|
| `eq` | `=` / `IS NULL` | Equal to |
| `ne` | `!=` / `IS NOT NULL` | Not equal to |
| `neq` | `!=` / `IS NOT NULL` | Alias for `ne` |
| `gt` | `>` | Greater than |
| `gte` | `>=` | Greater than or equal |
| `lt` | `<` | Less than |
| `lte` | `<=` | Less than or equal |

## eq

```typescript
{ where: { status: { eq: 'active' } } }
// SQL: WHERE "status" = 'active'
```

**Notice:** the bare shorthand `{ status: 'active' }` (no operator key) means the same thing.

**Edge cases:**
- `{ eq: null }` compiles to `IS NULL`, never `= NULL`.
- Bare array `{ field: [1, 2, 3] }` (no operator key) compiles to `IN (1, 2, 3)`.
- An explicit `{ eq: [1, 2, 3] }` does not become `IN` - it compares the column to an array value.
- Bare empty array `{ field: [] }` matches no rows (`WHERE false`).

## ne / neq

```typescript
{ where: { status: { ne: 'deleted' } } }
// SQL: WHERE "status" != 'deleted'
```

**Notice:** `ne` and `neq` are the same operator under two names.

**Edge cases:**
- `{ ne: null }` compiles to `IS NOT NULL`.
- SQL three-valued logic applies: a `NULL` field never matches `{ ne: value }`, because `NULL <> value` is UNKNOWN.
- Add an `or` branch to include NULL rows: `{ or: [{ field: { ne: value } }, { field: null }] }`.

## gt

```typescript
{ where: { price: { gt: 100 } } }
// SQL: WHERE "price" > 100
```

**Notice:** works on numbers, dates, and strings (lexicographic comparison).

**Edge cases:**
- `{ gt: null }` compiles to `"price" > NULL`, which is never true - no rows match.
- Use `is`/`exists` instead to check for null.
- Combine with other operators in the same object: `{ gte: 18, lt: 65 }`.

## gte

```typescript
{ where: { quantity: { gte: 10 } } }
// SQL: WHERE "quantity" >= 10
```

**Notice:** inclusive of the boundary value.

**Edge cases:**
- Same null behavior as `gt`: `{ gte: null }` matches no rows.

## lt

```typescript
{ where: { stock: { lt: 5 } } }
// SQL: WHERE "stock" < 5
```

**Notice:** exclusive of the boundary value.

**Edge cases:**
- Same null behavior as `gt`: `{ lt: null }` matches no rows.

## lte

```typescript
{ where: { rating: { lte: 3 } } }
// SQL: WHERE "rating" <= 3
```

**Notice:** inclusive of the boundary value.

**Edge cases:**
- Same null behavior as `gt`: `{ lte: null }` matches no rows.

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Range Operators](./range-operators) - `between`/`notBetween`, and the `gte`/`lte` equivalent shown above
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core-server/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/core-server/src/connectors/relational/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/relational/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
