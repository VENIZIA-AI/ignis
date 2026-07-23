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
| `limit` | `number` | `settings.defaultLimit ?? 10` | Row cap. An explicit value always wins. |
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

Each entry in `order` is a `'column DIRECTION'` string. Direction defaults to `ASC` and only `ASC`/`DESC` (case-insensitive) are valid:

```typescript
await userRepository.find({ filter: { order: ['createdAt DESC'] } });
await userRepository.find({ filter: { order: ['status ASC', 'createdAt DESC'] } });
await userRepository.find({ filter: { order: ['name'] } }); // same as 'name ASC'
```

An invalid direction throws before the query runs:

```
Error: Invalid direction: 'RANDOM' | Expected: 'ASC' or 'DESC'
```

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
> Set `limit` on every public-facing endpoint. An unbounded query can exhaust memory - the repository always falls back to a default of `10`, never to "no limit".

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
> `defaultLimit` is independent of `defaultFilter`. Passing `shouldSkipDefaultFilter` bypasses the default `where` clause but never drops the default limit. There is no "unbounded" sentinel - to fetch more rows, pass an explicit `limit`.

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
> With `shouldQueryRange: true`, the repository runs the data query and the count query in parallel via `Promise.all`.

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

- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder`, `toColumns`/`toOrderBy`
- [`packages/core/src/connectors/postgres/repositories/core/readable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/core/readable.ts) - `find()`'s `query.limit ?? getDefaultLimit() ?? DEFAULT_LIMIT` resolution
- [`packages/core/src/base/repositories/common/operators.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/operators.ts) - `Sorts` constants
- [`packages/core/src/base/repositories/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/constants.ts) - `DEFAULT_LIMIT`
- [`packages/core/src/base/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/types.ts) - `TDataRange`, `buildDataRange`
