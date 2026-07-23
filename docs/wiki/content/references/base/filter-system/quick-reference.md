---
title: Filter Operators Quick Reference
description: Single-page cheat sheet of all filter operators
difficulty: intermediate
lastUpdated: 2026-07-23
---

# Filter Operators Quick Reference

Every `where` operator, one line each. For the `filter` shape and the mental model, start at the [Filter System Overview](./). For explanations and worked examples, follow the **See** link under each table.

## Comparison Operators

| Operator | SQL | Example | Description |
|---|---|---|---|
| `eq` | `=` | `{ status: { eq: 'active' } }` | Equal to |
| `ne` | `!=` | `{ status: { ne: 'deleted' } }` | Not equal to |
| `neq` | `!=` | `{ status: { neq: 'deleted' } }` | Alias for `ne` |
| `gt` | `>` | `{ age: { gt: 18 } }` | Greater than |
| `gte` | `>=` | `{ age: { gte: 18 } }` | Greater than or equal |
| `lt` | `<` | `{ price: { lt: 100 } }` | Less than |
| `lte` | `<=` | `{ price: { lte: 100 } }` | Less than or equal |

> [!NOTE]
> `ne`/`neq` follow SQL three-valued logic: a row whose field is `NULL` never matches `{ field: { neq: value } }` (`NULL <> value` is UNKNOWN, not TRUE). To include NULL rows too, use `{ or: [{ field: { neq: value } }, { field: null }] }`.

**See:** [Comparison Operators Guide](./comparison-operators.md)

## Null / Presence Operators

| Operator | SQL | Example | Description |
|---|---|---|---|
| `is` | `IS NULL` / `=` | `{ deletedAt: { is: null } }` | `IS NULL` when the value is `null`, equality otherwise |
| `isn` | `IS NOT NULL` / `!=` | `{ email: { isn: null } }` | `IS NOT NULL` when the value is `null`, not-equal otherwise |
| `exists` | `IS NOT NULL` / `IS NULL` | `{ deletedAt: { exists: false } }` | `exists: true` -> `IS NOT NULL`, `exists: false` -> `IS NULL` |
| `notExists` | `IS NULL` / `IS NOT NULL` | `{ verifiedAt: { notExists: true } }` | Inverse of `exists` |

**Shorthand:** a bare `null` is implicit `IS NULL` - `{ deletedAt: null }` is identical to `{ deletedAt: { eq: null } }` or `{ deletedAt: { is: null } }`.

**See:** [Null Operators Guide](./null-operators.md)

## List Operators

| Operator | SQL | Example | Description |
|---|---|---|---|
| `in` | `IN` | `{ status: { in: ['active', 'pending'] } }` | Value matches any in the array |
| `inq` | `IN` | `{ status: { inq: ['active', 'pending'] } }` | Alias for `in` |
| `nin` | `NOT IN` | `{ status: { nin: ['deleted', 'banned'] } }` | Value matches none in the array |

> [!NOTE]
> An empty array is a hard edge: `{ in: [] }` / `{ inq: [] }` match no rows; `{ nin: [] }` matches every row (an empty exclusion list excludes nothing).

**See:** [List Operators Guide](./list-operators.md)

## Range Operators

| Operator | SQL | Example | Description |
|---|---|---|---|
| `between` | `BETWEEN` | `{ age: { between: [18, 65] } }` | Value is within range, inclusive |
| `notBetween` | `NOT BETWEEN` | `{ age: { notBetween: [0, 18] } }` | Value is outside range |

Both require a 2-element array `[min, max]` - anything else throws.

**See:** [Range Operators Guide](./range-operators.md)

## Pattern Matching Operators

| Operator | SQL | Example | Description |
|---|---|---|---|
| `like` | `LIKE` | `{ name: { like: '%john%' } }` | Pattern match, case-sensitive |
| `nlike` | `NOT LIKE` | `{ name: { nlike: '%test%' } }` | Inverse, case-sensitive |
| `ilike` | `ILIKE` | `{ email: { ilike: '%@gmail.com' } }` | Pattern match, case-insensitive |
| `nilike` | `NOT ILIKE` | `{ email: { nilike: '%spam%' } }` | Inverse, case-insensitive |
| `regexp` | `~` | `{ code: { regexp: '^[A-Z]{3}$' } }` | Regular expression (PostgreSQL) |
| `iregexp` | `~*` | `{ code: { iregexp: '^[a-z]{3}$' } }` | Case-insensitive regex (PostgreSQL) |

**Wildcards:** `%` matches any sequence of characters, `_` matches any single character.

**See:** [Pattern Matching Guide](./pattern-matching.md)

## Logical Operators

| Operator | SQL | Example | Description |
|---|---|---|---|
| `and` | `AND` | `{ and: [{ age: { gt: 18 } }, { status: 'active' }] }` | Every condition must be true |
| `or` | `OR` | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` | At least one condition must be true |
| `not` | `NOT (...)` | `{ status: { not: 'archived' } }` / `{ views: { not: { gt: 100 } } }` | Negates the nested condition; a bare value negates `eq` |
| (implicit) | `AND` | `{ status: 'active', age: { gte: 18 } }` | Multiple top-level `where` keys are ANDed together |
| `and: []` | (dropped) | `{ and: [] }` | Vacuously true - no condition added |
| `or: []` | `false` | `{ or: [] }` | Vacuously false - matches no rows |

`not` recurses: `{ not: { gt: 100 } }` becomes `NOT (col > 100)`; `{ not: 5 }` becomes `NOT (col = 5)`; `{ not: null }` becomes `IS NOT NULL`. `exists`/`notExists` also work over JSON paths (`{ 'metadata.score': { exists: true } }`).

**See:** [Logical Operators Guide](./logical-operators.md)

## Array Operators (PostgreSQL)

For array columns (`varchar[]`, `text[]`, `integer[]`, and so on) - not to be confused with `in`/`nin`, which match a scalar against a list.

| Operator | SQL | Example | Description |
|---|---|---|---|
| `contains` | `@>` | `{ tags: { contains: ['typescript', 'nodejs'] } }` | Column array contains ALL given elements |
| `containedBy` | `<@` | `{ tags: { containedBy: ['ts', 'js', 'go', 'rust'] } }` | Column array is a subset of the given array |
| `overlaps` | `&&` | `{ tags: { overlaps: ['react', 'vue', 'angular'] } }` | Arrays share at least one element |

A scalar operand is wrapped into a single-element array automatically.

**See:** [Array Operators Guide](./array-operators.md)

## JSON Path Operators (PostgreSQL)

A dot-notation key targets a JSON/JSONB column instead of a top-level one.

| Syntax | Example | Description |
|---|---|---|
| Dot notation | `{ 'metadata.user.name': 'John' }` | Access a nested property |
| Array index | `{ 'metadata.tags[0]': 'urgent' }` | Access an array element |
| Combined | `{ 'metadata.users[0].email': value }` | Nested arrays and objects |

**Supported operators:** `eq`, `ne`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `inq`, `nin`, `like`, `nlike`, `ilike`, `nilike`, `between`, `notBetween`, `regexp`, `iregexp`, `is`, `isn`, `exists`, `notExists`, `not` - the same as top-level columns, minus the array operators (`contains`/`containedBy`/`overlaps`, which need a real array column).

Numeric operators (`gt`, `gte`, `lt`, `lte`, `between`, `notBetween`, and `eq`/`ne`/`neq`/`in`/`inq`/`nin` when the operand is a number) cast the extracted text to `numeric` automatically, so `{ 'metadata.score': { gt: 80 } }` compares as a number, not a string.

**See:** [JSON Filtering Guide](./json-filtering.md)

## Fields, Order & Pagination

| Property | Syntax | Example | Result |
|---|---|---|---|
| `fields` (array) | `string[]` | `fields: ['id', 'name', 'email']` | `SELECT` only those columns |
| `fields` (object) | `{ field: true }` | `fields: { id: true, name: true }` | Same - inclusion-only, `false` is ignored |
| `order` | `'field ASC'` / `'field DESC'` | `order: ['createdAt DESC']` | `ORDER BY`; default direction is `ASC` (`order: ['name']` = `'name ASC'`) |
| `order` (JSON path) | `'a.b DESC'` | `order: ['metadata.priority DESC']` | `ORDER BY` on a JSON path |
| `limit` | number | `limit: 10` | `LIMIT`; omitted -> `query.limit ?? settings.defaultLimit ?? 10` |
| `skip` | number | `skip: 20` | `OFFSET`; alias of `offset` - `skip` wins if both are given |
| `offset` | number | `offset: 20` | `OFFSET`; alias of `skip` |

**See:** [Fields, Ordering & Pagination Guide](./fields-order-pagination.md)

## Default Filter

A model's `settings.defaultFilter` merges into every read, update, and delete for that model.

| Collision shape | Result |
|---|---|
| Different keys | AND-composed - `{ isDeleted: false }` default + `{ status: 'published' }` caller filter -> `WHERE "isDeleted" = false AND "status" = 'published'` |
| Same key, scalar vs. scalar | Caller wins - the one override escape, no `shouldSkipDefaultFilter` needed |
| Same key, scalar vs. operator object (either side) | AND-composed |
| Same key, both `and` | Concatenated - both groups hold |
| Same key, both `or` | Kept as two separate conjuncts, never unioned |

```typescript
// Skip the default filter entirely
await userRepository.find({
  filter: { where: { status: 'published' } },
  options: { shouldSkipDefaultFilter: true },
});
```

**See:** [Default Filter Guide](./default-filter.md)

## See also

- [Filter System Overview](./) - the `filter` shape, `where` families at a glance, and links to every depth page

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, one handler per operator
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `QueryOperators`/`Sorts` constants
