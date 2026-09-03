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

Open a second tab and it works too. Only one tab runs the Worker; the rest are forwarded to it.

## The front end is a normal react-admin app

`@minimaltech/ra-core-infra` is wired exactly as it would be against a real server: an inversion
container, `DefaultRestDataProvider` pointed at `/api`, and `CoreRaApplication` rendering a
`notes` resource. Nothing in it knows a Worker exists.

The whole integration is one call to `installBffFetch`, which gives the page a `fetch` that answers
`/api/*` from the Worker and passes everything else to the network. The data provider reaches the
network through `NodeFetchNetworkRequest`, which calls the global `fetch` and accepts no custom
fetcher - so intercepting `fetch` is what makes an in-browser backend a drop-in swap rather than a
fork of the provider.

It started here as twelve lines of example code. It now ships in `@venizia/ignis-worker`, because
every consumer of a browser BFF needs the same seam and the example's version had a bug the package
does not: it built a `Request` to read the URL, which in Chromium marks the original body disturbed,
so a passed-through POST reached the network unreadable.

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
| `src/bff.ts` | the UI half - a `SharedBffTransport` plus the base path both halves agree on |
| `src/main.tsx` | installs the `fetch` bridge, then renders the react-admin application |
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

## Many tabs, one database

`src/bff.ts` uses `SharedBffTransport`, so opening a second tab is not a problem the reader has to
work around.

Without it, the second tab is dead. PGlite in `opfs-ahp://` mode holds an exclusive OPFS access
handle, and those handles are exclusive per **origin** - so a second tab starting its own Worker
cannot open the database at all. Measured in Chromium: the first tab keeps working, and the second
renders its UI while every call fails with `Access Handles cannot be created if there is another
open Access Handle or Writable stream associated with the same file`.

The transport elects one tab with the Web Locks API, gives that tab the Worker, and forwards every
other tab's request to it over a `BroadcastChannel` - in the same envelope the Worker already
speaks. Close the leading tab and a follower is promoted in place, with no reload: the browser
releases the lock when the tab goes away, a crash included.

Measured with two real tabs: tab 2 reads and writes through tab 1, and closing tab 1 promotes tab 2
mid-session, keeping every row tab 1 committed.

## Limits

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
