# Postgres Drivers & Supabase

IGNIS talks to PostgreSQL through a **driver seam**. `IRelationalDriver` owns connection acquisition and the raw transaction control statements, and everything above it - repositories, transactions, the Casbin adapters - is driver-agnostic. Three drivers ship today:

- **node-postgres** (`pg`) - the default IGNIS has always used
- **postgres-js** (`postgres`) - required for Supabase's transaction pooler, and a faster option anywhere else
- **PGlite** (`@electric-sql/pglite`) - Postgres compiled to WebAssembly, running in your own process. It has one session and its own constraints, so it gets [its own page](./pglite)

Supabase is unmodified PostgreSQL, so it is not a separate connector: it varies the **driver**, not the SQL dialect. The `@venizia/ignis/postgres/supabase` submodule adds the two things Supabase deployments actually need - pooler presets and an RLS auth-context helper.

> [!IMPORTANT] Every database client is optional
> `pg` and `postgres` are both **optional peer dependencies**. The `@venizia/ignis/postgres` module pulls in neither - only the driver class you import and name in `@datasource({ driver })` reaches your bundle. Install the one your app uses:
>
> ```bash
> bun add pg                      # node-postgres
> bun add postgres                # postgres-js (>= 3.4.0)
> bun add @electric-sql/pglite    # PGlite
> ```

## Import Paths

| Import | Contents | Loads |
| :--- | :--- | :--- |
| `@venizia/ignis/postgres` | `BasePostgresDataSource`, `IRelationalDriver`, repository hierarchy | no client library |
| `@venizia/ignis/postgres/node-postgres` | `NodePostgresDriver` | `pg` |
| `@venizia/ignis/postgres/postgres-js` | `PostgresJsDriver` | `postgres` |
| `@venizia/ignis/postgres/pglite` | `PGliteDriver` | `@electric-sql/pglite` |
| `@venizia/ignis/postgres/supabase` | `PoolerModes`, `buildPostgresJsOptions`, `withAuthContext`, Supabase role re-exports | `drizzle-orm/supabase` |

## Naming the Driver Class

`@datasource({ driver })` takes the driver **class**, not a driver-name string:

```typescript
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  override configure(): ValueOrPromise<void> {
    this.client = new Pool({ connectionString: this.getConnectionString() }); // that is all
  }
}
```

`configure()` only builds `this.client` - the raw `pg.Pool` (or postgres-js `Sql`) your app's connection settings produce. The base class wires the driver **and** the connector lazily, on first call to `getConnector()` or `beginTransaction()`. It reads the class named in `@datasource({ driver })`, instantiates it over `this.client`, and builds the pooled Drizzle connector from that.

`getClient()` hands `this.client` back as the raw-client escape hatch. A datasource that sets neither `this.client` nor a driver (via `useDriver()`, below) throws `No driver and no client` on first use.

> [!IMPORTANT] Why a class, not a name
> A driver-name string cannot carry `pg` or `postgres` into your bundle - it is just text. A dynamic `import('./node-postgres.js')` keyed off that string would defer *execution*, not *packaging*. Every bundler statically resolves a literal specifier and packages whatever it points to. A build that only used node-postgres would still fail with `Could not resolve: "postgres"`. The failure fires the moment postgres-js's import appears anywhere in the module graph reachable at build time. Naming the class instead makes the driver module a real value reference - the one thing a bundler is forced to keep. That's what lets `pg` and `postgres` stay genuinely optional peers. A bare side-effect import (`import '@venizia/ignis/postgres/node-postgres'`) would not work either. `@venizia/ignis` declares `sideEffects: false`, so a bundler is free to drop an import whose exports go unused.
>
> Two tests pin this from different angles. `packages/core/src/__tests__/connectors/postgres/no-eager-driver-import.test.ts` proves no barrel **loads** a driver package in a fresh process (the runtime module graph). `packages/core/src/__tests__/connectors/postgres/bundle/optional-peers.test.ts` proves no barrel gets a driver package **packaged** by a real bundler.

## Using postgres-js

Same shape, different class:

```typescript
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

@datasource({ driver: PostgresJsDriver })
export class PostgresDataSource extends BasePostgresDataSource<
  IDataSourceConfigs,
  typeof schema,
  {},
  Sql // getClient() is now honestly typed as postgres-js's Sql, not pg.Pool
> {
  override configure(): ValueOrPromise<void> {
    this.client = postgres(this.getConnectionString());
  }
}
```

The fourth type parameter (`Client`) defaults to `pg.Pool`; declare it when the raw client escape hatch (`getClient()`) should carry the real type.

## Driver Constructors Validate Their Client

Both shipped drivers throw immediately if constructed with the wrong shape of client, instead of failing later inside a query:

```typescript
new NodePostgresDriver({ client: pool }); // client must expose connect() AND totalCount (pool accounting)
new PostgresJsDriver({ client: sql });    // client must expose reserve() AND unsafe()
```

`NodePostgresDriver` rejects a bare `pg.Client` - it exposes `connect()` too, but has no pool accounting and cannot hand out a dedicated connection per transaction. `PostgresJsDriver` rejects a `pg.Pool` the same way. You will not normally construct these yourself: `wireDriverFromMetadata()` does it for you from `this.client`. This validation fires the first time a datasource wired the wrong client behind the wrong `@datasource({ driver })` class.

## Custom or Third-Party Drivers: `useDriver()`

For a driver IGNIS does not ship, wire it explicitly with `useDriver()`. It assigns the driver **and** builds the pooled connector in one step, so the half-wired state (driver set, connector forgotten) cannot exist:

```typescript
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  override configure(): ValueOrPromise<void> {
    this.useDriver({
      driver: new MyCustomDriver({ client: myClient }),
      schema: this.getSchema(),
    });
  }
}
```

`useDriver()` bypasses `@datasource({ driver })` entirely. You never need to name a class in the decorator when you wire the driver yourself in `configure()`.

> [!WARNING] postgres-js cannot destroy a poisoned connection
> After a failed `COMMIT` or `ROLLBACK`, node-postgres **destroys** the connection instead of pooling it. The session may still hold an open transaction that the next borrower would inherit. postgres-js has no destroy semantics (`ReservedSql.release()` takes no argument), so the connection is returned to the pool anyway. This asymmetry is real and IGNIS does not paper over it; it is pinned by the driver's own tests.

## The Driver Contract

Every driver satisfies the same neutral interface, proven by a shared conformance suite - a seam only one driver can satisfy is not a seam:

```typescript
interface IRelationalDriver<Schema, Client> {
  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema>; // pooled Drizzle
  acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>>; // one dedicated connection
  getClient(): Client; // raw client escape: pg.Pool or Sql
  end(): Promise<void>;
}

interface IRelationalConnection<Schema> {
  connector: TRelationalConnector<Schema>; // Drizzle bound to THIS connection, not the pool
  execute(opts: { statement: string }): Promise<IStatementResult>; // { count } - control statements
  release(opts?: { destroy?: boolean }): void;
}
```

`acquire()` matters for transactions: `BEGIN` and `COMMIT` must land on the same backend. Each explicit transaction therefore gets a dedicated connection (`pool.connect()` for pg, `sql.reserve()` for postgres-js) - that's the reason for the `>= 3.4.0` floor.

The connection is checked out of the pool before Drizzle is constructed on top of it. If that constructor throws - a malformed discovered schema, a drizzle mismatch - both drivers catch the error. They release the connection back to the pool first, and rethrow. Without this, every failed `acquire()` would strand a connection, and the pool would exhaust after enough of them.

`execute()` resolves to the neutral `IStatementResult` (`{ count }` - the same `count` the repository verbs speak). Each driver maps its native result shape at its own boundary; nothing above the seam ever inspects a driver-specific type.

## Supabase

### Choosing a connection mode

Supabase exposes three ways in, and one of them silently breaks prepared statements:

| Mode | Port | Prepared statements | When |
| :--- | :--- | :--- | :--- |
| `PoolerModes.DIRECT` | 5432 | yes | long-lived servers connecting straight to the database |
| `PoolerModes.SESSION` | 5432 (pooler) | yes | pooled, one backend per client session |
| `PoolerModes.TRANSACTION` | 6543 | **no** | serverless / many short-lived connections |

The transaction pooler (Supavisor) rebinds the backend per transaction, so a server-side prepared statement created on one backend simply is not there next time. `buildPostgresJsOptions` encodes this so you cannot forget it:

```typescript
import { datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import { buildPostgresJsOptions, PoolerModes } from '@venizia/ignis/postgres/supabase';
import postgres from 'postgres';

@datasource({ driver: PostgresJsDriver })
export class SupabaseDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  override configure() {
    this.client = postgres(connectionString, {
      ...buildPostgresJsOptions({ mode: PoolerModes.TRANSACTION, max: 10 }),
    });
  }
}
```

`prepare: false` is emitted only for `TRANSACTION` mode; `max` is forwarded only when you pass it, so postgres-js's own default survives. Naming `PostgresJsDriver` in `@datasource` is what wires it - `configure()` only needs to build the client, same as node-postgres.

### Row Level Security

`withAuthContext` sets the Supabase auth context for the remainder of **one transaction**, so `auth.uid()` resolves inside RLS policies:

```typescript
import { withAuthContext } from '@venizia/ignis/postgres/supabase';

const transaction = await this.dataSource.beginTransaction();
try {
  // role defaults to claims.role (PostgREST semantics); pass it explicitly to override
  await withAuthContext({ transaction, claims: jwtPayload });

  await this.orderRepository.create({ data, options: { transaction } });
  await transaction.commit();
} catch (error) {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    logger.error('Rollback failed | %s', rollbackError);
  }
  throw error;
}
```

Three properties make this safe under a transaction-mode pooler:

- `claims` is **bound as a query parameter**, never interpolated into SQL text.
- `role` must be a bare identifier (`/^[a-z_][a-z0-9_]*$/`) because `set local role $1` is not valid SQL. A role taken from a JWT and interpolated unvalidated would be a privilege-escalation vector.
- Validation runs **before** any statement, so a rejected call leaves the session untouched.
- Everything is `SET LOCAL` / `set_config(..., true)` - transaction-scoped. A plain `SET` would leak the caller's identity to the next borrower of the pooled connection, and is deliberately not offered.

The submodule also re-exports Drizzle's Supabase helpers (`anonRole`, `authenticatedRole`, `serviceRole`, `authUid`, `authUsers`, ...) so RLS-aware schema files need one import.

## Adding a Driver

One file under `src/connectors/postgres/drivers/`, implementing the four verbs above. Add a fake client and a test that runs the shared conformance suite (`run({ driver, buildDriverProbe })` in `src/__tests__/connectors/postgres/drivers/conformance/`). Register a sub-path export and an optional peer dependency. Never re-export the driver from the drivers barrel - that is what would make its package load eagerly for everyone.
