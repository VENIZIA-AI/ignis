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
