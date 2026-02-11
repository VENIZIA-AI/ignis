---
title: Filter Operators Quick Reference
description: Single-page cheat sheet of all filter operators
difficulty: intermediate
lastUpdated: 2026-01-03
---

# Filter Operators Quick Reference

Complete single-page reference for all IGNIS filter operators. For detailed explanations and examples, see the individual operator guides.

## Comparison Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `eq` | `=` | `{ status: { eq: 'active' } }` | Equal to |
| `neq` | `!=` | `{ status: { neq: 'deleted' } }` | Not equal to |
| `gt` | `>` | `{ age: { gt: 18 } }` | Greater than |
| `gte` | `>=` | `{ age: { gte: 18 } }` | Greater than or equal |
| `lt` | `<` | `{ price: { lt: 100 } }` | Less than |
| `lte` | `<=` | `{ price: { lte: 100 } }` | Less than or equal |

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
| `in` / `inq` | `IN` | `{ status: { in: ['active', 'pending'] } }` | Value matches any in array |
| `notIn` / `nin` | `NOT IN` | `{ status: { notIn: ['deleted', 'banned'] } }` | Value doesn't match any in array |

**See:** [List Operators Guide](./list-operators.md)


## Pattern Matching Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `like` | `LIKE` | `{ name: { like: '%john%' } }` | Pattern match (case-sensitive) |
| `ilike` | `ILIKE` | `{ email: { ilike: '%@gmail.com' } }` | Pattern match (case-insensitive) |
| `notLike` | `NOT LIKE` | `{ name: { notLike: '%test%' } }` | Inverse pattern match (case-sensitive) |
| `notILike` | `NOT ILIKE` | `{ email: { notILike: '%spam%' } }` | Inverse pattern match (case-insensitive) |
| `startsWith` | `LIKE 'value%'` | `{ name: { startsWith: 'John' } }` | Starts with value |
| `endsWith` | `LIKE '%value'` | `{ email: { endsWith: '@example.com' } }` | Ends with value |
| `regexp` | `~` | `{ code: { regexp: '^[A-Z]{3}$' } }` | Regular expression (PostgreSQL) |
| `iregexp` | `~*` | `{ code: { iregexp: '^[a-z]{3}$' } }` | Case-insensitive regex (PostgreSQL) |

**Wildcard Patterns:**
- `%` - Matches any sequence of characters
- `_` - Matches any single character

**See:** [Pattern Matching Guide](./pattern-matching.md)


## Null Check Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `isNull` | `IS NULL` | `{ deletedAt: { isNull: true } }` | Value is NULL |
| `isNotNull` | `IS NOT NULL` | `{ email: { isNotNull: true } }` | Value is not NULL |

**Alternative Syntax:**
```typescript
// Using 'is' operator
{ deletedAt: { is: null } }     // IS NULL
{ email: { is: { not: null } } } // IS NOT NULL
```

**See:** [Null Operators Guide](./null-operators.md)


## Logical Operators

| Operator | SQL | TypeScript Example | Description |
|----------|-----|-------------------|-------------|
| `and` | `AND` | `{ and: [{ age: { gt: 18 } }, { status: 'active' }] }` | All conditions must be true |
| `or` | `OR` | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` | At least one condition must be true |
| `not` | `NOT` | `{ not: { status: 'deleted' } }` | Inverts the condition |

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

**See:** [Logical Operators Guide](./logical-operators.md)


## PostgreSQL Array Operators

These operators work with PostgreSQL array columns (`varchar[]`, `text[]`, `integer[]`, etc.).

| Operator | PostgreSQL | TypeScript Example | Description |
|----------|------------|-------------------|-------------|
| `contains` | `@>` | `{ tags: { contains: ['typescript', 'nodejs'] } }` | Array contains **ALL** specified elements |
| `containedBy` | `<@` | `{ tags: { containedBy: ['ts', 'js', 'go', 'rust'] } }` | Array is subset of specified array |
| `overlaps` | `&&` | `{ tags: { overlaps: ['react', 'vue', 'angular'] } }` | Arrays have at least one common element |

**Important:** These are array-specific operators, not to be confused with `in`/`notIn` which match scalar values against an array.

**See:** [Array Operators Guide](./array-operators.md)


## JSON/JSONB Operators (PostgreSQL)

Query nested fields within JSON/JSONB columns using dot notation.

### Basic JSON Path

| Syntax | Example | Description |
|--------|---------|-------------|
| Dot notation | `metadata.user.name` | Access nested properties |
| Array index | `metadata.tags[0]` | Access array elements |
| Combined | `metadata.users[0].email` | Nested arrays and objects |

### JSON Path with Filters

```typescript
// Query JSON field
{
  metadata: {
    jsonPath: '$.user.name',
    eq: 'John'
  }
}

// Multiple JSON conditions
{
  and: [
    { metadata: { jsonPath: '$.user.age', gt: 18 } },
    { metadata: { jsonPath: '$.user.country', eq: 'US' } }
  ]
}
```

### Supported Operators with JSON

All comparison operators work with JSON path queries:
- `eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- `in`, `notIn`
- `like`, `ilike` (for string fields)
- `isNull`, `isNotNull`

**See:** [JSON Filtering Guide](./json-filtering.md)


## Fields, Ordering & Pagination

### Select Specific Fields

```typescript
const users = await userRepo.find({
  where: { isActive: true },
  fields: ['id', 'name', 'email'], // Only return these fields
});
```

### Ordering

```typescript
// Single field
{ orderBy: { createdAt: 'desc' } }

// Multiple fields
{ orderBy: [
  { createdAt: 'desc' },
  { name: 'asc' }
]}
```

### Pagination

```typescript
{
  limit: 10,   // Max records to return
  offset: 20,  // Skip first 20 records
  orderBy: { id: 'asc' }
}

// Page 3 with 10 items per page
{
  limit: 10,
  offset: 20, // (page - 1) * limit = (3 - 1) * 10
  orderBy: { createdAt: 'desc' }
}
```

**See:** [Fields, Ordering & Pagination Guide](./fields-order-pagination.md)


## Default Filters

Automatically apply filters to all repository queries (e.g., soft delete, multi-tenant).

```typescript
import { model, DefaultFilterMixin } from '@venizia/ignis';

@model()
class User extends DefaultFilterMixin(BaseEntity) {
  static readonly schema = pgTable('users', {
    id: integer('id').primaryKey(),
    name: text('name'),
    isDeleted: boolean('is_deleted').default(false),
  });

  // Define default filter
  static getDefaultFilter() {
    return {
      isDeleted: false, // Exclude deleted users by default
    };
  }
}

// All queries automatically exclude deleted users
await userRepo.find({});
// WHERE is_deleted = false

// Skip default filter for admin operations
await userRepo.find({
  where: {},
  options: { shouldSkipDefaultFilter: true },
});
// No automatic filter applied
```

**See:** [Default Filter Guide](./default-filter.md)


## Common Filter Patterns

### Multi-Condition Search

```typescript
{
  and: [
    { age: { gte: 18, lte: 65 } }, // Between 18 and 65
    { status: { in: ['active', 'pending'] } },
    { or: [
      { email: { endsWith: '@company.com' } },
      { role: 'admin' }
    ]}
  ]
}
```

### Text Search

```typescript
{
  or: [
    { name: { ilike: '%john%' } },
    { email: { ilike: '%john%' } },
    { username: { ilike: '%john%' } }
  ]
}
```

### Date Range

```typescript
{
  createdAt: {
    gte: new Date('2024-01-01'),
    lt: new Date('2024-02-01')
  }
}
```

### Exclude Soft Deleted

```typescript
{
  and: [
    { isDeleted: false },
    { status: 'active' }
  ]
}
```

### Multi-Tenant Filtering

```typescript
{
  and: [
    { tenantId: currentTenantId },
    { isActive: true }
  ]
}
```


## Operator Precedence

When combining operators, IGNIS follows standard SQL precedence:

1. **NOT** - Highest precedence
2. **AND** - Medium precedence
3. **OR** - Lowest precedence

Use explicit parentheses (via nested `and`/`or`) for clarity:

```typescript
// Clear precedence
{
  and: [
    { status: 'active' },
    { or: [
      { role: 'admin' },
      { role: 'moderator' }
    ]}
  ]
}
```


## Type Safety

All filter operators are fully typed based on your model schema:

```typescript
interface User {
  id: number;
  name: string;
  age: number;
  email: string;
  tags: string[];
}

// ✅ Type-safe filters
await userRepo.find({
  where: {
    age: { gt: 18 },        // number operators
    name: { like: '%john%' }, // string operators
    tags: { contains: ['typescript'] } // array operators
  }
});

// ❌ TypeScript error: wrong operator for type
await userRepo.find({
  where: {
    age: { like: '%18%' } // Error: 'like' not valid for numbers
  }
});
```


## Performance Tips

1. **Index frequently filtered columns:**
   ```sql
   CREATE INDEX idx_users_status ON users(status);
   CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
   ```

2. **Use `eq` instead of `like` when possible:**
   ```typescript
   // ✅ Fast: Uses index
   { status: { eq: 'active' } }

   // ❌ Slower: Full table scan
   { status: { like: 'active' } }
   ```

3. **Limit array contains operations:**
   ```typescript
   // Better performance with smaller arrays
   { tags: { contains: ['typescript'] } } // ✅ Good
   { tags: { contains: ['tag1', 'tag2', /* ... 100 tags */] } } // ❌ Slow
   ```

4. **Use pagination for large result sets:**
   ```typescript
   {
     where: { isActive: true },
     limit: 100,
     offset: 0,
     orderBy: { id: 'asc' }
   }
   ```


## See Also

- **Detailed Guides:**
  - [Comparison Operators](./comparison-operators.md)
  - [Logical Operators](./logical-operators.md)
  - [Pattern Matching](./pattern-matching.md)
  - [JSON Filtering](./json-filtering.md)
  - [Array Operators](./array-operators.md)

- **Related References:**
  - [Repositories](../repositories/) - Using filters in repository queries
  - [Models](../models.md) - Defining model schemas

- **Usage Guides:**
  - [Application Usage](./application-usage.md) - Filters in the full stack
  - [Use Case Gallery](./use-cases.md) - Real-world examples
  - [Pro Tips & Edge Cases](./tips.md) - Advanced patterns

- **Quick Reference:**
  - [Main Quick Reference](/references/quick-reference.md) - All IGNIS APIs
