# @venizia/ignis-filter

The engine-neutral query filter vocabulary shared across IGNIS: the filter shape, the operator set,
and the sort direction constants.

It is **isomorphic by construction**. The package resolves to no node builtin and no server-only
peer, so the same filter language describes a query against a Postgres repository on the server and
against a WASM database in a browser worker. A guard test bundles the barrel for `target: 'browser'`
and fails if anything outside `@venizia/ignis-inversion`, `lodash` and `reflect-metadata` enters the
graph.

## Install

```bash
bun add @venizia/ignis-filter
```

Applications on `@venizia/ignis` already get everything here re-exported from the core barrel - there
is no need to add this package to reach `TFilter` or `QueryOperators`. Install it directly when you
want the vocabulary **without** the server framework, which is the browser case.

## What it carries

| Export | Purpose |
|---|---|
| `TFilter` | `{ where, order, limit, offset, skip, fields, include }` |
| `TWhere` | Query conditions, with nested `and` / `or` |
| `TFields` | Field selection - array of names, or an object keyed by name |
| `TInclusion` | One relation to include, with an optional nested `scope` |
| `TLimit`, `TOffset`, `TSkip`, `TOrderBy` | The scalar members of the shape |
| `QueryOperators` | Comparison, pattern, null, array and logical operators, plus `isValid` |
| `TQueryOperator` | The operator union, derived from the const class |
| `Sorts` | `ASC` / `DESC`, plus `isValid` |

```ts
import { QueryOperators, Sorts, type TFilter } from '@venizia/ignis-filter';

const filter: TFilter = {
  where: { status: 'active', createdAt: { [QueryOperators.GTE]: '2026-01-01' } },
  order: [`createdAt ${Sorts.DESC}`],
  limit: 20,
};
```

## Validation - the `/schemas` sub-path

```ts
import { FilterSchema, WhereSchema } from '@venizia/ignis-filter/schemas';

const parsed = FilterSchema.parse({ where: { status: 'active' }, limit: 20 });
const where = WhereSchema.parse('{"status":"active"}'); // a JSON string parses too
```

A separate entry point on purpose: importing the vocabulary must not drag `zod` into a bundle that
only needs `QueryOperators`. Available: `FilterSchema`, `WhereSchema`, `FieldsSchema`,
`InclusionSchema`, `LimitSchema`, `OffsetSchema`, `SkipSchema`, `OrderBySchema`.

> **On a server, import these from `@venizia/ignis-core` instead.** The instances here carry no
> OpenAPI metadata - they validate identically but document nothing, so a route built on them
> produces an API reference with no descriptions.

Need your own metadata layer? `buildQuerySchemas({ decorate })` takes a decorator applied to every
node, including nested ones:

```ts
import { buildQuerySchemas } from '@venizia/ignis-filter/schemas';

const { FilterSchema } = buildQuerySchemas({
  decorate: (schema, metadata) => schema.describe(metadata.description ?? ''),
});
```

## What it deliberately does not carry

- **Any translation to a query language.** Turning a `TFilter` into SQL is engine-specific - the
  Postgres translator is Drizzle-coupled and lives with its connector. Operator support differs per
  engine, and an unsupported operator throws at translation time rather than being dropped from this
  list.
- **Types inferred from the schemas.** `TFilter<T>` is generic over the entity, so `TFilter<User>`
  rejects `{ where: { notAField: 1 } }`; `z.infer<typeof FilterSchema>` accepts it, because the
  recursive where-clause is `z.ZodType<any>`. The schema describes what arrives over the wire, the
  type describes what application code builds, and they only overlap in the middle.

## License

MIT
