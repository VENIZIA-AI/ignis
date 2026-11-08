---
title: Filter System
description: Shape a query - which rows, which fields, what order, how much
difficulty: intermediate
---

# Filter System

Every repository read, update, and delete verb takes the same `filter` object. It picks rows (`where`), columns (`fields`), order (`order`), and how many (`limit`/`skip`).

The vocabulary ships as its own package, **`@venizia/ignis-filter`**. Applications on `@venizia/ignis` already get every name here re-exported from the core barrel, so nothing changes for them. Install it directly only when you want the filter language **without** the server framework - a browser or a Web Worker - since it resolves no node builtin and no server-only dependency:

```typescript
import { QueryOperators, Sorts, type TFilter } from '@venizia/ignis-filter';
import { FilterSchema, WhereSchema } from '@venizia/ignis-filter/schemas';
```

On a server take the schemas from `@venizia/ignis` instead: the ones on that subpath carry no OpenAPI metadata, so a route built on them documents nothing.

## In one example

`where` picks rows, `fields` picks columns, `order` sorts, `limit` bounds the result:

```typescript
import { postRepository } from '@/repositories';

const posts = await postRepository.find({
  filter: {
    where: {
      status: 'published',
      or: [{ featured: true }, { rating: { gte: 4.5 } }],
    },
    fields: ['id', 'title', 'rating', 'publishedAt'],
    order: ['rating DESC', 'publishedAt DESC'],
    limit: 20,
  },
});
```

`postRepository` is a `@repository({ model: Post, dataSource })`-bound repository. `Post`'s schema comes from `@/schemas` - see [Models](/references/base/models) and [Repositories](../repositories/).

```sql
-- Equivalent SQL
SELECT "id", "title", "rating", "published_at"
FROM "post"
WHERE "status" = 'published' AND ("featured" = true OR "rating" >= 4.5)
ORDER BY "rating" DESC, "published_at" DESC
LIMIT 20
```

## How it works

- **`TFilter` maps straight to SQL.** Every property corresponds to one clause of the generated query - see the table below.
- **`where` takes a bare value or an operator object.** A bare value is implicit equality (`null` becomes `IS NULL`, an array becomes `IN`). An operator object keys into one of the operator families.
- **Multiple `where` keys are an implicit AND.** A dot-notation key (`'metadata.path'`) targets a JSON/JSONB column instead of a top-level column, and accepts the same operators. IGNIS casts the operand automatically when it's a number.
- **A model's `settings.query.filter` merges into every query for that model** - see [Default filter](#default-filter) below.

| Filter property | SQL equivalent | Purpose |
|---|---|---|
| `where` | `WHERE` | Filter rows by conditions |
| `fields` | `SELECT col1, col2` | Select specific columns |
| `order` | `ORDER BY` | Sort results |
| `limit` | `LIMIT` | Restrict the number of results |
| `skip` / `offset` | `OFFSET` | Skip rows for pagination (aliases - `skip` wins if both are given) |
| `include` | Separate relational query | Eager-load related rows ([Relations & Includes](../repositories/relations)) |

### The `where` operator families

| Family | Operators | Example |
|---|---|---|
| Comparison | `eq`, `ne`/`neq`, `gt`, `gte`, `lt`, `lte` | `{ age: { gte: 18, lte: 65 } }` |
| Null / presence | `is`, `isn`, `exists`, `notExists` | `{ deletedAt: null }` or `{ verifiedAt: { exists: true } }` |
| List | `in`/`inq`, `nin` | `{ status: { inq: ['active', 'pending'] } }` |
| Subquery (SQL) | `inSql`, `ninSql` | `` { id: { inSql: sql`SELECT ...` } } `` - code only, never from a request |
| Range | `between`, `notBetween` | `{ score: { between: [40, 60] } }` |
| Pattern | `like`, `nlike`, `ilike`, `nilike`, `regexp`, `iregexp` | `{ email: { ilike: '%@company.com' } }` |
| Logical | `and`, `or`, `not` | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` |
| Array (PostgreSQL) | `contains`, `containedBy`, `overlaps` | `{ tags: { contains: ['typescript'] } }` |
| JSON path | comparison, null, list, range, and pattern operators, on a `'column.path'` key | `{ 'metadata.score': { gt: 80 } }` |

Full operator-by-operator tables, one line each, live on the [Quick Reference](./quick-reference) page.

### Timestamp and date values

A filter that arrives over HTTP is JSON, which has no `Date`. On a relational column that Drizzle maps from a `Date` (`timestamp` and `date` in Postgres, `integer({ mode: 'timestamp' })` and `integer({ mode: 'timestamp_ms' })` in SQLite), the filter builder parses the value for every operator that takes one: the bare value, `eq`, `ne`, `neq`, `gt`, `gte`, `lt`, `lte`, `is`, `isn`, each element of `in`/`inq`/`nin`, both ends of `between`/`notBetween`, and the value inside `not`, `and` and `or`.

| Value | Read as |
|---|---|
| `'2026-11-07'` | midnight UTC of that date |
| `'2026-11-07T10:30:00Z'`, `'2026-11-07T17:30:00+07:00'` | that instant. The time needs `T` and `Z` or an offset; fractional seconds are allowed |
| `1794009600000` | epoch milliseconds, in SQLite `timestamp` (seconds) columns too |
| a `Date` | itself |
| `null` | `IS NULL`, as before |

Anything else is refused with a `400` that names the table, the column and these forms: a locale string (`'11/07/2026'`), a word (`'tomorrow'`), a date that does not exist (`'2026-02-31'`), a date-time with no zone (the server's time zone would decide the instant), a numeric string, `NaN`, a boolean or an object. A column with its own storage type, such as `isoTimestamp`, or a `mode: 'string'` column, takes the string as written and is not converted. A JSON path (`'metadata.at'`) reads text or numbers, not a `Date`, and is not converted.

### Fields, order, and pagination

- **`fields`** selects columns - an array, or a `{ field: true }` object (inclusion-only; `false` is ignored).
- **`order`** takes `'field ASC'` / `'field DESC'` strings, including JSON paths.
- **`limit`**, when omitted, resolves through `query.limit ?? model settings.query.limit.default ?? 10`. An explicit value above the model's `settings.query.limit.max` (default `1000`) throws before the query runs.
- **`skip` / `offset`** both map to SQL `OFFSET`.

### Default filter

- **Applies automatically.** A model's `settings.query.filter` merges into every read, update, and delete for that model.
- **AND-composes on collision.** When the default and the caller's filter constrain the same field, IGNIS AND-composes the two conditions instead of one replacing the other.
- **No override.** A caller's `where` can only narrow the default: when both sides constrain a field, the two AND-compose, scalars included, so a caller cannot read the rows the default hides (`deletedAt: null`, `isDeleted: false`). A caller restating the default's value changes nothing. Server code that needs those rows passes `shouldSkipDefaultFilter: true`, which is not on the wire schema. The full collision table lives on the [Default Filter](./default-filter) page.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { postTable } from '@/schemas';

@model({
  settings: { query: { filter: { where: { isDeleted: false } } } },
})
export class Post extends BaseEntity<typeof Post.schema> {
  static override schema = postTable;
}

await postRepository.find({ filter: { where: { status: 'published' } } });
// WHERE "isDeleted" = false AND "status" = 'published' - different keys, both apply

await postRepository.find({
  filter: { where: { status: 'published' } },
  options: { shouldSkipDefaultFilter: true },
});
// WHERE "status" = 'published' - default filter skipped entirely
```

## Operators

Each operator family and every long-form topic has its own page:

| Page | Covers |
|---|---|
| [Quick Reference](./quick-reference) | Every operator, one line each - the fast lookup |
| [Comparison Operators](./comparison-operators) | `eq`, `ne`/`neq`, `gt`, `gte`, `lt`, `lte` |
| [Null Operators](./null-operators) | `is`, `isn`, direct `null`, `exists`/`notExists` |
| [List Operators](./list-operators) | `in`/`inq`, `nin`, and the subquery operators `inSql`/`ninSql` |
| [Range Operators](./range-operators) | `between`, `notBetween` |
| [Pattern Matching](./pattern-matching) | `like`, `nlike`, `ilike`, `nilike`, `regexp`, `iregexp` |
| [Logical Operators](./logical-operators) | Implicit/explicit `and`, `or`, `not`, empty-group semantics |
| [Array Operators](./array-operators) | `contains`, `containedBy`, `overlaps` (PostgreSQL array columns) |
| [JSON Filtering](./json-filtering) | Dot-path queries into JSON/JSONB columns |
| [Fields, Order & Pagination](./fields-order-pagination) | `fields`, `order`, `limit`/`skip`/`offset`, `settings.query.limit.default` |
| [Default Filter](./default-filter) | `settings.query.filter`, the collision/narrowing law, `shouldSkipDefaultFilter` |
| [Application Usage](./application-usage) | How a filter flows controller -> service -> repository |
| [Use Case Gallery](./use-cases) | Real-world filters with the SQL they produce |
| [Tips & Edge Cases](./tips) | Performance notes and common gotchas |

## See also

- [Repositories](../repositories/) - the `find`/`count`/`updateBy`/`deleteBy` verbs that take a `filter`
- [Models](/references/base/models) - `settings.query.filter` and `settings.properties.hidden`
- [Building a CRUD API](/guides/tutorials/building-a-crud-api) - filters in a real endpoint
- [Quick Reference Card](/references/quick-reference.md) - all IGNIS APIs on one page

**Files:**

- [`packages/connectors/src/relational/core/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/types.ts) - `TFilter`/`TInclusion` types
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators`/`Sorts` constants
