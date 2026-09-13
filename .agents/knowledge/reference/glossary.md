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
sequence is the ordered step list in [application lifecycle](/architecture/application-lifecycle.md):
`initialize()` runs those steps, and `start()` calls `initialize()`, then `setupMiddlewares()`, before
binding the socket - `setupMiddlewares` is not itself a boot step.

**Artifact** - A decorated class (`component`, `controller`, `service`, `repository`, or
`datasource`) that `ignis-artifacts generate` finds by AST scan, listed in
`src/generated/artifacts.ts`. The `registerArtifacts` boot step binds that file's
`configs.artifacts` index into the container. Not to be confused with a claude.ai Artifact. See
[artifact registration](/architecture/boot-lifecycle.md).

**BaseHelper** - `packages/helpers/src/modules/base.ts`. The base class every helper (and most
core/inversion classes) extends for a `scope`-tagged, per-method logger via `this.logger.for(...)`.
See [helpers](/packages/helpers.md).

**Binding** - `packages/inversion/src/modules/binding/binding.ts`. The fluent object wrapping one
container entry: its key, value/class, scope (`singleton`/`transient`), and tags. See
[DI container](/architecture/di-container.md).

**Binding key** - The string identifier a `Binding` is registered under, namespaced as
`<namespace>.<Name>` (e.g. `repositories.UserRepository`). See `CoreBindings` and
`BindingNamespaces` in `packages/kernel/src/common/bindings.ts`, and
[binding key namespaces](/conventions/binding-key-namespaces.md).

**Component** - `BaseComponent` in `packages/kernel/src/base/components/base.ts`. A pluggable unit an
application registers via `registerComponents()` to add cross-cutting behaviour (health checks,
Swagger/API-reference, auth, mail, Socket.IO, static assets, request tracking). See
[component model](/architecture/component-model.md).

**Concept** - One frontmattered markdown file inside `.agents/knowledge/`, identified by its
bundle-relative id (leading slash, no extension). The unit the OKF tooling parses, links, and gates.

**Connector** - A paradigm-specific implementation family in `@venizia/ignis-connectors`
(`packages/connectors/src/`), split into the `relational` and `search` tiers with the engines
(`postgres`, `sqlite`; `typesense`, `meilisearch`) nested under each, providing the DataSource and
repository chain for one storage engine. `packages/core-server/src/connectors/` is an alias barrel
kept so published `@venizia/ignis` sub-paths keep resolving. See [connectors](/packages/connectors.md).

**Container** - `Container` in `packages/inversion/src/modules/container/container.ts`, built on
`BaseContainer` -> `AbstractContainer` (`packages/inversion/src/modules/container/base.ts` and
`abstract.ts`). Holds all `Binding`s, resolves instances, and drives constructor/property injection.
`AbstractApplication` extends it directly. See [DI container](/architecture/di-container.md).

**Controller** - A class decorated with `@controller` (or built imperatively/fluently) that wraps an
`OpenAPIHono` instance and registers routes typed via `@hono/zod-openapi`. See
[controller system](/architecture/controller-system.md).

**DataSource** - `AbstractDataSource` in `packages/kernel/src/base/datasources/abstract.ts`. An
engine-neutral, singleton connection-pool wrapper; concrete per-connector subclasses add the SQL or
document-store specifics. See [datasource hierarchy](/architecture/datasource-hierarchy.md).

**Filter** - The `{ where, order, limit, offset, skip, fields, include }` Zod schema family a
repository's find methods accept, defined in `packages/filter/src/schemas/` (`@venizia/ignis-filter`,
plain Zod so a browser can use it) and re-exported with OpenAPI metadata by
`packages/kernel/src/base/repositories/query-schemas/index.ts` for server use. See
[filter system](/architecture/filter-system.md).

**Helper** - Any production-ready utility class under `packages/helpers/src/modules/` (Logger,
Redis, Queue, Storage, Crypto, Cron, Socket.IO, Network, UID, Worker, Secrets) - always extending
`BaseHelper`. See [helpers](/packages/helpers.md).

**Injection (`@inject`)** - The parameter/property decorator in
`packages/inversion/src/modules/metadata/injectors.ts` that records a binding key for the container
to resolve at instantiation time. Every constructor parameter of a container-instantiated class must
carry one - no mixing decorated and undecorated parameters. See
[DI container](/architecture/di-container.md).

**Kernel** - `packages/kernel`, the browser-pure package holding the DI, lifecycle, controller,
repository, datasource and auth abstractions - no node builtin, no server-only peer. `core`
re-exports it in full, so most `base/` abstractions live here while `core` keeps the server-side
application, connectors and middlewares. See [kernel](/packages/kernel.md).

**Managed region** - A block inside an otherwise hand-authored OKF file delimited by
`<!-- okf:generated:<id> start -->` ... `<!-- okf:generated:<id> end -->` that the generator may
overwrite; everything outside such a region is never touched.

**Mixin** - An interface contract (`IComponentMixin`, `IRepositoryMixin`, `IServiceMixin`,
`IControllerMixin`, `IServerConfigMixin`, `IStaticServeMixin` in
`packages/kernel/src/base/mixins/common/types.ts`) composed onto `BaseApplication` to add `component()`,
`repository()`, `service()`, `controller()` registration methods. The older `FieldsVisibilityMixin`
and `DefaultFilterMixin` no longer exist - their behaviour was folded into the repository base
classes directly. See [kernel](/packages/kernel.md).

**Model** - An `AbstractEntity` subclass (`packages/kernel/src/base/models/base.ts`) pairing a name
with a Drizzle or document schema via `getSchema()`, plus `@model` settings (`hiddenProperties`,
`defaultFilter`) read by the repository layer. See [kernel](/packages/kernel.md).

**Namespace** - The fixed first segment of a binding key, one of the `BindingNamespaces` constants
(`components`, `datasources`, `repositories`, `models`, `services`, `middlewares`, `providers`,
`controllers`, `configurations`). See [binding key namespaces](/conventions/binding-key-namespaces.md).

**OKF** - The knowledge-bundle format this directory (`.agents/knowledge/`) is written in:
frontmattered markdown concept files, generated and gated by `.agents/knowledge-tools/okf.ts`
(`gen`, `check`, `coverage`, `viz` subcommands). The separate `ignis-atlas` package serves the same
bundle over MCP. See [atlas](/packages/atlas.md).

**Provider** - `BaseProvider<T>` in `packages/kernel/src/base/providers/base.ts`, implementing
`IProvider<T>` - a class that produces a bound value (e.g. a middleware handler) rather than being
injected directly. See [kernel](/packages/kernel.md).

**Repository** - `AbstractRepository` in `packages/kernel/src/base/repositories/core/abstract.ts`, the
engine-neutral base. Each connector builds its own concrete chain on top (relational:
`ReadableRelationalRepository` -> `PersistableRelationalRepository` -> `DefaultRelationalRepository`
(renamed by a thin Postgres subclass, `DefaultCRUDRepository`) -> `SoftDeletableRelationalRepository`;
search: the mirrored `ReadableSearchRepository` -> `PersistableSearchRepository` ->
`DefaultSearchRepository`). See [repository hierarchy](/architecture/repository-hierarchy.md).

**Schema** - The Drizzle `pgTable` definition (or document-store equivalent) a Model's `getSchema()`
returns; also the Zod schema family under `query-schemas/` describing filter shapes. See
[relational connector](/architecture/relational-connector.md).

**Scope (singleton/transient)** - A `Binding`'s lifecycle mode, `BindingScopes.SINGLETON` or
`BindingScopes.TRANSIENT` (`packages/inversion/src/modules/binding/common/constants.ts`). Singleton
caches the resolved instance; transient resolves fresh every time. See
[DI container](/architecture/di-container.md).

**Service** - An `IService`-implementing class holding business logic between a Controller and one or
more Repositories; optional in the layered architecture. See
[what is IGNIS](/overview/what-is-ignis.md).

**Transaction** - An `ITransaction` obtained via a DataSource's `beginTransaction()`
(`packages/kernel/src/base/datasources/abstract.ts`), passed through repository calls as
`options.transaction` and closed with `commit()` or `rollback()`. See
[transactions](/architecture/transactions.md).

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [DI container](/architecture/di-container.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Key source files](/reference/key-source-files.md)
