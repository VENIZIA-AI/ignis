---
title: List Operators
description: Operators for matching values against arrays
difficulty: intermediate
---

# List Operators

Matches a field against a set of candidate values.

| Operator | SQL | Meaning |
|----------|-----|---------|
| `in` | `IN` | Value is one of the array |
| `inq` | `IN` | Alias for `in` |
| `nin` | `NOT IN` | Value is none of the array |

## in / inq

```typescript
{ where: { status: { in: ['active', 'pending', 'review'] } } }
// SQL: WHERE "status" IN ('active', 'pending', 'review')
```

**Notice:** `in` and `inq` are the same operator under two names.

**Edge cases:**
- `{ in: [] }` (empty array) matches no rows (`WHERE false`).
- `{ in: 'value' }` (non-array operand) falls back to `=`.
- `{ in: null }` falls back to `= NULL` (not `IS NULL`) and matches no rows; use `is`/`eq` for null checks.

## nin

```typescript
{ where: { status: { nin: ['deleted', 'archived', 'banned'] } } }
// SQL: WHERE "status" NOT IN ('deleted', 'archived', 'banned')
```

**Notice:** `NOT IN` excludes rows where the column is `NULL`.

**Edge cases:**
- Include NULL rows with an explicit `or` branch: `{ or: [{ status: { nin: [...] } }, { status: { is: null } }] }`.
- `{ nin: [] }` (empty array) matches all rows (`WHERE true`).
- `{ nin: 'value' }` (non-array operand) falls back to `!=`.
- `{ nin: null }` falls back to `!= NULL` (not `IS NOT NULL`) and matches no rows.

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Array Operators](./array-operators) - `contains`/`containedBy`/`overlaps` match against array COLUMNS, not to be confused with `in`/`nin`
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/core/src/connectors/relational/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/relational/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
