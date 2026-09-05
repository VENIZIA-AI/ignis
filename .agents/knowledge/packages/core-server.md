---
type: Package
title: core-server
description: The main IGNIS framework package - the server layer on top of the browser-pure kernel: application lifecycle, connectors, and the built-in components.
resource: packages/core-server
tags: [packages, core-server, framework]
---

`@venizia/ignis` is the main framework package - the top of the dependency chain
(`dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core`). `filter` is
isomorphic and depends on `inversion` only; `kernel` is the browser-pure tree; `boot` is a leaf beside
`kernel` that core does not depend on (an application declares it itself for the generator). Core is built on Hono for HTTP and
Drizzle ORM for SQL access, with `hono`, `drizzle-orm`, `zod`, `@hono/zod-openapi`, and `jose` as
required peers. Database clients (`pg`, `postgres`, `@libsql/client`, `typesense`, `meilisearch`)
and `socket.io` are optional peers installed only by apps that need them.

## Core and the kernel

The engine-neutral, browser-pure half of the framework lives in `@venizia/ignis-kernel`: the DI
`Container`, `AbstractApplication` / `RestApplication`, the base component, controller, datasource,
model, provider, repository and service classes, the `@controller` / `@repository` / `@datasource` /
`@model` decorator layer, `MetadataRegistry`, the binding-key namespaces, and the authentication and
authorization seams. `packages/core-server/src/index.ts` re-exports the kernel barrel wholesale, so
`@venizia/ignis` keeps its published name and its full public surface - no consumer import changed.

Core keeps only what needs node or a server peer: `ServerApplication` and `BaseApplication`, the
gRPC controller tier, the connectors, the built-in components, and the app-error and request-spy
middlewares.

## Application lifecycle

`BaseApplication` (`src/base/applications/base.ts`) extends `ServerApplication`, which extends the
kernel's `RestApplication` and `AbstractApplication`. It runs twelve ordered phases:
`staticConfigure`, `preConfigure`, `hydrateSecrets`, `registerDataSources`, `registerComponents`,
`wireSecretRotatables`, `registerControllers`, `postConfigure`, `verifyBindings` (opt-in through
`configs.bootChecks.binding.doVerify`), `setupMiddlewares`, `start`, `executePostStartHooks`.
The full server boot sequence is 15 named steps, ending `postConfigure -> verifyBindings ->
validateScopeFilterSupport`. See [Application lifecycle](/architecture/application-lifecycle.md) for the
full contract.

## Controllers

`BaseRestController` (`packages/kernel/src/base/controllers/rest/`) wraps an `OpenAPIHono` router.
Routes can be defined three ways in the same controller: decorator (`@get`, `@post`, `@put`,
`@patch`, `@del`), imperative (`this.defineRoute({ configs, handler })`), or fluent
(`this.bindRoute({ configs }).to({ handler })`). `ControllerFactory.defineCrudController()`
(`packages/kernel/src/base/controllers/factory/`) generates a full CRUD controller from an entity and
repository. gRPC controllers (ConnectRPC) are the one controller tier left in core
(`src/base/controllers/grpc/`) and register through the same `@controller` decorator with
`transport: 'grpc'`. See [Controller system](/architecture/controller-system.md).

## Repository hierarchy

One engine-neutral `AbstractRepository` (`packages/kernel/src/base/repositories/core/`) extends
`BaseHelper` and resolves the datasource/entity lazily; every verb is abstract. Above it sits one
shared chain per connector paradigm, not per engine. The SQL chain lives in `src/connectors/relational`:
`RelationalBaseRepository -> ReadableRelationalRepository -> PersistableRelationalRepository ->
DefaultRelationalRepository -> SoftDeletableRelationalRepository`. Postgres and SQLite each subclass
that chain one-for-one, rebinding only the two engine-facing type parameters - the postgres binding
is `PostgresBaseRepository -> ReadableRepository -> PersistableRepository -> DefaultCRUDRepository ->
SoftDeletableRepository` (the recommended default is `PersistableRepository` or above). The search
chain in `src/connectors/search` mirrors the shape as `SearchBaseRepository ->
ReadableSearchRepository -> PersistableSearchRepository -> DefaultSearchRepository` and has no
transaction support; `typesense` and `meilisearch` add no repository classes at all, only query
dialects. See [Repository hierarchy](/architecture/repository-hierarchy.md).

Hidden fields (`@model` `hiddenProperties`) and default filters (`@model` `defaultFilter`, e.g. soft
delete) are applied at the SQL/query level by each connector's base repository, not by post-processing
the result.

## DataSources and connectors

The engine-neutral bases live in the kernel; every engine-specific implementation lives under
`src/connectors/`, as two paradigm layers plus four engines: `relational` (engine-neutral SQL) with
`postgres` (drivers node-postgres, postgres-js, PGlite, plus Supabase) and `sqlite` (libsql driver)
on top of it, and `search` (engine-neutral) with `typesense` and `meilisearch` on top of it. The root
barrel re-exports only the `postgres` connector, because it never value-imports a client library;
`relational`, `sqlite`, `search`, `typesense` and `meilisearch` are sub-path exports only
(`@venizia/ignis/relational`, `/sqlite`, `/search`, `/typesense`, `/meilisearch`), which is what keeps
their client packages optional peers. A datasource's driver is named by passing the driver CLASS to
`@datasource({ driver })`, not a string - a class reference is what actually pulls an optional peer
into a consumer's bundle. DataSources auto-discover their schema from every `@repository` binding that
references them; no manual schema wiring is needed.

## Components

Built-in components live in `src/components/`: `HealthCheckComponent`, `ApiReferenceComponent`
(interactive OpenAPI UI, Scalar or Swagger UI - the successor to `SwaggerComponent`, whose deprecated
`Swagger*` aliases are all REMOVED), `AuthenticateComponent` (JWT + Basic strategies), `AuthorizeComponent` (Casbin
RBAC), `RequestTrackerComponent`, `RestComponent`, `GrpcComponent`, `StaticAssetComponent`,
`MailComponent`, `SocketIOComponent`, and `WebSocketComponent`. The root barrel carries
`AuthenticateComponent`, `AuthorizeComponent`, `HealthCheckComponent`, `RequestTrackerComponent`,
`ApiReferenceComponent`, and `RestComponent`; `GrpcComponent`, `MailComponent`, `SocketIOComponent`,
`StaticAssetComponent`, and `WebSocketComponent` are excluded from the barrel and must be imported
from their sub-path (`@venizia/ignis/grpc`, `/mail`, `/socket-io`, `/static-asset`, `/websocket`).
See [component model](/architecture/component-model.md) and the
[components catalog](/reference/components.md).

## Gotchas

- Every constructor parameter of a container-instantiated class (controller, service, repository) must carry `@inject` - mixing decorated and undecorated parameters is refused at boot.
- The kernel is browser-pure and the boundary is machine-checked by `make purity`: it reaches Drizzle only through `import type` and must never value-import a client library. In core, only `src/connectors/<engine>/` may.
- Core API queries (`this.dataSource.connector`) are faster but skip relation loading; use the query API (`this.dataSource.connector.query`) when `include` is needed.

## Related

- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Controller system](/architecture/controller-system.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [boot](/packages/boot.md)
