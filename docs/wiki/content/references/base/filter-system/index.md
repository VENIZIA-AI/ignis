---
title: Filter System
description: Shape a query - which rows, which fields, what order, how much
difficulty: intermediate
---

# Filter System

Every repository read, update, and delete verb takes the same `filter` object. It picks rows (`where`), columns (`fields`), order (`order`), and how many (`limit`/`skip`).

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
- **A model's `settings.defaultFilter` merges into every query for that model** - see [Default filter](#default-filter) below.

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
| Range | `between`, `notBetween` | `{ score: { between: [40, 60] } }` |
| Pattern | `like`, `nlike`, `ilike`, `nilike`, `regexp`, `iregexp` | `{ email: { ilike: '%@company.com' } }` |
| Logical | `and`, `or`, `not` | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` |
| Array (PostgreSQL) | `contains`, `containedBy`, `overlaps` | `{ tags: { contains: ['typescript'] } }` |
| JSON path | comparison, null, list, range, and pattern operators, on a `'column.path'` key | `{ 'metadata.score': { gt: 80 } }` |

Full operator-by-operator tables, one line each, live on the [Quick Reference](./quick-reference) page.

### Fields, order, and pagination

- **`fields`** selects columns - an array, or a `{ field: true }` object (inclusion-only; `false` is ignored).
- **`order`** takes `'field ASC'` / `'field DESC'` strings, including JSON paths.
- **`limit`**, when omitted, resolves through `query.limit ?? model settings.defaultLimit ?? 10`.
- **`skip` / `offset`** both map to SQL `OFFSET`.

### Default filter

- **Applies automatically.** A model's `settings.defaultFilter` merges into every read, update, and delete for that model.
- **AND-composes on collision.** When the default and the caller's filter constrain the same field, IGNIS AND-composes the two conditions instead of one replacing the other.
- **One override escape.** Setting that same field to a plain scalar (not an operator object) replaces the default outright - the one intentional opt-out, and it needs no `shouldSkipDefaultFilter`. The full collision table lives on the [Default Filter](./default-filter) page.

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { postTable } from '@/schemas';

@model({
  type: 'entity',
  settings: { defaultFilter: { where: { isDeleted: false } } },
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
| [List Operators](./list-operators) | `in`/`inq`, `nin` |
| [Range Operators](./range-operators) | `between`, `notBetween` |
| [Pattern Matching](./pattern-matching) | `like`, `nlike`, `ilike`, `nilike`, `regexp`, `iregexp` |
| [Logical Operators](./logical-operators) | Implicit/explicit `and`, `or`, `not`, empty-group semantics |
| [Array Operators](./array-operators) | `contains`, `containedBy`, `overlaps` (PostgreSQL array columns) |
| [JSON Filtering](./json-filtering) | Dot-path queries into JSON/JSONB columns |
| [Fields, Order & Pagination](./fields-order-pagination) | `fields`, `order`, `limit`/`skip`/`offset`, `defaultLimit` |
| [Default Filter](./default-filter) | `settings.defaultFilter`, the collision/narrowing law, `shouldSkipDefaultFilter` |
| [Application Usage](./application-usage) | How a filter flows controller -> service -> repository |
| [Use Case Gallery](./use-cases) | Real-world filters with the SQL they produce |
| [Tips & Edge Cases](./tips) | Performance notes and common gotchas |

## See also

- [Repositories](../repositories/) - the `find`/`count`/`updateAll`/`deleteAll` verbs that take a `filter`
- [Models](/references/base/models) - `settings.defaultFilter` and `settings.hiddenProperties`
- [Building a CRUD API](/guides/tutorials/building-a-crud-api) - filters in a real endpoint
- [Quick Reference Card](/references/quick-reference.md) - all IGNIS APIs on one page

**Files:**

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, translates `TFilter` to Drizzle/SQL
- [`packages/filter/src/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/types.ts) - `TFilter`/`TInclusion` types
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `QueryOperators`/`Sorts` constants
