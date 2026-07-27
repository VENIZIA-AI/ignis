---
type: Package
title: core
description: The main IGNIS framework package - application lifecycle, controllers, repositories, datasources, and components built on Hono and Drizzle.
resource: packages/core
tags: [packages, core, framework]
---

`@venizia/ignis` is the main framework package - the top of the dependency chain (`dev-configs -> inversion -> helpers -> boot -> core`). It provides `BaseApplication`, controllers, the repository hierarchy, datasources, models, services, and the built-in components. It is built on Hono for HTTP and Drizzle ORM for SQL access, with `hono`, `drizzle-orm`, `zod`, `@hono/zod-openapi`, and `jose` as required peers. Database clients (`pg`, `postgres`, `typesense`, `meilisearch`) and `socket.io` are optional peers installed only by apps that need them.

## Application lifecycle

`BaseApplication` (`src/base/applications/`) runs nine ordered phases: `staticConfigure`, `preConfigure`, `registerDataSources`, `registerComponents`, `registerControllers`, `postConfigure`, `setupMiddlewares`, `start`, `executePostStartHooks`. See [Application lifecycle](/architecture/application-lifecycle.md) for the full contract.

## Controllers

`BaseRestController` (`src/base/controllers/`) wraps an `OpenAPIHono` router. Routes can be defined three ways in the same controller: decorator (`@get`, `@post`, `@put`, `@patch`, `@del`), imperative (`this.defineRoute({ configs, handler })`), or fluent (`this.bindRoute({ configs }).to({ handler })`). `ControllerFactory.defineCrudController()` generates a full CRUD controller from an entity and repository. gRPC controllers (ConnectRPC) register through the same `@controller` decorator with `transport: 'grpc'`. See [Controller system](/architecture/controller-system.md).

## Repository hierarchy

One engine-neutral `AbstractRepository` (`src/base/repositories/core/`) extends `BaseHelper` and resolves the datasource/entity lazily; every verb is abstract. Each connector implements its own concrete hierarchy on top of it directly - there is no shared mixin layer anymore. The postgres branch is `PostgresBaseRepository -> ReadableRepository -> PersistableRepository -> DefaultCRUDRepository` (the recommended default is `PersistableRepository` or above). The search branch (`src/connectors/typesense`, sub-path export only) mirrors it as `TypesenseBaseRepository -> ReadableSearchRepository -> PersistableSearchRepository -> DefaultSearchRepository` and has no transaction support. See [Repository hierarchy](/architecture/repository-hierarchy.md).

Hidden fields (`@model` `hiddenProperties`) and default filters (`@model` `defaultFilter`, e.g. soft delete) are applied at the SQL/query level by each connector's base repository, not by post-processing the result.

## DataSources and connectors

`src/base` holds only engine-neutral code; every engine-specific implementation lives under `src/connectors/<engine>/` (`postgres`, `typesense`, `meilisearch`, plus the engine-neutral `search` paradigm shared by search engines). The root barrel re-exports only the `postgres` connector, because it never value-imports a client library; `typesense` and `meilisearch` are sub-path exports only (`@venizia/ignis/typesense`, `@venizia/ignis/meilisearch`) so their client packages stay optional peers. A datasource's driver is named by passing the driver CLASS to `@datasource({ driver })`, not a string - a class reference is what actually pulls an optional peer into a consumer's bundle. DataSources auto-discover their schema from every `@repository` binding that references them; no manual schema wiring is needed.

## Components

Built-in components live in `src/components/`: `HealthCheckComponent`, `ApiReferenceComponent` (interactive OpenAPI UI, Scalar or Swagger UI - the renamed successor to `SwaggerComponent`, kept as a deprecated alias), `AuthenticationComponent` (JWT + Basic strategies), `AuthorizationComponent` (Casbin RBAC), `RequestTrackerComponent`, `StaticAssetComponent`, `MailComponent`, and `SocketIOComponent`. `AuthenticationComponent`, `RequestTrackerComponent`, and `ApiReferenceComponent` are in the root barrel; `MailComponent`, `SocketIOComponent`, and `StaticAssetComponent` are excluded from the barrel and must be imported from their sub-path. See [Component model](/reference/components.md).

## Gotchas

- Every constructor parameter of a container-instantiated class (controller, service, repository) must carry `@inject` - mixing decorated and undecorated parameters is refused at boot.
- `src/base` must never import a connector package (`pg`, `drizzle-orm`, `typesense`) directly; only `src/connectors/<engine>/` may.
- Core API queries (`this.dataSource.connector`) are faster but skip relation loading; use the query API (`this.dataSource.connector.query`) when `include` is needed.

## Related

- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Controller system](/architecture/controller-system.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [boot](/packages/boot.md)
