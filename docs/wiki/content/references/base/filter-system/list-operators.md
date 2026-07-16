---
title: List Operators
description: Operators for matching values against arrays
difficulty: intermediate
---

# List Operators

Operators for matching values against arrays.


## in / inq - In Array

Matches records where field value is in the provided array. `in` and `inq` are aliases and behave identically.

```typescript
{ where: { status: { in: ['active', 'pending', 'review'] } } }
{ where: { status: { inq: ['active', 'pending', 'review'] } } }  // Alias

// SQL: WHERE "status" IN ('active', 'pending', 'review')

// Numeric IDs
{ where: { categoryId: { in: [1, 2, 3, 4, 5] } } }
// SQL: WHERE "category_id" IN (1, 2, 3, 4, 5)
```


## nin - Not In Array

```typescript
{ where: { status: { nin: ['deleted', 'archived', 'banned'] } } }
// SQL: WHERE "status" NOT IN ('deleted', 'archived', 'banned')
```


## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `{ in: [] }` (empty array) | Returns no rows (`WHERE false`) |
| `{ nin: [] }` (empty array) | Returns all rows (`WHERE true`) |
| `{ in: 'value' }` (non-array) | Treated as `{ eq: 'value' }` |
| `{ nin: 'value' }` (non-array) | Treated as `{ ne: 'value' }` |

> [!WARNING]
> `NOT IN` excludes rows where the column is `NULL`. If your column can be `NULL`, use `OR` to include them:
> ```typescript
> where: {
>   or: [
>     { status: { nin: ['deleted'] } },
>     { status: { is: null } }
>   ]
> }
> ```


## Performance Tip

```typescript
import { userRepository } from '@/repositories';

// For very large arrays (1000+ items), consider chunking
const allIds: number[] = [ /* 5000 ids */ ];

const chunkSize = 500;
const results = [];
for (let i = 0; i < allIds.length; i += chunkSize) {
  const chunk = allIds.slice(i, i + chunkSize);
  const chunkResults = await userRepository.find({
    filter: { where: { id: { in: chunk } } }
  });
  results.push(...chunkResults);
}
```

## See also

- [Filter System Overview](./) - the `filter` shape and the full `where` operator table
- [Array Operators](./array-operators) - `contains`/`containedBy`/`overlaps` match against array COLUMNS, not to be confused with `in`/`nin`
- [Quick Reference](./quick-reference) - every operator, one line each

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, per-operator SQL builders
- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `QueryOperators` constants
