# Array Operators (PostgreSQL)

Query PostgreSQL array columns using specialized operators: `contains`, `containedBy`, and `overlaps`.


## Overview

These operators work with columns defined as PostgreSQL arrays (`varchar[]`, `text[]`, `integer[]`, etc.):

| Operator | PostgreSQL | Description |
|----------|------------|-------------|
| `contains` | `@>` | Array contains **ALL** specified elements |
| `containedBy` | `<@` | Array is a **subset** of specified elements |
| `overlaps` | `&&` | Array shares **ANY** element with specified |


## contains (@>)

Find rows where the array column contains **all** specified elements.

### Basic Usage

```typescript
// Schema: tags varchar(100)[]
// Data: Product A has ['electronics', 'featured', 'sale']

// Find products with BOTH 'electronics' AND 'featured'
await productRepo.find({
  filter: {
    where: {
      tags: { contains: ['electronics', 'featured'] }
    }
  }
});
// SQL: "tags"::text[] @> ARRAY['electronics', 'featured']::text[]
```

### Examples

```typescript
// Single element
await productRepo.find({
  filter: {
    where: { tags: { contains: ['featured'] } }
  }
});
// Matches: ['featured'], ['featured', 'sale'], ['a', 'featured', 'b']

// Multiple elements (ALL must be present)
await productRepo.find({
  filter: {
    where: { tags: { contains: ['sale', 'premium'] } }
  }
});
// Matches: ['sale', 'premium'], ['sale', 'premium', 'new']
// Does NOT match: ['sale'], ['premium'], ['sale', 'featured']
```

### Use Case: Category Filtering

```typescript
// Find products in BOTH "electronics" AND "portable" categories
const portableElectronics = await productRepo.find({
  filter: {
    where: {
      categories: { contains: ['electronics', 'portable'] }
    }
  }
});
```


## containedBy (<@)

Find rows where **all** array elements are within the specified set.

### Basic Usage

```typescript
// Find products where ALL tags are in the allowed list
await productRepo.find({
  filter: {
    where: {
      tags: { containedBy: ['new', 'sale', 'featured', 'popular'] }
    }
  }
});
// SQL: "tags"::text[] <@ ARRAY['new', 'sale', 'featured', 'popular']::text[]
```

### Examples

```typescript
// Product A ['featured', 'sale'] → ✅ all in list
// Product B ['featured', 'clearance'] → ❌ 'clearance' not in list
// Product C [] → ✅ empty is subset of everything

// Validate tags are only from approved set
await productRepo.find({
  filter: {
    where: {
      tags: { containedBy: ['approved', 'verified', 'trusted'] }
    }
  }
});
```

### Use Case: Permission Checking

```typescript
// Find users whose roles are all within allowed roles
const allowedRoles = ['viewer', 'editor', 'commenter'];
const restrictedUsers = await userRepo.find({
  filter: {
    where: {
      roles: { containedBy: allowedRoles }
    }
  }
});
// Excludes users with 'admin' or other unauthorized roles
```


## overlaps (&&)

Find rows where arrays share **any** common element.

### Basic Usage

```typescript
// Find products with 'premium' OR 'sale' tag
await productRepo.find({
  filter: {
    where: {
      tags: { overlaps: ['premium', 'sale'] }
    }
  }
});
// SQL: "tags"::text[] && ARRAY['premium', 'sale']::text[]
```

### Examples

```typescript
// Product A ['electronics', 'featured', 'sale'] → ✅ has 'sale'
// Product B ['premium'] → ✅ has 'premium'
// Product C ['electronics'] → ❌ no overlap

// Find products matching ANY of user's interests
const userInterests = ['gaming', 'tech', 'fitness'];
await productRepo.find({
  filter: {
    where: {
      tags: { overlaps: userInterests }
    }
  }
});
```

### Use Case: Interest Matching

```typescript
// Find users interested in ANY of these topics
const topics = ['javascript', 'typescript', 'nodejs'];
const matchingUsers = await userRepo.find({
  filter: {
    where: {
      interests: { overlaps: topics }
    }
  }
});
```


## Visual Comparison

| Product | tags | `contains ['featured']` | `containedBy ['a','b','featured']` | `overlaps ['sale','premium']` |
|---------|------|------------------------|-----------------------------------|------------------------------|
| A | `['featured', 'sale']` | ✅ | ❌ (has 'sale') | ✅ (has 'sale') |
| B | `['featured']` | ✅ | ✅ | ❌ |
| C | `['a', 'b']` | ❌ | ✅ | ❌ |
| D | `['premium']` | ❌ | ❌ | ✅ (has 'premium') |
| E | `[]` | ❌ | ✅ (empty ⊆ all) | ❌ |


## Empty Array Behavior

| Operator | Empty Value `[]` | Behavior |
|----------|------------------|----------|
| `contains: []` | Returns **ALL** rows | Everything contains empty set |
| `containedBy: []` | Returns only rows with **empty arrays** | Only `[]` is subset of `[]` |
| `overlaps: []` | Returns **NO** rows | Nothing overlaps with empty |

### Examples

```typescript
// Contains empty = all rows
await repo.find({ filter: { where: { tags: { contains: [] } } } });
// Returns all products

// ContainedBy empty = only empty arrays
await repo.find({ filter: { where: { tags: { containedBy: [] } } } });
// Returns only products with tags = []

// Overlaps empty = no rows
await repo.find({ filter: { where: { tags: { overlaps: [] } } } });
// Returns nothing
```


## Type Handling

### String Arrays

For `varchar[]`, `text[]`, and `char[]` columns, both the column and value are cast to `text[]`:

```typescript
// Automatic type casting for string arrays
await repo.find({
  filter: { where: { tags: { contains: ['a', 'b'] } } }
});
// SQL: "tags"::text[] @> ARRAY['a', 'b']::text[]
```

### Numeric Arrays

For `integer[]`, `numeric[]` columns, no casting needed:

```typescript
// Integer array
await repo.find({
  filter: { where: { scores: { contains: [100, 200] } } }
});
// SQL: "scores" @> ARRAY[100, 200]
```

### Boolean Arrays

```typescript
// Boolean array
await repo.find({
  filter: { where: { flags: { contains: [true, false] } } }
});
// SQL: "flags" @> ARRAY[true, false]
```


## Combining with Other Operators

### With Standard Filters

```typescript
await productRepo.find({
  filter: {
    where: {
      status: 'active',
      price: { lt: 100 },
      tags: { contains: ['sale'] }
    }
  }
});
```

### With Logical Operators

```typescript
// Products with ('electronics' AND 'portable') OR 'clearance'
await productRepo.find({
  filter: {
    where: {
      or: [
        { tags: { contains: ['electronics', 'portable'] } },
        { tags: { contains: ['clearance'] } }
      ]
    }
  }
});
```

### Multiple Array Conditions

```typescript
await productRepo.find({
  filter: {
    where: {
      // Must have ALL these categories
      categories: { contains: ['electronics', 'portable'] },
      // Tags must be subset of allowed tags
      tags: { containedBy: ['new', 'sale', 'featured', 'popular'] },
      // Must have at least one of these suppliers
      suppliers: { overlaps: ['supplier-a', 'supplier-b'] }
    }
  }
});
```


## Complete Examples

### E-commerce Product Filter

```typescript
const products = await productRepo.find({
  filter: {
    where: {
      status: 'active',
      // Must be in electronics category
      categories: { contains: ['electronics'] },
      // Only standard tags allowed
      tags: { containedBy: ['new', 'sale', 'featured', 'popular', 'bestseller'] },
      // Match user's interests
      interests: { overlaps: userPreferences },
      // Stock check
      quantity: { gt: 0 }
    },
    order: ['createdAt DESC'],
    limit: 20
  }
});
```

### User Permission Check

```typescript
// Find users who can access this resource
const requiredPermissions = ['read', 'write'];
const authorizedUsers = await userRepo.find({
  filter: {
    where: {
      status: 'active',
      // Must have ALL required permissions
      permissions: { contains: requiredPermissions }
    }
  }
});
```

### Content Recommendation

```typescript
// Find articles matching user's interests
const userTags = ['technology', 'ai', 'programming'];
const recommendations = await articleRepo.find({
  filter: {
    where: {
      status: 'published',
      // Match ANY of user's interests
      tags: { overlaps: userTags }
    },
    order: ['publishedAt DESC'],
    limit: 10
  }
});
```


## Defining Array Columns

In your Drizzle schema:

```typescript
import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';

export const productTable = pgTable('Product', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  // Array columns
  tags: varchar('tags', { length: 100 }).array(),      // varchar(100)[]
  categories: text('categories').array(),              // text[]
  scores: integer('scores').array(),                   // integer[]
});
```


## Quick Reference

| Want to... | Use | Example |
|------------|-----|---------|
| Has ALL elements | `contains` | `{ tags: { contains: ['a', 'b'] } }` |
| All elements in set | `containedBy` | `{ tags: { containedBy: ['a', 'b', 'c'] } }` |
| Has ANY element | `overlaps` | `{ tags: { overlaps: ['a', 'b'] } }` |
| Single element | `contains` | `{ tags: { contains: ['featured'] } }` |

### Decision Guide

| Question | Use |
|----------|-----|
| "Must have ALL these tags" | `contains` |
| "Tags must only be from this list" | `containedBy` |
| "Must have AT LEAST ONE of these tags" | `overlaps` |


## Next Steps

- [Advanced Features](./advanced.md) - Transactions, hidden props, performance
- [Filtering & Operators](./filtering.md) - Standard query operators
- [JSON Path Filtering](./json-filtering.md) - Query JSONB columns
