---
title: Filter Operators Quick Reference
description: Single-page cheat sheet of all filter operators
difficulty: intermediate
lastUpdated: 2026-03-15
---

# Filter Operators Quick Reference

Complete single-page reference for all IGNIS filter operators. For detailed explanations and examples, see the individual operator guides linked below, or start at the [Filter System Overview](./) for the full `filter` shape.

## Comparison Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `eq` | `=` | `{ status: { eq: 'active' } }` | Equal to |
| `ne` | `!=` | `{ status: { ne: 'deleted' } }` | Not equal to |
| `neq` | `!=` | `{ status: { neq: 'deleted' } }` | Not equal to (alias for `ne`) |
| `gt` | `>` | `{ age: { gt: 18 } }` | Greater than |
| `gte` | `>=` | `{ age: { gte: 18 } }` | Greater than or equal |
| `lt` | `<` | `{ price: { lt: 100 } }` | Less than |
| `lte` | `<=` | `{ price: { lte: 100 } }` | Less than or equal |

> [!NOTE]
> `ne`/`neq` follow SQL three-valued logic: a row whose field is `NULL` **never** matches `{ field: { neq: value } }` (`NULL <> value` evaluates to UNKNOWN, not TRUE). To include NULL rows, add `{ or: [{ field: { neq: value } }, { field: null }] }`.

**See:** [Comparison Operators Guide](./comparison-operators.md)


## Range Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `between` | `BETWEEN` | `{ age: { between: [18, 65] } }` | Value is within range (inclusive) |
| `notBetween` | `NOT BETWEEN` | `{ age: { notBetween: [0, 18] } }` | Value is outside range |

**See:** [Range Operators Guide](./range-operators.md)


## List Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `in` | `IN` | `{ status: { in: ['active', 'pending'] } }` | Value matches any in array |
| `inq` | `IN` | `{ status: { inq: ['active', 'pending'] } }` | Alias for `in` |
| `nin` | `NOT IN` | `{ status: { nin: ['deleted', 'banned'] } }` | Value doesn't match any in array |

**See:** [List Operators Guide](./list-operators.md)


## Pattern Matching Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `like` | `LIKE` | `{ name: { like: '%john%' } }` | Pattern match (case-sensitive) |
| `nlike` | `NOT LIKE` | `{ name: { nlike: '%test%' } }` | Inverse pattern match (case-sensitive) |
| `ilike` | `ILIKE` | `{ email: { ilike: '%@gmail.com' } }` | Pattern match (case-insensitive) |
| `nilike` | `NOT ILIKE` | `{ email: { nilike: '%spam%' } }` | Inverse pattern match (case-insensitive) |
| `regexp` | `~` | `{ code: { regexp: '^[A-Z]{3}$' } }` | Regular expression (PostgreSQL) |
| `iregexp` | `~*` | `{ code: { iregexp: '^[a-z]{3}$' } }` | Case-insensitive regex (PostgreSQL) |

**Wildcard Patterns:**
- `%` - Matches any sequence of characters
- `_` - Matches any single character

**See:** [Pattern Matching Guide](./pattern-matching.md)


## Null Check Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `is` | `IS NULL` / `=` | `{ deletedAt: { is: null } }` | IS NULL when value is `null`, equality otherwise |
| `isn` | `IS NOT NULL` / `!=` | `{ email: { isn: null } }` | IS NOT NULL when value is `null`, not-equal otherwise |

**Shorthand Syntax:**
```typescript
// Direct null assignment (implicit IS NULL)
{ deletedAt: null }
// SQL: WHERE "deleted_at" IS NULL

// Using eq with null
{ deletedAt: { eq: null } }
// SQL: WHERE "deleted_at" IS NULL

// Using ne with null
{ deletedAt: { ne: null } }
// SQL: WHERE "deleted_at" IS NOT NULL
```

**See:** [Null Operators Guide](./null-operators.md)


## Presence & Negation Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `exists` | `IS NOT NULL` / `IS NULL` | `{ deletedAt: { exists: false } }` | `exists: true` -> IS NOT NULL, `exists: false` -> IS NULL |
| `notExists` | `IS NULL` / `IS NOT NULL` | `{ verifiedAt: { notExists: true } }` | Inverse of `exists` (`notExists: true` -> IS NULL) |
| `not` | `NOT (...)` | `{ status: { not: 'archived' } }` / `{ views: { not: { gt: 100 } } }` | Negates the nested condition; a bare value negates `eq` |

`exists`/`notExists`/`not` are supported on the PostgreSQL connector. `not` recurses: `{ not: { gt: 100 } }` becomes `NOT (col > 100)`, and `{ not: 5 }` becomes `NOT (col = 5)`. `exists` also works over JSON paths on PostgreSQL (`{ 'metadata.score': { exists: true } }`).

**See:** [Null Operators Guide](./null-operators.md) (`exists`/`notExists`), [Logical Operators Guide](./logical-operators.md) (`not`)


## Logical Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `and` | `AND` | `{ and: [{ age: { gt: 18 } }, { status: 'active' }] }` | All conditions must be true |
| `or` | `OR` | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` | At least one condition must be true |
| `and: []` | (dropped) | `{ and: [] }` | Vacuously true - no condition added to the query |
| `or: []` | `false` | `{ or: [] }` | Vacuously false - matches no rows |

**Implicit AND:**
```typescript
// Multiple fields = implicit AND
{
  status: 'active',
  age: { gte: 18 },
  role: 'user'
}
// WHERE status = 'active' AND age >= 18 AND role = 'user'
```

**NOT logic** is expressed via the general-purpose `not` operator (`{ field: { not: <value | operatorObject> } }`) or the dedicated negation operators (`ne`, `neq`, `nin`, `nlike`, `nilike`, `notBetween`, `isn`).

**See:** [Logical Operators Guide](./logical-operators.md)


## PostgreSQL Array Operators

These operators work with PostgreSQL array columns (`varchar[]`, `text[]`, `integer[]`, etc.).

| Operator | PostgreSQL | TypeScript Example | Description |
|----------|------------|-------------------|-------------|
| `contains` | `@>` | `{ tags: { contains: ['typescript', 'nodejs'] } }` | Array contains **ALL** specified elements |
| `containedBy` | `<@` | `{ tags: { containedBy: ['ts', 'js', 'go', 'rust'] } }` | Array is subset of specified array |
| `overlaps` | `&&` | `{ tags: { overlaps: ['react', 'vue', 'angular'] } }` | Arrays have at least one common element |

**Important:** These are array-specific operators, not to be confused with `in`/`nin` which match scalar values against an array.

**See:** [Array Operators Guide](./array-operators.md)


## JSON/JSONB Operators (PostgreSQL)

Query nested fields within JSON/JSONB columns using dot notation as the key.

### JSON Path Syntax

| Syntax | Example | Description |
|--------|---------|-------------|
| Dot notation | `{ 'metadata.user.name': 'John' }` | Access nested properties |
| Array index | `{ 'metadata.tags[0]': 'urgent' }` | Access array elements |
| Combined | `{ 'metadata.users[0].email': value }` | Nested arrays and objects |

### JSON Path with Operators

```typescript
// Equality (string comparison via #>>)
{ 'metadata.user.role': 'admin' }
// SQL: "metadata" #>> '{user,role}' = 'admin'

// Numeric comparison (safe casting via CASE/numeric)
{ 'metadata.score': { gt: 80 } }

// Pattern matching
{ 'metadata.level': { ilike: '%high%' } }
// SQL: "metadata" #>> '{level}' ILIKE '%high%'

// Multiple JSON conditions
{
  and: [
    { 'metadata.user.age': { gt: 18 } },
    { 'metadata.user.country': 'US' }
  ]
}
```

### Supported Operators with JSON Paths

All comparison operators work with JSON path queries:
- `eq`, `ne`, `neq`, `gt`, `gte`, `lt`, `lte`
- `in`, `inq`, `nin`
- `like`, `nlike`, `ilike`, `nilike`
- `between`, `notBetween`
- `regexp`, `iregexp`
- `is`, `isn`
- `exists`, `notExists`, `not`

Numeric operators (`gt`, `gte`, `lt`, `lte`, `between`, `notBetween`) use safe numeric casting to handle mixed JSON value types.

**See:** [JSON Filtering Guide](./json-filtering.md)


## Fields, Ordering & Pagination

### Select Specific Fields

```typescript
const users = await userRepository.find({
  filter: {
    where: { isActive: true },
    fields: ['id', 'name', 'email'], // Only return these fields
  }
});
```

### Ordering

```typescript
// Single field
{ order: ['createdAt DESC'] }

// Multiple fields
{ order: ['status ASC', 'createdAt DESC'] }

// Default direction is ASC
{ order: ['name'] }  // Same as 'name ASC'

// JSON path ordering
{ order: ['metadata.priority DESC'] }
```

### Pagination

```typescript
{
  limit: 10,   // Max records to return (default: 10)
  skip: 20,    // Skip first 20 records (alias: offset)
}

// Page 3 with 10 items per page
{
  limit: 10,
  skip: 20, // (page - 1) * limit = (3 - 1) * 10
}
```

**See:** [Fields, Ordering & Pagination Guide](./fields-order-pagination.md)


## Default Filters

Automatically apply filters to all repository queries (e.g., soft delete, multi-tenant).

```typescript
@model({
  type: 'entity',
  settings: {
    defaultFilter: {
      where: { isDeleted: false },
      limit: 100,
    },
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
}

// All queries automatically include the default filter
await userRepository.find({ filter: {} });
// WHERE isDeleted = false LIMIT 100

// Skip default filter for admin operations
await userRepository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});
// No automatic filter applied
```

**See:** [Default Filter Guide](./default-filter.md)

## See also

- [Filter System Overview](./) - the `filter` shape, `where` families at a glance, and links to every depth page

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `QueryOperators`/`Sorts` constants
