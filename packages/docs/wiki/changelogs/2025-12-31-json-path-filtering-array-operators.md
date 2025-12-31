---
title: JSON Path Filtering & Array Operators
description: Added JSON/JSONB path filtering support and PostgreSQL array column operators
---

# Changelog - 2025-12-31

## JSON Path Filtering & PostgreSQL Array Operators

This release adds powerful query capabilities for JSON/JSONB columns and PostgreSQL array columns, enabling complex filtering patterns without raw SQL.

## Overview

- **JSON Path Filtering**: Filter by nested JSON fields using dot notation (e.g., `'jValue.metadata.score': { gt: 80 }`)
- **Array Column Operators**: PostgreSQL-specific operators `contains`, `containedBy`, `overlaps` for array columns
- **Safe Numeric Casting**: Automatic type-safe numeric comparison for mixed-type JSON fields
- **NOT BETWEEN Operator**: Added `notBetween` operator for range exclusion queries
- **Code Refactoring**: Unified JSON path validation and extraction logic

## New Features

### JSON Path Filtering

**Files:**
- `packages/core/src/base/repositories/operators/filter.ts`
- `packages/core/src/base/repositories/operators/query.ts`

**Problem:** Filtering by nested JSON/JSONB fields required raw SQL or manual extraction, making queries complex and error-prone.

**Solution:** Detect JSON paths in filter keys (containing `.` or `[`) and automatically generate PostgreSQL `#>>` extraction expressions with proper type handling.

```typescript
// Before: Not possible with standard filters

// After: Native JSON path support
await repo.find({
  filter: {
    where: {
      // Simple nested field
      'jValue.priority': 3,

      // Deep nesting
      'jValue.metadata.level': 'high',

      // Array index access
      'jValue.tags[0]': 'important',

      // With operators
      'jValue.metadata.score': { gte: 70, lte: 90 },

      // Pattern matching
      'jValue.metadata.level': { ilike: '%igh%' }
    }
  }
});
```

**Generated SQL:**
```sql
WHERE "jValue" #>> '{priority}' = '3'
  AND "jValue" #>> '{metadata,level}' = 'high'
  AND "jValue" #>> '{tags,0}' = 'important'
  AND CASE WHEN ("jValue" #>> '{metadata,score}') ~ '^-?[0-9]+'
      THEN ("jValue" #>> '{metadata,score}')::numeric ELSE NULL END >= 70
  AND CASE WHEN ("jValue" #>> '{metadata,score}') ~ '^-?[0-9]+'
      THEN ("jValue" #>> '{metadata,score}')::numeric ELSE NULL END <= 90
  AND "jValue" #>> '{metadata,level}' ILIKE '%igh%'
```

**Benefits:**
- Intuitive dot notation for nested fields
- Automatic numeric casting for comparison operators
- Safe handling of mixed-type JSON (non-numeric values become NULL, not errors)
- SQL injection prevention via path component validation

### Safe Numeric Casting for JSON

**Problem:** JSON fields can contain mixed types (`{ score: 85 }` vs `{ score: "high" }`). Casting to numeric would crash on non-numeric values.

**Solution:** Safe casting pattern that validates numeric format before casting:

```sql
CASE WHEN ("jValue" #>> '{score}') ~ '^-?[0-9]+(\.[0-9]+)?$'
     THEN ("jValue" #>> '{score}')::numeric
     ELSE NULL
END
```

This ensures:
- Numeric values: Compared correctly as numbers
- String values: Treated as NULL (excluded from numeric comparisons)
- No database errors on mixed-type JSON data

### PostgreSQL Array Column Operators

**File:** `packages/core/src/base/repositories/operators/query.ts`

**Problem:** PostgreSQL array columns (`varchar[]`, `integer[]`, etc.) require special operators (`@>`, `<@`, `&&`) that weren't available in the filter builder.

**Solution:** Added three new operators with automatic type handling:

| Operator | PostgreSQL | Description |
|----------|------------|-------------|
| `contains` | `@>` | Array contains ALL specified elements |
| `containedBy` | `<@` | Array is subset of specified elements |
| `overlaps` | `&&` | Arrays share ANY common element |

```typescript
// Schema: tags varchar(100)[]

// Find products with BOTH 'electronics' AND 'featured'
await repo.find({
  filter: {
    where: { tags: { contains: ['electronics', 'featured'] } }
  }
});
// SQL: "tags"::text[] @> ARRAY['electronics', 'featured']::text[]

// Find products where ALL tags are in allowed list
await repo.find({
  filter: {
    where: { tags: { containedBy: ['sale', 'featured', 'new'] } }
  }
});
// SQL: "tags"::text[] <@ ARRAY['sale', 'featured', 'new']::text[]

// Find products with 'sale' OR 'premium' tag
await repo.find({
  filter: {
    where: { tags: { overlaps: ['sale', 'premium'] } }
  }
});
// SQL: "tags"::text[] && ARRAY['sale', 'premium']::text[]
```

**Type Compatibility:**
- String arrays (`varchar[]`, `text[]`, `char[]`): Both column and value cast to `text[]`
- Numeric arrays (`integer[]`, `numeric[]`): No casting needed
- Boolean arrays (`boolean[]`): No casting needed

**Empty Array Behavior:**

| Operator | Empty `[]` | Result |
|----------|------------|--------|
| `contains` | `{ contains: [] }` | `true` - everything contains empty set |
| `containedBy` | `{ containedBy: [] }` | Only rows with empty arrays |
| `overlaps` | `{ overlaps: [] }` | `false` - nothing overlaps with empty |

### NOT BETWEEN Operator

**File:** `packages/core/src/base/repositories/operators/query.ts`

**Problem:** No way to filter for values outside a range.

**Solution:** Added `notBetween` operator:

```typescript
await repo.find({
  filter: {
    where: {
      score: { notBetween: [40, 60] }  // Scores < 40 OR > 60
    }
  }
});
// SQL: WHERE NOT (score BETWEEN 40 AND 60)
```

## Security Enhancements

### JSON Path Validation

JSON path components are validated against a strict pattern to prevent SQL injection:

```typescript
// Valid patterns (allowed)
/^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/

// Examples:
'jValue.user_id'         // ✅ Valid identifier
'jValue.meta-data'       // ✅ Kebab-case allowed
'jValue.items[0]'        // ✅ Array index
'jValue.nested[2].field' // ✅ Mixed access

// Invalid (throws error)
'jValue.field;DROP TABLE' // ❌ SQL injection attempt
'jValue.123invalid'       // ❌ Starts with number
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/operators/filter.ts` | Added JSON path filtering (`buildJsonWhereCondition`, `validateJsonColumn`, `isJsonPath`, `isOperatorObject`), refactored `buildJsonOrderBy` to reuse validation |
| `src/base/repositories/operators/query.ts` | Added array operators (`contains`, `containedBy`, `overlaps`), `notBetween`, `hasNumericComparison` helper, `buildPgArrayComparison` helper |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/models/entities/product.model.ts` | Added array column (`tags varchar(100)[]`) for testing |
| `src/services/tests/` | New test services for JSON and array operators |

## No Breaking Changes

All changes are additive enhancements. Existing filter queries work unchanged.

## Documentation

Full documentation with examples available at:
- [Repositories - JSON Path Filtering](/references/base/repositories#json-path-filtering)
- [Repositories - Array Column Operators](/references/base/repositories#array-column-operators-postgresql)
- [Repositories - Query Operators](/references/base/repositories#query-operators)
