---
title: Use Case Gallery
description: Real-world filter examples with corresponding SQL
difficulty: intermediate
---

# Use Case Gallery

Runnable `filter` objects paired with the SQL `FilterBuilder` produces for them - copy the shape that's closest to what you need. For the operators themselves, start at the [Filter System Overview](./).

## Soft delete

The smallest real use case - `is`/`isn` against a nullable timestamp:

```typescript
// Active (non-deleted) records
const activeRecords = await repository.find({
  filter: { where: { deletedAt: { is: null } } },
});
// SQL: SELECT * FROM "Record" WHERE "deleted_at" IS NULL

// ONLY soft-deleted records
const deletedRecords = await repository.find({
  filter: { where: { deletedAt: { isn: null } } },
});
// SQL: SELECT * FROM "Record" WHERE "deleted_at" IS NOT NULL
```

If every query on a model should exclude deleted rows, encode this once as `settings.defaultFilter` instead of repeating it at every call site - see [Default Filter](./default-filter).

## E-commerce product search

Range, list, and pattern operators combined with field selection and sorting:

```typescript
const products = await productRepository.find({
  filter: {
    where: {
      category: 'electronics',
      price: { between: [100, 500] },
      quantity: { gt: 0 },
      status: 'active',
    },
    order: ['rating DESC', 'reviewCount DESC'],
    fields: ['id', 'name', 'price', 'rating', 'imageUrl'],
    limit: 24,
  },
});

// SQL:
// SELECT "id", "name", "price", "rating", "image_url"
// FROM "Product"
// WHERE "category" = 'electronics'
//   AND "price" BETWEEN 100 AND 500
//   AND "quantity" > 0
//   AND "status" = 'active'
// ORDER BY "rating" DESC, "review_count" DESC
// LIMIT 24
```

## Admin dashboard: recent users

`gte` for a rolling window, `nin` to exclude states, `isn` for presence:

```typescript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentUsers = await userRepository.find({
  filter: {
    where: {
      createdAt: { gte: thirtyDaysAgo },
      status: { nin: ['banned', 'suspended'] },
      emailVerifiedAt: { isn: null },
    },
    order: ['createdAt DESC'],
    fields: ['id', 'email', 'name', 'createdAt', 'status'],
    limit: 50,
  },
});

// SQL:
// SELECT "id", "email", "name", "created_at", "status"
// FROM "User"
// WHERE "created_at" >= '2024-12-01T00:00:00.000Z'
//   AND "status" NOT IN ('banned', 'suspended')
//   AND "email_verified_at" IS NOT NULL
// ORDER BY "created_at" DESC
// LIMIT 50
```

## Multi-tenant isolation at the call site

`settings.defaultFilter` (see [Default Filter](./default-filter)) is the model-level way to enforce a tenant scope. A helper that injects `tenantId` at every call site is the call-site alternative - useful when tenant isolation is a caller concern rather than a per-model constant:

```typescript
const getTenantProducts = (tenantId: string, filter: TFilter<TProductSchema>) =>
  productRepository.find({
    filter: {
      ...filter,
      where: { ...filter.where, tenantId, deletedAt: { is: null } },
    },
  });

await getTenantProducts('tenant-abc', {
  where: { category: 'electronics' },
  order: ['createdAt DESC'],
  limit: 20,
});

// SQL:
// SELECT * FROM "Product"
// WHERE "category" = 'electronics' AND "tenant_id" = 'tenant-abc' AND "deleted_at" IS NULL
// ORDER BY "created_at" DESC
// LIMIT 20
```

Unlike `defaultFilter`'s narrowing merge, this is a plain object spread - `tenantId`/`deletedAt` simply overwrite same-named keys from `filter.where` because they're spread last.

## Task management: priority tags

`nin` plus an array `overlaps` operator, with a relation include:

```typescript
const priorityTasks = await taskRepository.find({
  filter: {
    where: {
      status: { nin: ['completed', 'cancelled'] },
      tags: { overlaps: ['urgent', 'high-priority'] },
      assigneeId: currentUserId,
    },
    order: ['dueDate ASC', 'createdAt ASC'],
    include: [{ relation: 'project' }],
  },
});

// SQL:
// SELECT "Task".*
// FROM "Task"
// WHERE "status" NOT IN ('completed', 'cancelled')
//   AND "tags"::text[] && ARRAY['urgent', 'high-priority']::text[]
//   AND "assignee_id" = 'user-123'
// ORDER BY "due_date" ASC, "created_at" ASC
//
// -- Separate query for relation:
// SELECT * FROM "Project" WHERE "id" IN (...)
```

## Date range queries

`between` for a closed window, `gte` for a rolling one:

```typescript
const startOfWeek = new Date('2024-12-29');
const endOfWeek = new Date('2025-01-04');

const weekEvents = await eventRepository.find({
  filter: {
    where: { eventDate: { between: [startOfWeek, endOfWeek] } },
    order: ['eventDate ASC'],
  },
});
// SQL: SELECT * FROM "Event" WHERE "event_date" BETWEEN '2024-12-29' AND '2025-01-04' ORDER BY "event_date" ASC
```

```typescript
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const recentOrders = await orderRepository.find({
  filter: {
    where: {
      createdAt: { gte: sevenDaysAgo },
      status: { in: ['completed', 'shipped'] },
      total: { gte: 100 },
    },
    order: ['total DESC'],
    limit: 100,
  },
});
// SQL:
// SELECT * FROM "Order"
// WHERE "created_at" >= '2024-12-24T00:00:00.000Z' AND "status" IN ('completed', 'shipped') AND "total" >= 100
// ORDER BY "total" DESC LIMIT 100
```

## Inventory low-stock alert

Nested `or`/`and` groups plus a JSON path presence check:

```typescript
const lowStockProducts = await productRepository.find({
  filter: {
    where: {
      status: 'active',
      quantity: { lte: 10 },
      'metadata.reorderPoint': { isn: null },
      or: [
        { quantity: { lt: 5 } }, // Critical: below 5
        { and: [{ quantity: { lte: 10 } }, { 'metadata.fastMoving': true }] },
      ],
    },
    order: ['quantity ASC'],
    fields: ['id', 'name', 'quantity', 'metadata'],
  },
});

// SQL:
// SELECT "id", "name", "quantity", "metadata"
// FROM "Product"
// WHERE "status" = 'active'
//   AND "quantity" <= 10
//   AND "metadata" #>> '{reorderPoint}' IS NOT NULL
//   AND (
//     "quantity" < 5
//     OR ("quantity" <= 10 AND "metadata" #>> '{fastMoving}' = 'true')
//   )
// ORDER BY "quantity" ASC
```

## Complex authorization filter

A `where` builder branching on role, composed with the caller's own scope - the `or` group only appears for non-admins:

```typescript
const getAuthorizedFilter = (user: User): TWhere<TDocumentSchema> => {
  if (user.role === 'admin') {
    return { deletedAt: { is: null } };
  }

  return {
    deletedAt: { is: null },
    or: [
      { ownerId: user.id },
      { isPublic: true },
      { sharedWithTeams: { overlaps: user.teamIds } },
      { sharedWithUsers: { contains: [user.id] } },
    ],
  };
};

const documents = await documentRepository.find({
  filter: { where: getAuthorizedFilter(currentUser), order: ['updatedAt DESC'], limit: 100 },
});

// SQL (regular user):
// SELECT * FROM "Document"
// WHERE "deleted_at" IS NULL
//   AND (
//     "owner_id" = 'user-123'
//     OR "is_public" = true
//     OR "shared_with_teams"::text[] && ARRAY['team-1', 'team-2']::text[]
//     OR "shared_with_users"::text[] @> ARRAY['user-123']::text[]
//   )
// ORDER BY "updated_at" DESC LIMIT 100
```

## Full-text search with metadata

Conditional `where` assembly - each filter argument adds a key only if the caller supplied it:

```typescript
const searchProducts = async (
  query: string,
  filters: { minRating?: number; maxPrice?: number; categories?: string[] },
) => {
  const where: TWhere<TProductSchema> = { status: 'active', deletedAt: { is: null } };

  if (query) {
    where.or = [
      { name: { ilike: `%${query}%` } },
      { description: { ilike: `%${query}%` } },
      { 'metadata.keywords': { ilike: `%${query}%` } },
    ];
  }
  if (filters.minRating) where.rating = { gte: filters.minRating };
  if (filters.maxPrice) where.price = { lte: filters.maxPrice };
  if (filters.categories?.length) where.categories = { contains: filters.categories };

  return productRepository.find({
    filter: { where, order: ['rating DESC', 'createdAt DESC'], limit: 50 },
  });
};

// searchProducts('wireless', { minRating: 4, maxPrice: 200, categories: ['electronics'] })
//
// SQL:
// SELECT * FROM "Product"
// WHERE "status" = 'active'
//   AND "deleted_at" IS NULL
//   AND ("name" ILIKE '%wireless%' OR "description" ILIKE '%wireless%' OR "metadata" #>> '{keywords}' ILIKE '%wireless%')
//   AND "rating" >= 4
//   AND "price" <= 200
//   AND "categories"::text[] @> ARRAY['electronics']::text[]
// ORDER BY "rating" DESC, "created_at" DESC LIMIT 50
```

## Everything at once

Every operator family, a JSON path, a three-way `or`, and a scoped relation include in one filter - the ceiling of what a single `TFilter` can express:

```typescript
const massiveFilter: TFilter<TProductSchema> = {
  where: {
    status: 'active',
    deletedAt: { is: null },
    price: { gte: 50, lte: 500 },
    quantity: { gt: 0 },
    tags: { contains: ['electronics', 'portable'] },
    'metadata.priority': { gte: 3 },
    'metadata.features.wireless': true,
    or: [
      { rating: { gte: 4.5 } },
      {
        and: [
          { isFeatured: true },
          { 'metadata.promotion.active': true },
          { 'metadata.promotion.discount': { gte: 20 } },
        ],
      },
      { createdAt: { gte: new Date('2024-12-01') }, 'metadata.isNewArrival': true },
    ],
    category: { nin: ['discontinued', 'recalled'] },
    suppliers: { overlaps: ['supplier-a', 'supplier-b'] },
  },
  fields: ['id', 'name', 'price', 'rating', 'tags', 'metadata'],
  order: ['metadata.priority DESC', 'rating DESC', 'createdAt DESC'],
  limit: 20,
  skip: 0,
  include: [
    { relation: 'category' },
    { relation: 'reviews', scope: { where: { rating: { gte: 4 } }, order: ['createdAt DESC'], limit: 5 } },
  ],
};

const products = await productRepository.find({ filter: massiveFilter });

// SQL:
// SELECT "id", "name", "price", "rating", "tags", "metadata"
// FROM "Product"
// WHERE "status" = 'active'
//   AND "deleted_at" IS NULL
//   AND "price" >= 50 AND "price" <= 500
//   AND "quantity" > 0
//   AND "tags"::text[] @> ARRAY['electronics', 'portable']::text[]
//   AND CASE WHEN ("metadata" #>> '{priority}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//       THEN ("metadata" #>> '{priority}')::numeric ELSE NULL END >= 3
//   AND "metadata" #>> '{features,wireless}' = 'true'
//   AND (
//     "rating" >= 4.5
//     OR ("is_featured" = true AND "metadata" #>> '{promotion,active}' = 'true'
//         AND CASE WHEN ("metadata" #>> '{promotion,discount}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//             THEN ("metadata" #>> '{promotion,discount}')::numeric ELSE NULL END >= 20)
//     OR ("created_at" >= '2024-12-01T00:00:00.000Z' AND "metadata" #>> '{isNewArrival}' = 'true')
//   )
//   AND "category" NOT IN ('discontinued', 'recalled')
//   AND "suppliers"::text[] && ARRAY['supplier-a', 'supplier-b']::text[]
// ORDER BY "metadata" #> '{priority}' DESC, "rating" DESC, "created_at" DESC
// LIMIT 20 OFFSET 0
//
// -- Separate queries for relations:
// SELECT * FROM "Category" WHERE "id" IN (...)
// SELECT * FROM "Review" WHERE "product_id" IN (...) AND "rating" >= 4 ORDER BY "created_at" DESC LIMIT 5
```

## See also

- [Filter System Overview](./) - the `filter` shape and every `where` operator family
- [Default Filter](./default-filter) - model-level scoping instead of the call-site pattern shown above
- [Application Usage](./application-usage) - how a filter reaches the repository from an HTTP request
- [Tips & Edge Cases](./tips) - `NULL` handling, empty-array semantics, and other gotchas that show up in filters like these

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
