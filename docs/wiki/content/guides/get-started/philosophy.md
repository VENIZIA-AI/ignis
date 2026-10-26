# Philosophy

A REST API that grows past a handful of endpoints needs somewhere for its code to live: how
classes find each other, where data access sits, how a route is validated and documented. IGNIS
answers that on top of Hono. Structure - dependency injection, a layered shape, generated OpenAPI
docs - is part of the framework, so each team doesn't invent its own.

## What IGNIS gives you

- A standalone dependency injection container (`@venizia/ignis-inversion`), with `@inject`,
  singleton and transient scopes, and constructor injection. It is a small package with one
  dependency, `reflect-metadata`, and it imports nothing else from IGNIS.
- A layered shape: Controller -> Service (optional) -> Repository -> DataSource -> a database. The
  database is PostgreSQL (three drivers, PGlite included) or SQLite. Search engines (Typesense,
  Meilisearch) and a browser-side HTTP connector plug in behind the same repository contract.
- Request validation and OpenAPI docs generated from the same Zod schema, so they can't drift
  apart.
- A decorator-driven artifact system. `@controller`, `@service`, `@repository` and `@datasource`
  mark your classes, and the application registers them at boot, before `preConfigure()`. You pick
  how the list is built:
  - `ignis-artifacts generate` writes an index file at build time. It works on Node and Bun, and
    `ignis-artifacts check` fails CI when the file is stale.
  - `@venizia/ignis-boot/auto` needs no file. A Bun plugin scans `src` when the application starts
    (the first start parses the sources; the result is cached, so later starts skip the scan) and
    inlines the list when you build a binary. On Node there is no plugin API, so use the generator.

  Neither mode enforces a file-naming convention. See [Bootstrapping](../core-concepts/application/bootstrapping).
- Access control in the repository, not in each route: a row scope with a write guard, query
  defaults, and a CRUD controller that refuses to boot when a write route would inherit a read-only
  authorize. See [What IGNIS offers today](#what-ignis-offers-today).

IGNIS aims for guided flexibility: sensible conventions, with an override for every one of them.

## Performance

IGNIS runs on Hono, so routing and middleware are Hono's. The repository holds no benchmark, so
this page states no throughput, startup or memory figures. Measure your own workload before you
decide; the layers above Hono (injection, validation, repositories) cost something that depends on
what your endpoints do.

## Runtimes

| Where | Runtime |
|---|---|
| Server (`@venizia/ignis`) | Bun and Node |
| `inversion`, `filter`, `kernel`, `worker`, and `connectors` without a database driver | Also a browser or Web Worker |
| `helpers` | The root is server-only; `/core`, `/common`, `/uuid`, `/temporal` and `/socket-io/client` run in a browser |

A browser entry bundles with plain `vite build`, no Node polyfill. The CI purity gate fails when an
entry reaches a Node builtin. See [Using IGNIS in a Browser or Web Worker](../core-concepts/browser-and-web-worker).

## What IGNIS offers today

The 0.4 line added the pieces a multi-tenant API needs. Each links to its guide or changelog.

| Need | What IGNIS gives you |
|---|---|
| Keep a caller inside its own rows | An `access` scope on the model; creates and updates are checked against it, and shared rows need `write.sharedRows` ([Model settings](../core-concepts/persistent/model-settings)) |
| Default filters and limits per model | `query.filter` and `query.limit` in the model settings |
| Safe CRUD controllers | `defineCrudController` refuses to boot when a write route would inherit a read-only `authorize` |
| Scoped search | `defineSearchController({ scope })` applies the scope on the server |
| Clean shutdown | `installShutdownSignals()` stops the application on SIGTERM and SIGINT |
| Code in a browser or worker | The browser-pure entries and the `worker` package |
| Upgrading settings | `devz codemod model-settings --write` rewrites old model settings |

## Maturity, honestly

| Aspect | State |
|---|---|
| First npm release | December 2025 |
| Version line | 0.4, pre-1.0: a patch release can carry a breaking change, labeled in the [changelog](/changelogs/) with how to migrate |
| Production ready | Early stage |
| Backing | Independent |
| Components | Built in: authentication, API reference, health check, mail, request tracker, socket.io, static assets, WebSocket |
| Community packages | Few |
| LTS | None yet |

The framework is young. Expect the API to keep moving until 1.0.

## When to use IGNIS, and when not to

| Situation | Verdict | Why |
|---|---|---|
| Medium API, 10-100 endpoints | Yes | Structure prevents spaghetti code |
| Any team size, solo to large | Yes | The same patterns scale either way |
| Want dependency injection with a small container | Yes | `@venizia/ignis-inversion` stands alone |
| Need a database, auth, and OpenAPI docs | Yes | All built in, ready to use |
| Bun-first development | Yes | Native Bun support, single-binary builds |
| Growing out of a plain Hono project | Yes | Same foundation, incremental migration |
| 3-5 endpoints, solo developer | Maybe | Start with Hono; migrate later if it grows |
| Quick prototype or MVP | No | Plain Hono gets you to a first endpoint faster |
| Simple proxy or webhook handler | No | The structure is overhead you don't need |

Plain Hono is also the better fit when you're learning web development from scratch or deploying to
the edge, where every millisecond of cold start counts.

## What's still forming

Choosing IGNIS today trades a mature ecosystem for early access to a structured server framework.
You get the dependency injection container, the repository pattern, Zod validation, and OpenAPI
docs generated from the same schemas. IGNIS apps also compile to a single executable with Bun.

What you don't get yet: a large plugin ecosystem, extensive community packages, or a formal LTS
release.

## Next steps

1. [Check prerequisites](./setup) - install the required tools.
2. [Complete the installation](../tutorials/complete-installation) - build your first endpoint.
3. [Build a CRUD API](../tutorials/building-a-crud-api) - build a complete API.
