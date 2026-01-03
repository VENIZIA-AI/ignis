---
title: Fields, Ordering & Pagination
description: Control field selection, sorting, and pagination
difficulty: intermediate
---

# Fields, Ordering & Pagination

Control which fields are returned, how results are sorted, and how to paginate.


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

### JSONB Sort Order

| JSONB Type | Sort Order |
|------------|------------|
| `null` | First (lowest) |
| `boolean` | `false` < `true` |
| `number` | Numeric order |
| `string` | Lexicographic |
| `array` | Element-wise |
| `object` | Key-value |


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

> [!TIP]
> Always use `limit` for public-facing endpoints to prevent memory exhaustion.

### Pagination Helper

```typescript
function getPaginationFilter(page: number, pageSize: number = 20) {
  return {
    limit: pageSize,
    skip: (page - 1) * pageSize
  };
}

// Usage
const filter = {
  where: { status: 'active' },
  ...getPaginationFilter(3, 20)
};
// { where: {...}, limit: 20, skip: 40 }
```


## Combined Example

```typescript
await repo.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'price', 'createdAt'],
    order: ['price ASC', 'createdAt DESC'],
    limit: 20,
    skip: 0
  }
});
```
