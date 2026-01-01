---
title: Filter System
description: Comprehensive reference for the Ignis filter system - operators, JSON filtering, and query patterns
---

# Filter System Reference

This reference provides an exhaustive guide for the Ignis filter system, covering the complete lifecycle from REST API controllers down to repository queries.

> [!NOTE]
> This is an advanced reference document. If you're new to Ignis, start with:
> - [5-Minute Quickstart](/guides/get-started/5-minute-quickstart) - Get up and running
> - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Learn the basics
> - [Repositories](/references/base/repositories) - Repository overview

## Table of Contents

[[toc]]


## 1. Introduction to the Filter Object

The `Filter<T>` object is the core mechanism for querying data in Ignis. It provides a structured, type-safe way to express complex queries without writing raw SQL.

### Filter Structure

```typescript
type TFilter<T> = {
  where?: TWhere<T>;      // Query conditions (→ SQL WHERE)
  fields?: TFields<T>;    // Column selection (→ SQL SELECT)
  order?: string[];       // Sorting (→ SQL ORDER BY)
  limit?: number;         // Max results (→ SQL LIMIT)
  skip?: number;          // Pagination offset (→ SQL OFFSET)
  offset?: number;        // Alias for skip
  include?: TInclusion[]; // Related data (→ SQL JOIN / subqueries)
};
```

### SQL Mapping Overview

| Filter Property | SQL Equivalent | Purpose |
|-----------------|----------------|---------|
| `where` | `WHERE` | Filter rows by conditions |
| `fields` | `SELECT col1, col2` | Select specific columns |
| `order` | `ORDER BY` | Sort results |
| `limit` | `LIMIT` | Restrict number of results |
| `skip` / `offset` | `OFFSET` | Skip rows for pagination |
| `include` | `JOIN` / subquery | Include related data |

### Basic Example

```typescript
// Filter object
const filter = {
  where: { status: 'active', role: 'admin' },
  fields: ['id', 'name', 'email'],
  order: ['createdAt DESC'],
  limit: 10,
  skip: 0
};

// Equivalent SQL
// SELECT "id", "name", "email"
// FROM "User"
// WHERE "status" = 'active' AND "role" = 'admin'
// ORDER BY "created_at" DESC
// LIMIT 10 OFFSET 0
```


## 2. Passing Filters Through Layers

Filters flow from the HTTP layer through services to repositories. Understanding this flow is essential for building robust APIs.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Request                              │
│   GET /products?filter={"where":{"status":"active"},"limit":10} │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Controller Layer                             │
│   • Validates filter via Zod schema                              │
│   • Parses JSON string → Filter object                           │
│   • Passes to service/repository                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Service Layer (Optional)                     │
│   • Business logic, authorization                                │
│   • May modify filter before passing                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Repository Layer                             │
│   • DrizzleFilterBuilder transforms Filter → SQL                 │
│   • Executes query via Drizzle ORM                               │
│   • Returns typed results                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Controller Layer

#### Using ControllerFactory (Recommended)

The `ControllerFactory` automatically handles filter parsing and validation:

```typescript
// src/controllers/product.controller.ts
import { Product } from '@/models';
import { ProductRepository } from '@/repositories';
import {
  controller,
  ControllerFactory,
  inject,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';

const BASE_PATH = '/products';

// Define CRUD controller with automatic filter handling
const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ProductRepository.name },
  controller: {
    name: 'ProductController',
    basePath: BASE_PATH,
    isStrict: true,
    defaultLimit: 20,  // Default limit for queries
  },
  entity: () => Product,
});

@controller({ path: BASE_PATH })
export class ProductController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    repository: ProductRepository,
  ) {
    super(repository);
  }
}
```

**Generated Endpoints:**

| Method | Endpoint | Filter Location |
|--------|----------|-----------------|
| GET | `/products` | Query param: `?filter={...}` |
| GET | `/products/:id` | Query param: `?filter={...}` (for includes) |
| GET | `/products/one` | Query param: `?filter={...}` |
| GET | `/products/count` | Query param: `?where={...}` |

#### Custom Controller with Manual Filter Handling

For custom endpoints, handle filters manually:

```typescript
// src/controllers/product.controller.ts
import { controller, BaseController, inject } from '@venizia/ignis';
import { FilterSchema, TFilter } from '@venizia/ignis';
import { ProductRepository } from '@/repositories';
import { Product, TProductSchema } from '@/models';

@controller({ path: '/products' })
export class ProductController extends BaseController {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepo: ProductRepository,
  ) {
    super({ scope: 'ProductController', path: '/products' });
  }

  override binding() {
    // Custom search endpoint with filter
    this.defineRoute({
      configs: {
        path: '/search',
        method: 'get',
        query: {
          filter: FilterSchema,  // Zod schema for validation
        },
      },
      handler: async (context) => {
        const { filter = {} } = context.req.valid('query');

        // Pass filter to repository
        const results = await this._productRepo.find({ filter });

        return context.json(results);
      },
    });

    // Custom endpoint with programmatic filter
    this.defineRoute({
      configs: {
        path: '/featured',
        method: 'get',
      },
      handler: async (context) => {
        // Build filter programmatically
        const filter: TFilter<TProductSchema> = {
          where: {
            isFeatured: true,
            status: 'active',
          },
          order: ['priority DESC', 'createdAt DESC'],
          limit: 10,
        };

        const results = await this._productRepo.find({ filter });
        return context.json(results);
      },
    });
  }
}
```

### Service Layer

Services can modify filters before passing to repositories:

```typescript
// src/services/product.service.ts
import { service, inject } from '@venizia/ignis';
import { ProductRepository } from '@/repositories';
import { TFilter, TWhere } from '@venizia/ignis';
import { Product, TProductSchema } from '@/models';

@service()
export class ProductService {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepo: ProductRepository,
  ) {}

  /**
   * Find products with automatic soft-delete filtering
   */
  async findProducts(filter: TFilter<TProductSchema> = {}) {
    // Merge user filter with soft-delete condition
    const enhancedFilter: TFilter<TProductSchema> = {
      ...filter,
      where: {
        ...filter.where,
        deletedAt: { is: null },  // Only non-deleted records
      },
    };

    return this._productRepo.find({ filter: enhancedFilter });
  }

  /**
   * Find products with tenant isolation
   */
  async findProductsForTenant(
    tenantId: string,
    filter: TFilter<TProductSchema> = {},
  ) {
    const isolatedFilter: TFilter<TProductSchema> = {
      ...filter,
      where: {
        ...filter.where,
        tenantId,  // Force tenant isolation
      },
    };

    return this._productRepo.find({ filter: isolatedFilter });
  }

  /**
   * Search products with price range validation
   */
  async searchProducts(opts: {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    category?: string;
    limit?: number;
  }) {
    const { query, minPrice, maxPrice, category, limit = 20 } = opts;

    const where: TWhere<TProductSchema> = {
      status: 'active',
      deletedAt: { is: null },
    };

    // Add optional conditions
    if (query) {
      where.or = [
        { name: { ilike: `%${query}%` } },
        { description: { ilike: `%${query}%` } },
      ];
    }

    if (minPrice !== undefined) {
      where.price = { ...where.price, gte: minPrice };
    }

    if (maxPrice !== undefined) {
      where.price = { ...where.price, lte: maxPrice };
    }

    if (category) {
      where.category = category;
    }

    return this._productRepo.find({
      filter: {
        where,
        order: ['createdAt DESC'],
        limit,
      },
    });
  }
}
```

### Repository Layer

Repositories receive filters and execute queries:

```typescript
// src/repositories/product.repository.ts
import { repository, DefaultCRUDRepository } from '@venizia/ignis';
import { Product, TProductSchema } from '@/models';
import { PostgresDataSource } from '@/datasources';

@repository({ model: Product, dataSource: PostgresDataSource })
export class ProductRepository extends DefaultCRUDRepository<TProductSchema> {
  /**
   * Custom method with internal filter logic
   */
  async findActiveByCategory(opts: { category: string }) {
    return this.find({
      filter: {
        where: {
          category: opts.category,
          status: 'active',
          quantity: { gt: 0 },
        },
        order: ['name ASC'],
      },
    });
  }

  /**
   * Override find to add default behavior
   */
  override async find<R = TProductSchema['$inferSelect']>(opts: {
    filter: TFilter<TProductSchema>;
  }) {
    // Ensure limit is always set
    const filter = {
      ...opts.filter,
      limit: opts.filter.limit ?? 100,  // Default max 100
    };

    return super.find<R>({ filter });
  }
}
```

### HTTP Request Examples

**cURL:**
```bash
# Simple filter
curl "http://localhost:3000/products?filter=%7B%22where%22%3A%7B%22status%22%3A%22active%22%7D%2C%22limit%22%3A10%7D"

# Decoded filter: {"where":{"status":"active"},"limit":10}

# Complex filter with URL encoding
curl -G "http://localhost:3000/products" \
  --data-urlencode 'filter={"where":{"price":{"gte":100,"lte":500},"tags":{"contains":["featured"]}},"order":["price ASC"],"limit":20}'
```

**JavaScript/TypeScript:**
```typescript
// Using fetch
const filter = {
  where: { status: 'active', price: { lte: 100 } },
  order: ['createdAt DESC'],
  limit: 10,
};

const response = await fetch(
  `/api/products?filter=${encodeURIComponent(JSON.stringify(filter))}`
);

// Using axios
const response = await axios.get('/api/products', {
  params: { filter: JSON.stringify(filter) },
});
```


## 3. Complete Operator Reference

This section provides an exhaustive reference for every supported operator.

### 3.1 Equality & Comparison Operators

#### `eq` - Equal To

Matches records where field equals the value.

```typescript
// Filter
{ where: { status: 'active' } }
// Explicit form
{ where: { status: { eq: 'active' } } }

// SQL: WHERE "status" = 'active'
```

**Special Cases:**
```typescript
// Null equality
{ where: { deletedAt: null } }
{ where: { deletedAt: { eq: null } } }
// SQL: WHERE "deleted_at" IS NULL

// Array shorthand (becomes IN)
{ where: { id: [1, 2, 3] } }
// SQL: WHERE "id" IN (1, 2, 3)
```


#### `ne` / `neq` - Not Equal To

Matches records where field does NOT equal the value.

```typescript
// Filter
{ where: { status: { ne: 'deleted' } } }
{ where: { status: { neq: 'deleted' } } }  // Alias

// SQL: WHERE "status" != 'deleted'
```

**Null handling:**
```typescript
{ where: { deletedAt: { ne: null } } }
// SQL: WHERE "deleted_at" IS NOT NULL
```


#### `gt` - Greater Than

Matches records where field is greater than the value.

```typescript
// Numbers
{ where: { price: { gt: 100 } } }
// SQL: WHERE "price" > 100

// Dates
{ where: { createdAt: { gt: new Date('2024-01-01') } } }
// SQL: WHERE "created_at" > '2024-01-01'

// Strings (lexicographic)
{ where: { name: { gt: 'M' } } }
// SQL: WHERE "name" > 'M'
```


#### `gte` - Greater Than or Equal

Matches records where field is greater than or equal to the value.

```typescript
{ where: { quantity: { gte: 10 } } }
// SQL: WHERE "quantity" >= 10

// Combined with other operators
{ where: { age: { gte: 18, lt: 65 } } }
// SQL: WHERE "age" >= 18 AND "age" < 65
```


#### `lt` - Less Than

Matches records where field is less than the value.

```typescript
{ where: { stock: { lt: 5 } } }
// SQL: WHERE "stock" < 5
```


#### `lte` - Less Than or Equal

Matches records where field is less than or equal to the value.

```typescript
{ where: { rating: { lte: 3 } } }
// SQL: WHERE "rating" <= 3
```


### 3.2 Null Check Operators

#### `is` - IS NULL / Equality

Checks for null or exact value match.

```typescript
// NULL check
{ where: { deletedAt: { is: null } } }
// SQL: WHERE "deleted_at" IS NULL

// Value check (same as eq)
{ where: { status: { is: 'active' } } }
// SQL: WHERE "status" = 'active'
```


#### `isn` - IS NOT NULL / Not Equality

Checks for non-null or value mismatch.

```typescript
// NOT NULL check
{ where: { verifiedAt: { isn: null } } }
// SQL: WHERE "verified_at" IS NOT NULL

// Value check (same as ne)
{ where: { status: { isn: 'deleted' } } }
// SQL: WHERE "status" != 'deleted'
```


### 3.3 List/Inclusion Operators

#### `in` / `inq` - In Array

Matches records where field value is in the provided array.

```typescript
{ where: { status: { in: ['active', 'pending', 'review'] } } }
{ where: { status: { inq: ['active', 'pending', 'review'] } } }  // Alias

// SQL: WHERE "status" IN ('active', 'pending', 'review')

// Numeric IDs
{ where: { categoryId: { in: [1, 2, 3, 4, 5] } } }
// SQL: WHERE "category_id" IN (1, 2, 3, 4, 5)
```

**Edge Cases:**
```typescript
// Empty array → matches nothing (returns no rows)
{ where: { id: { in: [] } } }
// SQL: WHERE false

// Single value (works same as eq)
{ where: { id: { in: [42] } } }
// SQL: WHERE "id" IN (42)
```


#### `nin` - Not In Array

Matches records where field value is NOT in the provided array.

```typescript
{ where: { status: { nin: ['deleted', 'archived', 'banned'] } } }
// SQL: WHERE "status" NOT IN ('deleted', 'archived', 'banned')
```

**Edge Cases:**
```typescript
// Empty array → matches everything
{ where: { id: { nin: [] } } }
// SQL: WHERE true
```


### 3.4 String Matching Operators

#### `like` - Pattern Matching (Case-Sensitive)

Matches strings using SQL LIKE patterns.

```typescript
// Starts with
{ where: { email: { like: '%@gmail.com' } } }
// SQL: WHERE "email" LIKE '%@gmail.com'

// Contains
{ where: { name: { like: '%john%' } } }
// SQL: WHERE "name" LIKE '%john%'

// Ends with
{ where: { filename: { like: '%.pdf' } } }
// SQL: WHERE "filename" LIKE '%.pdf'

// Single character wildcard
{ where: { code: { like: 'A_B' } } }  // Matches 'A1B', 'AXB', etc.
// SQL: WHERE "code" LIKE 'A_B'
```

**Pattern Characters:**
- `%` - Matches any sequence of characters (including empty)
- `_` - Matches exactly one character


#### `nlike` - Not Like

Matches strings that do NOT match the pattern.

```typescript
{ where: { email: { nlike: '%@test.com' } } }
// SQL: WHERE "email" NOT LIKE '%@test.com'
```


#### `ilike` - Case-Insensitive Pattern Matching

PostgreSQL-specific case-insensitive LIKE.

```typescript
{ where: { name: { ilike: '%john%' } } }
// SQL: WHERE "name" ILIKE '%john%'
// Matches: 'John', 'JOHN', 'john', 'JoHn'

{ where: { email: { ilike: '%@GMAIL.COM' } } }
// Matches: 'user@gmail.com', 'USER@Gmail.Com'
```


#### `nilike` - Not ILike

Case-insensitive NOT LIKE.

```typescript
{ where: { email: { nilike: '%@example%' } } }
// SQL: WHERE NOT ("email" ILIKE '%@example%')
```


#### `regexp` - Regular Expression (Case-Sensitive)

PostgreSQL POSIX regex matching.

```typescript
// Starts with letter
{ where: { code: { regexp: '^[A-Z]' } } }
// SQL: WHERE "code" ~ '^[A-Z]'

// Email pattern
{ where: { email: { regexp: '^[a-z]+@[a-z]+\\.[a-z]+$' } } }
// SQL: WHERE "email" ~ '^[a-z]+@[a-z]+\.[a-z]+$'

// Phone number pattern
{ where: { phone: { regexp: '^\\+?[0-9]{10,15}$' } } }
```


#### `iregexp` - Case-Insensitive Regular Expression

PostgreSQL case-insensitive POSIX regex.

```typescript
{ where: { name: { iregexp: '^john' } } }
// SQL: WHERE "name" ~* '^john'
// Matches: 'John Doe', 'JOHN SMITH', 'john'
```


### 3.5 Range Operators

#### `between` - Between Two Values

Matches values within a range (inclusive).

```typescript
// Numeric range
{ where: { price: { between: [100, 500] } } }
// SQL: WHERE "price" BETWEEN 100 AND 500

// Date range
{
  where: {
    createdAt: {
      between: [new Date('2024-01-01'), new Date('2024-12-31')]
    }
  }
}
// SQL: WHERE "created_at" BETWEEN '2024-01-01' AND '2024-12-31'

// String range (lexicographic)
{ where: { lastName: { between: ['A', 'M'] } } }
// SQL: WHERE "last_name" BETWEEN 'A' AND 'M'
```

> [!WARNING]
> The value MUST be an array with exactly 2 elements `[min, max]`. Invalid values throw an error.


#### `notBetween` - Outside Range

Matches values outside the specified range.

```typescript
{ where: { score: { notBetween: [40, 60] } } }
// SQL: WHERE NOT ("score" BETWEEN 40 AND 60)
// Matches: scores < 40 OR scores > 60

// Exclude business hours
{
  where: {
    createdAt: {
      notBetween: [new Date('2024-01-01T09:00'), new Date('2024-01-01T17:00')]
    }
  }
}
```


### 3.6 PostgreSQL Array Column Operators

These operators work with array-type columns (`varchar[]`, `integer[]`, `text[]`, etc.).

#### `contains` (@>) - Array Contains All

Matches rows where the array column contains ALL specified elements.

```typescript
// Schema: tags varchar(100)[]

// Find products with BOTH 'electronics' AND 'featured'
{ where: { tags: { contains: ['electronics', 'featured'] } } }
// SQL: "tags"::text[] @> ARRAY['electronics', 'featured']::text[]

// Single element
{ where: { tags: { contains: ['sale'] } } }
// SQL: "tags"::text[] @> ARRAY['sale']::text[]

// Numeric arrays
{ where: { scores: { contains: [100, 90] } } }
// SQL: "scores" @> ARRAY[100, 90]
```

**Visual Example:**

| Product | tags | `contains ['featured']` | `contains ['a', 'b']` |
|---------|------|------------------------|----------------------|
| A | `['featured', 'sale']` | ✅ | ❌ |
| B | `['a', 'b', 'c']` | ❌ | ✅ |
| C | `['featured', 'a', 'b']` | ✅ | ✅ |


#### `containedBy` (<@) - Array Is Subset Of

Matches rows where ALL array elements are within the specified set.

```typescript
// Find products where ALL tags are in the allowed list
{
  where: {
    tags: { containedBy: ['sale', 'featured', 'new', 'popular'] }
  }
}
// SQL: "tags"::text[] <@ ARRAY['sale', 'featured', 'new', 'popular']::text[]
```

**Visual Example:**

| Product | tags | `containedBy ['sale', 'featured', 'new']` |
|---------|------|------------------------------------------|
| A | `['sale', 'featured']` | ✅ (all in list) |
| B | `['sale', 'premium']` | ❌ ('premium' not in list) |
| C | `[]` | ✅ (empty is subset of everything) |


#### `overlaps` (&&) - Arrays Share Any Element

Matches rows where the arrays share at least one common element.

```typescript
// Find products with ANY of these tags
{ where: { tags: { overlaps: ['premium', 'sale', 'clearance'] } } }
// SQL: "tags"::text[] && ARRAY['premium', 'sale', 'clearance']::text[]
```

**Visual Example:**

| Product | tags | `overlaps ['sale', 'premium']` |
|---------|------|-------------------------------|
| A | `['featured', 'sale']` | ✅ (has 'sale') |
| B | `['premium', 'luxury']` | ✅ (has 'premium') |
| C | `['new', 'featured']` | ❌ (no overlap) |


#### Array Operators - Empty Value Behavior

| Operator | Empty `[]` | Behavior |
|----------|------------|----------|
| `contains` | `{ contains: [] }` | Returns ALL rows (everything contains empty set) |
| `containedBy` | `{ containedBy: [] }` | Returns only rows with empty arrays |
| `overlaps` | `{ overlaps: [] }` | Returns NO rows (nothing overlaps with empty) |


## 4. Advanced JSON/JSONB Filtering

Ignis supports filtering by nested fields within JSON/JSONB columns using dot notation.

### Basic JSON Path Syntax

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

### JSON with Operators

```typescript
// Numeric comparison (automatic safe casting)
{ where: { 'metadata.score': { gt: 80 } } }
// SQL: CASE WHEN ("metadata" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//      THEN ("metadata" #>> '{score}')::numeric ELSE NULL END > 80

// Range comparison
{
  where: {
    'metadata.priority': { gte: 1, lte: 5 }
  }
}

// Between
{ where: { 'metadata.score': { between: [70, 90] } } }

// Pattern matching
{ where: { 'metadata.level': { ilike: '%high%' } } }
// SQL: "metadata" #>> '{level}' ILIKE '%high%'

// IN operator
{ where: { 'metadata.status': { in: ['pending', 'review'] } } }
```

### Safe Numeric Casting

JSON fields may contain mixed types. Ignis uses safe casting to prevent database errors:

```typescript
// Data in database:
// Row 1: { "score": 85 }      ← number
// Row 2: { "score": "high" }  ← string
// Row 3: { "score": null }    ← null

// Query with numeric operator
{ where: { 'metadata.score': { gt: 50 } } }

// Generated SQL (safe casting):
// CASE WHEN ("metadata" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//      THEN ("metadata" #>> '{score}')::numeric
//      ELSE NULL
// END > 50

// Result:
// Row 1: ✅ 85 > 50 → matched
// Row 2: ❌ "high" → NULL → not matched
// Row 3: ❌ null → NULL → not matched
```

### Complex JSON Filtering

```typescript
// Combine JSON and regular columns
{
  where: {
    status: 'active',
    'metadata.priority': { gte: 3 },
    'metadata.user.verified': true,
  }
}

// OR with JSON paths
{
  where: {
    or: [
      { 'metadata.priority': 1 },
      { 'metadata.priority': 5 },
      { 'metadata.isUrgent': true },
    ]
  }
}

// AND with nested conditions
{
  where: {
    and: [
      { 'metadata.score': { gte: 80 } },
      {
        or: [
          { 'metadata.level': 'high' },
          { 'metadata.promoted': true },
        ]
      }
    ]
  }
}
```

### JSON Path Validation

Path components are validated to prevent SQL injection:

```typescript
// ✅ Valid paths
'metadata.fieldName'
'metadata.nested.deep.value'
'data.items[0]'
'config.user_id'
'data.meta-data'  // kebab-case allowed

// ❌ Invalid (throws error)
'metadata.field;DROP TABLE'
'data.123invalid'
'config.(SELECT * FROM users)'
```


## 5. Logical Operators & Combinations

### Implicit AND

Multiple conditions in the same object are combined with AND:

```typescript
{
  where: {
    status: 'active',
    role: 'admin',
    verified: true,
  }
}
// SQL: WHERE "status" = 'active' AND "role" = 'admin' AND "verified" = true
```

### Explicit AND

Use `and` array for explicit AND conditions:

```typescript
{
  where: {
    and: [
      { status: 'active' },
      { role: { in: ['admin', 'moderator'] } },
      { createdAt: { gte: new Date('2024-01-01') } },
    ]
  }
}
// SQL: WHERE ("status" = 'active')
//        AND ("role" IN ('admin', 'moderator'))
//        AND ("created_at" >= '2024-01-01')
```

### OR Operator

Use `or` array for OR conditions:

```typescript
{
  where: {
    or: [
      { status: 'active' },
      { isPublished: true },
      { featured: true },
    ]
  }
}
// SQL: WHERE ("status" = 'active')
//         OR ("is_published" = true)
//         OR ("featured" = true)
```

### Nested AND/OR

Combine AND and OR for complex logic:

```typescript
// (status = 'active' AND verified = true) OR (role = 'admin')
{
  where: {
    or: [
      {
        and: [
          { status: 'active' },
          { verified: true },
        ]
      },
      { role: 'admin' },
    ]
  }
}

// status = 'active' AND (role = 'admin' OR role = 'moderator')
{
  where: {
    status: 'active',
    or: [
      { role: 'admin' },
      { role: 'moderator' },
    ]
  }
}
// Equivalent to:
{
  where: {
    status: 'active',
    role: { in: ['admin', 'moderator'] },
  }
}
```

### NOT Logic

Use negation operators for NOT conditions:

```typescript
// NOT equal
{ where: { status: { ne: 'deleted' } } }

// NOT IN
{ where: { status: { nin: ['deleted', 'banned'] } } }

// NOT LIKE
{ where: { email: { nlike: '%@test.com' } } }

// NOT NULL
{ where: { verifiedAt: { isn: null } } }

// NOT BETWEEN
{ where: { score: { notBetween: [40, 60] } } }
```


## 6. Massive Filter Example

Here's a comprehensive example combining multiple features:

```typescript
// E-commerce: Find featured products with complex conditions
const massiveFilter: TFilter<TProductSchema> = {
  where: {
    // Basic conditions (implicit AND)
    status: 'active',
    deletedAt: { is: null },

    // Price range
    price: { gte: 50, lte: 500 },

    // Must have stock
    quantity: { gt: 0 },

    // Array: Must have both tags
    tags: { contains: ['electronics', 'portable'] },

    // JSON: Priority check
    'metadata.priority': { gte: 3 },

    // JSON: Feature flags
    'metadata.features.wireless': true,

    // Complex OR condition
    or: [
      // Either: High rating
      { rating: { gte: 4.5 } },
      // Or: Featured with promotion
      {
        and: [
          { isFeatured: true },
          { 'metadata.promotion.active': true },
          { 'metadata.promotion.discount': { gte: 20 } },
        ]
      },
      // Or: New arrival this month
      {
        createdAt: { gte: new Date('2024-12-01') },
        'metadata.isNewArrival': true,
      },
    ],

    // Exclude certain categories
    category: { nin: ['discontinued', 'recalled'] },

    // Supplier overlap
    suppliers: { overlaps: ['supplier-a', 'supplier-b'] },
  },

  // Field selection
  fields: ['id', 'name', 'price', 'rating', 'tags', 'metadata'],

  // Sorting: JSON field, then regular field
  order: ['metadata.priority DESC', 'rating DESC', 'createdAt DESC'],

  // Pagination
  limit: 20,
  skip: 0,

  // Include related data
  include: [
    { relation: 'category' },
    {
      relation: 'reviews',
      scope: {
        where: { rating: { gte: 4 } },
        order: ['createdAt DESC'],
        limit: 5,
      },
    },
  ],
};

const products = await productRepo.find({ filter: massiveFilter });
```


## 7. Use Case Gallery

### 7.1 E-commerce: Product Search

```typescript
// Find products in 'electronics' category, price $100-$500, in stock, sorted by rating
const filter: TFilter<TProductSchema> = {
  where: {
    category: 'electronics',
    price: { between: [100, 500] },
    quantity: { gt: 0 },
    status: 'active',
  },
  order: ['rating DESC', 'reviewCount DESC'],
  fields: ['id', 'name', 'price', 'rating', 'imageUrl'],
  limit: 24,
};

const products = await productRepo.find({ filter });
```

### 7.2 Admin Dashboard: Recent Users

```typescript
// Find users created in the last 30 days who are NOT 'banned' and have verified emails
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const filter: TFilter<TUserSchema> = {
  where: {
    createdAt: { gte: thirtyDaysAgo },
    status: { nin: ['banned', 'suspended'] },
    emailVerifiedAt: { isn: null },  // IS NOT NULL
  },
  order: ['createdAt DESC'],
  fields: ['id', 'email', 'name', 'createdAt', 'status'],
  limit: 50,
};

const recentUsers = await userRepo.find({ filter });
```

### 7.3 Task Management: Priority Tags

```typescript
// Find items with tags overlapping ['urgent', 'high-priority']
const filter: TFilter<TTaskSchema> = {
  where: {
    status: { nin: ['completed', 'cancelled'] },
    tags: { overlaps: ['urgent', 'high-priority'] },
    assigneeId: currentUserId,
  },
  order: ['dueDate ASC', 'createdAt ASC'],
  include: [{ relation: 'project' }],
};

const priorityTasks = await taskRepo.find({ filter });
```

### 7.4 Soft Delete Handling

```typescript
// Find active records (soft delete pattern)
const filter: TFilter<TRecordSchema> = {
  where: {
    deletedAt: { is: null },
    // ... other conditions
  },
};

// Find ALL records including soft-deleted
const allFilter: TFilter<TRecordSchema> = {
  where: {
    // No deletedAt condition
  },
};

// Find ONLY soft-deleted records
const deletedFilter: TFilter<TRecordSchema> = {
  where: {
    deletedAt: { isn: null },  // IS NOT NULL
  },
};
```

### 7.5 Nested Relation Filter

```typescript
// Find Orders where the included Customer has vip: true
// Note: Relation filtering is done via include scope
const filter: TFilter<TOrderSchema> = {
  where: {
    status: 'pending',
    total: { gte: 1000 },
  },
  include: [
    {
      relation: 'customer',
      scope: {
        where: { isVip: true },
      },
    },
    {
      relation: 'items',
      scope: {
        include: [{ relation: 'product' }],
      },
    },
  ],
  order: ['createdAt DESC'],
};

const vipOrders = await orderRepo.find({ filter });
```

### 7.6 Full-Text Search with Metadata

```typescript
// Search products with text matching and JSON metadata filtering
const searchProducts = async (query: string, filters: {
  minRating?: number;
  maxPrice?: number;
  features?: string[];
}) => {
  const where: TWhere<TProductSchema> = {
    status: 'active',
    deletedAt: { is: null },
  };

  // Text search across multiple fields
  if (query) {
    where.or = [
      { name: { ilike: `%${query}%` } },
      { description: { ilike: `%${query}%` } },
      { 'metadata.keywords': { ilike: `%${query}%` } },
    ];
  }

  // Rating filter
  if (filters.minRating) {
    where.rating = { gte: filters.minRating };
  }

  // Price filter
  if (filters.maxPrice) {
    where.price = { lte: filters.maxPrice };
  }

  // Feature requirements (JSON array)
  if (filters.features?.length) {
    where['metadata.features'] = { contains: filters.features };
  }

  return productRepo.find({
    filter: {
      where,
      order: ['rating DESC', 'createdAt DESC'],
      limit: 50,
    },
  });
};
```

### 7.7 Date Range Queries

```typescript
// Find records within a specific time window
const filter: TFilter<TEventSchema> = {
  where: {
    // Events this week
    startDate: {
      gte: startOfWeek(new Date()),
      lte: endOfWeek(new Date()),
    },
    // OR events starting soon
    or: [
      {
        startDate: {
          between: [new Date(), addDays(new Date(), 7)],
        }
      }
    ],
  },
  order: ['startDate ASC'],
};

// Exclude specific time range
const excludeFilter: TFilter<TEventSchema> = {
  where: {
    // Exclude lunch hours
    startTime: { notBetween: ['12:00', '13:00'] },
  },
};
```

### 7.8 Complex Authorization Filter

```typescript
// Apply role-based access control via filter
const getAuthorizedFilter = (user: User): TWhere<TDocumentSchema> => {
  // Admins see everything
  if (user.role === 'admin') {
    return { deletedAt: { is: null } };
  }

  // Regular users see their own + public documents
  return {
    deletedAt: { is: null },
    or: [
      { ownerId: user.id },
      { isPublic: true },
      {
        // Shared with user's teams
        sharedWithTeams: { overlaps: user.teamIds },
      },
      {
        // Explicitly shared with user
        sharedWithUsers: { contains: [user.id] },
      },
    ],
  };
};

const documents = await documentRepo.find({
  filter: {
    where: getAuthorizedFilter(currentUser),
    order: ['updatedAt DESC'],
    limit: 100,
  },
});
```


## 8. Pro Tips & Edge Cases

### Tip 1: JSON Numeric vs String Comparison

```typescript
// JSON field contains: { "priority": "3" } (string)
// This WON'T match numeric comparison!
{ where: { 'metadata.priority': { gt: 2 } } }  // ❌ NULL due to safe casting

// Use string comparison instead
{ where: { 'metadata.priority': { gt: '2' } } }  // ✅ Lexicographic compare

// Or ensure your data stores numbers properly
{ "priority": 3 }  // Store as number, not string
```

### Tip 2: Empty Array Handling

```typescript
// Empty IN → no results
{ where: { id: { in: [] } } }  // SQL: WHERE false

// Empty NIN → all results
{ where: { id: { nin: [] } } }  // SQL: WHERE true

// Check array length before filtering
const ids = getUserSelectedIds();
if (ids.length === 0) {
  return [];  // Early return instead of empty IN
}
```

### Tip 3: Null-Safe JSON Paths

```typescript
// If JSON field doesn't exist, #>> returns NULL
// This is safe - no errors, just no matches
{ where: { 'metadata.nonexistent.field': 'value' } }
// SQL: "metadata" #>> '{nonexistent,field}' = 'value'
// Result: No rows (NULL != 'value')
```

### Tip 4: Performance with Large IN Arrays

```typescript
// For very large arrays (1000+ items), consider chunking
const allIds = getLargeIdList();  // 5000 IDs

// Chunk and merge results
const chunkSize = 500;
const results = [];
for (let i = 0; i < allIds.length; i += chunkSize) {
  const chunk = allIds.slice(i, i + chunkSize);
  const chunkResults = await repo.find({
    filter: { where: { id: { in: chunk } } }
  });
  results.push(...chunkResults);
}
```

### Tip 5: Order By JSON Fields

```typescript
// JSON ordering uses #> (preserves type) not #>> (text)
{ order: ['metadata.priority DESC'] }
// SQL: "metadata" #> '{priority}' DESC

// JSONB comparison order:
// null < boolean < number < string < array < object
```

### Tip 6: Debugging Filters

```typescript
// Enable logging to see generated SQL
const result = await repo.find({
  filter: complexFilter,
  options: {
    log: { use: true, level: 'debug' },
  },
});

// Or use buildQuery to inspect without executing
const queryOptions = repo.buildQuery({ filter: complexFilter });
console.log('Generated query options:', queryOptions);
```


## 9. Quick Reference

| Want to... | Filter Syntax |
|------------|---------------|
| Equals | `{ field: value }` or `{ field: { eq: value } }` |
| Not equals | `{ field: { ne: value } }` |
| Greater than | `{ field: { gt: value } }` |
| Greater or equal | `{ field: { gte: value } }` |
| Less than | `{ field: { lt: value } }` |
| Less or equal | `{ field: { lte: value } }` |
| Is null | `{ field: null }` or `{ field: { is: null } }` |
| Is not null | `{ field: { isn: null } }` |
| In list | `{ field: { in: [a, b, c] } }` |
| Not in list | `{ field: { nin: [a, b, c] } }` |
| Range | `{ field: { between: [min, max] } }` |
| Outside range | `{ field: { notBetween: [min, max] } }` |
| Contains pattern | `{ field: { like: '%pattern%' } }` |
| Case-insensitive | `{ field: { ilike: '%pattern%' } }` |
| Regex match | `{ field: { regexp: '^pattern$' } }` |
| Array contains all | `{ arrayField: { contains: [a, b] } }` |
| Array is subset | `{ arrayField: { containedBy: [a, b, c] } }` |
| Array overlaps | `{ arrayField: { overlaps: [a, b] } }` |
| JSON nested | `{ 'jsonField.nested.path': value }` |
| JSON with operator | `{ 'jsonField.path': { gt: 10 } }` |
| AND conditions | `{ a: 1, b: 2 }` or `{ and: [{a: 1}, {b: 2}] }` |
| OR conditions | `{ or: [{ a: 1 }, { b: 2 }] }` |
| Include relation | `{ include: [{ relation: 'name' }] }` |
| Nested include | `{ include: [{ relation: 'a', scope: { include: [{ relation: 'b' }] } }] }` |
| Select fields | `{ fields: ['id', 'name'] }` |
| Order by | `{ order: ['field DESC'] }` |
| Order by JSON | `{ order: ['jsonField.path DESC'] }` |
| Paginate | `{ limit: 10, skip: 20 }` |
