---
title: Logical Operators
description: Combine multiple conditions with AND and OR logic
difficulty: intermediate
---

# Logical Operators

Combine multiple conditions with AND and OR logic.

| Form | Where shape | SQL |
|------|-------------|-----|
| Implicit AND | multiple keys in one object | `AND` between each key |
| Explicit AND | `{ and: [...] }` | `AND` between grouped clauses |
| OR | `{ or: [...] }` | `OR` between grouped clauses |
| NOT | `{ field: { not: ... } }` | `NOT (...)` around the negated condition |


## Implicit AND

Multiple conditions in the same object combine with AND.

```typescript
{ where: { status: 'active', role: 'admin', verified: true } }
// SQL: WHERE "status" = 'active' AND "role" = 'admin' AND "verified" = true
```


## Explicit AND

Use an `and` array to group conditions explicitly.

```typescript
{
  where: {
    and: [
      { status: 'active' },
      { role: { in: ['admin', 'moderator'] } },
    ]
  }
}
// SQL: WHERE ("status" = 'active') AND ("role" IN ('admin', 'moderator'))
```


## OR

Use an `or` array to match any of several conditions.

```typescript
{
  where: {
    or: [
      { status: 'active' },
      { isPublished: true },
    ]
  }
}
// SQL: WHERE ("status" = 'active') OR ("is_published" = true)
```


## NOT

`not` negates whatever it wraps: a bare value negates `eq`, a nested operator object negates that operator.

```typescript
{ where: { status: { not: 'archived' } } }
// SQL: WHERE NOT ("status" = 'archived')

{ where: { views: { not: { gt: 100 } } } }
// SQL: WHERE NOT ("views" > 100)
```

> [!NOTE]
> `not` is supported on the PostgreSQL connector. The dedicated negation operators below are often clearer for a single condition.


## Dedicated Negation Operators

| Operator | Example | SQL |
|----------|---------|-----|
| `ne` / `neq` | `{ status: { ne: 'deleted' } }` | `!=` |
| `nin` | `{ status: { nin: ['deleted', 'banned'] } }` | `NOT IN` |
| `nlike` | `{ email: { nlike: '%@test.com' } }` | `NOT LIKE` |
| `nilike` | `{ email: { nilike: '%@test.com' } }` | `NOT ILIKE` |
| `isn` / `ne: null` | `{ verifiedAt: { isn: null } }` | `IS NOT NULL` |
| `notBetween` | `{ score: { notBetween: [40, 60] } }` | `NOT BETWEEN` |

> [!NOTE]
> `ne`/`neq`/`nin` follow SQL three-valued logic - a row whose field is `NULL` never matches them (`NULL <> value` is UNKNOWN, not TRUE). Use `exists`/`notExists` or an explicit `{ field: null }` branch to include NULL rows.


## Nested AND/OR

Combine AND and OR for multi-level logic.

```typescript
// (status = 'active' AND verified = true) OR (role = 'admin')
{
  where: {
    or: [
      { and: [{ status: 'active' }, { verified: true }] },
      { role: 'admin' },
    ]
  }
}
```

A top-level key alongside `or` ANDs with it - these two filters are equivalent:

```typescript
// status = 'active' AND (role = 'admin' OR role = 'moderator')
{ where: { status: 'active', or: [{ role: 'admin' }, { role: 'moderator' }] } }

// Same result, using in instead
{ where: { status: 'active', role: { in: ['admin', 'moderator'] } } }
```


## Empty Groups

An empty `and`/`or` array is not a no-op - each resolves to what the operator means with zero conditions.

```typescript
{ where: { and: [] } }
// Vacuously TRUE - dropped from the query entirely, no condition added

{ where: { or: [] } }
// SQL: WHERE false - vacuously FALSE, matches nothing
```

> [!NOTE]
> This matters for a caller-built list, e.g. `{ or: permittedOrgIds.map(id => ({ orgId: id })) }`: an empty permission list must return zero rows, so `or: []` matching nothing is the safe default.


## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Null Operators](./null-operators) - `isn`, one of the dedicated negation operators above
- [Comparison Operators](./comparison-operators) - `ne`/`neq`, the other dedicated negation operators
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/connectors/src/relational/core/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/filter.ts) - `FilterBuilder`, `buildLogicalGroupCondition`/`buildNotCondition`
- [`packages/connectors/src/relational/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators` constants
