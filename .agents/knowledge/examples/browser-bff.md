---
type: Example
title: browser-bff
description: An IGNIS controller answering its own REST routes from PGlite inside a browser Worker, with no server running - and the data surviving a page reload in OPFS.
resource: examples/browser-bff
tags: [examples, browser, bff, worker, pglite, opfs]
---

`browser-bff` is `examples/pglite-quickstart` moved into a browser tab. The model, repository and
controller are copied across with **no change to a single line of class body, decorator, column
definition or `super()` call** - only their import specifiers differ. That is the claim the example
exists to prove.

```bash
bun install && bun run dev     # http://localhost:5173
```

The page calls `bff.fetch(...)`, a dedicated Worker answers from PGlite in OPFS, and nothing crosses
a network. `curl` against the dev server returns the SPA shell; the routed URL is
`http://ignis.internal/api/notes`.

## What it demonstrates

- **The domain tier is host-neutral.** Only the datasource is browser-aware: `dataDir` becomes
  `opfs-ahp://ignis-browser-bff` and the `mkdirSync` call goes, because there is no filesystem.
- **OPFS persists across a reload.** Write rows, reload the page, read them back. A reload destroys
  the JS heap and the Worker, and the data never crosses HTTP, so neither memory nor cache can
  explain the rows coming back. Measured on a fresh origin three separate times, dev server and
  production build alike.
- **The error envelope is identical to the server's.** A thrown `ApplicationError` renders the same
  shape here as on Bun - see [error handling flow](/architecture/error-handling-flow.md).

## The one workaround left, and the two that were removed

`optimizeDeps.exclude: ['@electric-sql/pglite']` stays - Vite's pre-bundling mangles PGlite's WASM
asset resolution, which is that package's packaging, not IGNIS's.

`optimizeDeps.include` and `define: { __filename }` are gone. Both were downstream of ONE fact: every
IGNIS package shipped CommonJS only. Vite serves a linked workspace dependency as-is, so the browser
met a bare `require()` - hence one `include` line per sub-path, added by hand, and forgotten the day
a new sub-path was imported. Rolldown's CommonJS interop shim then read `__filename` on the branch it
takes inside a Worker, hence the second.

Every package in `PURITY_CLAIMS` now dual-builds and publishes an `import` condition, and
`assertBrowserImportCondition` in `scripts/purity/manifest.ts` fails the gate if one stops. Measured
on the production build: the page chunk fell from **682 KB to 54 KB**, because the ESM entry is
tree-shakeable where the CommonJS one was not.

There was a third: an alias pointing `hono/context-storage` at `src/shims/hono-context-storage.ts`,
because `@venizia/ignis-connectors/postgres` imported that module and its body constructs an
`AsyncLocalStorage`. It replaced the module for the entire build, not one call site, so a model using
`enrichUserAudit` had `createdBy` and `modifiedBy` written as `null` on every row with no error. Both
the alias and the shim are gone: the enricher now reads
[`RequestContextRegistry`](/packages/kernel.md), and this Worker installs no resolver, which the
enricher reads as "no request context" - the state its `allowAnonymous` branch already handled.

## Migrations are inlined, and the ledger is atomic

Drizzle's PGlite migrator is `node:fs`-bound, so the SQL arrives through Vite's `?raw` and a small
ledger table records what ran.

The runner is the framework's `RelationalMigrationRunner`, not this example's - it was 70 lines of
transaction handling with a documented crash analysis, which is framework work living in an example.
The example keeps only its `MIGRATIONS` array, and passes `ledgerTable: 'ignis_browser_migrations'`
because that is the name its own earlier ledger used and the database lives in the visitor's OPFS.

The DDL and the ledger row go in **one** transaction. Run as two statements they would not: a bare
exec commits when it returns, so an interruption between them leaves the table present and the ledger
empty. The next boot re-runs a bare `CREATE TABLE` and `configure()` rejects forever, with no
recovery inside the application - the user has to clear OPFS by hand. The window lands on the first
ever visit, while the page downloads roughly 16 MB of WASM and data.

Two consequences of wrapping it, both stated on `RelationalMigrationRunner`: PostgreSQL refuses
`CREATE INDEX CONCURRENTLY` inside a transaction block, which Drizzle emits for any `.concurrently()`
index; and the ledger keys on the migration name with no content hash, so editing an already-applied
file is skipped rather than reported.

## Notable / non-obvious

- **PGlite must be `>= 0.5.5`.** 0.5.4 calls a provided filesystem's `init()` twice on first create
  and trips OPFS handle contention. The pin lives in the **root** `package.json` as an
  `overrides` entry - see [gotchas](/conventions/gotchas.md) for why a per-package pin was not
  enough.
- **One tab.** A second tab opening the same OPFS directory fails with `NoModificationAllowedError`.
  Multi-tab needs PGlite's own leader election.
- **A failed migration closes its client.** `configure()` used to assign `this.client` only after
  the migrations resolved, so a migration failure orphaned a live `PGlite` still holding its
  OPFS access handles - and every retry then reported `NoModificationAllowedError` instead of the
  real cause. The client is closed before the error is rethrown, so the retry surfaces the migration
  failure itself.
- **No COOP/COEP headers, and no CSP without `unsafe-eval`.** PGlite ships no `SharedArrayBuffer` so
  it needs no cross-origin isolation, but it does call raw `eval()` through Emscripten and dies at
  WASM init without it.
- **`optimizeDeps.exclude: ['@electric-sql/pglite']`** matters: Vite's pre-bundling mangles PGlite's
  WASM asset resolution.
- Errors arrive sanitised unless the application declares an environment. The middleware is
  fail-closed and a browser has no ambient one, so `worker.ts` sets `config.error.environment` from
  `import.meta.env.MODE`, which Vite replaces with the literal `production` in a build. This used to
  be a Hono middleware assigning `context.env`, because the seam was a `protected` hook an
  application could not reach; it is a constructor option now.
- `/favicon.ico` returns the JSON 404 envelope where the server returns an icon. Deliberate - a BFF
  inside a Worker serves no favicon, the page does.

## Related

- [pglite-quickstart](/examples/pglite-quickstart.md)
- [core-worker](/packages/core-worker.md)
- [connectors](/packages/connectors.md)
