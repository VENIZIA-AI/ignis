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
import { userRepository } from '@/repositories';

await userRepository.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'email', 'name']
  }
});
// Returns only: { id, email, name }
```

### Object Format

```typescript
// Include specific fields (only keys with `true` are selected)
await userRepository.find({
  filter: {
    fields: { id: true, email: true, name: true }
  }
});
```

> [!NOTE]
> The object format only supports inclusion (`true` values). Keys set to `false` are simply ignored -- they do not exclude fields. To select specific fields, list the ones you want with `true` or use the array format.


## Ordering

### Basic Ordering

```typescript
// Single column, descending
await userRepository.find({
  filter: { order: ['createdAt DESC'] }
});

// Multiple columns
await userRepository.find({
  filter: { order: ['status ASC', 'createdAt DESC'] }
});

// Default direction is ASC
await userRepository.find({
  filter: { order: ['name'] }  // Same as 'name ASC'
});
```

### Valid Directions

Only `ASC` and `DESC` (case-insensitive) are accepted. Invalid directions throw an error:

```
Error: Invalid direction: 'RANDOM' | Expected: 'ASC' or 'DESC'
```

### JSON Path Ordering

Order by nested fields in JSON columns:

```typescript
await userRepository.find({
  filter: { order: ['metadata.priority DESC'] }
});
// SQL: ORDER BY "metadata" #> '{priority}' DESC

await userRepository.find({
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

### Limit and Skip/Offset

Both `skip` and `offset` are supported as aliases -- they both map to the SQL `OFFSET` clause. When both are provided, `skip` takes precedence.

```typescript
// First 10 results (default limit is 10)
await userRepository.find({
  filter: { limit: 10 }
});

// Page 2 (skip first 10, get next 10)
await userRepository.find({
  filter: { limit: 10, skip: 10 }
});

// Using offset (equivalent to skip)
await userRepository.find({
  filter: { limit: 10, offset: 10 }
});

// Page N formula: skip = (page - 1) * limit
const page = 3;
const pageSize = 20;
await userRepository.find({
  filter: {
    limit: pageSize,
    skip: (page - 1) * pageSize
  }
});
```

> [!TIP]
> Always use `limit` for public-facing endpoints to prevent memory exhaustion. The default limit is 10 if not specified.

### Default Limit

When a query omits `limit`, the repository resolves one with this precedence:

```
query.limit  ??  model settings.defaultLimit  ??  DEFAULT_LIMIT (10)
```

- **`query.limit`** - an explicit `limit` in the filter always wins.
- **`settings.defaultLimit`** - a per-model default set on the `@model` decorator. Must be a positive integer (validated at decoration time). Applies to top-level `find()` and to every to-many relation (using the related model's own `defaultLimit`).
- **`DEFAULT_LIMIT`** - the global fallback, `10`.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { countryTable } from '@/schemas';
import { countryRepository } from '@/repositories';

@model({
  type: 'entity',
  settings: { defaultLimit: 200 },  // Small lookup table - default to 200 rows
})
export class Country extends BaseEntity<typeof Country.schema> {
  static override schema = countryTable;
}

await countryRepository.find({ filter: {} });            // LIMIT 200
await countryRepository.find({ filter: { limit: 10 } }); // LIMIT 10  (explicit wins)
```

> [!NOTE]
> `defaultLimit` is independent of `defaultFilter`: passing `shouldSkipDefaultFilter` to bypass the default `where` clause does **not** drop the default limit. There is no "unbounded" sentinel - to fetch more rows, pass an explicit `limit`.

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


## Range Queries (Content-Range Header)

When building paginated APIs, you often need to return the total count alongside the data for pagination UI. Use `shouldQueryRange: true` to get range information following the HTTP Content-Range standard.

### Basic Usage

```typescript
const result = await userRepository.find({
  filter: { limit: 10, skip: 20 },
  options: { shouldQueryRange: true }
});

// Result structure:
// {
//   data: [...],  // Array of records
//   range: {
//     start: 20,   // Starting index (inclusive)
//     end: 29,     // Ending index (inclusive)
//     total: 100   // Total matching records
//   }
// }
```

### Setting HTTP Headers

Use the range information to set standard HTTP headers:

```typescript
const { data, range } = await userRepository.find({
  filter: { limit: 10, skip: 20, where: { status: 'active' } },
  options: { shouldQueryRange: true }
});

// Format: "records start-end/total"
const contentRange = data.length > 0
  ? `records ${range.start}-${range.end}/${range.total}`
  : `records */${range.total}`;

res.setHeader('Content-Range', contentRange);
// -> "records 20-29/100"
```

### TDataRange Type

```typescript
type TDataRange = {
  start: number;  // Starting index (0-based, inclusive)
  end: number;    // Ending index (0-based, inclusive)
  total: number;  // Total count matching the query
};
```

### Content-Range Format Reference

| Scenario | Content-Range Header |
|----------|---------------------|
| Items 0-9 of 100 | `records 0-9/100` |
| Items 20-29 of 100 | `records 20-29/100` |
| No items found | `records */0` |
| Last page (items 90-99) | `records 90-99/100` |

### Performance Note

When `shouldQueryRange: true`, the repository executes the data query and count query **in parallel** using `Promise.all` for optimal performance.


## Combined Example

```typescript
await userRepository.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'price', 'createdAt'],
    order: ['price ASC', 'createdAt DESC'],
    limit: 20,
    skip: 0
  }
});
```

### With Range Information

```typescript
const { data, range } = await userRepository.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'price', 'createdAt'],
    order: ['price ASC', 'createdAt DESC'],
    limit: 20,
    skip: 0
  },
  options: { shouldQueryRange: true }
});

console.log(`Showing ${range.start}-${range.end} of ${range.total}`);
// -> "Showing 0-19 of 150"
```

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [JSON Filtering](./json-filtering) - JSON path ordering and the JSONB sort-order table
- [Default Filter](./default-filter) - `settings.defaultFilter`, the sibling of `settings.defaultLimit`
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, `toColumns`/`toOrderBy`
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `Sorts` constants
- [`packages/core/src/base/repositories/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/constants.ts) - `DEFAULT_LIMIT`
- [`packages/core/src/base/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/types.ts) - `TDataRange`, `buildDataRange`
