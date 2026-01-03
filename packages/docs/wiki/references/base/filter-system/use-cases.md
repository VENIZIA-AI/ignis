---
title: Use Case Gallery
description: Real-world filter examples with corresponding SQL
difficulty: intermediate
---

# Use Case Gallery

Real-world examples of filter usage with corresponding SQL.


## E-commerce Product Search

```typescript
const products = await productRepo.find({
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
  }
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


## Admin Dashboard: Recent Users

```typescript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentUsers = await userRepo.find({
  filter: {
    where: {
      createdAt: { gte: thirtyDaysAgo },
      status: { nin: ['banned', 'suspended'] },
      emailVerifiedAt: { isn: null },
    },
    order: ['createdAt DESC'],
    fields: ['id', 'email', 'name', 'createdAt', 'status'],
    limit: 50,
  }
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


## Task Management: Priority Tags

```typescript
const priorityTasks = await taskRepo.find({
  filter: {
    where: {
      status: { nin: ['completed', 'cancelled'] },
      tags: { overlaps: ['urgent', 'high-priority'] },
      assigneeId: currentUserId,
    },
    order: ['dueDate ASC', 'createdAt ASC'],
    include: [{ relation: 'project' }],
  }
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


## Soft Delete Handling

```typescript
// Find active records (soft delete pattern)
const activeRecords = await repo.find({
  filter: {
    where: { deletedAt: { is: null } },
  }
});

// SQL:
// SELECT * FROM "Record" WHERE "deleted_at" IS NULL
```

```typescript
// Find ONLY soft-deleted records
const deletedRecords = await repo.find({
  filter: {
    where: { deletedAt: { isn: null } },
  }
});

// SQL:
// SELECT * FROM "Record" WHERE "deleted_at" IS NOT NULL
```


## Complex Authorization Filter

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

const documents = await documentRepo.find({
  filter: {
    where: getAuthorizedFilter(currentUser),
    order: ['updatedAt DESC'],
    limit: 100,
  },
});

// SQL (for admin):
// SELECT *
// FROM "Document"
// WHERE "deleted_at" IS NULL
// ORDER BY "updated_at" DESC
// LIMIT 100

// SQL (for regular user):
// SELECT *
// FROM "Document"
// WHERE "deleted_at" IS NULL
//   AND (
//     "owner_id" = 'user-123'
//     OR "is_public" = true
//     OR "shared_with_teams"::text[] && ARRAY['team-1', 'team-2']::text[]
//     OR "shared_with_users"::text[] @> ARRAY['user-123']::text[]
//   )
// ORDER BY "updated_at" DESC
// LIMIT 100
```


## Full-Text Search with Metadata

```typescript
const searchProducts = async (query: string, filters: {
  minRating?: number;
  maxPrice?: number;
  features?: string[];
}) => {
  const where: TWhere<TProductSchema> = {
    status: 'active',
    deletedAt: { is: null },
  };

  if (query) {
    where.or = [
      { name: { ilike: `%${query}%` } },
      { description: { ilike: `%${query}%` } },
      { 'metadata.keywords': { ilike: `%${query}%` } },
    ];
  }

  if (filters.minRating) {
    where.rating = { gte: filters.minRating };
  }

  if (filters.maxPrice) {
    where.price = { lte: filters.maxPrice };
  }

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

// Example: searchProducts('wireless', { minRating: 4, maxPrice: 200, features: ['bluetooth'] })
//
// SQL:
// SELECT *
// FROM "Product"
// WHERE "status" = 'active'
//   AND "deleted_at" IS NULL
//   AND (
//     "name" ILIKE '%wireless%'
//     OR "description" ILIKE '%wireless%'
//     OR "metadata" #>> '{keywords}' ILIKE '%wireless%'
//   )
//   AND "rating" >= 4
//   AND "price" <= 200
//   AND "metadata" #>> '{features}' @> '["bluetooth"]'
// ORDER BY "rating" DESC, "created_at" DESC
// LIMIT 50
```


## Massive Filter Example

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
        ]
      },
      {
        createdAt: { gte: new Date('2024-12-01') },
        'metadata.isNewArrival': true,
      },
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

// SQL:
// SELECT "id", "name", "price", "rating", "tags", "metadata"
// FROM "Product"
// WHERE "status" = 'active'
//   AND "deleted_at" IS NULL
//   AND "price" >= 50 AND "price" <= 500
//   AND "quantity" > 0
//   AND "tags"::text[] @> ARRAY['electronics', 'portable']::text[]
//   AND CASE
//     WHEN ("metadata" #>> '{priority}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//     THEN ("metadata" #>> '{priority}')::numeric ELSE NULL
//   END >= 3
//   AND "metadata" #>> '{features,wireless}' = 'true'
//   AND (
//     "rating" >= 4.5
//     OR (
//       "is_featured" = true
//       AND "metadata" #>> '{promotion,active}' = 'true'
//       AND CASE
//         WHEN ("metadata" #>> '{promotion,discount}') ~ '^-?[0-9]+(\.[0-9]+)?$'
//         THEN ("metadata" #>> '{promotion,discount}')::numeric ELSE NULL
//       END >= 20
//     )
//     OR (
//       "created_at" >= '2024-12-01T00:00:00.000Z'
//       AND "metadata" #>> '{isNewArrival}' = 'true'
//     )
//   )
//   AND "category" NOT IN ('discontinued', 'recalled')
//   AND "suppliers"::text[] && ARRAY['supplier-a', 'supplier-b']::text[]
// ORDER BY "metadata" #> '{priority}' DESC, "rating" DESC, "created_at" DESC
// LIMIT 20 OFFSET 0
//
// -- Separate query for category relation:
// SELECT * FROM "Category" WHERE "id" IN (...)
//
// -- Separate query for reviews relation:
// SELECT * FROM "Review"
// WHERE "product_id" IN (...) AND "rating" >= 4
// ORDER BY "created_at" DESC
// LIMIT 5
```


## Date Range Queries

```typescript
// Events this week
const startOfWeek = new Date('2024-12-29');
const endOfWeek = new Date('2025-01-04');

const weekEvents = await eventRepo.find({
  filter: {
    where: {
      eventDate: { between: [startOfWeek, endOfWeek] }
    },
    order: ['eventDate ASC']
  }
});

// SQL:
// SELECT *
// FROM "Event"
// WHERE "event_date" BETWEEN '2024-12-29' AND '2025-01-04'
// ORDER BY "event_date" ASC
```

```typescript
// Orders in the last 7 days
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const recentOrders = await orderRepo.find({
  filter: {
    where: {
      createdAt: { gte: sevenDaysAgo },
      status: { in: ['completed', 'shipped'] },
      total: { gte: 100 }
    },
    order: ['total DESC'],
    limit: 100
  }
});

// SQL:
// SELECT *
// FROM "Order"
// WHERE "created_at" >= '2024-12-24T00:00:00.000Z'
//   AND "status" IN ('completed', 'shipped')
//   AND "total" >= 100
// ORDER BY "total" DESC
// LIMIT 100
```


## Multi-Tenant Data Isolation

```typescript
const getTenantProducts = async (tenantId: string, filter: TFilter<TProductSchema>) => {
  return productRepo.find({
    filter: {
      ...filter,
      where: {
        ...filter.where,
        tenantId,  // Always enforce tenant isolation
        deletedAt: { is: null },
      },
    },
  });
};

// Usage
await getTenantProducts('tenant-abc', {
  where: { category: 'electronics' },
  order: ['createdAt DESC'],
  limit: 20
});

// SQL:
// SELECT *
// FROM "Product"
// WHERE "category" = 'electronics'
//   AND "tenant_id" = 'tenant-abc'
//   AND "deleted_at" IS NULL
// ORDER BY "created_at" DESC
// LIMIT 20
```


## Inventory Low Stock Alert

```typescript
const lowStockProducts = await productRepo.find({
  filter: {
    where: {
      status: 'active',
      quantity: { lte: 10 },
      'metadata.reorderPoint': { isn: null },
      or: [
        { quantity: { lt: 5 } },  // Critical: below 5
        {
          and: [
            { quantity: { lte: 10 } },
            { 'metadata.fastMoving': true }
          ]
        }
      ]
    },
    order: ['quantity ASC'],
    fields: ['id', 'name', 'quantity', 'metadata']
  }
});

// SQL:
// SELECT "id", "name", "quantity", "metadata"
// FROM "Product"
// WHERE "status" = 'active'
//   AND "quantity" <= 10
//   AND "metadata" #>> '{reorderPoint}' IS NOT NULL
//   AND (
//     "quantity" < 5
//     OR (
//       "quantity" <= 10
//       AND "metadata" #>> '{fastMoving}' = 'true'
//     )
//   )
// ORDER BY "quantity" ASC
```
