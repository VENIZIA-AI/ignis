# Postgres Drivers & Supabase

IGNIS talks to PostgreSQL through a **driver seam**: `IRelationalDriver` owns connection acquisition and the raw transaction control statements, and everything above it - repositories, transactions, the Casbin adapters - is driver-agnostic. Two drivers ship today:

- **node-postgres** (`pg`) - the default IGNIS has always used
- **postgres-js** (`postgres`) - required for Supabase's transaction pooler, and a faster option anywhere else

Supabase is unmodified PostgreSQL, so it is not a separate connector: it varies the **driver**, not the SQL dialect. The `@venizia/ignis/postgres/supabase` submodule adds the two things Supabase deployments actually need - pooler presets and an RLS auth-context helper.

> [!IMPORTANT] Every database client is optional
> `pg` and `postgres` are both **optional peer dependencies**. The `@venizia/ignis/postgres` module pulls in neither - each driver is imported lazily, only when the client you built selects it. Install the one your app uses:
>
> ```bash
> bun add pg          # node-postgres
> bun add postgres    # postgres-js (>= 3.4.0)
> ```

## Import Paths

| Import | Contents | Loads |
| :--- | :--- | :--- |
| `@venizia/ignis/postgres` | `BasePostgresDataSource`, `IRelationalDriver`, `resolveDatabaseDriver`, repository hierarchy | no client library |
| `@venizia/ignis/postgres/node-postgres` | `NodePostgresDriver` | `pg` |
| `@venizia/ignis/postgres/postgres-js` | `PostgresJsDriver` | `postgres` |
| `@venizia/ignis/postgres/supabase` | `PoolerModes`, `buildPostgresJsOptions`, `withAuthContext`, Supabase role re-exports | `drizzle-orm/supabase` |

## The Default: a Bare Pool

Hand IGNIS a `pg.Pool` on `this.client` and it adopts it into a `NodePostgresDriver` on first use - no driver import needed:

```typescript
import { DataSourceDrivers, datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  configure() {
    this.client = new Pool({ connectionString: this.getConnectionString() });
    this.connector = drizzle({ client: this.client, schema: this.getSchema() });
  }
}
```

`this.client` is the raw-client slot: the `pg.Pool` (or postgres-js `Sql`) your `configure()` built. `getClient()` hands it back as the escape hatch, and `beginTransaction()` resolves a driver from it lazily. A datasource that sets neither `this.client` nor a driver throws `No driver and no client` on its first transaction.

## Using postgres-js

Wire a driver explicitly with `useDriver()` - it assigns the driver **and** builds the pooled connector in one step, so the half-wired state (driver set, connector forgotten) cannot exist:

```typescript
import { DataSourceDrivers, datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

@datasource({ driver: DataSourceDrivers.POSTGRES_JS })
export class PostgresDataSource extends BasePostgresDataSource<
  IDataSourceConfigs,
  typeof schema,
  {},
  Sql // getClient() is now honestly typed as postgres-js's Sql, not pg.Pool
> {
  configure() {
    this.useDriver({
      driver: new PostgresJsDriver({ client: postgres(this.getConnectionString()) }),
      schema: this.getSchema(),
    });
  }
}
```

The fourth type parameter (`Client`) defaults to `pg.Pool`; declare it when the raw client escape hatch (`getClient()`) should carry the real type.

> [!WARNING] postgres-js cannot destroy a poisoned connection
> After a failed `COMMIT` or `ROLLBACK`, node-postgres **destroys** the connection instead of pooling it - the session may still hold an open transaction that the next borrower would inherit. postgres-js has no destroy semantics (`ReservedSql.release()` takes no argument), so the connection is returned to the pool anyway. This asymmetry is real and IGNIS does not paper over it; it is pinned by the driver's own tests.

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

`acquire()` matters for transactions: `BEGIN` and `COMMIT` must land on the same backend, so each explicit transaction gets a dedicated connection (`pool.connect()` for pg, `sql.reserve()` for postgres-js - the reason for the `>= 3.4.0` floor).

The connection is checked out of the pool before Drizzle is constructed on top of it. If that constructor throws - a malformed discovered schema, a drizzle mismatch - both drivers catch the error, release the connection back to the pool first, and rethrow. Without this, every failed `acquire()` would strand a connection, and the pool would exhaust after enough of them.

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
import { buildPostgresJsOptions, PoolerModes } from '@venizia/ignis/postgres/supabase';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import postgres from 'postgres';

const client = postgres(connectionString, {
  ...buildPostgresJsOptions({ mode: PoolerModes.TRANSACTION, max: 10 }),
});

this.useDriver({ driver: new PostgresJsDriver({ client }), schema: this.getSchema() });
```

`prepare: false` is emitted only for `TRANSACTION` mode; `max` is forwarded only when you pass it, so postgres-js's own default survives.

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
- `role` must be a bare identifier (`/^[a-z_][a-z0-9_]*$/`) because `set local role $1` is not valid SQL - a role taken from a JWT and interpolated unvalidated would be a privilege-escalation vector. Validation runs **before** any statement, so a rejected call leaves the session untouched.
- Everything is `SET LOCAL` / `set_config(..., true)` - transaction-scoped. A plain `SET` would leak the caller's identity to the next borrower of the pooled connection, and is deliberately not offered.

The submodule also re-exports Drizzle's Supabase helpers (`anonRole`, `authenticatedRole`, `serviceRole`, `authUid`, `authUsers`, ...) so RLS-aware schema files need one import.

## Adding a Driver

One file under `src/connectors/postgres/drivers/`, implementing the four verbs above, plus a fake client and a test that runs the shared conformance suite (`run({ driver, resolveDatabaseDriver })` in `src/__tests__/connectors/postgres/drivers/conformance/`). Register a sub-path export and an optional peer dependency; never re-export the driver from the drivers barrel - that is what would make its package load eagerly for everyone.
