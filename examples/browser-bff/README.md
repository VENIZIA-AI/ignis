# Browser BFF

A react-admin application whose backend runs inside a browser Worker. IGNIS serves its own REST
routes from PGlite in OPFS, with no server anywhere - the page talks to it over `postMessage`.

```bash
bun install
bun run dev
# http://localhost:5173 - create a note, then reload the page
```

The rows are still there after the reload. They live in the origin private file system, under
`ignis-browser-bff/`.

## The front end is a normal react-admin app

`@minimaltech/ra-core-infra` is wired exactly as it would be against a real server: an inversion
container, `DefaultRestDataProvider` pointed at `/api`, and `CoreRaApplication` rendering a
`notes` resource. Nothing in it knows a Worker exists.

The whole integration is `src/bff-fetch.ts`, twelve lines that give the page a `fetch` which
answers `/api/*` from the Worker and passes everything else to the network. The data provider
reaches the network through `NodeFetchNetworkRequest`, which calls the global `fetch` and accepts
no custom fetcher - so intercepting `fetch` is what makes an in-browser backend a drop-in swap
rather than a fork of the provider.

The UI is shadcn/ui on Base UI (`@base-ui-components/react`, shadcn's default base since July
2026) with Tailwind v4. `components.json` points shadcn at `~/components`, not `@/components`:
this example already uses `@` for `src/domain`, which the copied controller depends on.

## What is shared with the server example

The model, the repository and the controller are copied from
[`pglite-quickstart`](../pglite-quickstart) with their bodies untouched. Only import specifiers
change, because `@venizia/ignis` reaches `ioredis` and cannot bundle for a browser:

| Server example imports | Browser example imports |
|---|---|
| `@venizia/ignis` | `@venizia/ignis-kernel` |
| `@venizia/ignis/postgres` | `@venizia/ignis-connectors/postgres` |
| `ValueOrPromise` from `@venizia/ignis` | `@venizia/ignis-helpers/common` |

The datasource is the one file with real changes: `dataDir` becomes `opfs-ahp://ignis-browser-bff`,
the `mkdirSync` goes, and the migration is inlined rather than read from disk.

## The parts that are browser-only

| File | Job |
|---|---|
| `src/worker.ts` | the BFF - extends `WorkerApplication`, registers the artifacts, calls `listen()` |
| `src/bff.ts` | the UI half - wraps the `Worker` in a `WorkerBffTransport` |
| `src/main.ts` | calls `/api/notes` and renders the rows |
| `src/domain/datasources/pglite.datasource.ts` | opens PGlite on OPFS and applies the migration |

## Workarounds this example carries

One, and it is a third party's packaging:

| Where | Why |
|---|---|
| `optimizeDeps.exclude: ['@electric-sql/pglite']` in `vite.config.ts` | Vite's dependency pre-bundling mangles PGlite's WASM asset resolution |

Two more used to live here, and both were one gap: every IGNIS package shipped CommonJS only, so
Vite served a linked workspace dependency as-is and the browser met a bare `require()`
(`optimizeDeps.include`, one line per sub-path), and Rolldown's CommonJS interop shim read
`__filename` on the branch it takes inside a Worker (`define: { __filename }`). Every package that
claims browser purity now publishes an `import` condition, the purity manifest enforces that claim,
and both lines are gone. The page chunk went from 682 KB to 54 KB with them.

This example used to alias `hono/context-storage` onto a local stub, because
`@venizia/ignis-connectors/postgres` imported it and that module constructs an `AsyncLocalStorage` at
module scope. It no longer does: the user-audit enricher reads `RequestContextRegistry` instead, the
server layer installs the resolver over it, and a Worker that installs none simply has no request
context. `make purity` measures the sub-path directly, so the alias cannot come back unnoticed.

## Limits

**One tab.** A second tab opening the same OPFS directory fails with `NoModificationAllowedError`.
Multi-tab needs PGlite's own leader election, which this example does not use.

**Chrome, measured. Firefox untested.** Desktop Safari caps sync access handles below what a
Postgres data directory needs, so `opfs-ahp://` does not work there.

**No sync.** The database starts empty and stays local. Nothing here talks to a backend.

## Production build

```bash
bun run build
bun run preview
```

The build is served from a different port, so it gets a different origin - and OPFS is per-origin.
The preview starts with an empty database rather than the one the dev server wrote.
