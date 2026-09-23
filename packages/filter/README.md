# @venizia/ignis-filter

The query filter language of IGNIS: the `TFilter` shape, its operators, and the zod schemas that
validate it. Install it directly when you want the language without the server framework, for
example in a browser.

## Install

```bash
bun add @venizia/ignis-filter
```

An application on `@venizia/ignis` does not need it: `TFilter`, `QueryOperators`, `Sorts` and the
schemas are re-exported from `@venizia/ignis`.

## Use it

A filter is a plain object. Type it against your entity, and an unknown field in `where` is a
compile error.

```typescript
import { QueryOperators, Sorts, type TFilter } from '@venizia/ignis-filter';

type TUser = { id: number; status: string; createdAt: string };

const filter: TFilter<TUser> = {
  where: {
    status: 'active',
    createdAt: { [QueryOperators.GTE]: '2026-01-01' },
    or: [{ id: { [QueryOperators.IN]: [1, 2, 3] } }, { status: 'pending' }],
  },
  order: [`createdAt ${Sorts.DESC}`],
  limit: 20,
};
```

A bare value means `eq`, and `null` means `is`. The same object works against every IGNIS
repository. Each connector translates it for its engine and throws on an operator the engine does
not support.

## Validate a filter from the wire

Import the schemas from the `/schemas` entry point. `FilterSchema` and `WhereSchema` accept an
object or a JSON string.

```typescript
import { FilterSchema, WhereSchema } from '@venizia/ignis-filter/schemas';

const filter = FilterSchema.parse('{"where":{"status":"active"},"limit":20}');
const where = WhereSchema.safeParse('not-json'); // success: false - a validation issue, not a throw
```

A negative or fractional `limit`, `offset` or `skip` fails validation. `include[].scope` takes a
nested filter.

## What it carries

| Export | What it is |
| :--- | :--- |
| `TFilter<T>` | `{ where, fields, include, order, limit, offset, skip }` |
| `TWhere<T>` | Conditions keyed by the fields of `T`, with nested `and` / `or` |
| `TWhereOperators<V>`, `TWhereValue<V>` | The operator object and what one field accepts |
| `TFields<T>` | An array of field names, or `{ field: true \| false }` |
| `TInclusion` | `{ relation, scope? }`: a relation to load, with its own filter |
| `TIsoTimestamp` | A branded string for ISO timestamp columns; `where` also accepts a `Date` for it |
| `QueryOperators` | The operator names, plus `isValid()` |
| `Sorts` | `ASC` / `DESC`, plus `isValid()` |

| Operators | Names |
| :--- | :--- |
| Comparison | `eq`, `ne`, `neq`, `gt`, `gte`, `lt`, `lte` |
| Pattern | `like`, `nlike`, `ilike`, `nilike`, `regexp`, `iregexp` |
| Null | `is`, `isn` |
| List and range | `in`, `inq`, `nin`, `between`, `notBetween` |
| Array columns | `contains`, `containedBy`, `overlaps` |
| Other | `exists`, `notExists`, `not`, `and`, `or` |

## Entry points

| Entry point | What it gives | Extra peers |
| :--- | :--- | :--- |
| `@venizia/ignis-filter` | Types, `QueryOperators`, `Sorts`. Does not load zod | none |
| `@venizia/ignis-filter/schemas` | `FilterSchema`, `WhereSchema`, `FieldsSchema`, `InclusionSchema`, `LimitSchema`, `OffsetSchema`, `SkipSchema`, `OrderBySchema`, `buildQuerySchemas` | none (`zod` is a dependency) |

Both ship CommonJS and ES module builds, with no node builtin, so they load in a browser.

The schemas here carry no OpenAPI descriptions. On a server, import them from `@venizia/ignis`
instead: the same schemas, built through `buildQuerySchemas({ decorate })` with an OpenAPI
decorator, so your API reference documents them.

The schema's inferred type is looser than `TFilter<T>`. It describes what arrives over the wire,
so it accepts any field name in `where`.

## Where it sits

Depends on inversion. Used by kernel and connectors: dev-configs -> inversion -> {**filter**,
helpers} -> {boot, kernel} -> connectors -> {core-worker, core-server} -> atlas.

## Links

- [Filter system](https://ignis.venizia.ai/references/base/filter-system/)
- [Filter quick reference](https://ignis.venizia.ai/references/base/filter-system/quick-reference)
- [Changelog: the filter package](https://ignis.venizia.ai/changelogs/2026-07-25-ignis-filter-package)
- [Changelog](https://ignis.venizia.ai/changelogs/)
- [Source](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter)

MIT licensed - see [LICENSE.md](./LICENSE.md).
