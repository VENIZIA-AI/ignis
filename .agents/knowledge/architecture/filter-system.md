---
type: Architecture
title: Filter system
description: The engine-neutral filter vocabulary, how FilterBuilder translates it into Drizzle, and why find() silently switches between two different Drizzle query APIs.
resource: packages/core/src/connectors/postgres/repositories/dialect/filter.ts
tags: [architecture, filter, query, drizzle, postgres]
---

A filter is a plain options object: `{ where, order, limit, offset, skip, fields, include }`. The vocabulary lives in its own package, [`@venizia/ignis-filter`](/packages/filter.md), and is **engine-neutral** - support differs per engine, and an unsupported operator throws at translation time rather than being quietly dropped from the list.

The vocabulary is also **browser-safe**, and that is enforced rather than assumed: `packages/filter/src/__tests__/browser-purity.test.ts` bundles the barrel for `target: 'browser'` and fails on any `node:*` builtin or any package outside `@venizia/ignis-inversion` / `lodash` / `reflect-metadata`. The zod schemas that validate a filter arriving over HTTP stay in `core/src/base/repositories/query-schemas/`, coupled to `@hono/zod-openapi` - that is correct for them, they parse query strings. `core` re-exports the package from `base/repositories/common/index.ts`, so every existing `@venizia/ignis-core` import keeps resolving.

## Operators

`QueryOperators` is a const-class, not a string union:

| Group | Values |
| --- | --- |
| Comparison | `eq`, `ne`, `neq`, `gt`, `gte`, `lt`, `lte` |
| Pattern | `like`, `nlike`, `ilike`, `nilike`, `regexp`, `iregexp` |
| Null / presence | `is`, `isn`, `exists`, `notExists` |
| Membership | `in`, `inq`, `nin` |
| Range | `between`, `notBetween` |
| Postgres array | `contains` (`@>`), `containedBy` (`<@`), `overlaps` (`&&`) |
| Logical | `not`, `and`, `or` |

`Sorts` carries `asc`/`desc`. `DEFAULT_LIMIT` is `10` - `find()` applies `filter.limit ?? getDefaultLimit() ?? DEFAULT_LIMIT`, so an unbounded query is not the default.

## Translation

`FilterBuilder` (in the postgres dialect) implements `IRelationalQueryDialect` and turns a filter into Drizzle pieces: `toWhere()`, `toOrderBy()`, `toInclude()`, plus column selection. It is created once and cached statically on `AbstractRelationalDataSource`, and it memoizes resolved relations per schema in a `WeakMap` (registry lookups are safe to cache because `@model` settings are immutable after boot). `getCachedColumns()` does the same for table columns.

## The dual query API

`find()` and `findOne()` pick their execution path from the filter itself:

```typescript
protected canUseCoreAPI(filter: TFilter<DataObject>): boolean {
  const hasInclude = filter.include && filter.include.length > 0;
  const hasFields = /* fields present and non-empty */;
  return !hasInclude && !hasFields;
}
```

- **Core API** (`connector.select().from(table).$dynamic()`) - roughly 15-20% faster, but supports neither relations nor field selection. This is the path that supports row-level locking (`.for(strength, config)`).
- **Query API** (`connector.query.<table>.findMany()`) - supports relations (`include`) and field selection (`fields`).

The switch is automatic and invisible to the caller, which is why lock options are rejected when `include`/`fields` force the Query API: `validateLockOptions()` throws rather than dropping the lock.

## JSON path pitfalls

Any `where` key containing `.` or `[` is treated as a JSON path (`isJsonPath`). Three things bite here:

1. **The column must actually be JSON/JSONB.** `validateJsonColumnType()` throws otherwise - a dotted key against a `text` column is an error, not a literal column name.
2. **Path components are validated.** `JSON_PATH_PATTERN` allows identifiers, kebab-case, and array indices; anything else throws. This is what keeps a caller-supplied path out of the generated SQL as an injection vector.
3. **JSON extraction is text, so numeric operands need a cast.** `#>>` yields text; comparing it to a number without a cast produces Postgres `operator does not exist: text = integer`. `jsonNeedsNumericCast()` decides this from the operand: true for any numeric comparison (`gt`/`gte`/`lt`/`lte`/`between`/`notBetween` with numbers), and true for `eq`/`ne`/`neq` with a number operand or `in`/`inq`/`nin` with an all-number array. A mixed-type array is *not* cast.

## mergeFilter and arrays

`mergeFilter({ defaultFilter, userFilter })` composes a model's default filter (soft delete, tenancy, visibility) with the caller's. It merges `where` at the **top key level, never index-wise** - index-wise merging corrupts operator arrays like `inq` and `or`. The rules, as implemented in `mergeWhere()`:

- a user value of `undefined` never overrides a defined default, so a caller cannot blow away a tenant or soft-delete scope by passing `undefined`;
- scalar-over-scalar on the same key is a plain override (`isDeleted: false` -> `true` is the long-standing opt-out);
- **any other collision AND-composes** into the reserved `and` group, so a default scope can only ever be narrowed - `status: 'active'` plus `status: { neq: 'archived' }` keeps both;
- an `and` collision concatenates the two conjunct lists (concatenating *is* the AND of the groups);
- an `or` collision does **not** concatenate - that would union the disjunctions and widen the query. Each group becomes its own conjunct, so both must hold.

Everything outside `where` (`order`, `limit`, `offset`, `skip`, `fields`, `include`) is user-wins.

`applyDefaultFilter()` runs once at the top of `find()`, which then passes `shouldSkipDefaultFilter: true` down to the Core/Query executor so the default is not merged twice.

## Related

- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [Transactions](/architecture/transactions.md)
- [Const Classes](/conventions/const-classes.md)
