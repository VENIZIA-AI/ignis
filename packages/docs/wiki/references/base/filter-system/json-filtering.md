---
title: JSON/JSONB Filtering
description: Query nested fields within JSON/JSONB columns using dot notation
difficulty: intermediate
---

# JSON/JSONB Filtering

Query nested fields within JSON/JSONB columns using dot notation. This is a PostgreSQL-specific feature.


## Basic JSON Path Syntax

```typescript
// Column: metadata jsonb
// Data: { "user": { "id": 123, "role": "admin" }, "tags": ["urgent"] }

// Simple nested field
{ where: { 'metadata.user.id': 123 } }
// SQL: "metadata" #>> '{user,id}' = '123'

// Deep nesting
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

// Pattern matching
{ where: { 'metadata.level': { ilike: '%high%' } } }
// SQL: "metadata" #>> '{level}' ILIKE '%high%'

// IN operator
{ where: { 'metadata.status': { in: ['pending', 'review'] } } }
```


## Safe Numeric Casting

JSON fields may contain mixed types. Ignis uses safe casting to prevent database errors:

```typescript
// Data in database:
// Row 1: { "score": 85 }      <- number
// Row 2: { "score": "high" }  <- string
// Row 3: { "score": null }    <- null

// Query with numeric operator
{ where: { 'metadata.score': { gt: 50 } } }

// Result:
// Row 1: 85 > 50 -> matched
// Row 2: "high" -> NULL -> not matched
// Row 3: null -> NULL -> not matched
```

| JSON Value | Numeric Operation Result |
|------------|-------------------------|
| `{ "score": 85 }` | Compares as `85` |
| `{ "score": "high" }` | Treated as `NULL` (no match) |
| `{ "score": null }` | Treated as `NULL` (no match) |


## Boolean Values

Booleans are compared as TEXT strings:

```typescript
// JSON data: { "enabled": true }

{ where: { 'metadata.enabled': true } }
// SQL: "metadata" #>> '{enabled}' = 'true'
```


## JSON Path Ordering

Order results by JSON fields:

```typescript
{ filter: { order: ['metadata.priority DESC'] } }
// SQL: ORDER BY "metadata" #> '{priority}' DESC

// Multiple JSON fields
{ filter: { order: ['metadata.priority DESC', 'metadata.score ASC'] } }
```

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

Path components are validated to prevent SQL injection:

```typescript
// Valid paths
'metadata.fieldName'
'metadata.nested.deep.value'
'data.items[0]'
'config.user_id'
'data.meta-data'  // kebab-case allowed

// Invalid (throws error)
'metadata.field;DROP TABLE'
'data.123invalid'
'config.(SELECT * FROM users)'
```

**Error Messages:**
```
// Non-JSON column
Error: Column 'name' is not JSON/JSONB type | dataType: 'text'

// Invalid path
Error: Invalid JSON path component: 'field;DROP'
```


## Performance Tips

1. **Index Your JSON Paths:**
```sql
CREATE INDEX idx_metadata_priority ON "Product" (("metadata" ->> 'priority'));
CREATE INDEX idx_metadata_gin ON "Product" USING GIN ("metadata");
```

2. **Use Appropriate Types in JSON:**
```json
// Good
{ "priority": 3, "enabled": true }

// Bad
{ "priority": "3", "enabled": "true" }
```

3. **Keep Paths Shallow:**
```typescript
// Easier to work with
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
