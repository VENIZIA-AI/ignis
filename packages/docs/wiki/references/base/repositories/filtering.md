# Filtering & Query Operators

Learn how to query data using `where` clauses, comparison operators, pattern matching, and logical combinations.

## Basic Filtering

### Simple Equality

The most common filter - find records where a field equals a value:

```typescript
// Find active users
await repo.find({
  filter: {
    where: { status: 'active' }
  }
});
// SQL: WHERE status = 'active'

// Multiple conditions (AND)
await repo.find({
  filter: {
    where: {
      status: 'active',
      role: 'admin'
    }
  }
});
// SQL: WHERE status = 'active' AND role = 'admin'
```

### Using Explicit `eq` Operator

```typescript
await repo.find({
  filter: {
    where: { status: { eq: 'active' } }
  }
});
```

## Comparison Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `eq` | `=` | Equal to |
| `ne` / `neq` | `!=` | Not equal to |
| `gt` | `>` | Greater than |
| `gte` | `>=` | Greater than or equal |
| `lt` | `<` | Less than |
| `lte` | `<=` | Less than or equal |

### Examples

```typescript
// Greater than
await repo.find({
  filter: { where: { age: { gt: 18 } } }
});
// SQL: WHERE age > 18

// Greater than or equal
await repo.find({
  filter: { where: { score: { gte: 100 } } }
});
// SQL: WHERE score >= 100

// Less than
await repo.find({
  filter: { where: { price: { lt: 50 } } }
});
// SQL: WHERE price < 50

// Not equal
await repo.find({
  filter: { where: { status: { ne: 'deleted' } } }
});
// SQL: WHERE status != 'deleted'

// Multiple operators on same field (range)
await repo.find({
  filter: {
    where: {
      age: { gte: 18, lt: 65 }
    }
  }
});
// SQL: WHERE age >= 18 AND age < 65
```


## Range Operators

### between

Find values within a range (inclusive):

```typescript
await repo.find({
  filter: {
    where: {
      price: { between: [100, 500] }
    }
  }
});
// SQL: WHERE price BETWEEN 100 AND 500

// With dates
await repo.find({
  filter: {
    where: {
      createdAt: { between: [new Date('2024-01-01'), new Date('2024-12-31')] }
    }
  }
});
```

### notBetween

Find values outside a range:

```typescript
await repo.find({
  filter: {
    where: {
      score: { notBetween: [40, 60] }
    }
  }
});
// SQL: WHERE NOT (score BETWEEN 40 AND 60)
// Returns: scores below 40 OR above 60
```

> **Note:** `between` requires an array of exactly 2 elements `[min, max]`. Other formats will throw an error.


## NULL Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `is` | `IS NULL` | Check if null |
| `isn` | `IS NOT NULL` | Check if not null |

### Examples

```typescript
// Find records where deletedAt is NULL (not deleted)
await repo.find({
  filter: { where: { deletedAt: { is: null } } }
});
// SQL: WHERE deleted_at IS NULL

// Find records where deletedAt is NOT NULL (deleted)
await repo.find({
  filter: { where: { deletedAt: { isn: null } } }
});
// SQL: WHERE deleted_at IS NOT NULL

// Using eq with null also works
await repo.find({
  filter: { where: { deletedAt: { eq: null } } }
});
// SQL: WHERE deleted_at IS NULL
```


## List Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `in` / `inq` | `IN` | Value in array |
| `nin` | `NOT IN` | Value not in array |

### Examples

```typescript
// Find users with specific roles
await repo.find({
  filter: {
    where: { role: { in: ['admin', 'moderator', 'editor'] } }
  }
});
// SQL: WHERE role IN ('admin', 'moderator', 'editor')

// Shorthand: array value implies IN
await repo.find({
  filter: {
    where: { id: ['id1', 'id2', 'id3'] }
  }
});
// SQL: WHERE id IN ('id1', 'id2', 'id3')

// NOT IN
await repo.find({
  filter: {
    where: { status: { nin: ['deleted', 'archived', 'spam'] } }
  }
});
// SQL: WHERE status NOT IN ('deleted', 'archived', 'spam')
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| `{ in: [] }` (empty array) | Returns no rows (`false`) |
| `{ nin: [] }` (empty array) | Returns all rows (`true`) |
| `{ in: 'value' }` (non-array) | Treated as `{ eq: 'value' }` |

> **Warning:** `NOT IN` excludes rows where the column is `NULL`. If your column can be `NULL`, use `OR` to include them:
> ```typescript
> where: {
>   or: [
>     { status: { nin: ['deleted'] } },
>     { status: { is: null } }
>   ]
> }
> ```


## Pattern Matching

| Operator | SQL | Case | Description |
|----------|-----|------|-------------|
| `like` | `LIKE` | Sensitive | Pattern with wildcards |
| `nlike` | `NOT LIKE` | Sensitive | Negative pattern |
| `ilike` | `ILIKE` | Insensitive | PostgreSQL only |
| `nilike` | `NOT ILIKE` | Insensitive | PostgreSQL only |

### Wildcards

- `%` - Matches any sequence of characters
- `_` - Matches any single character

### Examples

```typescript
// Contains 'john' (case-sensitive)
await repo.find({
  filter: { where: { name: { like: '%john%' } } }
});
// SQL: WHERE name LIKE '%john%'
// Matches: 'john', 'John Doe' ❌ (case-sensitive), 'johnny'

// Contains 'john' (case-insensitive, PostgreSQL)
await repo.find({
  filter: { where: { name: { ilike: '%john%' } } }
});
// SQL: WHERE name ILIKE '%john%'
// Matches: 'john', 'John Doe' ✅, 'JOHNNY'

// Starts with 'admin'
await repo.find({
  filter: { where: { username: { like: 'admin%' } } }
});
// Matches: 'admin', 'admin123', 'administrator'

// Ends with '@gmail.com'
await repo.find({
  filter: { where: { email: { ilike: '%@gmail.com' } } }
});

// NOT LIKE
await repo.find({
  filter: { where: { email: { nlike: '%@test.com' } } }
});
// Excludes test email addresses
```


## Regular Expressions (PostgreSQL)

| Operator | SQL | Case | Description |
|----------|-----|------|-------------|
| `regexp` | `~` | Sensitive | POSIX regex match |
| `iregexp` | `~*` | Insensitive | POSIX regex match |

### Examples

```typescript
// Starts with 'John' (regex)
await repo.find({
  filter: { where: { name: { regexp: '^John' } } }
});
// SQL: WHERE name ~ '^John'

// Email validation pattern (case-insensitive)
await repo.find({
  filter: {
    where: {
      email: { iregexp: '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$' }
    }
  }
});
// SQL: WHERE email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'

// Phone number format
await repo.find({
  filter: {
    where: {
      phone: { regexp: '^\\+?[0-9]{10,14}$' }
    }
  }
});
```

> **Note:** Escape backslashes in TypeScript strings: `\\d` for regex `\d`.


## Logical Operators

### AND (Implicit)

Multiple conditions in the same `where` object are combined with AND:

```typescript
await repo.find({
  filter: {
    where: {
      status: 'active',
      role: 'admin',
      verified: true
    }
  }
});
// SQL: WHERE status = 'active' AND role = 'admin' AND verified = true
```

### AND (Explicit)

Use `and` for complex nested conditions:

```typescript
await repo.find({
  filter: {
    where: {
      and: [
        { status: 'active' },
        { createdAt: { gte: new Date('2024-01-01') } },
        { or: [{ role: 'admin' }, { role: 'moderator' }] }
      ]
    }
  }
});
```

### OR

```typescript
// Simple OR
await repo.find({
  filter: {
    where: {
      or: [
        { status: 'active' },
        { status: 'pending' }
      ]
    }
  }
});
// SQL: WHERE status = 'active' OR status = 'pending'

// OR with different fields
await repo.find({
  filter: {
    where: {
      or: [
        { email: { like: '%@company.com' } },
        { role: 'partner' }
      ]
    }
  }
});
// SQL: WHERE email LIKE '%@company.com' OR role = 'partner'
```

### Complex Nested Logic

```typescript
// (status = 'active' AND verified = true) OR (role = 'admin')
await repo.find({
  filter: {
    where: {
      or: [
        {
          and: [
            { status: 'active' },
            { verified: true }
          ]
        },
        { role: 'admin' }
      ]
    }
  }
});

// status = 'active' AND (role = 'admin' OR role = 'moderator')
await repo.find({
  filter: {
    where: {
      status: 'active',
      or: [
        { role: 'admin' },
        { role: 'moderator' }
      ]
    }
  }
});
```


## Field Selection

Control which fields are returned using `fields`:

### Array Format (Recommended)

```typescript
await repo.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'email', 'name']
  }
});
// Returns only: { id, email, name }
```

### Object Format

```typescript
// Include specific fields
await repo.find({
  filter: {
    fields: { id: true, email: true, name: true }
  }
});

// Exclude specific fields
await repo.find({
  filter: {
    fields: { password: false, secret: false }
  }
});
```


## Ordering

### Basic Ordering

```typescript
// Single column, descending
await repo.find({
  filter: { order: ['createdAt DESC'] }
});

// Multiple columns
await repo.find({
  filter: { order: ['status ASC', 'createdAt DESC'] }
});

// Default direction is ASC
await repo.find({
  filter: { order: ['name'] }  // Same as 'name ASC'
});
```

### JSON Path Ordering

Order by nested fields in JSON columns:

```typescript
await repo.find({
  filter: { order: ['metadata.priority DESC'] }
});
// SQL: ORDER BY "metadata" #> '{priority}' DESC

await repo.find({
  filter: { order: ['settings.display.theme ASC'] }
});
```

See [JSON Path Filtering](./json-filtering.md) for more details.


## Pagination

### Limit and Skip

```typescript
// First 10 results
await repo.find({
  filter: { limit: 10 }
});

// Page 2 (skip first 10, get next 10)
await repo.find({
  filter: { limit: 10, skip: 10 }
});

// Page N formula: skip = (page - 1) * limit
const page = 3;
const pageSize = 20;
await repo.find({
  filter: {
    limit: pageSize,
    skip: (page - 1) * pageSize
  }
});
```

> **Best Practice:** Always use `limit` for public-facing endpoints to prevent memory exhaustion.


## Complete Examples

### E-commerce Product Search

```typescript
const products = await productRepo.find({
  filter: {
    where: {
      status: 'active',
      price: { between: [50, 500] },
      or: [
        { name: { ilike: '%phone%' } },
        { description: { ilike: '%phone%' } }
      ]
    },
    order: ['price ASC', 'createdAt DESC'],
    fields: ['id', 'name', 'price', 'imageUrl'],
    limit: 20,
    skip: 0
  }
});
```

### User Search with Multiple Conditions

```typescript
const users = await userRepo.find({
  filter: {
    where: {
      deletedAt: { is: null },
      status: 'active',
      or: [
        { email: { like: '%@company.com' } },
        {
          and: [
            { role: { in: ['admin', 'moderator'] } },
            { verified: true }
          ]
        }
      ]
    },
    order: ['createdAt DESC'],
    limit: 50
  }
});
```

### Date Range Query

```typescript
const recentOrders = await orderRepo.find({
  filter: {
    where: {
      createdAt: {
        gte: new Date('2024-01-01'),
        lt: new Date('2024-02-01')
      },
      status: { nin: ['cancelled', 'refunded'] }
    },
    order: ['createdAt DESC']
  }
});
```


## Quick Reference

| Want to... | Code |
|------------|------|
| Equal | `{ field: value }` or `{ field: { eq: value } }` |
| Not equal | `{ field: { ne: value } }` |
| Greater than | `{ field: { gt: value } }` |
| Greater or equal | `{ field: { gte: value } }` |
| Less than | `{ field: { lt: value } }` |
| Less or equal | `{ field: { lte: value } }` |
| In range | `{ field: { between: [min, max] } }` |
| Outside range | `{ field: { notBetween: [min, max] } }` |
| In list | `{ field: { in: [a, b, c] } }` |
| Not in list | `{ field: { nin: [a, b, c] } }` |
| Is null | `{ field: { is: null } }` |
| Is not null | `{ field: { isn: null } }` |
| Contains (case-sensitive) | `{ field: { like: '%text%' } }` |
| Contains (case-insensitive) | `{ field: { ilike: '%text%' } }` |
| Regex match | `{ field: { regexp: '^pattern$' } }` |
| OR conditions | `{ or: [{ a: 1 }, { b: 2 }] }` |
| AND conditions | `{ and: [{ a: 1 }, { b: 2 }] }` |


## Next Steps

- [Relations & Includes](./relations.md) - Fetch related data
- [JSON Path Filtering](./json-filtering.md) - Query JSONB columns
- [Array Operators](./array-operators.md) - PostgreSQL array queries
