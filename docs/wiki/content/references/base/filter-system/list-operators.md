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

## inSql / ninSql - a subquery

To keep the rows whose id appears in another table, pass a Drizzle subquery instead of a list of ids:

```typescript
import { sql } from 'drizzle-orm';

const taggedRed = sql`SELECT ${tagTable.orderId} FROM ${tagTable} WHERE ${tagTable.label} = ${label}`;

const orders = await orderRepository.find({ filter: { where: { id: { inSql: taggedRed } } } });
// WHERE "order"."id" in (SELECT "tag"."order_id" FROM "tag" WHERE "tag"."label" = $1)
```

The database runs one query, with no id list in between and no cap on its size. `inSql` works wherever `where` does: `find`, `findOne`, `count`, update and delete wheres, nested `and`/`or`, and merged with the default filter.

- **Server code only.** The operand must be a Drizzle `SQL` or `SQLWrapper` built in your code, with values bound through `${}`. A string is refused with a 400, and a filter that arrives as JSON over HTTP cannot carry one.
- **The subquery returns one column.** It is compared with the key's column.
- **An empty subquery** matches nothing under `inSql` and everything under `ninSql`.
- **`ninSql` and NULL.** If the subquery returns a NULL, `NOT IN` matches no row, as in SQL. Add `WHERE ... IS NOT NULL` to the subquery when the column can be NULL.
- **Relational only.** Typesense and Meilisearch refuse both operators with a 400.

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Array Operators](./array-operators) - `contains`/`containedBy`/`overlaps` match against array COLUMNS, not to be confused with `in`/`nin`
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/connectors/src/relational/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/connectors/src/relational/core/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
