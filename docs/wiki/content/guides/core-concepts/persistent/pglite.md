# PGlite - Postgres In Your Process

PGlite is PostgreSQL compiled to WebAssembly. It runs inside your Node or Bun process, with no server, no port and no container. IGNIS reaches it through `PGliteDriver`, a third driver on the unchanged Postgres connector.

```typescript
import { PGlite } from '@electric-sql/pglite';
import { datasource } from '@venizia/ignis';
import type { TAnyDataSourceSchema, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PGliteDriver } from '@venizia/ignis/postgres/pglite';

@datasource({ driver: PGliteDriver })
export class TestDataSource extends BasePostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite> {
  constructor() {
    super({ name: TestDataSource.name, config: {} });
  }

  override configure(): ValueOrPromise<void> {
    this.client = new PGlite();
  }

  override getConnectionString(): ValueOrPromise<string> {
    return 'memory://';
  }
}
```

Your models, repositories and filters do not change. PGlite reports `PostgreSQL 18.3`, so every statement the filter builder emits works unchanged - `#>>` JSON paths, `ILIKE`, regex operators, arrays, `SELECT ... FOR UPDATE`.

> [!IMPORTANT] Optional peer dependency
> `@electric-sql/pglite` is an optional peer. Only the driver class you import and name in `@datasource({ driver })` reaches your bundle.
>
> ```bash
> bun add @electric-sql/pglite
> ```

## What PGlite is good for

Two cases, and they are the only two worth the constraints below.

**An honest test database.** Your suite gets real Postgres semantics in-process - no Docker, no fixture server, no port collisions between parallel CI jobs. A SQLite test database would answer differently from production. PGlite answers the same. IGNIS runs its own relational conformance suite this way.

**Embedded deployment.** A CLI, a desktop app or an edge worker ships one data directory instead of a database service. `new PGlite('./pgdata')` creates and opens it. PGlite is a directory rather than a single file - `dumpDataDir()` is what packs it into one artifact.

Anything with concurrent writers belongs on a real Postgres server. Read [the constraints](#the-constraints) before you pick PGlite for a running service.

## Wiring a persistent instance

Point PGlite at a directory and it persists there:

```typescript
import { PGlite } from '@electric-sql/pglite';
import { datasource } from '@venizia/ignis';
import type { TAnyDataSourceSchema, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PGliteDriver } from '@venizia/ignis/postgres/pglite';

interface IDataSourceConfigs {
  dataDir: string;
}

@datasource({ driver: PGliteDriver })
export class EmbeddedDataSource extends BasePostgresDataSource<
  IDataSourceConfigs,
  TAnyDataSourceSchema,
  {},
  PGlite
> {
  constructor() {
    super({
      name: EmbeddedDataSource.name,
      config: { dataDir: process.env.APP_ENV_PGLITE_DATA_DIR ?? './pgdata' },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.client = new PGlite(this.settings.dataDir);
  }

  override getConnectionString(): ValueOrPromise<string> {
    return this.settings.dataDir;
  }
}
```

`configure()` builds only the client. Naming `PGliteDriver` in the decorator is what wires the driver and the connector, lazily, on the first `getConnector()` or `beginTransaction()`.

The fourth type parameter pins `getClient()` to `PGlite`. Declare it whenever you reach for the raw client - `waitReady`, `exec()`, `dumpDataDir()`.

> [!NOTE] `getConnectionString()` returns a data directory, not a URL
> There is no host, port or user to spell. IGNIS never calls this method itself - it exists for your own tooling, so return whatever identifies the database. A directory path for a persistent instance, `memory://` for an ephemeral one.

## The constraints

These matter more than the setup. PGlite is a single embedded Postgres instance, and it has **exactly one session**.

### Transactions serialise

`beginTransaction()` borrows the one session from a 1-slot pool. A second caller waits for the first transaction to commit or roll back. There is no parallelism to lose - one session cannot run two transactions anyway.

A second `BEGIN` on that session would not nest and would not error. It joins the open transaction silently, and the outer `COMMIT` commits the inner writer's rows. The pool is what stops that.

### A write during an open transaction is swallowed by it

This is the trap. Repositories run through the pooled connector that `createConnector()` builds. On one session, that connector is inside whatever transaction happens to be open:

```typescript
const transaction = await dataSource.beginTransaction();

// Runs INSIDE the transaction above, because there is only one session.
await this.productRepository.create({ data: { name: 'widget' } });

await transaction.rollback(); // The product is gone.
```

Measured, not theorised: the row does not survive the rollback.

Pass the transaction explicitly, and the write is deliberate rather than accidental:

```typescript
await this.productRepository.create({
  data: { name: 'widget' },
  options: { transaction },
});
```

That is PGlite, not the IGNIS driver. On a server-backed Postgres each caller gets its own connection and the problem does not exist. Under concurrency, route every write through a transaction.

### The acquire timeout

A transaction that never commits holds the one slot forever. Without a bound, every later `acquire()` in the process hangs silently. So the wait is bounded:

| Option | Type | Default | Meaning |
| :--- | :--- | :--- | :--- |
| `acquireTimeoutMs` | `number` | `PGliteDriver.DEFAULT_ACQUIRE_TIMEOUT_MS` (30000) | Max ms to wait for the session before rejecting |
| `maxWaitingClients` | `number` | unlimited | Max queued waiters; over the limit, `acquire()` rejects immediately |
| `scope` | `string` | `'PGliteDriver'` | Logger scope |
| `client` | `PGlite` | required | The instance the driver borrows |

The timeout bounds the **wait for the slot**, never the transaction itself. It fires only under contention, so a migration or a bulk seed running alone never trips it. When it does fire you get a named error, not a dead process:

```
[PGliteDriver][acquire] Could not borrow the single PGlite session
| [acquire] Acquire timed out after 30000ms.
| An unreleased transaction still holds it - commit/rollback it, or raise `acquireTimeoutMs`
```

To change any of these, construct the driver yourself with `useDriver()`. That assigns the driver and builds the connector in one step, and bypasses `@datasource({ driver })`:

```typescript
override configure(): ValueOrPromise<void> {
  const client = new PGlite(this.settings.dataDir);

  this.useDriver({
    driver: new PGliteDriver({ client, acquireTimeoutMs: 120_000 }),
    schema: this.getSchema(),
  });
}
```

`size` is not an option. One slot **is** the mutual exclusion PGlite lacks, so it is pinned at 1.

## Schema and migrations

drizzle-kit works here - `driver: 'pglite'` means it opens the data directory itself - but that is the catch: PGlite allows one writer on the directory at a time, so `drizzle-kit migrate` cannot reach a database your app has already opened. Generate the SQL offline, and let your own process apply it at boot.

Point `dbCredentials.url` at a folder path where a server config would carry a URL:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  schema: './src/models/**/*.model.ts',
  out: './migrations',
  dbCredentials: { url: './pgdata' },
});
```

```bash
bun run drizzle-kit generate
```

Apply them in-process, at boot, before the first repository call:

```typescript
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

export const applyMigrations = async (opts: { dataSource: EmbeddedDataSource }): Promise<void> => {
  const client = opts.dataSource.getClient();
  await client.waitReady;

  await migrate(drizzle({ client }), { migrationsFolder: './migrations' });
};
```

`migrate()` wants drizzle's own `PgliteDatabase`, which is narrower than the `getConnector()` return type. Build one over the same client - PGlite has a single session, so both handles talk to the same database.

## Runnable example

`examples/pglite-quickstart/` is this page as an app: a `pgTable` model with `uuid`, `jsonb` and `timestamptz`, a one-line repository, the standard CRUD controller, and a datasource that is the only file aware of PGlite.

```bash
cd examples/pglite-quickstart
bun install
bun run start        # http://localhost:3000/api/notes
```

## See Also

- [Postgres Drivers & Supabase](./postgres-drivers) - the driver seam, `node-postgres` and `postgres-js`
- [SQLite](./sqlite) - the other embedded engine, and what it refuses
- [DataSources](./datasources) - schema auto-discovery and `configure()`
- [Transactions](./transactions) - commit, rollback and connection safety
- [Connectors](/references/base/connectors) - the engine-neutral contract
