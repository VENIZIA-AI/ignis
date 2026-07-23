---
title: JSON/JSONB Filtering
description: Query nested fields within JSON/JSONB columns using dot notation
difficulty: intermediate
---

# JSON/JSONB Filtering

Query nested fields within JSON/JSONB columns using dot notation. PostgreSQL-specific.

| Format | Example | SQL path |
|--------|---------|----------|
| Simple field | `metadata.name` | `{name}` |
| Nested field | `metadata.user.email` | `{user,email}` |
| Array index | `metadata.tags[0]` | `{tags,0}` |
| Nested with array | `metadata.items[2].name` | `{items,2,name}` |
| Kebab-case | `metadata.user-id` | `{user-id}` |

> [!NOTE]
> A key is recognized as a JSON path if it contains a `.` or `[`. The column named by the first path segment must be a `json`/`jsonb` column, or the query throws.


## Basic Usage

```typescript
// Column: metadata jsonb
// Data: { "user": { "id": 123, "role": "admin" } }

{ where: { 'metadata.user.role': 'admin' } }
// SQL: "metadata" #>> '{user,role}' = 'admin'
```

All standard operators work with a JSON path key:

```typescript
{ where: { 'metadata.score': { gt: 80 } } }
{ where: { 'metadata.level': { ilike: '%high%' } } }
{ where: { 'metadata.status': { in: ['pending', 'review'] } } }
{ where: { 'metadata.code': { regexp: '^[A-Z]+$' } } }
```

> [!NOTE]
> If the path does not exist in a row's JSON, `#>>` returns `NULL` - the row is safely excluded, never an error.


## Numeric Casting

A JSON `#>>` extraction is text, so a numeric comparison needs a cast or Postgres raises `operator does not exist`. IGNIS wraps the extraction in a safe `CASE` expression, decided per operator:

```typescript
{ where: { 'metadata.score': { gt: 50 } } }
// SQL: CASE WHEN ("metadata" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//      THEN ("metadata" #>> '{score}')::numeric ELSE NULL END > 50
```

| Operators | Casts to numeric when... |
|-----------|---------------------------|
| `gt`, `gte`, `lt`, `lte` | the operand is a `number` |
| `between`, `notBetween` | both bounds are numbers |
| `eq`, `ne`, `neq` | the operand is a `number` |
| `in`, `inq`, `nin` | every array element is a `number` |
| `like`, `ilike`, `nlike`, `nilike`, `regexp`, `iregexp` | never - always text |
| direct value (no operator object) | the value is `typeof number` |

> [!NOTE]
> A numeric-looking string still passes the cast (`"85"` -> `85`); a non-numeric string or `null` falls through to `NULL` and never matches.

The cast applies per operator, not once for the whole object - a mixed object casts only the operators that need it:

```typescript
{ where: { 'metadata.score': { gte: 1, like: '%a%' } } }
// gte casts to numeric; like stays text - both read the same #>> extraction
```

`not` recurses into whatever it wraps, so a numeric operator nested under `not` still gets cast:

```typescript
{ where: { 'metadata.score': { not: { gt: 50 } } } }
// SQL: NOT (CASE WHEN ("metadata" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//           THEN ("metadata" #>> '{score}')::numeric ELSE NULL END > 50)
```


## Ordering

```typescript
{ order: ['metadata.priority DESC'] }
// SQL: ORDER BY "metadata" #> '{priority}' DESC
```

> [!NOTE]
> Ordering uses `#>` (returns JSONB, preserves native type ordering); `where` uses `#>>` (returns text) instead.


## Path Validation

Every path component must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/` - a letter/underscore start followed by letters, digits, underscore or hyphen, or a bare digit run for an array index.

```typescript
'metadata.fieldName'        // valid
'data.meta-data'            // valid - kebab-case allowed
'data.123invalid'           // invalid - starts with a digit outside array-index context
'metadata.field;DROP TABLE' // invalid - throws
```

> [!NOTE]
> A path on a non-JSON/JSONB column also throws: `Column 'name' is not JSON/JSONB type`.


## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Fields, Order & Pagination](./fields-order-pagination) - JSON path ordering (`#>`, sorted by native JSONB type)
- [Pattern Matching](./pattern-matching) - `like`/`ilike`/`regexp` also work on a JSON path, with no numeric casting
- [Nested JSON Updates](../repositories/advanced.md#nested-json-updates) - writing to JSON paths
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, `buildJsonWhereCondition`/`buildJsonOperatorConditions`/`buildJsonOrderBy`
- [`packages/core/src/connectors/postgres/repositories/dialect/internal/json-utils.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/internal/json-utils.ts) - `isJsonPath`, `parseJsonPath`, path validation regex
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `QueryOperators` constants
