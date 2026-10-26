# Raw SQL Engines

An analytics engine beside your main database (ClickHouse, DuckDB, BigQuery) runs SQL text and returns rows. It has no Drizzle dialect, no query executor and no transactions, so it does not fit the relational datasources. IGNIS gives it its own small family: you write one connector and one driver for the engine, and the lifecycle, the dependency injection and the typed repository come from the base classes.

IGNIS ships no engine connector. ClickHouse, DuckDB and the rest stay in your application.

## The pieces

| You write | IGNIS gives you |
|---|---|
| A **connector** with `execute(query)` that returns `{ rows }` | `IRawSqlConnector`, `IRawSqlResult`, `TRawSqlQuery` (a string or a Drizzle `sql` template) |
| A **driver** with `createConnector`, `getClient` and `end` | `TRawSqlDriver<TConnector, Client>` - no transaction to acquire |
| A **datasource** that builds the client in `configure()` | `BaseRawSqlDataSource`: driver wiring, close once, secret rotation, drain |
| A **repository** that writes its own statements | `BaseRawSqlRepository<TConnector>`: `this.connector`, typed, no cast |

Import them from `@venizia/ignis-connectors/raw-sql`.

## A worked example on a fake engine

The engine below is made up: its client takes SQL text and answers with rows. Replace the client and the connector with your engine's; the rest stays. Every snippet on this page comes from one file that runs in the test suite, `packages/connectors/src/__tests__/raw-sql/worked-example.test.ts`.

```typescript
import type { IRawSqlConnector, IRawSqlResult, TRawSqlDriver, TRawSqlQuery } from '@/raw-sql';
import { BaseRawSqlDataSource, BaseRawSqlRepository } from '@/raw-sql';
import { datasource, repository, RepositoryTypes } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
```

**1. The client** is the engine's own library. Nothing IGNIS-specific:

```typescript
/** The engine's own client: it takes SQL text and answers with rows. */
class GizmoClient {
  constructor(readonly opts: { url: string }) {}

  async run(statement: string): Promise<Array<Record<string, unknown>>> {
    return [{ url: this.opts.url, statement }];
  }

  async close(): Promise<void> {}
}
```

**2. The connector** turns a statement into the client's call. A query is a string or a Drizzle `sql` template. An engine that cannot take a template says so, as this one does:

```typescript
/** The connector turns a statement into the client's call and returns `{ rows }`. */
class GizmoConnector implements IRawSqlConnector {
  constructor(private readonly client: GizmoClient) {}

  async execute(query: TRawSqlQuery): Promise<IRawSqlResult> {
    if (typeof query !== 'string') {
      throw getError({
        message: '[GizmoConnector] This engine takes SQL text, not a Drizzle template',
      });
    }

    return { rows: await this.client.run(query) };
  }
}
```

**3. The driver** builds the connector over the client, hands the client back, and ends it. It is a class, so `@datasource({ driver })` pulls the engine into your bundle:

```typescript
/** The driver builds the connector over the client, hands the client back, and ends it. */
class GizmoDriver implements TRawSqlDriver<GizmoConnector, GizmoClient> {
  constructor(private readonly opts: { client: GizmoClient }) {}

  createConnector(): GizmoConnector {
    return new GizmoConnector(this.opts.client);
  }

  getClient(): GizmoClient {
    return this.opts.client;
  }

  end(): Promise<void> {
    return this.opts.client.close();
  }
}
```

**4. The datasource** names the driver and builds the client in `configure()`:

```typescript
/** The datasource names the driver and builds the client in `configure()`. */
@datasource({ driver: GizmoDriver })
class GizmoDataSource extends BaseRawSqlDataSource<{ url: string }, GizmoClient, GizmoConnector> {
  constructor() {
    super({ name: 'gizmo', config: { url: 'gizmo://analytics' } });
  }

  configure(): void {
    this.client = new GizmoClient({ url: this.getSettings().url });
  }
}
```

**5. The repository** has no model. Bind it with a datasource and no model (`RepositoryTypes.REMOTE`) and write the statements. `this.connector` is a `GizmoConnector` because of the generic, so `execute` needs no cast:

```typescript
/** A repository has no model: it names the datasource and writes its own statements. */
@repository({ type: RepositoryTypes.REMOTE, dataSource: GizmoDataSource })
class DailyRevenueRepository extends BaseRawSqlRepository<GizmoConnector> {
  async since(opts: { day: string }) {
    const { rows } = await this.connector.execute(
      `select day, sum(total) from revenue where day >= '${opts.day}'`,
    );
    return rows;
  }
}
```

Register the datasource and the repository like any other. With auto-discovery the decorators are enough; by hand, call `this.dataSource(GizmoDataSource)` and `this.repository(DailyRevenueRepository)` in `preConfigure()`. A service then injects the repository and calls `since({ day })`.

## What it does and does not do

- **Lifecycle.** `close()` ends the engine once, through the driver. A secret rotation rebuilds the client against the rotated credentials, swaps the connector and drains the old client. If the rebuild fails, the old client keeps serving and the settings are restored.
- **No transactions.** `getCapabilities()` reports `{ transactions: false }` and `beginTransaction()` rejects with NotSupported, as on any datasource without them. There is no method to stub.
- **No query building.** There is no filter language, no `find`, no `create`. The repository writes SQL. Bind parameters with your engine's client: the example concatenates a string for brevity only.
- **No schema.** `getSchema()` is empty and nothing is discovered. Migrations stay in the engine's own tooling.

## Why a separate family

The relational datasource needs a query dialect, a query executor, a connection string and transactions. A raw-SQL engine has none of them, so placing it under the relational base would leave four members that only throw. Both families share one base, `AbstractDriverDataSource`, for the lifecycle above. See [Connectors](/references/base/connectors) for the whole hierarchy.
