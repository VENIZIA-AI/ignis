---
title: Optional Peers, Actually Optional - The Driver Is a Class Now
description: A dynamic import defers execution, not packaging. Every bundler was pulling postgres-js into apps that had never installed it, and bun build --compile failed for all of them. The fix names the driver class in @datasource, and deletes the resolver entirely.
---

# Changelog - 2026-07-14

## Optional Peers, Actually Optional

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

`pg` and `postgres` are declared optional peers. They were not. Any application that imported `@venizia/ignis` and bundled - `bun build --compile`, esbuild, webpack, rollup - failed on a package it had never installed:

```
error: Could not resolve: "postgres". Maybe you need to "bun install"?
    at node_modules/drizzle-orm/postgres-js/driver.cjs:35:39
```

Including applications that use node-postgres exclusively and never touch postgres-js.

## The premise that was wrong

`drivers/resolve.ts` carried this claim:

> *"Picks the driver that matches the client the application built, and imports it dynamically so the losing driver's package is never loaded. This is the only reason `pg` and `postgres` can both be optional peers."*

True of a **runtime module graph**. False of a **bundler**.

A dynamic `import()` defers **execution**, not **packaging**. Every bundler statically resolves `import('<string literal>')` and pulls the target into the output. The specifier being relative changes nothing.

The test that was supposed to guard this - `no-eager-driver-import.test.ts` - measured `require.cache` in a fresh process. That is the runtime module graph, where the deferral is real. It was green the whole time, and it was answering a different question than the one that mattered.

## The fix: name the driver class

`@datasource({ driver })` takes the driver **class**, not a driver-name string.

```typescript
import { Pool } from 'pg';
import { datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IConfigs> {
  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings); // that is all
  }
}
```

`configure()` builds the client. Nothing else. The base wires the driver and the connector from the decorator on first use.

A **class reference** is the only thing that can carry an optional peer into a bundle. A string carries nothing. A bare `import '@venizia/ignis/postgres/node-postgres'` for its side effect would not work either: core declares `sideEffects: false`, so a bundler is entitled to delete an import whose exports go unused - and it would, silently, leaving the driver unregistered until production.

So there is nothing left to register, and nothing left to resolve. `resolveDatabaseDriver()`, `drivers/resolve.ts`, `isNodePostgresPool()` and `isPostgresJsClient()` are all deleted. `resolveDriver()` is synchronous: instantiating a class the application already imported has nothing to await, so the cached in-flight promise, the un-cache-on-rejection, and the retry log go with them.

## The gate

`bundle/optional-peers.test.ts` bundles four fixtures and greps the output:

| Fixture | `pg` in bundle | `postgres` in bundle |
|---|---|---|
| names `NodePostgresDriver` | yes | **no** |
| names `PostgresJsDriver` | **no** | yes |
| root barrel only | **no** | **no** |
| a literal `await import()` | - | **yes** |

The last row is the point. It reproduces the old resolver's shape on purpose and asserts the peer **is** pulled in - so the three rows above it cannot pass merely because a marker never matches anything.

Both tests stay, and they are not redundant: `no-eager-driver-import.test.ts` proves nothing is **loaded**, `optional-peers.test.ts` proves nothing is **packaged**.

## One rule, both branches: a class reference names the engine

Search never had this bug, and the reason is worth stating, because it is what the relational fix was reaching for all along.

The two branches vary on different axes:

| | Relational | Search |
|---|---|---|
| What varies | the **driver**, under one `BasePostgresDataSource` | the **datasource** - it *is* the engine |
| What names the engine | `@datasource({ driver: NodePostgresDriver })` | `extends TypesenseDataSource` |
| What carries the peer into the bundle | that class reference | that class reference |

A search datasource already holds a value reference to its engine, so `typesense` enters the bundle when - and only when - the application extends `TypesenseDataSource`. The property relational had to go and win back, search got for free.

Which leaves `@datasource({ driver: DataSourceDrivers.TYPESENSE })` as what it always was: **dead metadata**. Nothing read it. It is gone:

```typescript
@datasource()
export class ArticleSearchDataSource extends MeilisearchDataSource {}
```

`IDataSourceMetadata.driver` is now **optional and class-only**. `DataSourceDrivers` stays - it is an identity constant for names, config and `isValid()` - but it is no longer a configuration channel, because it never was one.

## Bug Fix: a pool-only datasource had no connector at all

`resolveDriver()` assigned `this.driver` and never built `this.connector`. A datasource that configured a bare client therefore had a working `beginTransaction()` and an `undefined` connector - every pooled query read through it.

It survived because the repositories reached past the accessor: `this.dataSource.connector`, the raw field. They now call `getConnector()`, which wires on first use.

## Bug Fix: a bare pg.Client was silently accepted

`isNodePostgresPool()` tested `typeof client.connect === 'function'`. A `pg.Client` has `connect()` too - the source comment admitted it was "out of contract" and hoped nobody passed one. A Client that reached the driver could not hand out a dedicated connection per transaction; every transaction fought over the one it is.

Each driver now validates its own client at construction, where the knowledge lives:

```typescript
new NodePostgresDriver({ client: someClient });
// [NodePostgresDriver] Expected a `pg` Pool | Got a client without pool accounting - a bare `pg.Client`? | Construct `new Pool({ ... })` instead
```

## Migration Guide

> [!WARNING]
> Every relational datasource needs a two-line change. Nothing else in the framework moves.

```typescript
// BEFORE
import { DataSourceDrivers, datasource } from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';

@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })
export class PostgresDataSource extends BasePostgresDataSource<IConfigs> {
  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();
    this.client = new Pool(this.settings);
    this.connector = drizzle({ client: this.client, schema });
  }
}

// AFTER
import { datasource } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IConfigs> {
  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings);
  }
}
```

| If you | Then |
|--------|------|
| write `@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })` | name the class: `@datasource({ driver: NodePostgresDriver })`. A string is now a **type error**, and throws at first use if you cast past it |
| call `useDriver({ driver: new NodePostgresDriver({ pool }) })` | the constructor takes `{ client }` now. Or drop the call entirely and let the decorator wire it |
| build the drizzle connector by hand in `configure()` | delete that line - the base builds it |
| pass a bare `pg.Client` | construct a `Pool`. It was never supported; now it says so |
| carry `--external postgres` in a bundler config | remove it |
| write `@datasource({ driver: DataSourceDrivers.TYPESENSE })` on a search datasource | drop the `driver` entirely: `@datasource()`. It was never read |
| have a custom driver | keep calling `useDriver()`. It is unchanged and still public |

## Verification

The whole chain, cold: **inversion 96, helpers 1014, boot 81, core 1518** tests passing, 1 skipped, 0 failing. Zero type errors and zero lint findings across all four packages, and all nine examples type-check.
