---
title: Null Check Operators
description: Operators for checking null and non-null values
difficulty: intermediate
---

# Null Check Operators

Checks whether a field is `NULL` or has a value, without comparing to a specific value.

| Operator | SQL | Meaning |
|----------|-----|---------|
| `is` | `IS NULL` / `=` | Null check or equality |
| `isn` | `IS NOT NULL` / `!=` | Not-null check or inequality |
| `exists` | `IS NOT NULL` / `IS NULL` | Presence check |
| `notExists` | `IS NULL` / `IS NOT NULL` | Inverse presence check |

## is

```typescript
{ where: { deletedAt: { is: null } } }
// SQL: WHERE "deleted_at" IS NULL
```

**Notice:** `is` behaves exactly like `eq` - `is: null` compiles to `IS NULL`, `is: <value>` compiles to `=`.

**Edge cases:**
- The bare shorthand `{ deletedAt: null }` (no operator key) is identical to `{ deletedAt: { is: null } }`.
- `{ is: 'active' }` compiles to `"status" = 'active'`, the same as `eq`.

## isn

```typescript
{ where: { verifiedAt: { isn: null } } }
// SQL: WHERE "verified_at" IS NOT NULL
```

**Notice:** `isn` behaves exactly like `ne`/`neq` - `isn: null` compiles to `IS NOT NULL`, `isn: <value>` compiles to `!=`.

**Edge cases:**
- Same three-valued-logic caveat as `ne`: `{ isn: value }` for a real `value` never matches a `NULL` row.

## exists

```typescript
{ where: { verifiedAt: { exists: true } } }
// SQL: WHERE "verified_at" IS NOT NULL
```

**Notice:** `exists` takes a boolean, not a value - `exists: false` compiles to `IS NULL`, anything else compiles to `IS NOT NULL`.

**Edge cases:**
- Only the literal `false` selects the `IS NULL` branch.
- Any other operand, including `0` or a truthy string, selects `IS NOT NULL`.
- Also works over a JSON path key, for example `{ 'metadata.score': { exists: true } }`.

## notExists

```typescript
{ where: { verifiedAt: { notExists: true } } }
// SQL: WHERE "verified_at" IS NULL
```

**Notice:** the inverse of `exists` - `notExists: false` compiles to `IS NOT NULL`, anything else compiles to `IS NULL`.

**Edge cases:**
- Same `false`-only branch rule as `exists`.

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Logical Operators](./logical-operators) - `not`, the general-purpose negation operator
- [JSON Filtering](./json-filtering) - `exists` also works over a `'column.path'` key
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
