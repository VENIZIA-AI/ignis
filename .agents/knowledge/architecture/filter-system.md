---
type: Architecture
title: Filter system
description: The engine-neutral filter vocabulary, how FilterBuilder translates it into Drizzle, and why find() silently switches between two different Drizzle query APIs.
resource: packages/connectors/src/relational/core/repositories/dialect/filter.ts
tags: [architecture, filter, query, drizzle, postgres]
---

A filter is a plain options object: `{ where, order, limit, offset, skip, fields, include }`. The vocabulary lives in its own package, [`@venizia/ignis-filter`](/packages/filter.md), and is **engine-neutral** - support differs per engine, and an unsupported operator throws at translation time rather than being quietly dropped from the list.

The vocabulary is also **browser-safe**, and that is enforced rather than assumed - centrally, not per package. `scripts/purity/cli.ts` (with `probe.ts` and `manifest.ts`) bundles each claimed package's built `dist` entry with `bun build --target=browser` and fails on any leftover node builtin import, any unresolved external import, or any node global (`process.`, `__dirname`, `__filename`, `createRequire(`) surviving in the bundled text. `make purity` checks every entry in the manifest, `make purity-filter` only this package.

The zod schemas that validate a filter arriving over HTTP come in two layers. `packages/filter/src/schemas/builder.ts` builds them with plain `zod`, so a browser can use them; `packages/kernel/src/base/repositories/query-schemas/index.ts` calls `buildQuerySchemas({ decorate })` to add the `@hono/zod-openapi` documentation metadata - a server concern, and the load-bearing side-effect `import '@hono/zod-openapi'` that patches `.openapi()` onto the shared prototype sits in that kernel file. The repository base classes live in the browser-pure `@venizia/ignis-kernel` package, not in `core/src/base/repositories/`, and kernel re-exports the filter package from `base/repositories/common/index.ts`, so every existing `@venizia/ignis-core` import keeps resolving.

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

The vocabulary is shared, the support is not. An operator an engine cannot express throws
NotSupported (HTTP 501) at translation time rather than being dropped from the list:

| Operator | On SQLite (`SqliteQueryOperators`) |
|---|---|
| `regexp`, `iregexp` | **Throws.** `X REGEXP Y` is sugar for a `regexp()` user function SQLite never defines and libsql never registers |
| `contains`, `containedBy`, `overlaps` | **Throws.** SQLite has no array storage class, so there is no operand for `@>` / `<@` / `&&` |
| `ilike`, `nilike` | Compile to `LIKE` / `NOT LIKE`. SQLite's `LIKE` is already ASCII case-insensitive, so refusing `ilike` would only push the caller to write `like` and get identical SQL |
| `like`, `nlike` | Compile to `LIKE` / `NOT LIKE`, which is **wider than Postgres** - `LIKE` folds ASCII case, and non-ASCII is folded by neither (`'ÉCOLE' LIKE 'é%'` is false without ICU) |

Do not enable `PRAGMA case_sensitive_like=ON` on a SQLite datasource: it makes `ilike` case-sensitive.

## Translation

`FilterBuilder` (`packages/connectors/src/relational/core/repositories/dialect/filter.ts`) turns a filter into Drizzle pieces: `toWhere()`, `toOrderBy()`, `toInclude()`, plus column selection. It is **abstract** and emits no engine-specific SQL: `operators`, `buildJsonWhereCondition` and `buildJsonOrderBy` are all `protected abstract`, so every engine subclasses to supply its operator table and its own JSON extraction syntax. It has zero `drizzle-orm/pg-core` imports.

Three classes, in a line:

| Class | Declared in | Adds |
|---|---|---|
| `FilterBuilder` (abstract) | `packages/connectors/src/relational/core/repositories/dialect/filter.ts` | The whole `where`/`order`/`include`/columns walk; `operators` and both JSON extractions left abstract |
| `PostgresFilterBuilder` | `packages/connectors/src/relational/postgres/repositories/dialect/filter.ts` | `operators` returns `PostgresQueryOperators.FNS`, plus the `#>>`/`#>` extractions and the `::numeric` guard cast |
| `PostgresQueryDialect` | `packages/connectors/src/relational/postgres/repositories/dialect/query-dialect.ts` | `implements IRelationalQueryDialect`; adds `transformUpdate()`/`toUpdateData()`, backed by `UpdateBuilder` |

SQLite mirrors the last two: `SqliteFilterBuilder` (`packages/connectors/src/relational/sqlite/repositories/dialect/filter.ts`) supplies `SqliteQueryOperators.FNS` plus `json_extract` path syntax, and `SqliteQueryDialect` backs its update transform with `SqliteUpdateBuilder` (`json_set`).

The update transform has the same two-tier shape: `RelationalUpdateBuilder` (`packages/connectors/src/relational/core/repositories/dialect/update.ts`) is abstract with one abstract member, `composeJsonSet()`, and each engine overrides only that.

**Export placement matters.** `FilterBuilder` resolves only from `@venizia/ignis/relational`. `PostgresFilterBuilder` resolves from `@venizia/ignis` and `@venizia/ignis/postgres`. There is no `FilterBuilder` alias in the Postgres tier - it would publish two different classes under one name across sibling sub-paths.

A repository never constructs any of them; it asks its datasource for `getQueryDialect()`, which caches one `PostgresQueryDialect` instance statically on `AbstractPostgresDataSource`. `FilterBuilder` memoizes resolved relations per schema in a `WeakMap` (registry lookups are safe to cache because `@model` settings are immutable after boot); `getCachedColumns()` does the same for table columns. It declares the JSON-path methods `abstract` and spells no `#>>`/`#>` itself, so a second SQL engine gets a compile error rather than Postgres SQL. See [Relational connector](/architecture/relational-connector.md) for the exact override list.

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

1. **The column must actually be a JSON column.** `validateJsonColumnType()` throws `Column 'x' is not a JSON column` otherwise - a dotted key against a `text` column is an error, not a literal column name. The message names no engine type: `jsonb` is unreachable on SQLite.
2. **Path components are validated.** `JSON_PATH_PATTERN` allows identifiers, kebab-case, and array indices; anything else throws. This is what keeps a caller-supplied path out of the generated SQL as an injection vector.
3. **Where extraction is text, numeric operands need a cast.** Postgres `#>>` yields text; comparing it to a number without a cast produces `operator does not exist: text = integer`. `jsonNeedsNumericCast()` decides this from the operand: true for any numeric comparison (`gt`/`gte`/`lt`/`lte`/`between`/`notBetween` with numbers), and true for `eq`/`ne`/`neq` with a number operand or `in`/`inq`/`nin` with an all-number array. A mixed-type array is *not* cast. It only picks between the two extractions the engine passed in, so `SqliteFilterBuilder` returns `false` and `json_extract` stays cast-free - including under `not`, which routes through the same predicate rather than testing `typeof` itself.

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

- [Relational connector](/architecture/relational-connector.md)
- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [Transactions](/architecture/transactions.md)
- [Const Classes](/conventions/const-classes.md)
