---
type: Glossary
title: Glossary
description: The IGNIS vocabulary an agent needs, defined in one or two lines each.
resource: .
tags: [reference, glossary]
---

Alphabetical lookup table. See [what is IGNIS](/overview/what-is-ignis.md) for the narrative version.

**Application / BaseApplication** - `BaseApplication` in `packages/core-server/src/base/applications/base.ts`
extends `AbstractApplication` (itself a `Container`), a mixin-composed REST application. Its boot
sequence runs `registerArtifacts` - binding `configs.artifacts`, the generated artifact index -
before `preConfigure` -> `registerDataSources` -> `registerComponents` -> `registerControllers` ->
`postConfigure` -> `setupMiddlewares` -> `start`.

**Artifact** - A decorated class (`component`, `controller`, `service`, `repository`, or
`datasource`) that `ignis-artifacts generate` finds by AST scan, listed in
`src/generated/artifacts.ts`. The `registerArtifacts` boot step binds that file's
`configs.artifacts` index into the container. Not to be confused with a claude.ai Artifact.

**BaseHelper** - `packages/helpers/src/modules/base.ts`. The base class every helper (and most
core/inversion classes) extends for a `scope`-tagged, per-method logger via `this.logger.for(...)`.

**Binding** - `packages/inversion/src/modules/binding/binding.ts`. The fluent object wrapping one
container entry: its key, value/class, scope (`singleton`/`transient`), and tags.

**Binding key** - The string identifier a `Binding` is registered under, namespaced as
`<namespace>.<Name>` (e.g. `repositories.UserRepository`). See `CoreBindings` and
`BindingNamespaces` in `packages/kernel/src/common/bindings.ts`.

**Component** - `BaseComponent` in `packages/kernel/src/base/components/base.ts`. A pluggable unit an
application registers via `registerComponents()` to add cross-cutting behaviour (health checks,
Swagger/API-reference, auth, mail, Socket.IO, static assets, request tracking).

**Concept** - One frontmattered markdown file inside `.agents/knowledge/`, identified by its
bundle-relative id (leading slash, no extension). The unit the OKF tooling parses, links, and gates.

**Connector** - A paradigm-specific implementation family under `packages/core-server/src/connectors/*`
(`postgres`, `sqlite`, `search`, `typesense`, `meilisearch`) providing the DataSource and repository
chain for one storage engine.

**Container** - `Container` in `packages/inversion/src/modules/container/container.ts`, built on
`BaseContainer` -> `AbstractContainer` (`packages/inversion/src/modules/container/base.ts` and
`abstract.ts`). Holds all `Binding`s, resolves instances, and drives constructor/property injection.
`AbstractApplication` extends it directly.

**Controller** - A class decorated with `@controller` (or built imperatively/fluently) that wraps an
`OpenAPIHono` instance and registers routes typed via `@hono/zod-openapi`.

**DataSource** - `AbstractDataSource` in `packages/kernel/src/base/datasources/abstract.ts`. An
engine-neutral, singleton connection-pool wrapper; concrete per-connector subclasses add the SQL or
document-store specifics.

**Filter** - The `{ where, order, limit, offset, skip, fields, include }` Zod schema family a
repository's find methods accept, defined in `packages/filter/src/schemas/` (`@venizia/ignis-filter`,
plain Zod so a browser can use it) and re-exported with OpenAPI metadata by
`packages/kernel/src/base/repositories/query-schemas/index.ts` for server use.

**Helper** - Any production-ready utility class under `packages/helpers/src/modules/` (Logger,
Redis, Queue, Storage, Crypto, Cron, Socket.IO, Network, UID, Worker, Secrets) - always extending
`BaseHelper`.

**Injection (`@inject`)** - The parameter/property decorator in
`packages/inversion/src/modules/metadata/injectors.ts` that records a binding key for the container
to resolve at instantiation time. Every constructor parameter of a container-instantiated class must
carry one - no mixing decorated and undecorated parameters.

**Kernel** - `packages/kernel`, the browser-pure package holding the DI, lifecycle, controller,
repository, datasource and auth abstractions - no node builtin, no server-only peer. `core`
re-exports it in full, so most `base/` abstractions live here while `core` keeps the server-side
application, connectors and middlewares.

**Managed region** - A block inside an otherwise hand-authored OKF file delimited by
`<!-- okf:generated:<id> start -->` ... `<!-- okf:generated:<id> end -->` that the generator may
overwrite; everything outside such a region is never touched.

**Mixin** - An interface contract (`IComponentMixin`, `IRepositoryMixin`, `IServiceMixin`,
`IControllerMixin`, `IServerConfigMixin`, `IStaticServeMixin` in
`packages/kernel/src/base/mixins/common/types.ts`) composed onto `BaseApplication` to add `component()`,
`repository()`, `service()`, `controller()` registration methods. The older `FieldsVisibilityMixin`
and `DefaultFilterMixin` no longer exist - their behaviour was folded into the repository base
classes directly.

**Model** - An `AbstractEntity` subclass (`packages/kernel/src/base/models/base.ts`) pairing a name
with a Drizzle or document schema via `getSchema()`, plus `@model` settings (`hiddenProperties`,
`defaultFilter`) read by the repository layer.

**Namespace** - The fixed first segment of a binding key, one of the `BindingNamespaces` constants
(`components`, `datasources`, `repositories`, `models`, `services`, `middlewares`, `providers`,
`controllers`, `booters`).

**OKF** - The knowledge-bundle format this directory (`.agents/knowledge/`) is written in:
frontmattered markdown concept files, generated and gated by `.agents/knowledge-tools/okf.ts`
(`gen`, `check`, `coverage`, `viz`, `mcp` subcommands).

**Provider** - `BaseProvider<T>` in `packages/kernel/src/base/providers/base.ts`, implementing
`IProvider<T>` - a class that produces a bound value (e.g. a middleware handler) rather than being
injected directly.

**Repository** - `AbstractRepository` in `packages/kernel/src/base/repositories/core/abstract.ts`, the
engine-neutral base. Each connector builds its own concrete chain on top (relational:
`ReadableRelationalRepository` -> `PersistableRelationalRepository` -> `DefaultRelationalRepository`
(aliased `DefaultCRUDRepository`) -> `SoftDeletableRelationalRepository`; search: the mirrored
`ReadableSearchRepository` -> `PersistableSearchRepository` -> `DefaultSearchRepository`).

**Schema** - The Drizzle `pgTable` definition (or document-store equivalent) a Model's `getSchema()`
returns; also the Zod schema family under `query-schemas/` describing filter shapes.

**Scope (singleton/transient)** - A `Binding`'s lifecycle mode, `BindingScopes.SINGLETON` or
`BindingScopes.TRANSIENT` (`packages/inversion/src/modules/binding/common/constants.ts`). Singleton
caches the resolved instance; transient resolves fresh every time.

**Service** - An `IService`-implementing class holding business logic between a Controller and one or
more Repositories; optional in the layered architecture.

**Transaction** - An `ITransaction` obtained via a DataSource's `beginTransaction()`
(`packages/kernel/src/base/datasources/abstract.ts`), passed through repository calls as
`options.transaction` and closed with `commit()` or `rollback()`.

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [DI container](/architecture/di-container.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Key source files](/reference/key-source-files.md)
