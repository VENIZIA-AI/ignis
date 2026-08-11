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

## The relational chain

The five-class chain lives in `connectors/relational` - the engine-neutral SQL tier, reachable at the
`@venizia/ignis/relational` sub-path - not in `connectors/postgres`. `connectors/postgres` extends it
one-for-one: five thin subclasses that add no behavior and only rebind the two engine-facing type
parameters. Full account, including the two ports a datasource supplies (`IRelationalQueryDialect`,
`IRelationalQueryExecutor`) and what stays genuinely Postgres-only:
[Relational connector](/architecture/relational-connector.md).

```
AbstractRepository
  └── RelationalBaseRepository       (abstract; query-dialect delegation + hidden-column exclusion)
      └── ReadableRelationalRepository        (READ_ONLY; writes throw)
          └── PersistableRelationalRepository     (READ_WRITE; create/update/delete)
              └── DefaultRelationalRepository         (recommended base - no additions)
                  └── SoftDeletableRelationalRepository  (sets deletedAt instead of deleting)
```

**`DefaultCRUDRepository` is the Postgres subclass** of `DefaultRelationalRepository`, declared in
`connectors/postgres/repositories/core/default.ts`. It is a different class object from its neutral
parent - `DefaultCRUDRepository === DefaultRelationalRepository` is false - but `instanceof` still
holds down the chain, and nothing in the framework compares repository classes by identity.

The last two type parameters are where the engine lives. Neutral, they default to the neutral
contracts:

```ts
ExtraOptions extends IExtraOptions = IRelationalExtraOptions,
TDataSource extends IRelationalDataSource = IRelationalDataSource,
```

Each Postgres subclass rebinds exactly those two to `IDatabaseExtraOptions` and
`IPostgresDataSource`, which is what makes `connector`, `resolveConnector()`,
`beginTransaction().connector` and `options.transaction.connector` a `PgDatabase` with no cast for a
single-argument `class UserRepository extends DefaultCRUDRepository<TUserSchema> {}`. Off the neutral
class those same reads are `unknown` - correct, since neutral code cannot know the engine. A second
SQL engine adds its own five subclasses the same way.

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

A read right after a write can hit a lagging replica. `find`/`findOne`/`findById` accept an opt-in
`retry: IReadRetryOptions<TResult>` (`maxAttempts?`, `maxTotalMs?`, `signal?`, `backoff?`,
`until?`) that re-reads until the predicate passes.

Type design (`base/repositories/common/types.ts`):

- `retry` exists ONLY on the read-verb option aliases: `TFindOptions` (predicate sees `Array<R>`),
  `TFindRangeOptions` (`TDataWithRange<R>`), `TFindOneOptions` (`TNullable<R>`).
- `IExtraOptions` is untouched, so an inline `{ retry }` on a write verb is a compile error
  (excess-property check). A pre-built object carrying a stray `retry` passes structurally, but the
  key is never read.

Runtime (`AbstractRepository.executeReadWithRetry`, the shared orchestration point):

- No `retry` -> direct execution, zero overhead.
- Inside a transaction -> skipped with a debug log; pools route transactions to the primary.
  Locked reads require a transaction, so they never retry either.
- Otherwise -> helpers' `executeWithRetryUntil` (see [helpers](/packages/helpers.md)) with a
  read-tuned default backoff (EXPONENTIAL, 50ms initial, 500ms cap, EQUAL jitter) and a per-verb
  default `until`: `findOne`/`findById` retry while `null`/`undefined`, `find` while empty.
- `maxTotalMs` only gates NEW attempts - an in-flight read is never interrupted; non-positive means
  "no retries", one read still runs. An aborted `signal` REJECTS the call. `maxAttempts` below `1`
  throws before any read.

Wiring:

- Protected `findUntil`/`findRangeUntil`/`findOneUntil` strip `retry` (spread + `delete`; the
  destructure-omit idiom is a lint error here - `no-unused-vars` has `ignoreRestSiblings: false`)
  and re-enter the public verb, so recursion is single-depth by construction. The find/range split
  lets each method check against its own `find` overload.
- Both connectors dispatch at the top of `find`/`findOne`; `findById` inherits via its `findOne`
  delegation. Search's `findOne` dispatches BEFORE delegating to `find`, so exactly one retry layer
  wraps a call.
- Routing stays pooler-owned: no primary/replica awareness lives in framework code.
- A NEW engine's readable tier must add those dispatch lines itself - the base cannot inject them.
  Omitting them does not crash: `retry` is silently ignored, reads degrade to a single attempt.
- Any subclass that RE-DECLARES a read verb - an abstract restatement, or an override adding one
  option - must keep `TFindOptions`/`TFindRangeOptions`/`TFindOneOptions` in the signature. Typing
  `options` as bare `ExtraOptions` drops `IWithReadRetry`, and `options.retry` becomes a compile
  error on that class alone. Nothing flagged it: narrowing an override is legal TypeScript, the
  runtime plumbing still works, and a test holding the CONCRETE subclass never touches the narrowed
  tier - only a reference typed as the narrowed class does. `RelationalBaseRepository`'s four
  abstract read verbs and `SoftDeletableRelationalRepository.findById` both shipped this way.
  `__tests__/connectors/relational/soft-deletable-retry.test.ts` now pins it, by typing its
  parameter as the abstract tier rather than a concrete subclass. Retype that parameter and the
  guard stops guarding, so do not "simplify" it away.
- `SoftDeletableRelationalRepository.findById` evaluates `isStrict` AFTER the retry loop is
  exhausted - retry lives in `super.findById` -> `findOne`, so a strict read waits out replica lag
  before it throws `ENTITY_NOT_FOUND`.

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

- [Relational connector](/architecture/relational-connector.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Filter system](/architecture/filter-system.md)
- [Transactions](/architecture/transactions.md)
- [Search and Typesense](/architecture/search-typesense.md)
