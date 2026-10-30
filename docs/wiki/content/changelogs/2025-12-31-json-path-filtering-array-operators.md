---
title: JSON Path Filtering & Array Operators
description: Filters can now reach into JSON/JSONB fields with dot notation, use PostgreSQL array operators, and exclude a range with notBetween, all without raw SQL.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-31

## JSON Path Filtering & PostgreSQL Array Operators

**In one line.** You can filter by nested JSON fields and PostgreSQL array columns, and exclude a range, using normal repository filters.

## What changed

- **JSON path filtering.** A `where` key containing `.` or `[` is treated as a JSON path.
- **Safe numeric comparison.** Comparison operators on JSON fields cast to numeric only when the value is numeric. Non-numeric values become NULL instead of causing a database error.
- **Array operators.** `contains`, `containedBy` and `overlaps` for PostgreSQL array columns.
- **`notBetween`.** Matches values outside a range.

```typescript
await repo.find({
  filter: {
    where: {
      'jValue.priority': 3,
      'jValue.metadata.level': 'high',
      'jValue.tags[0]': 'important',
      'jValue.metadata.score': { gte: 70, lte: 90 },
      'jValue.metadata.level': { ilike: '%igh%' },
    }
  }
});

// Array column: tags varchar(100)[]
await repo.find({ filter: { where: { tags: { contains: ['electronics', 'featured'] } } } });
await repo.find({ filter: { where: { tags: { containedBy: ['sale', 'featured', 'new'] } } } });
await repo.find({ filter: { where: { tags: { overlaps: ['sale', 'premium'] } } } });

// Scores < 40 OR > 60
await repo.find({ filter: { where: { score: { notBetween: [40, 60] } } } });
```

| Operator | PostgreSQL | Description |
|----------|------------|-------------|
| `contains` | `@>` | Array contains ALL specified elements |
| `containedBy` | `<@` | Array is a subset of the specified elements |
| `overlaps` | `&&` | Arrays share ANY common element |

## Who is affected

- **Everyone.** No action needed. Existing filter queries work unchanged.

## Details

- **Security.** JSON path components are validated against `/^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/` to prevent SQL injection. `jValue.user_id`, `jValue.meta-data`, `jValue.items[0]` and `jValue.nested[2].field` are valid; `jValue.field;DROP TABLE` and `jValue.123invalid` throw.
- **Array types.** String arrays (`varchar[]`, `text[]`, `char[]`) are cast to `text[]` on both sides. Numeric and boolean arrays need no casting.
- **Empty arrays.** `{ contains: [] }` is `true`, `{ containedBy: [] }` matches only rows with empty arrays, `{ overlaps: [] }` is `false`.
- See [Query Operators](/references/base/filter-system/quick-reference), [JSON Path Filtering](/references/base/filter-system/json-filtering) and [Array Column Operators](/references/base/filter-system/array-operators).
