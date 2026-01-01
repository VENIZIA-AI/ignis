# List Operators

Operators for matching values against arrays.


## in / inq - In Array

Matches records where field value is in the provided array.

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
| `{ in: [] }` (empty array) | Returns no rows (`false`) |
| `{ nin: [] }` (empty array) | Returns all rows (`true`) |
| `{ in: 'value' }` (non-array) | Treated as `{ eq: 'value' }` |

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
// For very large arrays (1000+ items), consider chunking
const allIds = getLargeIdList();  // 5000 IDs

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
