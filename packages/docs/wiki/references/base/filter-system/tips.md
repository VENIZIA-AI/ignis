# Pro Tips & Edge Cases

Advanced tips and common edge cases when working with filters.


## Tip 1: JSON Numeric vs String Comparison

```typescript
// JSON field contains: { "priority": "3" } (string)
// This WON'T match numeric comparison!
{ where: { 'metadata.priority': { gt: 2 } } }  // NULL due to safe casting

// Use string comparison instead
{ where: { 'metadata.priority': { gt: '2' } } }  // Lexicographic compare

// Or ensure your data stores numbers properly
{ "priority": 3 }  // Store as number, not string
```


## Tip 2: Empty Array Handling

```typescript
// Empty IN -> no results
{ where: { id: { in: [] } } }  // SQL: WHERE false

// Empty NIN -> all results
{ where: { id: { nin: [] } } }  // SQL: WHERE true

// Check array length before filtering
const ids = getUserSelectedIds();
if (ids.length === 0) {
  return [];  // Early return instead of empty IN
}
```


## Tip 3: Null-Safe JSON Paths

```typescript
// If JSON field doesn't exist, #>> returns NULL
// This is safe - no errors, just no matches
{ where: { 'metadata.nonexistent.field': 'value' } }
// SQL: "metadata" #>> '{nonexistent,field}' = 'value'
// Result: No rows (NULL != 'value')
```


## Tip 4: Performance with Large IN Arrays

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


## Tip 5: Order By JSON Fields

```typescript
// JSON ordering uses #> (preserves type) not #>> (text)
{ order: ['metadata.priority DESC'] }
// SQL: "metadata" #> '{priority}' DESC

// JSONB comparison order:
// null < boolean < number < string < array < object
```


## Tip 6: Debugging Filters

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


## Tip 7: NOT IN with NULL Columns

```typescript
// NOT IN excludes NULL values!
{ where: { status: { nin: ['deleted'] } } }
// Rows where status IS NULL will NOT be returned

// Include NULL values explicitly
{
  where: {
    or: [
      { status: { nin: ['deleted'] } },
      { status: { is: null } }
    ]
  }
}
```


## Tip 8: Combining Multiple Array Conditions

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


## Tip 9: Date Range Queries

```typescript
// This week's events
const startOfWeek = new Date();
startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
const endOfWeek = new Date(startOfWeek);
endOfWeek.setDate(endOfWeek.getDate() + 6);

{
  where: {
    eventDate: { between: [startOfWeek, endOfWeek] }
  }
}

// Last 30 days
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

{
  where: {
    createdAt: { gte: thirtyDaysAgo }
  }
}
```


## Tip 10: Reusable Filter Builders

```typescript
// Create reusable filter builders
const createActiveFilter = <T extends { status: string; deletedAt: Date | null }>(): TWhere<T> => ({
  status: 'active',
  deletedAt: { is: null },
} as TWhere<T>);

const createPaginationFilter = (page: number, size: number = 20) => ({
  limit: size,
  skip: (page - 1) * size,
});

// Usage
const products = await productRepo.find({
  filter: {
    where: {
      ...createActiveFilter(),
      category: 'electronics',
    },
    ...createPaginationFilter(3),
  }
});
```
