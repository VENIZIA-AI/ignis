---
title: Relational Connector Lift - Engine-Neutral SQL Tier
description: The SQL repository and datasource tier splits into an engine-neutral connectors/relational and a Postgres branch, reachable at a new @venizia/ignis/relational export. Every Postgres class name still resolves, except FilterBuilder, which is now PostgresFilterBuilder.
---

# Changelog - 2026-08-01

## Relational Connector Lift - Engine-Neutral SQL Tier

<Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** IGNIS's SQL repository and datasource tier now splits into an engine-neutral
`connectors/relational` and a Postgres branch on top of it, published at a new
`@venizia/ignis/relational` export. Every existing Postgres class name still resolves unchanged, with
one exception: `FilterBuilder` is now `PostgresFilterBuilder`.

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
  merged into the root barrel - two compat aliases would collide with the neutral classes that own
  those names (see Details).
- **`TTableSchemaWithId` widened** from Drizzle's Postgres-only `PgTable` to its dialect-free `Table`,
  so a `sqliteTable` satisfies the same bound a `pgTable` does.

## Behavior changes

- **`FilterBuilder` is withdrawn from `@venizia/ignis` and `@venizia/ignis/postgres`.** The Postgres
  class is now `PostgresFilterBuilder`, exported from both. The name `FilterBuilder` now belongs to
  the neutral abstract base, reachable only at `@venizia/ignis/relational`. The old export was an
  alias, so the same name meant two different classes on sibling sub-paths.

  ```typescript
  // Before
  import { FilterBuilder } from '@venizia/ignis';
  // After
  import { PostgresFilterBuilder } from '@venizia/ignis';
  ```

- **`resolveConnector`'s error message reworded.** A repository called with a transaction it cannot
  use now throws `"... is not a relational transaction"`, where it previously said
  `"... is not a postgres transaction"`. The failure condition is identical; only the wording changed.
- **A debug log now carries different content in one branch.** `create`/`updateAll`/`deleteAll`
  called with `options: { shouldReturn: false }` still emit the same debug line
  (`'INSERT result | shouldReturn: %s | rs: %j'` and its `UPDATE`/`DELETE` siblings, same level, same
  scope), but `rs` is now `{ count, rows: [] }` instead of the raw driver result (`pg`'s
  `{ rows, rowCount }`, or postgres-js's `RowList`). Anything parsing that specific log line's `%j`
  payload sees a different object shape in the `shouldReturn: false` branch only.

## Who is affected

- **Everyone using `ReadableRepository`, `PersistableRepository`, `DefaultCRUDRepository`,
  `SoftDeletableRepository`, `BasePostgresDataSource`, `AbstractPostgresDataSource`, `BaseDataSource`,
  or `NodePostgresDriver`.** No action needed. Every one of these still resolves at the same import
  path, with the same behavior and the same Postgres-typed `connector`. The four repository names are
  now Postgres subclasses of the neutral chain rather than aliases of it, so
  `ReadableRepository === ReadableRelationalRepository` is false where it used to be true;
  `instanceof` is unaffected.
- **Anyone importing `FilterBuilder` from `@venizia/ignis` or `@venizia/ignis/postgres`.** Rename the
  import to `PostgresFilterBuilder`, from the same path. It is the same behavior: the Postgres
  operator table on top of the neutral translation. Subclass the abstract `FilterBuilder` from
  `@venizia/ignis/relational` only when you are building a second SQL engine.
- **Anything matching on the literal string `"is not a postgres transaction"`.** Update the match to
  `"is not a relational transaction"`.
- **A log pipeline parsing the `shouldReturn: false` branch's `rs` field structurally** (for example,
  reading `rs.rowCount`). Read `rs.count` instead - it is already normalized across drivers.
- **Building a second SQL engine connector (SQLite, PGlite).** The seam now exists:
  `connectors/relational` has no Postgres coupling to work around.

## Details

The Postgres branch declares `AbstractPostgresDataSource` and `BasePostgresDataSource`. The neutral
tier declares `AbstractRelationalDataSource` and `BaseRelationalDataSource`. No two classes share a
declaration name.

`@venizia/ignis/postgres` still *exports* the `*RelationalDataSource` spellings, as aliases of its
own two classes, because that is what apps imported before the lift. So those two names resolve to
different classes depending on which sub-path you import from. That is why `connectors/index.ts`
still exports `./postgres` only; merging both into the root barrel would make one class of each pair
unreachable by name. Reach the neutral tier only through `@venizia/ignis/relational`, and import one
sub-path per file.

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
| `src/connectors/postgres/repositories/**` | core |
| `src/connectors/postgres/models/base.ts` | core |

See also: [Connectors](/references/base/connectors) for how IGNIS's engine-neutral contract works
across every connector family, Postgres included.
