---
type: Architecture
title: Repository hierarchy
description: The engine-neutral repository base and the per-connector chains built on it, plus how the DataSource gets injected.
resource: packages/core/src/base/repositories
tags: [architecture, repositories, drizzle, connectors]
---

IGNIS repositories split across two layers: one engine-neutral abstract base, and one concrete chain
per connector paradigm. There is no single universal `AbstractRepository -> ReadableRepository ->
PersistableRepository -> DefaultCRUDRepository` chain - that shape exists, but **once per connector
family, under connector-specific names**.

## The engine-neutral base

`AbstractRepository<TDataObject, TPersistObject, TOptions extends IExtraOptions>` in
`base/repositories/core/abstract.ts` extends `BaseHelper` and implements `IPersistableRepository`. It
holds only what every engine needs: lazy `_dataSource` and `_entity` resolution (the latter from
`@repository` metadata on first access), `hiddenFields` and the default-filter where clause read off
`@model` settings, and `_operationScope`, defaulting to `READ_ONLY`.

Those `@model` settings are memoized per entity class, and `_modelSettings` starts as `null` meaning
"not yet resolved" - `undefined` is itself a valid resolved value (the model declares no settings).

## The relational (Postgres) chain

```
AbstractRepository
  └── RelationalBaseRepository       (abstract; FilterBuilder + hidden-column exclusion)
      └── ReadableRelationalRepository        (READ_ONLY; writes throw)
          └── PersistableRelationalRepository     (READ_WRITE; create/update/delete)
              └── DefaultRelationalRepository         (recommended base - no additions)
                  └── SoftDeletableRelationalRepository  (sets deletedAt instead of deleting)
```

**`DefaultCRUDRepository` is a back-compat alias**, exported from
`connectors/postgres/repositories/core/index.ts` as `DefaultRelationalRepository as
DefaultCRUDRepository`. Both names are the same class; new code should prefer the family name.

`ReadableRelationalRepository` carries the dual query API: `canUseCoreAPI(filter)` returns true when
the filter has neither `include` nor `fields`, and the Drizzle Core API path is then used because it
is roughly 15-20% faster. Relations and field selection force the query API.

`PersistableRelationalRepository` adds guards that are easy to miss: `validateId` refuses a
null/undefined id, and `validateWhereCondition` requires an explicit force flag before a table-wide
update or delete can run.

`SoftDeletableRelationalRepository` needs both a `deletedAt` column and
`defaultFilter: { where: { deletedAt: null } }` in `@model` settings. The column alone does not hide
deleted rows; the default filter is what does.

## The search chain

`connectors/search/repositories/core` mirrors the same shape: `SearchBaseRepository` (abstract) ->
`ReadableSearchRepository` -> `PersistableSearchRepository` -> `DefaultSearchRepository`. The
Typesense and Meilisearch connectors add no repository classes - they contribute query dialects
(`repositories/dialect/query-dialect.ts`) and types that the shared search chain drives.

## Opt-in read retry (read-after-write)

`find`/`findOne`/`findById` accept an opt-in `retry: IReadRetryOptions<TResult>` (`maxAttempts?`,
`maxTotalMs?`, `signal?`, `backoff?`, `until?`) defined in `base/repositories/common/types.ts`. It
lives ONLY on the read-verb option types - `TFindOptions`/`TFindRangeOptions` (predicate sees
`Array<R>` / the `TDataWithRange<R>` range envelope) and `TFindOneOptions` (predicate sees
`TNullable<R>`) intersect `IWithReadRetry<TResult>` on top of the shared `IExtraOptions`.
`IExtraOptions` itself is untouched, so an inline `options: { retry }` literal on a write verb
(`create`, `updateById`, `deleteById`, ...) is rejected by TypeScript's excess-property check at
compile time; a pre-built variable carrying an extra `retry` key passes structurally instead, but
the key is inert there and never read - not a runtime guard, a compile-time nudge with one known
structural gap.

`AbstractRepository.executeReadWithRetry` is the shared orchestration point: no `retry` set ->
direct execution, zero overhead; inside a transaction -> skipped with a debug log, because the pool
routes transactions to the primary and there is no replica lag to wait out; otherwise it calls the
helpers-layer `executeWithRetryUntil` (see [helpers](/packages/helpers.md)) with a default backoff
tuned for replica lag - EXPONENTIAL, 50ms initial delay, 500ms cap, EQUAL jitter, distinct from
`executeWithRetry`'s own general-purpose defaults - and a per-verb default `until` predicate:
`findOne`/`findById` retry while the result is `null` OR `undefined`; `find` retries while the array
(or, under `shouldQueryRange: true`, the range envelope's `data`) is empty. `maxTotalMs` only bounds
whether a NEW attempt may start - an in-flight read is never interrupted, so the first read always
runs to completion, and a non-positive budget just means "no retries" while still performing exactly
one read. `signal` aborts between attempts and during backoff sleeps; unlike exhaustion (which
returns the last, possibly stale, result), an abort REJECTS the call. `maxAttempts` below `1` also
throws immediately, before any read runs - the one case where "retry never fabricates a new error"
does not hold, because the configuration itself is nonsensical.

Protected `findUntil`/`findRangeUntil`/`findOneUntil` on `AbstractRepository` re-enter the public
verb with `retry` stripped via spread + `delete` (the destructure-omit idiom is a lint error here -
`no-unused-vars` has `ignoreRestSiblings: false`), so the recursion is single-depth by construction.
`findUntil`/`findRangeUntil` are split rather than one method, so each is checked against its own
`find` overload - `findUntil` returns `Array<R>` against the plain overload, `findRangeUntil`
returns `TDataWithRange<R>` against the `shouldQueryRange: true` overload. Postgres's
`ReadableRelationalRepository` and search's `ReadableSearchRepository` both dispatch with
`if (options?.retry) return options.shouldQueryRange ? this.findRangeUntil(...) :
this.findUntil(...)` at the top of `find`, and `if (options?.retry) return
this.findOneUntil(...)` at the top of `findOne`; `findById` inherits the behavior because it
delegates to `findOne`. Search's `findOne` dispatches BEFORE its own `find` delegation, so exactly
one retry layer wraps a call. Locked reads (`lock: TLockOptions`) never retry - a lock requires a
transaction, and transactions already skip retry. Routing stays pooler-owned: no primary/replica
awareness lives in framework code, `retry` only smooths over the read-your-writes lag such routing
can introduce.

A NEW engine's readable tier must include those dispatch lines itself - the base cannot inject
them without owning every engine's verb overloads. Omitting them does not crash: `retry` is
silently ignored and every read degrades to a single attempt.

## Hidden fields are excluded at query time

`hiddenProperties` in `@model` settings is not post-query filtering. `RelationalBaseRepository`
memoizes a `Set` view of `hiddenFields` and derives a Drizzle column-selection map from it
(`_visibleColumns`). Hidden columns are simply never selected, so the value never leaves the
database - a security property, not an optimization, since nothing downstream has to remember to
strip anything.

The default filter works the same way: `applyDefaultFilter({ userFilter, shouldSkipDefaultFilter })`
AND-merges the model's `defaultFilter` into the user's filter through the query dialect's
`mergeFilter` before the SQL is built.
## No mixins

`FieldsVisibilityMixin` and `DefaultFilterMixin` no longer exist - both behaviours were folded into
the base classes above and the mixins removed. Do not reach for them; there is nothing to compose.

## `@repository` auto-injects the DataSource

`@repository({ model, dataSource })` wires the datasource into constructor **param[0]** unless an
explicit `@inject` already claims that slot, so the common case needs no constructor:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultRelationalRepository<typeof User.schema> {}
```

`registerDataSourceInjection` in `base/metadata/persistents.ts` does the work, and it is strict:

- If the constructor declares a first parameter, its `design:paramtypes` entry must extend
  `AbstractDataSource` and be compatible with the class named in `@repository({ dataSource })`. Both
  mismatches throw by class name at decoration time.
- If an explicit `@inject` sits at index 0, its key must start with the `datasources.` namespace.
- It reads **own** metadata only (`Reflect.getOwnMetadata`). `getInjectMetadata` walks the prototype
  chain, so a repository extending another `@repository` class would otherwise see the base class's
  injection at param[0], skip its own auto-injection, and silently resolve the base's datasource.

## Related

- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Filter system](/architecture/filter-system.md)
- [Transactions](/architecture/transactions.md)
- [Search and Typesense](/architecture/search-typesense.md)
