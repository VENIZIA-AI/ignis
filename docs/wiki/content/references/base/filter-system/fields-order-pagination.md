---
title: Fields, Ordering & Pagination
description: Control field selection, sorting, and pagination
difficulty: intermediate
---

# Fields, Ordering & Pagination

The `filter` object controls which columns come back, in what order, and how many rows - through the `fields`, `order`, `limit`, and `skip`/`offset` properties.

```typescript
import { userRepository } from '@/repositories';

await userRepository.find({
  filter: { fields: ['id', 'email'], order: ['createdAt DESC'], limit: 10 },
});
```

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `fields` | `string[] \| Record<string, boolean>` | every column | Inclusion-only column selection. |
| `order` | `string[]` (`'column ASC\|DESC'`) | insertion order | Sort columns; `ASC` if no direction is given. |
| `limit` | `number` | `settings.defaultLimit ?? 10` | Row cap. An explicit value always wins, up to `settings.maxLimit` (default `1000`). |
| `skip` / `offset` | `number` | `0` | Rows to skip. Aliases for the same `OFFSET` clause; `skip` wins if both are set. |
| `options.shouldQueryRange` | `boolean` | `false` | Adds a `range` envelope (`start`/`end`/`total`) to the result. |

## Field selection

`fields` accepts an array or an object. Both select the same columns:

```typescript
// Array format (recommended)
await userRepository.find({
  filter: { where: { status: 'active' }, fields: ['id', 'email', 'name'] },
});
// Returns only: { id, email, name }

// Object format - only keys set to `true` are selected
await userRepository.find({
  filter: { fields: { id: true, email: true, name: true } },
});
```

> [!NOTE]
> The object format is inclusion-only. A key set to `false` is ignored, not excluded - it neither adds nor removes the column. To exclude a column, omit its key or use the array format.

## Ordering

Each entry in `order` is a `'field'` or `'field DIRECTION'` string, read by `parseOrderEntry`. Direction defaults to `ASC` and only `ASC`/`DESC` (case-insensitive) are valid. Only ASCII whitespace separates the two tokens - a non-breaking space does not split them, so `'name DESC'` is one token, not two:

```typescript
await userRepository.find({ filter: { order: ['createdAt DESC'] } });
await userRepository.find({ filter: { order: ['status ASC', 'createdAt DESC'] } });
await userRepository.find({ filter: { order: ['name'] } }); // same as 'name ASC'
```

When the order does not name `id`, the relational repository appends `id ASC`, so pages over a tied column never repeat or skip a row.

### `parseOrderEntry`

```typescript
parseOrderEntry(opts: { entry: string }): { field: string; direction: 'asc' | 'desc' }
```

Every relational and search dialect (Postgres, SQLite, Typesense, Meilisearch) reads each `order` entry through this one parser, so the same 400s apply everywhere `order` is accepted. It throws a `400`, naming the whole entry, in three cases:

| Case | Example entry | Thrown message contains |
|---|---|---|
| Empty field | `''` or `'   '` | `Order entry has no field` |
| Invalid direction | `'name sideways'` | `Invalid direction` |
| More than two tokens | `'name DESC NULLS LAST'` | `Too many tokens` |

```typescript
import { parseOrderEntry } from '@venizia/ignis-filter';

parseOrderEntry({ entry: 'createdAt DESC' }); // { field: 'createdAt', direction: 'desc' }
parseOrderEntry({ entry: 'name' }); // { field: 'name', direction: 'asc' }
parseOrderEntry({ entry: 'name DESC NULLS LAST' }); // throws - 400, two tokens max
```

> [!NOTE]
> Before this parser, extra tokens past the direction were silently dropped - `'createdAt DESC NULLS LAST'` sorted on `createdAt DESC` and lost `NULLS LAST` without warning. An entry like that is now a 400. See the [2026-09-26 changelog](/changelogs/2026-09-26-order-entry-parsing-and-sort-expressions) for the full behavior change.

Order by a nested key inside a JSON column with dot-path notation:

```typescript
await userRepository.find({ filter: { order: ['metadata.priority DESC'] } });
// SQL: ORDER BY "metadata" #> '{priority}' DESC

await userRepository.find({ filter: { order: ['settings.display.theme ASC'] } });
```

JSONB values sort by type first, then by value within the type:

| JSONB type | Sort position |
|---|---|
| `null` | First (lowest) |
| `boolean` | `false` before `true` |
| `number` | Numeric order |
| `string` | Lexicographic order |
| `array` | Element-wise |
| `object` | Key-value order |

See [JSON Filtering](./json-filtering) for the full path syntax.

### Sorting by a joined column or a computed expression

`order` only names a column on the model's own schema, or a JSON path inside one. To sort by a column on a joined table, or by a computed value, pass `toOrderBy`'s `expressions` option - a map from the name an order entry uses to a Drizzle column or `SQL`:

```typescript
import { sql } from 'drizzle-orm';

const queryDialect = dataSource.getQueryDialect();

const orderBy = queryDialect.toOrderBy({
  tableName: 'item',
  schema: itemTable,
  order: ['groupLabel ASC', 'displayName DESC'],
  expressions: {
    groupLabel: groupTable.label, // a column on a joined table
    displayName: sql`COALESCE(${itemTable.nickname}, ${itemTable.name})`, // a computed value
  },
});
// ORDER BY "group"."label" ASC, COALESCE("item"."nickname", "item"."name") DESC, "item"."id" ASC
```

A key resolves in this order: an own key of `expressions`, then a JSON path, then a schema column. "Own key" means `Object.hasOwn` - an inherited name such as `constructor` or `__proto__` in an order entry is treated as an unknown column, never as a match. The `id ASC` tie-breaker still closes the list unless an entry names `id` - an expression keyed `id` never counts as naming it, since it sorts by whatever the expression computes, not the `id` column.

Passing no `expressions` costs nothing extra; the option only adds a lookup when it is set.

## Pagination

`limit` caps the row count; `skip` (or its alias `offset`) sets how many rows to skip. Combine them for page N:

```typescript
await userRepository.find({ filter: { limit: 10 } }); // first 10
await userRepository.find({ filter: { limit: 10, skip: 10 } }); // page 2

const page = 3;
const pageSize = 20;
await userRepository.find({
  filter: { limit: pageSize, skip: (page - 1) * pageSize },
});
```

> [!TIP]
> Set `limit` on every public-facing endpoint. A query that omits it is not unbounded - the repository falls back to `10`, never to "no limit" - but an explicit value keeps the page size under your control instead of a framework default.

### Default limit resolution

A query that omits `limit` gets one from this precedence chain:

```
query.limit  ??  settings.defaultLimit  ??  DEFAULT_LIMIT (10)
```

| Source | Meaning |
|---|---|
| `query.limit` | An explicit `limit` in the caller's filter. Always wins. |
| `settings.defaultLimit` | A per-model default on the `@model` decorator. Must be a positive integer - `@model` validates it at decoration time. Applies to top-level `find()` and to every to-many relation, using the related model's own `defaultLimit`. |
| `DEFAULT_LIMIT` | The global fallback, `10`. |

```typescript
import { model, BaseEntity } from '@venizia/ignis';
import { countryTable } from '@/schemas';
import { countryRepository } from '@/repositories';

@model({
  type: 'entity',
  settings: { defaultLimit: 200 }, // small lookup table - default to 200 rows
})
export class Country extends BaseEntity<typeof Country.schema> {
  static override schema = countryTable;
}

await countryRepository.find({ filter: {} }); // LIMIT 200
await countryRepository.find({ filter: { limit: 10 } }); // LIMIT 10 (explicit wins)
```

> [!NOTE]
> `defaultLimit` is independent of `defaultFilter`. Passing `shouldSkipDefaultFilter` bypasses the default `where` clause but never drops the default limit. There is no "unbounded" sentinel - to fetch more rows, pass an explicit `limit`, up to the ceiling below.

### Limit ceiling (`maxLimit`)

An explicit `limit` is checked before the query runs. The repository reads the ceiling from the model's `@model({ settings: { maxLimit } })`, falling back to the global `DEFAULT_MAX_LIMIT` of `1000`.

| Caller's `limit` | Result |
|---|---|
| Omitted | Filled in from `settings.defaultLimit ?? 10`. No ceiling check runs. |
| Within the ceiling | Used as given. |
| Above the ceiling | Throws before the query runs, naming the requested value and the maximum. |
| Negative or non-integer | Throws. A negative value would drop the `LIMIT` clause and return the whole table. |

```typescript
@model({
  type: 'entity',
  // Reports run bigger pages than a list screen, so this model says so explicitly.
  settings: { maxLimit: 5000 },
})
export class Report extends BaseEntity<typeof Report.schema> {
  static override schema = reportTable;
}

await reportRepository.find({ filter: { limit: 4000 } }); // LIMIT 4000
await userRepository.find({ filter: { limit: 4000 } }); // throws - default ceiling is 1000
```

`maxLimit` is a policy, not a capacity - the engine's own ceiling sits far above it. `@model` validates it as a positive integer at decoration time, so a bad ceiling fails at boot rather than on the first big page.

A relation's `scope.limit` gets the shape check only, never the ceiling. The ceiling belongs to the related model, which the parent repository cannot resolve.

A small helper keeps page-to-filter math in one place:

```typescript
function getPaginationFilter(page: number, pageSize: number = 20) {
  return { limit: pageSize, skip: (page - 1) * pageSize };
}

const filter = { where: { status: 'active' }, ...getPaginationFilter(3, 20) };
// { where: {...}, limit: 20, skip: 40 }
```

## Range queries (Content-Range header)

Set `options.shouldQueryRange: true` to get the total row count alongside the data, formatted for the HTTP `Content-Range` header:

```typescript
const result = await userRepository.find({
  filter: { limit: 10, skip: 20 },
  options: { shouldQueryRange: true },
});

// result.data  -> the matching rows
// result.range -> { start: 20, end: 29, total: 100 }
```

`range` has this shape:

```typescript
type TDataRange = {
  start: number; // starting index, 0-based, inclusive
  end: number; // ending index, 0-based, inclusive
  total: number; // total rows matching the query
};
```

Build the header value from `range`:

```typescript
const { data, range } = await userRepository.find({
  filter: { limit: 10, skip: 20, where: { status: 'active' } },
  options: { shouldQueryRange: true },
});

const contentRange =
  data.length > 0 ? `records ${range.start}-${range.end}/${range.total}` : `records */${range.total}`;

res.setHeader('Content-Range', contentRange);
// -> "records 20-29/100"
```

| Scenario | Content-Range header |
|---|---|
| Items 0-9 of 100 | `records 0-9/100` |
| Items 20-29 of 100 | `records 20-29/100` |
| No items found | `records */0` |
| Last page (items 90-99) | `records 90-99/100` |

> [!NOTE]
> With `shouldQueryRange: true`, the repository runs the data query and the count query in parallel via `Promise.all` - unless `options.transaction` is set. A transaction connector wraps a single client, so inside one the two queries run in sequence instead.

## Combined example

```typescript
await userRepository.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'price', 'createdAt'],
    order: ['price ASC', 'createdAt DESC'],
    limit: 20,
    skip: 0,
  },
});
```

With range information:

```typescript
const { data, range } = await userRepository.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'price', 'createdAt'],
    order: ['price ASC', 'createdAt DESC'],
    limit: 20,
    skip: 0,
  },
  options: { shouldQueryRange: true },
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

- [`packages/connectors/src/relational/core/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/filter.ts) - `FilterBuilder`, `toColumns`/`toOrderBy`, the `expressions` resolution
- [`packages/connectors/src/relational/core/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/common/types.ts) - `IRelationalQueryDialect.toOrderBy`'s `expressions` option
- [`packages/connectors/src/relational/core/repositories/core/readable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/core/readable.ts) - `find()`'s `filter.limit ?? getDefaultLimit() ?? DEFAULT_LIMIT` resolution
- [`packages/kernel/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/core/abstract.ts) - `assertLimitWithinCeiling`/`assertFilterLimits`, the `maxLimit` check
- [`packages/filter/src/common/order.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/order.ts) - `parseOrderEntry`
- [`packages/filter/src/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/operators.ts) - `Sorts` constants
- [`packages/kernel/src/base/repositories/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/common/constants.ts) - `DEFAULT_LIMIT`, `DEFAULT_MAX_LIMIT`
- [`packages/kernel/src/base/repositories/common/types/results.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/common/types/results.ts) - `TDataRange`, `buildDataRange`
