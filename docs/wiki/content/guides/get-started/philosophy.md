# Philosophy

Building a REST API on Node or Bun means picking a side. Minimal frameworks give you speed and a
blank page. Enterprise frameworks give you structure, and ask you to pay for it in ceremony.
IGNIS is the third option: LoopBack 4's architecture, running on Hono.

## The three-way landscape

| Category | Frameworks | What you trade |
|---|---|---|
| Minimal | Express, Hono, Fastify, Koa | Freedom and a small surface for do-it-yourself architecture |
| Balanced | IGNIS, Ts.ED | Built-in structure on a small engine, for a younger ecosystem |
| Enterprise | NestJS, LoopBack 4, AdonisJS | Proven structure for more ceremony and a steeper learning curve |

IGNIS sits in the balanced row on purpose.

## Why IGNIS exists

Three frameworks shaped the decision, and each fell short in a specific way.

**LoopBack 4** had the right architectural ideas: decorators, the `@repository` pattern, a
DataSource abstraction, a Component system, a Booter system. It is still maintained - its
[README](https://github.com/loopbackio/loopback-next#long-term-support) lists LoopBack 4 as
"Current" with a minimum support date of April 2028, and says no LTS release exists for it yet
(the [LTS page](https://loopback.io/doc/en/contrib/Long-term-support.html) points to that table).
It runs on Express, and IGNIS wanted Hono instead.

**NestJS** is popular and full-featured. But it puts an adapter layer over Express or Fastify,
and it asks for a lot of ceremony along the way.

**Hono** is small, fast and deliberately unopinionated: a router and middleware, and nothing else.
No dependency injection, no repository pattern, no convention for where code lives. That's fine
for one microservice, and painful once an API grows past a handful of endpoints.

IGNIS keeps LoopBack 4's architecture and swaps its engine for Hono. Concretely, that means:

- A standalone dependency injection container (`@venizia/ignis-inversion`), with `@inject`,
  singleton and transient scopes, and constructor injection. It is a small package with one
  dependency, `reflect-metadata`, and it imports nothing else from IGNIS.
- The same layered shape LoopBack 4 popularized: Controller -> Service (optional) -> Repository ->
  DataSource -> a database. The database is PostgreSQL (three drivers, PGlite included) or SQLite.
  Search engines (Typesense, Meilisearch) and a browser-side HTTP connector plug in behind the same
  repository contract.
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

## What you get, compared

| Aspect | Minimal (Hono, Express) | Enterprise (NestJS, LoopBack 4) | IGNIS |
|---|---|---|---|
| Learning curve | Low | High | Medium |
| Boilerplate | Minimal | Heavy | Moderate |
| Type safety | Manual | Excellent | Excellent |
| Dependency injection | Manual | Built-in, full-featured | Built-in, small container |
| Layered architecture | DIY | Enforced | Guided |
| Repository pattern | DIY | Built-in | Built-in |
| Validation | Third-party | Built-in | Built-in (Zod) |
| OpenAPI / Swagger | Third-party | Built-in | Built-in |
| Authentication | DIY | Built-in | Component |

Minimal frameworks give you total freedom. Enterprise frameworks are opinionated. IGNIS aims for a
third mode - guided flexibility: sensible conventions, with an override for every one of them.

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

The architecture is proven, because it is LoopBack 4's. The framework carrying it is new.

## When to use IGNIS, and when not to

| Situation | Verdict | Why |
|---|---|---|
| Medium API, 10-100 endpoints | Yes | Structure prevents spaghetti code |
| Any team size, solo to large | Yes | The same patterns scale either way |
| Want DI without NestJS or LoopBack 4's weight | Yes | A small container |
| Coming from NestJS or LoopBack 4 | Yes | Familiar patterns on Hono |
| Need a database, auth, and OpenAPI docs | Yes | All built in, ready to use |
| Bun-first development | Yes | Native Bun support, single-binary builds |
| Growing out of a plain Hono project | Yes | Same foundation, incremental migration |
| 3-5 endpoints, solo developer | Maybe | Start with Hono; migrate later if it grows |
| Quick prototype or MVP | No | Plain Hono gets you to a first endpoint faster |
| Simple proxy or webhook handler | No | The structure is overhead you don't need |

Two situations push you toward an alternative even outside this table:

- Reach for **NestJS or LoopBack 4** if you need a large team (10+ developers) held to strict
  enterprise standards, complex microservice patterns like CQRS, or a hiring pool that already
  knows the framework.
- Reach for **plain Hono, Fastify, or Express** if you're learning web development from scratch or
  deploying to the edge, where every millisecond of cold start counts.

## What's still forming

Choosing IGNIS today trades a mature ecosystem for early access to a leaner enterprise framework.
You get the dependency injection container, the repository pattern, Zod validation, and OpenAPI
docs generated from the same schemas. IGNIS apps also compile to a single executable with Bun.

What you don't get yet: a large plugin ecosystem, extensive community packages, or a formal LTS
release.

## Next steps

1. [Check prerequisites](./setup) - install the required tools.
2. [Complete the installation](../tutorials/complete-installation) - build your first endpoint.
3. [Build a CRUD API](../tutorials/building-a-crud-api) - build a complete API.
