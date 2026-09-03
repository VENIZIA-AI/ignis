---
title: DataSources
description: Manage the connection to a database or search engine with a DataSource class
difficulty: intermediate
---

# DataSources

A datasource owns the connection to a database (or search engine).

## In one example

The smallest real datasource: a `pg.Pool` wrapped in a class, wired to node-postgres via `@datasource`.

```typescript
import { Pool } from 'pg';
import { datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  override configure(): void {
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): string {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

A `@repository` binds a model to `PostgresDataSource`, and the schema is auto-discovered from that binding - no manual schema wiring.

## How it works

- **Driver is a class, not a string.** `@datasource({ driver })` names `NodePostgresDriver` or `PostgresJsDriver` as a class reference, never a driver-name string. Only a class reference carries `pg`/`postgres` into the bundle, keeping both packages optional.
- **`configure()` has exactly one job.** Build the raw client and assign it to `this.client` (a `pg.Pool` for node-postgres, or a postgres-js `Sql`). It never touches `this.connector` directly.
- **The driver wires lazily.** The first time `getConnector()` or `beginTransaction()` is called, the base class reads the class named in `@datasource({ driver })`. It instantiates that class over `this.client` and builds `this.connector` from it.
- **Base vs. connector split.** IGNIS splits datasources into an engine-neutral root (`AbstractDataSource` - no SQL, no Drizzle, no pool) and per-engine connectors. `BasePostgresDataSource` is the PostgreSQL connector; typesense has a parallel class. See [Connectors](/references/base/connectors) for the full architecture.
- **Naming.** The PostgreSQL connector's canonical class is `BaseRelationalDataSource`; `BasePostgresDataSource` and `BaseDataSource` are compatibility aliases re-exporting the same class.

## Common tasks

### Configure connection settings

Pass connection settings through the constructor's `config` option. `configure()` reads them back off `this.settings`.

```typescript
import { Pool } from 'pg';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';

export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: applicationEnvironment.get<string>('APP_ENV_POSTGRES_HOST'),
        port: int(applicationEnvironment.get<string>('APP_ENV_POSTGRES_PORT')),
        database: applicationEnvironment.get<string>('APP_ENV_POSTGRES_DATABASE'),
        user: applicationEnvironment.get<string>('APP_ENV_POSTGRES_USERNAME'),
        password: applicationEnvironment.get<string>('APP_ENV_POSTGRES_PASSWORD'),
      },
    });
  }

  override configure(): void {
    this.client = new Pool(this.settings);
  }
}
```

### Choose a driver

| Driver | Package | When to use |
|---|---|---|
| `NodePostgresDriver` | `pg` | Long-standing default |
| `PostgresJsDriver` | `postgres` | Required for Supabase's transaction pooler; faster elsewhere |

Swapping drivers only changes which class `@datasource` names and how `configure()` builds the client:

```typescript
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import * as schema from '@/schemas';

@datasource({ driver: PostgresJsDriver })
export class PostgresDataSource extends BasePostgresDataSource<
  IDataSourceConfigs,
  typeof schema,
  {},
  Sql
> {
  override configure(): void {
    this.client = postgres(this.getConnectionString());
  }
}
```

See [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers) for the full comparison, client-validation behavior, and Supabase presets.

### Run a transaction

`beginTransaction()` acquires a connection, issues `BEGIN`, and returns a handle with a scoped `connector`, `commit()`, and `rollback()`.

```typescript
import { IsolationLevels } from '@venizia/ignis/postgres';
import { userTable } from '@/schemas';

const transaction = await postgresDataSource.beginTransaction({
  isolationLevel: IsolationLevels.SERIALIZABLE,
});

try {
  await transaction.connector.insert(userTable).values({ name: 'Alice' });
  await transaction.commit();
} catch (error) {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    console.error('Rollback failed | %s', rollbackError);
  }
  throw error;
}
```

- **`rollback()` throws on failure.** Nest it in its own `try...catch` so a rollback failure never replaces the original error.
- **Prefer the repository API.** Most repository code should call `repository.beginTransaction()` instead of going through the datasource directly. See [Transactions](/guides/core-concepts/persistent/transactions).

### Share one datasource across repositories

One `PostgresDataSource` instance is shared by every repository bound to it. `@repository` auto-injects the datasource, and `getSchema()` merges the tables and relations of every model bound to it.

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

@repository({ model: Configuration, dataSource: PostgresDataSource })
export class ConfigurationRepository extends DefaultCRUDRepository<typeof Configuration.schema> {}
```

`PostgresDataSource.schema` automatically includes both `User` and `Configuration`, plus their relations - one pooled connection, no per-repository connection setup.

## See also

- [Full reference](/references/base/datasources-reference) - every `IDataSource` member, `BasePostgresDataSource` internals, and transaction edge cases
- [Tutorial](/guides/core-concepts/persistent/datasources) - creating datasources step by step
- [Connectors](/references/base/connectors) - the base-vs-connector architecture
- [Repositories](/references/base/repositories/) - the layer that queries through a datasource
- [Models](/references/base/models) - the schema a datasource discovers from `@repository` bindings

**Files:**

- [`packages/core-server/src/base/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/datasources/abstract.ts) - neutral `AbstractDataSource`
- [`packages/core-server/src/connectors/postgres/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/connectors/postgres/datasources/base.ts) - PostgreSQL `BasePostgresDataSource`
