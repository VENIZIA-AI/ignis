---
title: Relational Connector Lift - Engine-Neutral SQL Tier
description: The SQL repository and datasource tier splits into an engine-neutral connectors/relational and a Postgres branch, reachable at a new @venizia/ignis/relational export. Ten names leave @venizia/ignis/postgres for their Postgres spellings, and findById finally accepts options.retry.
---

# Changelog - 2026-08-01

## Relational Connector Lift - Engine-Neutral SQL Tier

<Badge type="danger" text="Breaking Change" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** IGNIS's SQL repository and datasource tier now splits into an engine-neutral
`connectors/relational` and a Postgres branch on top of it, published at a new
`@venizia/ignis/relational` export. Ten `*Relational*` names leave `@venizia/ignis` and
`@venizia/ignis/postgres` for their Postgres spellings on the same path, and `findById` accepts
`options.retry` for the first time.

## The problem it solves

Every SQL class in IGNIS - `DefaultCRUDRepository`, `BasePostgresDataSource`, the query dialect - was
hard-wired to Postgres, down to a single class calling Drizzle's Postgres query builder directly. A
second SQL engine (SQLite, or a Postgres-compatible engine like PGlite for tests and browsers) had no
seam to plug into; it would have needed its own copy of the repository chain.

## What changed

- **New engine-neutral tier.** `connectors/relational` carries the datasource root, driver contract,
  entity base, and the five-class repository chain (`RelationalBaseRepository` through
  `SoftDeletableRelationalRepository`), all free of Postgres-specific Drizzle imports.
- **One repository, any SQL engine.** A repository reaches the database through two ports its
  datasource supplies: `getQueryDialect()` (filter and update translation) and `getQueryExecutor()`
  (the seven query verbs - `select`, `count`, `findMany`, `findFirst`, `insert`, `update`, `remove`).
  `PostgresQueryExecutor` is now the only place in `connectors/postgres` that calls a Drizzle query
  builder.
- **New `@venizia/ignis/relational` export**, published beside `@venizia/ignis/postgres`. It is not
  merged into the root barrel - the two tiers declare several of the same class names (see Details).
- **`@venizia/ignis/relational` publishes a dialect-free `TTableSchemaWithId`**, bound by Drizzle's
  `Table` rather than `PgTable`, so a `sqliteTable` satisfies it. The `TTableSchemaWithId` on
  `@venizia/ignis` and `@venizia/ignis/postgres` is unchanged and stays `PgTable`-branded - it has to
  compose with the `TTableObject` and `TTableInsert` those entries serve.
- **`findById` now accepts `options.retry`** on `SoftDeletableRepository`. The runtime always
  supported it; only the type signature rejected it. See [Fixes](#fixes).

## Breaking changes

Every rename below is name-only. The class or type is the same one you already use, on the same
import path, with the same type parameters and the same behavior.

### Ten names move to their Postgres spelling

The neutral tier now declares the `*Relational*` names for real, so `@venizia/ignis/postgres` can no
longer alias them onto its own classes. One name would mean two different classes on sibling
sub-paths. Each old name has a Postgres spelling that was already exported before the lift.

Rename the import. Do not switch to `@venizia/ignis/relational` - the class of that name there is the
neutral one, and its `connector` is `unknown` rather than a `PgDatabase`.

| Old name | Use instead | Kind |
|----------|-------------|------|
| `RelationalBaseRepository` | `PostgresBaseRepository` | abstract class |
| `ReadableRelationalRepository` | `ReadableRepository` | class |
| `PersistableRelationalRepository` | `PersistableRepository` | class |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | class |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | class |
| `AbstractRelationalDataSource` | `AbstractPostgresDataSource` | abstract class |
| `BaseRelationalDataSource` | `BasePostgresDataSource` | abstract class |
| `FilterBuilder` | `PostgresFilterBuilder` | class |
| `IRelationalDriver` | `TRelationalDriver` | type |
| `IRelationalConnection` | `TRelationalConnection` | type |

```typescript
// Before
import { BaseRelationalDataSource, DefaultRelationalRepository, FilterBuilder } from '@venizia/ignis';
// After
import { BasePostgresDataSource, DefaultCRUDRepository, PostgresFilterBuilder } from '@venizia/ignis';
```

A repository subclass changes only its `extends` clause:

```typescript
// Before
export class UserRepository extends DefaultRelationalRepository<typeof User.schema> {}
// After
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

`BaseDataSource`, `BaseEntity`, `BasePostgresEntity`, `BaseRelationalEntity`, `IStatementResult` and
`UpdateBuilder` are untouched. Each still resolves from `@venizia/ignis` and
`@venizia/ignis/postgres` under the name you already use. `NodePostgresDriver` and `PostgresJsDriver`
keep their own sub-paths, `@venizia/ignis/postgres/node-postgres` and
`@venizia/ignis/postgres/postgres-js`, unchanged.

### The two driver types are now `T`-prefixed

`IRelationalDriver` and `IRelationalConnection` were interfaces in
`connectors/postgres/drivers/driver.ts`. They are now Postgres *narrowings* - type aliases over the
neutral interfaces of the same name. IGNIS names a symbol after its declaration keyword: `I` for an
`interface`, `T` for a `type`. So the aliases are `TRelationalDriver` and `TRelationalConnection`.

The type parameters did not change, so an existing driver class needs one edit:

```typescript
// Before
import type { IRelationalConnection, IRelationalDriver } from '@venizia/ignis/postgres';
export class MyDriver<Schema extends TAnyDataSourceSchema> implements IRelationalDriver<Schema, Pool> {
  async acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>> { /* ... */ }
}

// After
import type { TRelationalConnection, TRelationalDriver } from '@venizia/ignis/postgres';
export class MyDriver<Schema extends TAnyDataSourceSchema> implements TRelationalDriver<Schema, Pool> {
  async acquire(opts: { schema: Schema }): Promise<TRelationalConnection<Schema>> { /* ... */ }
}
```

The genuine interfaces keep the `I` prefix at `@venizia/ignis/relational`. There they take a
connector type parameter instead of a schema: `IRelationalDriver<TConnector, Client>` and
`IRelationalConnection<TConnector>`. Reach for those only when you build a second SQL engine.
`IStatementResult` is still an interface and is unchanged on both paths.

### `denyOperation` takes an options object

`AbstractRepository.denyOperation` is `protected`, so this breaks any repository subclass that calls
it. Both connector families are affected - a `ReadableSearchRepository` subclass as much as a
relational one.

```typescript
// Before
protected denyOperation(methodName: string): never;
// After
protected denyOperation(opts: { methodName: string }): never;
```

```typescript
// Before
return this.denyOperation(this.create.name);
// After
return this.denyOperation({ methodName: this.create.name });
```

## Behavior changes

- **`resolveConnector`'s error message reworded.** A repository called with a transaction it cannot
  use now throws `"... is not a relational transaction"`, where it previously said
  `"... is not a postgres transaction"`. The failure condition is identical; only the wording changed.
- **A debug log now carries different content in one branch.** `create`/`updateAll`/`deleteAll`
  called with `options: { shouldReturn: false }` still emit the same debug line
  (`'INSERT result | shouldReturn: %s | rs: %j'` and its `UPDATE`/`DELETE` siblings, same level, same
  scope), but `rs` is now `{ count, rows: [] }` instead of the raw driver result (`pg`'s
  `{ rows, rowCount }`, or postgres-js's `RowList`). Anything parsing that specific log line's `%j`
  payload sees a different object shape in the `shouldReturn: false` branch only.
- **The five Postgres repository names are subclasses, not aliases.** They used to be the neutral
  classes under a second name. So `ReadableRepository === ReadableRelationalRepository` is false
  where it used to be true, and `instanceof DefaultCRUDRepository` is false for a
  `SoftDeletableRepository`. `instanceof` down the chain is unaffected, and nothing in IGNIS compares
  repository classes by identity.

## Fixes

### `findById` accepts `options.retry`

This is the most user-visible change in the set. [Read retry](/references/base/repositories/advanced#read-retry-replica-lag)
shipped for `find`, `findOne` and `findById`, but `findById` was rejected at compile time on
`SoftDeletableRepository`. Its three overloads typed `options` as `ExtraOptions & { isStrict?: X }`,
which drops `IWithReadRetry`. `RelationalBaseRepository`'s four abstract read verbs had the same
defect. The runtime plumbing was always complete, so the option worked the moment the signature
allowed it.

All seven signatures now carry `TFindOptions`, `TFindRangeOptions` or `TFindOneOptions`, matching the
`IReadableRepository` contract. Nothing to migrate - code that did not compile now does:

```typescript
const category = await repository.findById({
  id: 123,
  options: { retry: { maxAttempts: 4 } },
});
```

**Ordering.** Pass `retry` and `isStrict: true` together and retries run first. `isStrict` is
evaluated after the loop is exhausted, because retry lives in `super.findById` -> `findOne`. So a
strict read waits out replica lag before it throws `ENTITY_NOT_FOUND`:

```typescript
const category = await repository.findById({
  id: 123,
  options: { retry: { maxAttempts: 4 }, isStrict: true },
});
```

### `TSoftDeletableTableSchema` composes with the root barrel again

The Postgres tier declares `TSoftDeletableTableSchema` itself rather than re-exporting the neutral
one. The neutral schema is branded with Drizzle's dialect-free `Table`, while the root barrel serves
`PgTable`-branded `TTableObject` and `TTableInsert` beside it. The two could not compose.

The symptom, if you saw it: intersecting the schema and feeding the result to the row types failed
with `TS2344`.

```typescript
import type { TSoftDeletableTableSchema, TTableObject } from '@venizia/ignis';

type TArchivableTableSchema = TSoftDeletableTableSchema & { status: unknown };
type TArchivableRow = TTableObject<TArchivableTableSchema>; // TS2344 before the fix
```

Nothing to migrate. The break never reached a release, and both sides of the root barrel are
`PgTable`-branded again. `packages/core/src/__tests__/connectors/postgres/root-barrel-composability.test.ts`
pins it - `bun run typecheck` is the gate, since `bun test` erases types.

### `getIdType` is one function again

The Postgres copy is deleted. `@venizia/ignis/postgres` re-exports the neutral function from
`connectors/relational/models/common`. Same signature, same behavior, one object instead of two. The
neutral bound is `Table`-branded and therefore wider, so every Postgres caller still satisfies it.
Invisible at runtime, nothing to migrate.

## Notes

`TRelationalTransactionOptions` is the neutral SQL transaction options type, at
`@venizia/ignis/relational`. It was spelled `IRelationalTransactionOptions` earlier in this work and
follows the same `T`-for-`type` rule as the two driver types above. It is new here and was never
published, so there is nothing to migrate. `IDatabaseTransactionOptions` extends it and is unchanged.

## Who is affected

- **Anyone importing a `*Relational*` repository, datasource, driver type or `FilterBuilder` from
  `@venizia/ignis` or `@venizia/ignis/postgres`.** Rename per the table above. Same path, same
  behavior.
- **Anyone using `ReadableRepository`, `PersistableRepository`, `DefaultCRUDRepository`,
  `SoftDeletableRepository`, `BasePostgresDataSource`, `AbstractPostgresDataSource`, `BaseDataSource`,
  `BaseRelationalEntity` or `NodePostgresDriver`.** No action needed. Every one of these still
  resolves at the same import path, with the same behavior and the same Postgres-typed `connector`.
- **Any repository subclass that calls `denyOperation`.** Wrap the argument:
  `denyOperation({ methodName })`. This includes search repositories.
- **Anyone who wanted `retry` on `findById`.** It compiles now. Nothing else to do.
- **Anyone who hit `TS2344` intersecting `TSoftDeletableTableSchema`.** Fixed. Delete any local
  workaround that re-declared the schema.
- **Anything matching on the literal string `"is not a postgres transaction"`.** Update the match to
  `"is not a relational transaction"`.
- **A log pipeline parsing the `shouldReturn: false` branch's `rs` field structurally** (for example,
  reading `rs.rowCount`). Read `rs.count` instead - it is already normalized across drivers.
- **Anything comparing repository classes by identity.** `ReadableRepository ===
  ReadableRelationalRepository` is now false. Use `instanceof`.
- **Building a second SQL engine connector (SQLite, PGlite).** The seam now exists:
  `connectors/relational` has no Postgres coupling to work around.

## Details

The Postgres branch declares `AbstractPostgresDataSource` and `BasePostgresDataSource`. The neutral
tier declares `AbstractRelationalDataSource` and `BaseRelationalDataSource`. No two classes share a
declaration name. The same holds for the five repository classes and for `FilterBuilder`.

`connectors/index.ts` exports `./postgres` only. Merging `./relational` into the root barrel would
put two different classes under one name for every pair above, and make one of each unreachable.
That is also why the compat aliases are gone rather than kept: an alias would have reintroduced the
collision across sibling sub-paths. Reach the neutral tier only through `@venizia/ignis/relational`,
and import one sub-path per file.

`FilterBuilder` turned out to already be engine-neutral - zero `drizzle-orm/pg-core` imports - once
its one Postgres-only call (`getTableConfig(schema).name`) was swapped for Drizzle's dialect-free
`getTableName(schema)`. It moved whole to `connectors/relational/repositories/dialect/filter.ts` and
became `abstract`: its operator table is now `protected abstract get operators()`, so the class names
no engine at all. `PostgresFilterBuilder` is the Postgres subclass, and it supplies one member -
`PostgresQueryOperators.FNS`. A second SQL engine does the same and inherits the other 736 lines. The
JSON-path methods stay `protected` on the neutral base for the same reason: override, never fork.

Only `PostgresQueryOperators`, `UpdateBuilder`, and those JSON-path defaults remain genuinely
Postgres-specific.

| File | Package |
|------|---------|
| `src/connectors/relational/**` | core |
| `src/connectors/postgres/datasources/**` | core |
| `src/connectors/postgres/drivers/driver.ts` | core |
| `src/connectors/postgres/repositories/**` | core |
| `src/connectors/postgres/models/**` | core |
| `src/base/repositories/core/abstract.ts` | core |
| `src/connectors/search/repositories/core/readable.ts` | core |

See also: [Connectors](/references/base/connectors) for how IGNIS's engine-neutral contract works
across every connector family, Postgres included.
