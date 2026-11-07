# DataSources

A DataSource manages database connections and supports **schema auto-discovery** from repositories.

> [!NOTE] Connectors
> This guide covers the **PostgreSQL connector** (`BasePostgresDataSource`, aliased as `BaseDataSource` for backward compatibility). It's the primary relational engine and the one used by most applications. IGNIS also ships a **SQLite connector** (`BaseSqliteDataSource`, see [SQLite](./sqlite)), an embedded **PGlite** driver (see [PGlite](./pglite)), and two search connectors, **Typesense** (see [Search and Typesense](./search-typesense)) and **Meilisearch** (see [Search and Meilisearch](./search-meilisearch)). They all implement the same engine-neutral `AbstractDataSource` contract - see [Connectors](/references/base/connectors) for the architecture.

## Creating a DataSource

```typescript
// src/datasources/postgres.datasource.ts
import {
  BasePostgresDataSource,
  datasource,
  ValueOrPromise,
} from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'mydb',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
      // No schema needed - auto-discovered from @repository bindings!
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = Object.keys(this.getSchema());
    this.logger.debug('[configure] Auto-discovered schema | Keys: %o', schema);

    // That is all - naming NodePostgresDriver above is what wires the driver and connector.
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

> [!NOTE] Driver seam: the raw client goes on `this.client`
> `this.client = new Pool(...)` is the short path: `configure()` builds only the client. `getConnector()`/`beginTransaction()` lazily instantiate the class named in `@datasource({ driver })` over it - `NodePostgresDriver` here. There is no `pool` field - the raw-client slot is `client`, whatever the client happens to be. Naming the driver class (rather than a driver-name string) is what carries `pg` into the app's bundle. A bundler only packages a real value reference, never text. The alternative is to wire a driver yourself for a custom or third-party driver: `configure()` calls `this.useDriver({ driver, schema? })`. That assigns `this.driver` **and** builds `this.connector` in one step (so the half-wired state cannot exist), bypassing `@datasource({ driver })` entirely. See [Postgres Drivers & Supabase](./postgres-drivers) for `postgres-js` and Supabase.

**How auto-discovery works:**

1. `@repository` decorators register model-datasource bindings in the `MetadataRegistry`
2. `getSchema()` invokes `discoverSchema()` which calls `MetadataRegistry.buildSchema({ dataSource })` to collect all bound models and their relations
3. The lazily-built Drizzle connector is initialized with the complete schema (tables + Drizzle relations)

You can disable auto-discovery per datasource via `@datasource({ driver: NodePostgresDriver, autoDiscovery: false })`.

## Open at start, or on first use

By default `configure()` runs when the application starts, and `listen()` waits for it. A datasource can open later: `@datasource({ driver: PGliteDriver, open: { on: 'first-use' } })`. The default is `open: { on: 'start' }`.

```typescript
@datasource({ driver: PGliteDriver, open: { on: 'first-use' } })
export class PGliteDataSource extends BasePostgresDataSource<IPGliteSettings, {}, {}, PGlite> {
  override async configure(): Promise<void> {
    const client = new PGlite(this.settings.dataDir);
    await client.waitReady;
    this.client = client;

    // The migrations run inside the open: no call ever sees a database without its tables.
    const runner = new RelationalMigrationRunner({ driver: this.resolveDriver() });
    await runner.run({ migrations: MIGRATIONS });
  }
}
```

The `open` option takes a timeout too: `open: { on: 'first-use', timeoutMs: 120_000 }`. The default is 60 s, `0` waits for ever. When the open does not finish in time every waiting call is rejected with a named error, and the attempt is abandoned: a `configure()` that ends late has what it built closed and never published, and the next call waits until it has ended before it tries again.

With `first-use`:

- **The application starts and listens without the datasource.** Nothing is built until a call needs it. In a browser Worker on PGlite this moves the WASM boot (about 16 MB) off the first screen.
- **The first repository call opens it, once.** Every verb and `beginTransaction()` awaits the open first. Calls that arrive while it is opening wait for that same open; `configure()` runs once.
- **A failed open is reported to every waiting call.** What the failed `configure()` built is closed and forgotten, so nothing is left half-open, and the next call tries again from nothing. A `configure()` that fails after it assigned `this.client` has that client ended for it.
- **`close()` closes only what was opened.** A datasource that was never used builds nothing and closes nothing. A stop that arrives during the first use waits for that open, then closes what it built. After the stop a call is refused (`The datasource is closed`); a stopped application does not reopen its datasources.
- **`getConnector()` and `getClient()` throw until it is open.** They are synchronous. Await `dataSource.ensureOpen()` first; repository calls do it for you.
- **A rotated secret waits in the settings** for the first use when the datasource is not open yet. A secret rotated while the first open is in flight reaches the settings, but that open may already have read the old one; rotation after the open swaps the pool as always.
- **Relational datasources only** (node-postgres, postgres-js, PGlite, libsql). A search or raw-SQL datasource with `first-use` refuses to start, naming the datasource.

### Doing database work inside configure()

`configure()` is the open. While it runs, the public `getConnector()`, `getClient()` and `beginTransaction()` are gated (they wait for the open, which waits for `configure()`), and a repository cannot be used (it waits for the open too). `configure()` receives its handles as a second argument instead: the connector, the client and a transaction, typed by the datasource's own types. Only `configure()` gets them, so every other caller still waits for the open to finish and no request can see a half-migrated database.

```typescript
@datasource({ driver: PGliteDriver, open: { on: 'first-use' } })
export class PGliteDataSource extends BasePostgresDataSource<IPGliteSettings, {}, {}, PGlite> {
  override async configure(
    _options?: object,
    opening?: IRelationalDataSourceOpening<TRelationalConnector, PGlite>,
  ): Promise<void> {
    this.client = new PGlite(this.settings.dataDir);
    await this.client.waitReady;

    // Migrations and seeding go through the handles, never through a repository.
    const transaction = await opening!.beginTransaction();
    await transaction.connector.execute(sql`INSERT INTO settings (key) VALUES ('seeded')`);
    await transaction.commit();
  }
}
```

The boot passes the same handles to a datasource that opens at start, so the same body works in both modes. `this.client`, `this.resolveDriver()` and `RelationalMigrationRunner` need no handle. Calling `this.getConnector()` inside `configure()` of a first-use datasource throws "still opening" and names the `opening` argument. A `configure()` that awaits a repository or `ensureOpen()` waits on itself until the timeout, which rejects with a named error. The handles exist only as that argument: the datasource has no public accessor for them, so no other code can take them while it is opening.

> [!WARNING]
> A `configure()` that never settles keeps the datasource from opening until the process restarts. `timeoutMs` releases the waiting calls with the named error, but the abandoned `configure()` still owns the datasource: a new open starts only after it has settled, and until then every call is refused with "the previous open is still running". Make `configure()` end (or fail) on its own, for example with a timeout on the call that can hang.

```typescript
await dataSource.ensureOpen(); // resolves at once for a datasource that opens at start, or is open already
dataSource.isOpen();           // false until the first use has finished; true from the start for a datasource that opens at start, until close()
```

## Manual Schema (Optional)

If you need explicit control, you can still provide schema manually:

```typescript
@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: { /* ... */ },
      schema: {
        User: User.schema,
        Configuration: Configuration.schema,
        // Add relations if using Drizzle's relational queries
      },
    });
  }
}
```

## DataSource Hierarchy

```
AbstractDataSource extends BaseHelper             # engine-neutral - no client, no Drizzle
  └── AbstractRelationalDataSource                # SQL branch root - client, driver, connector slots
        │                                           wireDriverFromMetadata(), useDriver()
        │                                           getConnectionString() is abstract here
        └── BaseRelationalDataSource              # still engine-neutral
              │                                     getSchema(), discoverSchema()
              │                                     hasDiscoverableModels()
              │                                     getCapabilities() -> { transactions: true }
              │                                     beginTransaction(opts?)
              ├── AbstractPostgresDataSource      # Postgres dialect + executor
              │     └── BasePostgresDataSource (alias: BaseDataSource)
              │           ├── configure()               # you assign this.client (abstract)
              │           ├── getConnectionString()     # still abstract - you implement it
              │           └── buildBeginStatement()     # BEGIN with isolation level
              └── AbstractSqliteDataSource        # SQLite dialect + executor
                    └── BaseSqliteDataSource
                          ├── configure()               # you assign this.client (abstract)
                          ├── getConnectionString()     # inherited - returns settings.url
                          └── buildBeginStatement()     # BEGIN with begin mode
```

`getCapabilities()` and `beginTransaction()` sit on the neutral `BaseRelationalDataSource`, so both SQL engines get transactions. `getConnectionString()` is abstract on the Postgres branch because no framework code can guess a `postgresql://` URL; SQLite inherits one because the libsql url is the connection string.

## Registering a DataSource

`@datasource` marks the class. `artifacts: AutoArtifacts` in the application config registers it at boot, before `preConfigure()`:

```typescript
// src/application.ts
import AutoArtifacts from '@venizia/ignis-boot/auto';

export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: AutoArtifacts,
};
```

See [Registering artifacts](../application/bootstrapping). DataSources are bound as **singletons** to ensure connection pool sharing across the application.

## Supported Engines

| Engine | Driver/Package | Import | Status |
|--------|---------|--------|--------|
| PostgreSQL | `node-postgres` (`pg`) or `postgres` | `@venizia/ignis` or `@venizia/ignis-connectors/postgres` | Supported, transactions + 3 isolation levels. See [Postgres Drivers](./postgres-drivers) |
| PGlite (embedded Postgres) | `@electric-sql/pglite` (optional peer) | `@venizia/ignis-connectors/postgres/pglite` | Supported. See [PGlite](./pglite) |
| SQLite | `@libsql/client` (optional peer) | `@venizia/ignis-connectors/sqlite` and `@venizia/ignis-connectors/sqlite/libsql` | Supported, transactions with begin modes. See [SQLite](./sqlite) |
| Typesense (search) | `typesense` (optional peer) | `@venizia/ignis-connectors/typesense` (subpath-only) | Supported, no transactions/locks. See [Search and Typesense](./search-typesense) |
| Meilisearch (search) | `meilisearch` (optional peer) | `@venizia/ignis-connectors/meilisearch` (subpath-only) | Supported, no transactions/locks. See [Search and Meilisearch](./search-meilisearch) |
| MySQL | - | - | Not planned; would be a new connector under `packages/connectors/src/relational/` |

## DataSource Template

```typescript
import { BasePostgresDataSource, datasource, ValueOrPromise } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'mydb',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

> **Deep Dive:** See [BaseDataSource Reference](../../../references/base/datasources.md) for connection pooling and advanced configuration.

## See Also

- **Related Concepts:**
  - [Repositories](/guides/core-concepts/persistent/repositories) - Use DataSources for database access
  - [Models](/guides/core-concepts/persistent/models) - Entity schemas loaded by DataSource
  - [Transactions](/guides/core-concepts/persistent/transactions) - Multi-operation database transactions
  - [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - The typesense connector
  - [Application](/guides/core-concepts/application/) - Registering DataSources

- **References:**
  - [BaseDataSource API](/references/base/datasources) - Complete API reference
  - [Environment Variables](/references/configuration/environment-variables) - Configuration management

- **External Resources:**
  - [Drizzle ORM Documentation](https://orm.drizzle.team/) - ORM configuration
  - [node-postgres Documentation](https://node-postgres.com/) - Connection pooling guide

- **Best Practices:**
  - [Performance Optimization](/best-practices/performance-optimization) - Connection pool tuning
  - [Security Guidelines](/best-practices/security-guidelines) - Database credential management

- **Tutorials:**
  - [Complete Installation](/guides/tutorials/complete-installation) - Database setup
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - DataSource configuration
