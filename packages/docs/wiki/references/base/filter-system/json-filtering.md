---
title: JSON/JSONB Filtering
description: Query nested fields within JSON/JSONB columns using dot notation
difficulty: intermediate
---

# JSON/JSONB Filtering

Query nested fields within JSON/JSONB columns using dot notation. This is a PostgreSQL-specific feature.


## Basic JSON Path Syntax

JSON paths are expressed as dot-notation keys in the `where` clause. A key is recognized as a JSON path if it contains a `.` or `[`.

```typescript
// Column: metadata jsonb
// Data: { "user": { "id": 123, "role": "admin" }, "tags": ["urgent"] }

// Simple nested field
{ where: { 'metadata.user.id': 123 } }
// SQL: CASE WHEN ("metadata" #>> '{user,id}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//      THEN ("metadata" #>> '{user,id}')::numeric ELSE NULL END = 123

// String field (no numeric casting)
{ where: { 'metadata.user.role': 'admin' } }
// SQL: "metadata" #>> '{user,role}' = 'admin'

// Array index access
{ where: { 'metadata.tags[0]': 'urgent' } }
// SQL: "metadata" #>> '{tags,0}' = 'urgent'

// Kebab-case keys
{ where: { 'metadata.user-id': 'abc123' } }
// SQL: "metadata" #>> '{user-id}' = 'abc123'
```


## Supported Path Formats

| Format | Example | SQL Path |
|--------|---------|----------|
| Simple field | `metadata.name` | `{name}` |
| Nested field | `metadata.user.email` | `{user,email}` |
| Array index | `metadata.tags[0]` | `{tags,0}` |
| Nested with array | `metadata.items[2].name` | `{items,2,name}` |
| Kebab-case | `metadata.user-id` | `{user-id}` |


## JSON with Operators

All standard operators work with JSON paths:

```typescript
// Numeric comparison (automatic safe casting)
{ where: { 'metadata.score': { gt: 80 } } }
// SQL: CASE WHEN ("metadata" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//      THEN ("metadata" #>> '{score}')::numeric ELSE NULL END > 80

// Range comparison
{ where: { 'metadata.priority': { gte: 1, lte: 5 } } }

// Between
{ where: { 'metadata.score': { between: [70, 90] } } }

// Pattern matching (text comparison, no numeric casting)
{ where: { 'metadata.level': { ilike: '%high%' } } }
// SQL: "metadata" #>> '{level}' ILIKE '%high%'

// IN operator (text comparison)
{ where: { 'metadata.status': { in: ['pending', 'review'] } } }

// Regex
{ where: { 'metadata.code': { regexp: '^[A-Z]+$' } } }
// SQL: "metadata" #>> '{code}' ~ '^[A-Z]+$'

// Not equal
{ where: { 'metadata.type': { ne: 'draft' } } }
// SQL: "metadata" #>> '{type}' != 'draft'
```


## Safe Numeric Casting

When a numeric comparison operator (`gt`, `gte`, `lt`, `lte`, `between`, `notBetween`) is used with a JSON path, Ignis wraps the extraction in a safe CASE expression. This prevents database errors when JSON fields contain mixed types:

```typescript
// Data in database:
// Row 1: { "score": 85 }      <- number
// Row 2: { "score": "high" }  <- string
// Row 3: { "score": null }    <- null

// Query with numeric operator
{ where: { 'metadata.score': { gt: 50 } } }

// Generated SQL:
// CASE WHEN ("metadata" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//   THEN ("metadata" #>> '{score}')::numeric
//   ELSE NULL
// END > 50

// Result:
// Row 1: 85 > 50 -> matched
// Row 2: "high" -> NULL -> not matched
// Row 3: null -> NULL -> not matched
```

| JSON Value | Numeric Operation Result |
|------------|-------------------------|
| `{ "score": 85 }` | Compares as `85` |
| `{ "score": "85" }` | Compares as `85` (string passes regex) |
| `{ "score": "high" }` | Treated as `NULL` (no match) |
| `{ "score": null }` | Treated as `NULL` (no match) |

Non-numeric operators (`eq`, `ne`, `like`, `ilike`, `in`, etc.) use text comparison via `#>>` without numeric casting.


## Numeric Value Equality

When a JSON path is compared to a number using direct equality (not an operator object), numeric casting is also applied:

```typescript
{ where: { 'metadata.user.id': 123 } }
// Uses numeric CASE expression since value is typeof number
```

When compared to a string, it uses text comparison:

```typescript
{ where: { 'metadata.user.role': 'admin' } }
// Uses "metadata" #>> '{user,role}' text comparison
```


## JSON Path Ordering

Order results by JSON fields:

```typescript
{ order: ['metadata.priority DESC'] }
// SQL: ORDER BY "metadata" #> '{priority}' DESC

// Multiple JSON fields
{ order: ['metadata.priority DESC', 'metadata.score ASC'] }
```

> [!NOTE]
> JSON ordering uses `#>` (returns JSONB, preserves native types) unlike where clauses which use `#>>` (returns text). This means JSONB sort order applies.

**Sort Order for JSONB Types:**

| JSONB Type | Sort Order |
|------------|------------|
| `null` | First (lowest) |
| `boolean` | `false` < `true` |
| `number` | Numeric order |
| `string` | Lexicographic |
| `array` | Element-wise |
| `object` | Key-value |


## Path Validation & Security

Path components are validated against the pattern `/^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/` to prevent SQL injection:

```typescript
// Valid paths
'metadata.fieldName'
'metadata.nested.deep.value'
'data.items[0]'
'config.user_id'
'data.meta-data'  // kebab-case allowed

// Invalid (throws error)
'metadata.field;DROP TABLE'
'data.123invalid'         // starts with digit (not array index context)
'config.(SELECT * FROM users)'
```

**Error Messages:**
```
// Non-JSON column
Error: Column 'name' is not JSON/JSONB type | dataType: 'text'

// Invalid path
Error: Invalid JSON path component: 'field;DROP'
```

The column referenced by the first path segment (before the first `.` or `[`) must be a `json` or `jsonb` column type. Using a JSON path on a non-JSON column throws an error.


## Performance Tips

1. **Index Your JSON Paths:**
```sql
CREATE INDEX idx_metadata_priority ON "Product" (("metadata" ->> 'priority'));
CREATE INDEX idx_metadata_gin ON "Product" USING GIN ("metadata");
```

2. **Use Appropriate Types in JSON:**
```json
// Good - numeric operators will work correctly
{ "priority": 3, "enabled": true }

// Bad - numeric operators will need string-to-number casting
{ "priority": "3", "enabled": "true" }
```

3. **Keep Paths Shallow:**
```typescript
// Easier to work with and index
'metadata.priority'

// Harder to optimize
'data.level1.level2.level3.level4.value'
```


## Null-Safe JSON Paths

```typescript
// If JSON field doesn't exist, #>> returns NULL
// This is safe - no errors, just no matches
{ where: { 'metadata.nonexistent.field': 'value' } }
// SQL: "metadata" #>> '{nonexistent,field}' = 'value'
// Result: No rows (NULL != 'value')
```


## See Also

- [Nested JSON Updates](../repositories/advanced.md#nested-json-updates) - Updating JSON fields
