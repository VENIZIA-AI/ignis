# SQLite

IGNIS ships a **SQLite connector** at `@venizia/ignis/sqlite`, driven by libsql. It is the second engine on the engine-neutral relational tier, so `@model`, `@repository`, `@datasource`, filters, transactions and soft delete all mean the same thing they mean on Postgres.

They do not all *do* the same thing. Read this table first - it is what a Postgres user needs before anything else.

| Capability | PostgreSQL | SQLite | What happens |
| :--- | :--- | :--- | :--- |
| `ilike` | native `ILIKE` | none | Maps onto `LIKE`, which already folds ASCII case |
| `like` | case-**sensitive** | case-**insensitive** | Silently matches more rows than on Postgres |
| `regexp`, `iregexp` | native | none | Throws `501` `core.not_supported` |
| `contains`, `containedBy`, `overlaps` | array operators | no array type | Throws `501` `core.not_supported` |
| `lock` (`SELECT ... FOR UPDATE`) | row locks | file locks only | Throws `501` `core.not_supported` |
| Isolation levels | three (`IsolationLevels`) | none | `isolationLevel` throws; pass `beginMode` instead |
| Storage classes | ~28 types | five | `jsonb` -> json-mode `text`, `bytea` -> `blob`, `boolean` -> 0/1 `integer` |
| JSON paths | `col #>> '{a,b}'` | `json_extract(col, '$."a"."b"')` | Same filter syntax, different SQL |
| Timestamps | `timestamptz` | no date type | ISO 8601 UTC strings in a `text` column |
| NULL sort order | NULL sorts **high** | NULL sorts **low** | `order: ['score ASC']` puts NULLs last on Postgres, first here |

Every refusal throws `501 Not Implemented` with `normalized.code: 'core.not_supported'`. None of them silently emits different SQL.

The two divergences that do not throw are the dangerous ones. `like` widens, and `nlike` narrows - on SQLite `{ nlike: 'alpha' }` **drops** the row holding `Alpha`. NULL ordering inverts. Both are pinned per engine by the conformance suite.

> [!IMPORTANT] Optional peer dependency
> `@libsql/client` is an optional peer, and the connector never reaches the `@venizia/ignis` root barrel. Import from the sub-path.
>
> ```bash
> bun add @libsql/client
> ```

## What does work

- **Every CRUD verb**, including `.returning()` on insert, update and delete. MySQL cannot do that, so nothing here is emulated with a read-then-write.
- **Real transactions**, with `commit()`, `rollback()` and the same transaction object your services already pass around.
- **The whole filter vocabulary** minus the four operators above - `and`/`or`, `between`, `inq`, `nin`, `gt`, `like`, null handling, nested logical groups.
- **JSON path filtering and JSON path updates**, through `json_extract` and `json_set`.
- **Relations, hidden properties, default filters, soft delete, `count`, `skip`/`limit`.**
- **One driver for four deployments**: `:memory:`, a local file, a remote Turso database and an embedded replica.

## Wiring the datasource

```typescript
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { datasource } from '@venizia/ignis';
import type { TAnyDataSourceSchema, ValueOrPromise } from '@venizia/ignis';
import { BaseSqliteDataSource } from '@venizia/ignis/sqlite';
import type { ISqliteDataSourceSettings } from '@venizia/ignis/sqlite';
import { LibSqlDriver } from '@venizia/ignis/sqlite/libsql';

@datasource({ driver: LibSqlDriver })
export class SqliteDataSource extends BaseSqliteDataSource<
  ISqliteDataSourceSettings,
  TAnyDataSourceSchema,
  {},
  Client
> {
  constructor() {
    super({
      name: SqliteDataSource.name,
      config: { url: process.env.APP_ENV_SQLITE_URL ?? 'file:./data.db' },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.client = createClient(this.settings);
  }
}
```

There is no `getConnectionString()` override. SQLite inherits one that returns `settings.url` - the libsql URL **is** the connection string. Postgres leaves the method abstract because no framework code can guess a `postgresql://` URL.

| Setting | Type | Meaning |
| :--- | :--- | :--- |
| `url` | `string` | `:memory:`, `file:./data.db`, `libsql://<host>`, or an embedded-replica URL |
| `authToken` | `string` | Turso credential; omit for a local file |

## Models

Same decorators, `sqliteTable` instead of `pgTable`, and the enrichers come from `@venizia/ignis/sqlite`:

```typescript
import { model } from '@venizia/ignis';
import {
  BaseSqliteEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
} from '@venizia/ignis/sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

@model({ type: 'entity' })
export class Product extends BaseSqliteEntity<typeof Product.schema> {
  static override schema = sqliteTable('Product', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    name: text('name').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  });
}
```

Three column choices differ from the Postgres twin:

- **JSON is a json-mode `text` column.** Declare the mode. A JSON path on a plain `text` column is rejected rather than compiled into a `json_extract` that quietly returns `NULL`.
- **Booleans are `integer(..., { mode: 'boolean' })`** - SQLite stores 0 and 1.
- **Timestamps are ISO 8601 strings.** `generateTzColumnDefs()` handles this, defaulting to `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`. Comparisons stay lexicographic, so ordering by a timestamp still works.

`generateIdColumnDefs` accepts `dataType: 'string'` and `dataType: 'number'`. There is no `'big-number'` - an integer primary key in SQLite is already the 64-bit rowid.

## Repositories

`DefaultSqliteRepository` is the base most repositories want. `ReadableSqliteRepository`, `PersistableSqliteRepository` and `SoftDeletableSqliteRepository` sit beside it, mirroring the Postgres chain.

```typescript
import { repository } from '@venizia/ignis';
import { DefaultSqliteRepository } from '@venizia/ignis/sqlite';

@repository({ model: Product, dataSource: SqliteDataSource })
export class ProductRepository extends DefaultSqliteRepository<typeof Product.schema> {}
```

Reads look exactly like Postgres reads:

```typescript
await this.productRepository.find({
  filter: {
    where: { and: [{ isActive: true }, { name: { like: 'wid%' } }] },
    order: ['createdAt DESC'],
    limit: 20,
  },
});
```

Remember that `like` is case-insensitive here, so `{ like: 'wid%' }` also matches `Widget`. Non-ASCII is not folded, so `'ÉCOLE' LIKE 'é%'` is still false. Never set `PRAGMA case_sensitive_like=ON` - it would break `ilike` too.

JSON paths use the same dot notation as Postgres and compile to SQLite syntax:

```typescript
{ where: { 'metadata.tier': { eq: 'gold' } } }
// SQL: json_extract("metadata", '$."tier"') = ?

{ where: { 'metadata.score': { gt: 50 } } }
// SQL: json_extract("metadata", '$."score"') > ?  -- no cast; json_extract is already typed
```

Postgres needs a numeric cast because `#>>` always returns text. SQLite does not, because `json_extract` hands back a JSON number as `INTEGER` or `REAL`. See [JSON/JSONB Filtering](/references/base/filter-system/json-filtering) for the path grammar.

## Transactions

SQLite has no isolation levels. Every SQLite transaction is already serializable, so the axis is a **locking mode**:

| `beginMode` | Statement | Takes the write lock |
| :--- | :--- | :--- |
| `SqliteBeginModes.IMMEDIATE` (default) | `BEGIN IMMEDIATE` | At `BEGIN` |
| `SqliteBeginModes.DEFERRED` | `BEGIN DEFERRED` | At the first write |
| `SqliteBeginModes.EXCLUSIVE` | `BEGIN EXCLUSIVE` | At `BEGIN`, blocking readers too |

```typescript
import { SqliteBeginModes } from '@venizia/ignis/sqlite';

const transaction = await this.dataSource.beginTransaction({
  beginMode: SqliteBeginModes.IMMEDIATE,
});

try {
  await this.productRepository.create({ data: { name: 'widget' }, options: { transaction } });
  await transaction.commit();
} catch (error) {
  // Nested: a first rollback that itself fails throws, and would replace the original error.
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    this.logger.error('Rollback failed | %s', rollbackError);
  }

  throw error;
}
```

`commit()` and `rollback()` throw on failure, exactly as they do on Postgres. See [Transactions](./transactions) for the full contract.

The default is `IMMEDIATE`, not SQLite's own `DEFERRED`. A deferred transaction takes its write lock at the first write, and that upgrade fails outright with `SQLITE_BUSY` when another writer got there first. `IMMEDIATE` waits on the busy timeout instead.

Passing `isolationLevel` throws rather than being ignored. Ignoring it would leave you believing `SERIALIZABLE` was honoured.

A `beginMode` outside those three throws too. The mode is written straight into the `BEGIN` statement, which the driver runs verbatim, so it has to come from the closed set. Matching is exact - `'immediate'` is refused, because nothing upper-cases it for you.

### One connection, so writes serialise

`beginTransaction()` borrows the single libsql connection from a 1-slot pool. A second transaction waits. SQLite allows one writer at a time regardless, so this costs no throughput SQLite was going to give.

Reads are the part to watch. A query on the pooled connector while a transaction is open runs **inside** that transaction. Pass `options.transaction` when the work belongs to the transaction, and route work that must stay outside through the driver's `acquire()`.

> [!WARNING] Transactions need a local database
> `beginTransaction()` throws `501` when the libsql client is not a `file:` or `:memory:` one. A remote client opens a stream per statement and closes it, so `BEGIN` would neither hold nor error - the transaction would silently not exist. Use a local file or an embedded replica.

### The acquire timeout

A transaction that never commits holds the one slot forever. Without a bound, every later `beginTransaction()` in the process hangs silently. So the wait is bounded:

| Option | Type | Default | Meaning |
| :--- | :--- | :--- | :--- |
| `acquireTimeoutMs` | `number` | `LibSqlDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` (30000) | Max ms to wait for the connection before rejecting |
| `maxWaitingClients` | `number` | unlimited | Max queued waiters; over the limit, `acquire()` rejects immediately |
| `scope` | `string` | `'LibSqlDriver'` | Logger scope |
| `client` | `Client` | required | The libsql client the driver borrows |

The timeout bounds the **wait for the connection**, never the transaction itself. It fires only under contention, so a migration or a bulk seed running alone never trips it. When it does fire you get a named error, not a dead process:

```
[LibSqlDriver][acquire] Could not borrow the single libsql connection
| [acquire] Acquire timed out after 30000ms.
| An unreleased transaction still holds it - commit/rollback it, or raise `acquireTimeoutMs`
```

To change any of these, construct the driver yourself with `useDriver()`. That assigns the driver and builds the connector in one step, and bypasses `@datasource({ driver })`:

```typescript
override configure(): void {
  const client = createClient(this.settings);

  this.useDriver({
    driver: new LibSqlDriver({ client, acquireTimeoutMs: 120_000 }),
    schema: this.getSchema(),
  });
}
```

`size` is not an option. One slot **is** the mutual exclusion the single connection lacks, so it is pinned at 1.

## Schema and migrations

drizzle-kit, with the `sqlite` dialect:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/models/**/*.model.ts',
  out: './migrations',
  dbCredentials: { url: 'file:./data.db' },
});
```

Use `dialect: 'turso'` instead for a remote database - it adds `authToken` to `dbCredentials`.

```bash
bun run drizzle-kit generate
```

Apply them at boot, before the first repository call:

```typescript
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

export const applyMigrations = async (opts: { dataSource: SqliteDataSource }): Promise<void> => {
  const client = opts.dataSource.getClient();

  await migrate(drizzle({ client }), { migrationsFolder: './migrations' });
};
```

## Out of scope in this release

Three components declare their models as `pgTable` and are Postgres-only for now. A SQLite datasource cannot back them:

| Component | Why |
| :--- | :--- |
| **Authentication** | `User`, `Role`, `Permission` and `PolicyDefinition` are `pgTable` models |
| **Authorization** | The Casbin adapters type their connector as Drizzle's `PgDatabase` |
| **StaticAssetComponent** | Its base model is a `pgTable` with `jsonb` and Postgres indexes |

Everything else - your own models, repositories, services, controllers, REST routes - works on either engine.

## Runnable example

`examples/sqlite-quickstart/` is this page as an app: a `sqliteTable` model with a `text` id and `text({ mode: 'json' })` metadata, `generateTzColumnDefs` for the timestamp default, and the same repository and controller the PGlite example uses.

```bash
cd examples/sqlite-quickstart
bun install
bun run start        # http://localhost:3000/api/notes
```

## See Also

- [PGlite](./pglite) - the other embedded engine, with real Postgres semantics
- [Postgres Drivers & Supabase](./postgres-drivers) - the driver seam
- [DataSources](./datasources) - schema auto-discovery and `configure()`
- [Transactions](./transactions) - the transaction object and connection safety
- [JSON/JSONB Filtering](/references/base/filter-system/json-filtering) - the JSON path grammar
- [Connectors](/references/base/connectors) - the engine-neutral contract
