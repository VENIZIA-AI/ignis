---
type: Architecture
title: SQLite connector
description: The second SQL engine on the relational tier - the libsql driver, BEGIN IMMEDIATE, and every capability SQLite refuses instead of faking.
resource: packages/core/src/connectors/sqlite
tags: [architecture, connectors, drizzle, sqlite, libsql, relational]
---

`connectors/sqlite` is the second engine branch on the engine-neutral relational tier. It is what
falsifies that tier: every seam `connectors/relational` declares abstract now has two
implementations, not one.

Reach it at `@venizia/ignis/sqlite`, and the driver at `@venizia/ignis/sqlite/libsql`.

```typescript
import { datasource } from '@venizia/ignis';
import { BaseSqliteDataSource } from '@venizia/ignis/sqlite';
import { LibSqlDriver } from '@venizia/ignis/sqlite/libsql';
import { createClient } from '@libsql/client';

@datasource({ driver: LibSqlDriver })
export class SqliteDataSource extends BaseSqliteDataSource<{ url: string }> {
  constructor() {
    super({ name: SqliteDataSource.name, config: { url: 'file:./data.db' } });
  }

  override configure(): void {
    this.client = createClient(this.settings);
  }
}
```

`getConnectionString()` is inherited here - it returns `settings.url`, which is what SQLite's
connection string is. Postgres leaves that method abstract because no framework code can guess a
`postgresql://` url.

`connectors/index.ts` exports `./postgres` only, so `./sqlite` never reaches the root barrel. The two
branches share type names (`TTableSchemaWithId`, `TTableObject`) deliberately - import one sub-path
per file and the collision never surfaces.

## What the branch supplies

```
BaseRelationalDataSource            connectors/relational/datasources/base.ts   (BEGIN text abstract)
└── AbstractSqliteDataSource        connectors/sqlite/datasources/abstract.ts   (SqliteQueryDialect + SqliteQueryExecutor, both memoized)
    └── BaseSqliteDataSource        connectors/sqlite/datasources/base.ts       (supplies "BEGIN IMMEDIATE")
```

| File | Supplies |
|---|---|
| `datasources/abstract.ts` | The two ports, memoized on static fields the way `AbstractPostgresDataSource` does |
| `datasources/base.ts` | `buildBeginStatement()`, the `beginMode` patch, and a `getConnectionString()` that returns the libsql url |
| `drivers/libsql.ts` | `LibSqlDriver` - the only file that imports `@libsql/client` |
| `repositories/executor.ts` | `SqliteQueryExecutor`, the seven verbs against `BaseSQLiteDatabase` |
| `repositories/dialect/` | `SqliteQueryOperators`, `SqliteFilterBuilder`, `SqliteUpdateBuilder`, `SqliteQueryDialect` |
| `repositories/core/` | Five thin subclasses binding `ISqliteExtraOptions` + `ISqliteDataSource` |
| `models/` | `BaseSqliteEntity` and five enrichers over `sqlite-core` column factories |

## libsql, and why not `bun:sqlite`

`better-sqlite3` and `bun:sqlite` are synchronous. IGNIS repositories return promises, so a sync
driver blocks the event loop on every query. libsql's result kind is **async**, and Drizzle types
`bun:sqlite`'s run result as `void`, which puts affected-row counts out of reach entirely.

One driver covers `:memory:`, a local file, a remote Turso database and an embedded replica. It also
runs on Node and Bun, which `bun:sqlite` cannot.

**`acquire()` borrows from a 1-slot pool over the single client** - it does not open a second
connection. `drizzle()` binds to a `Client`, never to libsql's interactive `Transaction`, so a real
second connection could not carry the connector. `client.transaction()` takes the client's connection
away and lazily opens a fresh one, which against `:memory:` is a different empty database.

Two consequences. Write transactions serialize, which costs nothing SQLite was going to give - it
allows one writer anyway. And a read on the pooled connector while a transaction is open runs INSIDE
that transaction; route work that must stay outside through `acquire()`.

`acquire()` throws NotSupported when `client.protocol !== 'file'`. A remote client opens a stream per
statement, so `BEGIN` would neither hold nor error - the transaction would silently not exist.

**The wait for that slot is bounded.** The constructor takes `TLibSqlDriverOptions` -
`Omit<IPoolControlOptions, 'size'> & { client }`, so `acquireTimeoutMs`, `maxWaitingClients` and
`scope` are forwarded while `size` stays pinned at 1. `acquireTimeoutMs` defaults to
`LibSqlDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` = 30s. Without it a transaction leaked between `BEGIN` and
commit would make every later `acquire()` in the process await a promise that never settles - no
error, no log, no recovery short of a restart.

The framework's own wiring calls `new DriverClass({ client })` and passes nothing else, so **an app
raises the timeout by constructing the driver itself** in `configure()`:

```typescript
override configure(): void {
  const client = createClient(this.settings);
  this.useDriver({ driver: new LibSqlDriver({ client, acquireTimeoutMs: 120_000 }) });
}
```

`useDriver()` assigns the driver and builds the connector in one step, so `@datasource({ driver })`
is never consulted. Assigning `this.client` instead is the shorter form that accepts the defaults.

## BEGIN IMMEDIATE, and no isolation levels

SQLite has no isolation levels. Every transaction is serializable, so the axis is a locking mode:
`BEGIN DEFERRED | IMMEDIATE | EXCLUSIVE`, named by `SqliteBeginModes`.

The default is `IMMEDIATE`, not SQLite's own `DEFERRED`. A deferred transaction takes its write lock
only at the first write, and that upgrade fails outright with `SQLITE_BUSY` when another writer got
there first. `IMMEDIATE` waits on the busy timeout instead.

Passing `isolationLevel` throws NotSupported rather than being ignored. Ignoring it would leave the
caller believing `SERIALIZABLE` was honoured; pass `beginMode` instead.

An unknown `beginMode` is **refused**, not interpolated. The driver runs the BEGIN verbatim and never
parameterized, so `SqliteBeginModes.isValid` is the only thing standing between a config value and
raw SQL. Matching is exact - `'immediate'` is refused too, because nothing normalises the case on the
way to the statement. `beginTransaction()` resolves the mode once and hands the settled value down to
`buildBeginStatement()`, so the refusal runs a single time per transaction rather than once for the
statement and once for the `beginMode` patch on the returned handle.

## What SQLite refuses

Every gap throws NotSupported (HTTP 501, `core.not_supported`). None of them silently produces
different SQL.

| Capability | Where it throws | Why |
|---|---|---|
| `lock` (`SELECT ... FOR UPDATE`) | `SqliteQueryExecutor.select` | SQLite locks the database file, never a row |
| `regexp`, `iregexp` | `SqliteQueryOperators` | SQLite defines no `regexp()` function and libsql registers none |
| `contains`, `containedBy`, `overlaps` | `SqliteQueryOperators` | No array storage class, so `@>` / `&&` have no operand |
| `isolationLevel` | `BaseSqliteDataSource` | No isolation levels; the axis is a locking mode |
| Transactions on a non-`file:` client | `LibSqlDriver.acquire` | Every statement runs on its own connection |

## What differs without refusing

- **`ilike` maps onto `LIKE`.** SQLite's `LIKE` is already ASCII case-insensitive, so `ilike` is
  exact and `like` is the operator that silently widens. Refusing `ilike` would be theatre - the
  caller renames it to `like` and gets identical SQL. Residual gap: non-ASCII stays unfolded, so
  `'ÉCOLE' LIKE 'é%'` is false. Never set `PRAGMA case_sensitive_like=ON`.
- **JSON is `json_extract(col, '$."a"[0]')`**, not `#>>`. `SqliteFilterBuilder` supplies four of the
  ten `FilterBuilder` seam members - three of them mandatory - and inherits the rest.
  `jsonNeedsNumericCast()` returns `false`: `json_extract` hands back the value in its own type, so
  there is no cast to apply.
- **Updates compose `json_set`**, with the path and the value bound rather than interpolated.
  `SqliteUpdateBuilder` overrides the single abstract `composeJsonSet()` on the neutral
  `RelationalUpdateBuilder` and inherits the split and the path validation.
- **NULL sorts LOW.** `order: ['score ASC']` returns NULLs first and `DESC` returns them last, the
  opposite of Postgres, where NULL compares greater than every value.
- **Five storage classes**, against Postgres's ~28. The data-type enricher maps
  `doublePrecision`->`real`, `bytea`->native `blob`, `jsonb`->`text({ mode: 'json' })`,
  `boolean`->`integer({ mode: 'boolean' })`.
- **`id: 'big-number'` is gone from the union.** SQLite's rowid is already 64-bit, and
  `blob({ mode: 'bigint' })` has blob affinity so it cannot be a primary key.
- **No `timestamptz`.** The tz enricher stores ISO 8601 UTC strings and defaults to
  `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`. The parens are mandatory, and `CURRENT_TIMESTAMP` is
  second-resolution and does not round-trip. A value read back with no zone designator - what
  `CURRENT_TIMESTAMP` and most external writers produce - is taken as UTC, not as host-local time.
- **Omitting `enable` on a tz option opts the column in.** `{ deleted: { columnName: 'deleted_at' } }`
  emits `deletedAt`; only `enable: false` drops a column. Leaving the key out entirely keeps the
  enricher default - `modified` on, `deleted` off.
- **Column defaults are gated on presence, not truthiness**, so `0`, `''` and `false` reach the DDL.
- **`.returning()` works** on insert, update and delete - unlike MySQL. No read-then-write emulation.

## The conformance suite proves both engines

`__tests__/connectors/relational/conformance/repository-conformance.ts` is one repository-level suite
run against two real in-process databases: PGlite for Postgres, libsql `:memory:` for SQLite. It
asserts consumer-visible behaviour, never an engine's SQL text.

Each engine declares its capabilities, and the suite asserts the **NotSupported throw** where one is
`false`:

```typescript
runRepositoryConformance({
  engine: 'sqlite (libsql :memory:)',
  capabilities: {
    rowLocking: false,
    regexp: false,
    arrayOperators: false,
    caseInsensitiveLike: true,
    nullsSortHigh: false,
  },
  build: () => harness,
});
```

The last two are not refusals but divergences - the query succeeds on both engines and answers
differently - so each engine pins its own answer rather than one being called correct. SQLite's
`like: 'alpha'` returns `Alpha` too, its `nlike: 'alpha'` drops it, and its NULLs sort first
ascending where Postgres sorts them last.

A suite that skipped the differences would prove nothing, so nothing is skipped. It found a real
defect on its first run: `PostgresQueryExecutor.readAffectedRowCount` knew `pg`'s `rowCount` and
postgres-js's `count`, but PGlite reports `affectedRows` and nothing else - so every Postgres write
with `shouldReturn: false` threw against PGlite.

## Related

- [Relational connector](/architecture/relational-connector.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Filter system](/architecture/filter-system.md)
- [Transactions](/architecture/transactions.md)
