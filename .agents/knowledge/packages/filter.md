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
sort direction constants (`Sorts`). It was extracted from the repository base that now lives in
`kernel/src/base/repositories/` so the vocabulary can be shared with a browser data layer.

It sits **beside** helpers in the dependency chain, not after it:
`dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> core`. Its only dependency is
`@venizia/ignis-inversion`, which supplies both `getError` and `TConstValue` - helpers duplicates
`TConstValue`, so depending on helpers would have been a heavier edge for no gain.

## Isomorphic by construction, and it is enforced

The guard is **not** a per-package test - it is the centralized `scripts/purity/` tool that covers
every entry point the monorepo claims is browser-pure (filter, inversion, helpers `/core` and
`/common`, kernel, core-worker, connectors). `scripts/purity/manifest.ts` reads filter's own
`exports` map, so both sub-paths land in the gate under both conditions - four rows, `.` and
`./schemas` times ESM and CJS. Run it with `make purity-filter`, or `make purity` for all of them. It
probes `dist/`, so build the package first.

`scripts/purity/probe.ts` shells out to the `bun build` CLI - not the in-process `Bun.build()`, which
resolves this workspace's symlinked dependencies to directories and dies - with
`--target=browser --format=esm --env=disable --metafile=...`, then fails on any node builtin import,
any unresolved external, or any Node global (`process.`, `__dirname`, `__filename`, `createRequire(`)
surviving in the bundled text.

Three ways the measurement lies if written carelessly, all of them hit while building it: a browser
target does NOT error on `node:fs` and exits 0, so build success is not a purity signal - the
`--metafile` module graph is the only place the specifier survives; `--env=disable` is mandatory
because Bun otherwise inlines `process.env.NODE_ENV` as a compile-time constant and erases the very
read the probe exists to catch; and a bare `import ... from 'fs'` bundles identically to `'node:fs'`,
so matching on the `node:` prefix alone misses it - the check uses `node:module`'s own
`builtinModules` list.

Purity is a property of the RESOLVED graph, not of a file's own source: before the extraction this
same code pulled 13 node builtins plus `@hono/zod-openapi` and `ioredis`, purely by reaching
`getError` through the `@venizia/ignis-helpers` root barrel.
See [filter system](/architecture/filter-system.md).

## The `./schemas` sub-path

The zod schemas (`FilterSchema`, `WhereSchema`, `InclusionSchema`, and the scalar members) live here
too, on a **separate entry point**: `@venizia/ignis-filter/schemas`. Separate because the root barrel
must not drag `zod` in for consumers who only want the vocabulary - the root re-exports `common/`
only, and `zod` is reachable from the sub-path alone.

They are built with **plain `zod`**, never `@hono/zod-openapi`, so `buildQuerySchemas({ decorate })`
takes an injected decorator: `.openapi()` returns a NEW schema rather than mutating, and three of the
eleven decorations sit on inner nodes of a nested tree, so a consumer cannot annotate them after the
tree is composed. `kernel/src/base/repositories/query-schemas/index.ts` calls the builder with
`(schema, metadata) => (schema as any).openapi(metadata)` and re-exports under the original names.
That file's side-effect `import '@hono/zod-openapi'` is load-bearing: the package peers on `zod`, so
importing it patches `.openapi()` onto the shared prototype before the builder runs.

**Server code must import the schemas from `@venizia/ignis-core`, never from
`@venizia/ignis-filter/schemas`.** The sub-path exports undecorated instances of the same names for
browsers; importing those on a server yields schemas that validate identically but document nothing.
`core/src/__tests__/repositories/query-schema-openapi.test.ts` guards the decorated path by
generating an OpenAPI 3.1 document and asserting descriptions survive at both the top level and on
nested properties - the failure mode is otherwise silent, since undecorated schemas still compile and
still validate.

## What stays behind in core

Translation stays in core: turning a `TFilter` into SQL is engine-specific, and `mergeFilter` is a
method on the shared relational query dialect (`FilterBuilder` in
`connectors/relational/repositories/dialect/filter.ts`, inherited by `PostgresFilterBuilder` and the
other engine dialects) rather than a standalone function, so neither is extractable.

The types are **hand-written, not `z.infer`**, and that is deliberate. `TFilter<T>` is generic over
the entity, so `TFilter<User>` rejects `{ where: { notAField: 1 } }` while the inferred type accepts
it - `RecursiveWhereSchema` is `z.ZodType<any>`, and inference cannot recover the entity keys.
`connectors/search/repositories/common/constants.ts` documents a second reason: embedding the
recursive `FilterSchema` collapses optional-key inference for every sibling field, silently turning
`filter` into a required `any`. Schema and type describe different things - what arrives over the
wire versus what application code builds - and only overlap in the middle.

`kernel` re-exports this package from `base/repositories/common/index.ts`, and `core`'s root barrel
re-exports `kernel` wholesale, so every existing `@venizia/ignis-core` import of `TFilter` or
`QueryOperators` keeps resolving and no consumer needed to change. Install this package directly only
when you want the vocabulary WITHOUT the server framework - the browser case.

## Related

- [filter system](/architecture/filter-system.md)
- [repository hierarchy](/architecture/repository-hierarchy.md)
- [inversion](/packages/inversion.md)
- [kernel](/packages/kernel.md)
