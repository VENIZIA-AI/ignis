---
title: A datasource can open on first use
description: "@datasource({ open: { on: 'first-use' } }) starts the application without opening the datasource; the first repository call opens it once, and a failed open is retried by the next call."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-08

## A datasource can open on first use

<Badge type="tip" text="New Feature" />

**In one line.** `@datasource({ driver, open: { on: 'first-use' } })` lets the application start and listen without opening the datasource. The first repository call opens it, once.

## What changed

- **The `open` option.** `open: { on: 'start' | 'first-use' }`, default `start`: today's behaviour, unchanged. A value other than these two throws where `@datasource` is written.
- **`first-use`.** The boot records the datasource's options and does not call `configure()`. The first repository call, or `beginTransaction()`, opens it; calls that arrive meanwhile wait for the same open, so `configure()` runs once. Your `configure()` is the open: a `RelationalMigrationRunner` that runs inside it finishes before the first query.
- **A failed open.** Every waiting call gets the error. What the failed `configure()` built is closed and forgotten, and the next call tries again from nothing.
- **Stopping.** `close()` closes only what was opened. A stop during the first use waits for that open, then closes what it built. After the stop a call is refused instead of reopening the datasource.
- **New members.** `ensureOpen()`, `isOpen()`, `isClosed()`, `isOpenDeferred()` and `getOpenMode()` on the datasource base. `getConnector()` and `getClient()` stay synchronous and throw until the datasource is open.
- **Relational datasources.** node-postgres, postgres-js, PGlite and libsql. A search or raw-SQL datasource with `first-use` refuses to start, naming the datasource.
- **Rotated secrets.** A secret rotated before the first use waits in the settings.
- **The browser-bff example** now uses it: the Worker listens before PGlite's ~16 MB WASM boot starts.

## Who is affected

- **Everyone.** No action needed: the default is `start`.
- **A browser Worker or any app with a slow-to-open datasource.** Set `open: { on: 'first-use' }` to take the open off the start.
- **Code that reads `getConnector()` or `getClient()` itself.** With `first-use`, `await dataSource.ensureOpen()` first. Repository calls do it for you.

## Details

```typescript
@datasource({ driver: PGliteDriver, open: { on: 'first-use' } })
export class AppDataSource extends BasePostgresDataSource<ISettings, {}, {}, PGlite> {
  override async configure(): Promise<void> {
    const client = new PGlite(this.settings.dataDir);
    await client.waitReady;
    this.client = client;

    const runner = new RelationalMigrationRunner({ driver: this.resolveDriver() });
    await runner.run({ migrations: MIGRATIONS });
  }
}
```

| File | Package |
|------|---------|
| `src/base/datasources/abstract.ts` | kernel |
| `src/base/datasources/common/types.ts` | kernel |
| `src/base/applications/rest.ts` | kernel |
| `src/common/driver-data-source.ts` | connectors |
| `src/relational/core/repositories/core/base.ts` | connectors |
| `src/relational/core/datasources/base.ts` | connectors |
