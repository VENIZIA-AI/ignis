---
title: Pro Tips & Edge Cases
description: Advanced tips and common edge cases for filters
difficulty: intermediate
---

# Pro Tips & Edge Cases

Behavior that is easy to assume incorrectly when writing a `filter` - each one verified against `FilterBuilder`/`PostgresQueryOperators`.

## `NOT IN` and `!=` silently exclude `NULL`

SQL three-valued logic, not an IGNIS quirk: a row whose column is `NULL` never matches `nin`, `ne`, or `neq`, because `NULL <> value` evaluates to UNKNOWN rather than TRUE.

```typescript
{ where: { status: { nin: ['deleted'] } } }
// Rows where status IS NULL are NOT returned

// To include them, add an explicit NULL branch:
{ where: { or: [{ status: { nin: ['deleted'] } }, { status: { is: null } }] } }
```

## Empty arrays are not no-ops

```typescript
{ where: { id: { in: [] } } }   // SQL: WHERE false  - matches nothing
{ where: { id: { nin: [] } } }  // SQL: WHERE true   - matches everything
```

This matters most when the array comes from user input - check its length before building the filter:

```typescript
const ids = getUserSelectedIds();
if (ids.length === 0) {
  return []; // early return instead of an accidental WHERE false or WHERE true
}
```

## JSON numeric comparisons need actual JSON numbers

A JSON path comparison casts safely with `CASE WHEN (...) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (...)::numeric ELSE NULL END` - the regex has to match or the cast yields `NULL` and the row is excluded:

```typescript
// { "priority": "3" } (string) - regex matches "3" -> casts to numeric 3 -> 3 > 2 matches
{ where: { 'metadata.priority': { gt: 2 } } }

// { "priority": "high" } - regex fails -> NULL -> never matches
{ where: { 'metadata.priority': { gt: 2 } } }
```

Store numbers as JSON numbers (`{ "priority": 3 }`), not numeric strings, to avoid depending on the cast.

## A missing JSON path is a null-safe miss, not an error

```typescript
{ where: { 'metadata.nonexistent.field': 'value' } }
// SQL: "metadata" #>> '{nonexistent,field}' = 'value'
// No rows match (NULL != 'value') - no exception either
```

## JSON `order` uses `#>`, not `#>>`

`#>` returns JSONB and preserves the value's type; the equality/comparison operators above use `#>>` (text) instead, because sorting needs JSONB's native ordering:

```typescript
{ order: ['metadata.priority DESC'] }
// SQL: "metadata" #> '{priority}' DESC

// JSONB comparison order: null < boolean < number < string < array < object
```

## Array operators accept a bare value

`contains`, `containedBy`, and `overlaps` wrap a non-array operand in a single-element array automatically:

```typescript
{ where: { tags: { contains: ['featured'] } } }
{ where: { tags: { contains: 'featured' } } }
// Equivalent
```

## `fields` as an object only supports inclusion

```typescript
{ fields: { id: true, name: true, email: true } }

// Setting a key to `false` does NOT exclude it - the key is simply ignored.
// To exclude fields, list only the ones you want, as an array:
{ fields: ['id', 'name', 'email'] }
```

## Combining multiple array conditions

`contains`, `containedBy`, and `overlaps` compose like any other operators - as separate keys under an implicit AND:

```typescript
await productRepository.find({
  filter: {
    where: {
      categories: { contains: ['electronics', 'portable'] },  // must have ALL these
      tags: { containedBy: ['new', 'sale', 'featured', 'popular'] }, // must be a subset
      suppliers: { overlaps: ['supplier-a', 'supplier-b'] },  // at least one match
    },
  },
});
```

## Chunk very large `in` arrays

Postgres has no hard `IN`-list limit, but a multi-thousand-element array is worth chunking for query-plan and payload-size reasons:

```typescript
const allIds = getLargeIdList(); // e.g. 5000 IDs
const chunkSize = 500;
const results = [];

for (let i = 0; i < allIds.length; i += chunkSize) {
  const chunk = allIds.slice(i, i + chunkSize);
  results.push(...(await repository.find({ filter: { where: { id: { in: chunk } } } })));
}
```

## Factor out reusable `where`/pagination fragments

A `filter` is a plain object, so common fragments compose with spreads instead of being rewritten per call site:

```typescript
const createActiveFilter = <T extends { status: string; deletedAt: Date | null }>(): TWhere<T> =>
  ({ status: 'active', deletedAt: { is: null } }) as TWhere<T>;

const createPaginationFilter = (page: number, size = 20) => ({
  limit: size,
  skip: (page - 1) * size,
});

const products = await productRepository.find({
  filter: {
    where: { ...createActiveFilter(), category: 'electronics' },
    ...createPaginationFilter(3),
  },
});
```

## See also

- [Filter System Overview](./) - the `filter` shape and every `where` operator family
- [Application Usage -> Debugging a filter](./application-usage#debugging-a-filter) - `buildQuery`, and why `options.log` doesn't apply to `find`
- [Use Case Gallery](./use-cases) - full runnable filters, including date-range and multi-condition examples
- [JSON Filtering](./json-filtering) - the full JSON path operator reference

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, JSON path casting, `toColumns`
- [`packages/core/src/connectors/postgres/repositories/dialect/query.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/query.ts) - `PostgresQueryOperators.FNS`, empty-array and array-operator handling
