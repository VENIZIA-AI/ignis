# JSON Path Filtering

Query nested fields within JSON/JSONB columns using dot notation. This is a PostgreSQL-specific feature.


## Basic JSON Filtering

### Dot Notation

Use dot notation to access nested fields in JSON columns:

```typescript
// Schema: metadata jsonb
// Data: { "priority": 3, "category": "tech" }

await repo.find({
  filter: {
    where: { 'metadata.priority': 3 }
  }
});
// SQL: "metadata" #>> '{priority}' = '3'
```

### Deeply Nested Fields

```typescript
// Data: { "settings": { "display": { "theme": "dark" } } }

await repo.find({
  filter: {
    where: { 'settings.display.theme': 'dark' }
  }
});
// SQL: "settings" #>> '{display,theme}' = 'dark'
```

### Array Index Access

```typescript
// Data: { "tags": ["important", "urgent", "review"] }

await repo.find({
  filter: {
    where: { 'metadata.tags[0]': 'important' }
  }
});
// SQL: "metadata" #>> '{tags,0}' = 'important'
```

### Complex Paths

```typescript
// Data: { "items": [{ "name": "Widget" }, { "name": "Gadget" }] }

await repo.find({
  filter: {
    where: { 'data.items[1].name': 'Gadget' }
  }
});
// SQL: "data" #>> '{items,1,name}' = 'Gadget'
```


## JSON with Operators

All standard operators work with JSON paths:

### Comparison Operators

```typescript
// Greater than
await repo.find({
  filter: {
    where: { 'metadata.priority': { gt: 3 } }
  }
});

// Range
await repo.find({
  filter: {
    where: { 'metadata.score': { gte: 70, lte: 90 } }
  }
});

// Between
await repo.find({
  filter: {
    where: { 'metadata.score': { between: [70, 90] } }
  }
});
```

### Pattern Matching

```typescript
// LIKE
await repo.find({
  filter: {
    where: { 'metadata.category': { like: '%tech%' } }
  }
});

// Case-insensitive
await repo.find({
  filter: {
    where: { 'metadata.category': { ilike: '%TECH%' } }
  }
});
```

### List Operators

```typescript
// IN
await repo.find({
  filter: {
    where: { 'metadata.status': { in: ['active', 'pending'] } }
  }
});

// NOT IN
await repo.find({
  filter: {
    where: { 'metadata.level': { nin: ['low', 'none'] } }
  }
});
```


## Important: Type Handling

### The #>> Operator Returns TEXT

PostgreSQL's `#>>` operator (used for JSON path access) **always returns TEXT**. This affects comparisons:

```typescript
// JSON data: { "priority": 3 } (number in JSON)

// This query compares as TEXT
await repo.find({
  filter: { where: { 'metadata.priority': 3 } }
});
// SQL: "metadata" #>> '{priority}' = '3'
// Works because 3 is converted to '3' for comparison
```

### Safe Numeric Casting

For numeric comparisons (`gt`, `gte`, `lt`, `lte`, `between`), the filter builder uses **safe casting** to handle mixed types:

```typescript
await repo.find({
  filter: {
    where: { 'metadata.priority': { gt: 3 } }
  }
});
// SQL: CASE WHEN ("metadata" #>> '{priority}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//      THEN ("metadata" #>> '{priority}')::numeric
//      ELSE NULL END > 3
```

This prevents crashes when JSON contains mixed types:

| JSON Value | Numeric Operation Result |
|------------|-------------------------|
| `{ "score": 85 }` | Compares as `85` |
| `{ "score": "high" }` | Treated as `NULL` (no match) |
| `{ "score": null }` | Treated as `NULL` (no match) |

### Boolean Values

Booleans are compared as TEXT strings:

```typescript
// JSON data: { "enabled": true }

await repo.find({
  filter: {
    where: { 'metadata.enabled': true }
  }
});
// SQL: "metadata" #>> '{enabled}' = 'true'
```


## JSON Path Ordering

Order results by JSON fields:

```typescript
await repo.find({
  filter: {
    order: ['metadata.priority DESC']
  }
});
// SQL: ORDER BY "metadata" #> '{priority}' DESC

// Multiple JSON fields
await repo.find({
  filter: {
    order: ['metadata.priority DESC', 'metadata.score ASC']
  }
});
```

### Sort Order for JSONB Types

| JSONB Type | Sort Order |
|------------|------------|
| `null` | First (lowest) |
| `boolean` | `false` < `true` |
| `number` | Numeric order |
| `string` | Lexicographic |
| `array` | Element-wise |
| `object` | Key-value |


## Combining JSON and Regular Filters

Mix JSON path filters with standard column filters:

```typescript
await repo.find({
  filter: {
    where: {
      status: 'active',                          // Regular column
      'metadata.priority': { gte: 3 },           // JSON path
      'metadata.category': 'tech',               // JSON path
      or: [
        { 'metadata.tags[0]': 'important' },     // JSON array
        { featured: true }                        // Regular column
      ]
    }
  }
});
```


## Logical Operators with JSON

### OR with JSON Paths

```typescript
await repo.find({
  filter: {
    where: {
      or: [
        { 'metadata.priority': 1 },
        { 'metadata.priority': 5 }
      ]
    }
  }
});
```

### Complex Nested Logic

```typescript
await repo.find({
  filter: {
    where: {
      status: 'active',
      or: [
        { 'metadata.level': 'high' },
        {
          and: [
            { 'metadata.score': { gte: 90 } },
            { 'metadata.verified': true }
          ]
        }
      ]
    }
  }
});
```


## Supported Path Formats

| Format | Example | SQL Path |
|--------|---------|----------|
| Simple field | `metadata.name` | `{name}` |
| Nested field | `metadata.user.email` | `{user,email}` |
| Array index | `metadata.tags[0]` | `{tags,0}` |
| Nested with array | `metadata.items[2].name` | `{items,2,name}` |
| Kebab-case | `metadata.user-id` | `{user-id}` |


## Security & Validation

### Path Validation

Invalid path components are rejected to prevent SQL injection:

```typescript
// ✅ Valid paths
'metadata.fieldName'
'data.items[0]'
'config.nested_field'

// ❌ Invalid - throws error
'metadata.field;DROP TABLE'  // Special characters
'data.123invalid'            // Can't start with number
```

### Error Messages

```
// Non-JSON column
Error: Column 'name' is not JSON/JSONB type | dataType: 'text'

// Invalid path
Error: Invalid JSON path component: 'field;DROP'
```


## Complete Examples

### Configuration System

```typescript
// Find high-priority enabled configs
const configs = await configRepo.find({
  filter: {
    where: {
      group: 'SYSTEM',
      'jValue.enabled': true,
      'jValue.priority': { gte: 3 },
      'jValue.metadata.level': { in: ['high', 'critical'] }
    },
    order: ['jValue.priority DESC'],
    limit: 10
  }
});
```

**Generated SQL:**
```sql
SELECT * FROM "Configuration"
WHERE
  "group" = 'SYSTEM'
  AND "jValue" #>> '{enabled}' = 'true'
  AND CASE WHEN ("jValue" #>> '{priority}') ~ '^-?[0-9]+'
      THEN ("jValue" #>> '{priority}')::numeric ELSE NULL END >= 3
  AND "jValue" #>> '{metadata,level}' IN ('high', 'critical')
ORDER BY "jValue" #> '{priority}' DESC
LIMIT 10
```

### User Preferences

```typescript
// Find users with dark theme and notifications enabled
const users = await userRepo.find({
  filter: {
    where: {
      'preferences.theme': 'dark',
      'preferences.notifications.email': true,
      'preferences.notifications.push': true
    }
  }
});
```

### Product Attributes

```typescript
// Find products by dynamic attributes
const products = await productRepo.find({
  filter: {
    where: {
      status: 'active',
      'attributes.color': { in: ['red', 'blue', 'green'] },
      'attributes.size': 'large',
      'attributes.weight': { lt: 10 }
    },
    order: ['attributes.weight ASC']
  }
});
```


## Tips & Best Practices

### 1. Index Your JSON Paths

For frequently queried paths, create GIN indexes:

```sql
CREATE INDEX idx_metadata_priority ON "Product" (("metadata" ->> 'priority'));
CREATE INDEX idx_metadata_gin ON "Product" USING GIN ("metadata");
```

### 2. Use Appropriate Types in JSON

Store numbers as numbers, not strings:

```json
// ✅ Good
{ "priority": 3, "enabled": true }

// ❌ Bad
{ "priority": "3", "enabled": "true" }
```

### 3. Keep Paths Shallow

Deeply nested paths are harder to index and query:

```typescript
// ✅ Easier to work with
'metadata.priority'

// ⚠️ Harder to optimize
'data.level1.level2.level3.level4.value'
```

### 4. Consider Denormalization

For heavily-queried JSON fields, consider extracting to regular columns.


## Quick Reference

| Want to... | Code |
|------------|------|
| Simple equality | `{ 'json.field': value }` |
| Nested field | `{ 'json.nested.field': value }` |
| Array element | `{ 'json.array[0]': value }` |
| Greater than | `{ 'json.field': { gt: 10 } }` |
| Range | `{ 'json.field': { between: [1, 10] } }` |
| Pattern match | `{ 'json.field': { ilike: '%text%' } }` |
| In list | `{ 'json.field': { in: ['a', 'b'] } }` |
| Order by JSON | `order: ['json.field DESC']` |


## Next Steps

- [Array Operators](./array-operators.md) - PostgreSQL array queries
- [Advanced Features](./advanced.md) - Transactions, hidden props
- [Filtering & Operators](./filtering.md) - Standard query operators
