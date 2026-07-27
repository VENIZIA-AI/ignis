---
type: Package
title: filter
description: The engine-neutral query filter vocabulary - the TFilter shape, QueryOperators, Sorts - isomorphic by construction so a browser data layer speaks the same filter language as a server repository.
resource: packages/filter
tags: [packages, filter, query, isomorphic, browser]
---

`@venizia/ignis-filter` carries the filter vocabulary every connector translates from: the
`{ where, order, limit, offset, skip, fields, include }` shape (`TFilter`, `TWhere`, `TFields`,
`TInclusion`, and the scalar members), the operator set (`QueryOperators`, `TQueryOperator`) and the
sort direction constants (`Sorts`). It was extracted from
`core/src/base/repositories/` so the vocabulary can be shared with a browser data layer.

It sits **beside** helpers in the dependency chain, not after it:
`dev-configs -> inversion -> {filter, helpers} -> boot -> core`. Its only dependency is
`@venizia/ignis-inversion`, which supplies both `getError` and `TConstValue` - helpers duplicates
`TConstValue`, so depending on helpers would have been a heavier edge for no gain.

## Isomorphic by construction, and it is enforced

`src/__tests__/browser-purity.test.ts` bundles the barrel for `target: 'browser'` and fails if
anything outside `@venizia/ignis-inversion`, `lodash` and `reflect-metadata` enters the resolved
graph, or if any `node:*` builtin does. Purity is a property of the RESOLVED graph, not of a file's
own source: before the extraction this same code pulled 13 node builtins plus `@hono/zod-openapi`
and `ioredis`, purely by reaching `getError` through the `@venizia/ignis-helpers` root barrel.

Three ways the measurement lies if written carelessly, all of them hit while building it:
`Bun.build` with a browser target does NOT error on `node:fs` and returns `success: true`, so build
success is not a purity signal; the spy must sit on `onResolve`, not `onLoad`, because a probe entry
outside the workspace never resolves a root-hoisted package and the leak passes unseen; and the probe
must run with cwd at the package root, or tsconfig `paths` do not resolve and the walk stops at the
first aliased import. See [filter system](/architecture/filter-system.md).

## The `./schemas` sub-path

The zod schemas (`FilterSchema`, `WhereSchema`, `InclusionSchema`, and the scalar members) live here
too, on a **separate entry point**: `@venizia/ignis-filter/schemas`. Separate because the root barrel
must not drag `zod` in for consumers who only want the vocabulary - a guard asserts the root resolves
no `zod` and the sub-path resolves nothing beyond it.

They are built with **plain `zod`**, never `@hono/zod-openapi`, so `buildQuerySchemas({ decorate })`
takes an injected decorator: `.openapi()` returns a NEW schema rather than mutating, and three of the
eleven decorations sit on inner nodes of a nested tree, so a consumer cannot annotate them after the
tree is composed. `core/src/base/repositories/query-schemas/index.ts` calls the builder with
`(schema, metadata) => schema.openapi(metadata)` and re-exports under the original names. That file's
side-effect `import '@hono/zod-openapi'` is load-bearing: the package peers on `zod`, so importing it
patches `.openapi()` onto the shared prototype before the builder runs.

**Server code must import the schemas from `@venizia/ignis-core`, never from
`@venizia/ignis-filter/schemas`.** The sub-path exports undecorated instances of the same names for
browsers; importing those on a server yields schemas that validate identically but document nothing.
`core/src/__tests__/repositories/query-schema-openapi.test.ts` guards the decorated path by
generating an OpenAPI 3.1 document and asserting descriptions survive at both the top level and on
nested properties - the failure mode is otherwise silent, since undecorated schemas still compile and
still validate.

## What stays behind in core

Translation stays in core: turning a `TFilter` into SQL is engine-specific, and `mergeFilter` is a
method on the Postgres query dialect rather than a standalone function, so neither is extractable.

The types are **hand-written, not `z.infer`**, and that is deliberate. `TFilter<T>` is generic over
the entity, so `TFilter<User>` rejects `{ where: { notAField: 1 } }` while the inferred type accepts
it - `RecursiveWhereSchema` is `z.ZodType<any>`, and inference cannot recover the entity keys.
`connectors/search/repositories/common/constants.ts` documents a second reason: embedding the
recursive `FilterSchema` collapses optional-key inference for every sibling field, silently turning
`filter` into a required `any`. Schema and type describe different things - what arrives over the
wire versus what application code builds - and only overlap in the middle.

`core` re-exports this package from `base/repositories/common/index.ts`, so every existing
`@venizia/ignis-core` import of `TFilter` or `QueryOperators` keeps resolving and no consumer needed
to change. Install this package directly only when you want the vocabulary WITHOUT the server
framework - the browser case.
