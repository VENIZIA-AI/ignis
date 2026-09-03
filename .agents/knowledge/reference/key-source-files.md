---
type: Reference
title: Key source files
description: The handful of files that matter most when orienting in the IGNIS codebase.
resource: .
tags: [reference, orientation, source-files]
---

A curated shortlist, not a listing - see [source map](/reference/source-map.md) for the full,
generated file inventory.

| Path | Why it matters |
|---|---|
| `Makefile` | Root entry point for build, lint, and OKF (`okf-check`/`okf-gen`) targets across every package. |
| `packages/dev-configs/tsconfig/tsconfig.base.json` | Shared compiler base; sets `experimentalDecorators` + `emitDecoratorMetadata`, without which no `@inject`/`@controller`/`@repository` decorator works. |
| `packages/inversion/src/modules/container/abstract.ts` | `AbstractContainer` - the bottom of the container class chain, extends `BaseHelper`. |
| `packages/inversion/src/modules/container/base.ts` | `BaseContainer` - adds binding storage/resolution on top of `AbstractContainer`. |
| `packages/inversion/src/modules/container/container.ts` | `Container` - the concrete IoC container; `AbstractApplication` extends it directly. |
| `packages/inversion/src/modules/binding/binding.ts` | `Binding` - the fluent per-key API (scope, value/class, tags, caching). |
| `packages/inversion/src/modules/metadata/injectors.ts` | Where `@inject` metadata is recorded and later read during constructor/property resolution. |
| `packages/kernel/src/base/applications/abstract.ts` | `AbstractApplication` - extends `Container`; container, config, host/port resolution and lifecycle hooks. No router, no server, no `process` access. |
| `packages/kernel/src/base/applications/rest.ts` | `RestApplication` - adds the `OpenAPIHono` router on top of `AbstractApplication`, still without a listening server. |
| `packages/core-server/src/base/applications/server.ts` | `ServerApplication` - the only layer that binds a socket (`Bun.serve` / `@hono/node-server`), and the layer that restores env and cwd defaults. |
| `packages/core-server/src/base/applications/base.ts` | `BaseApplication` - the boot-aware application base combining all mixins and the lifecycle phases. |
| `packages/kernel/src/common/bindings.ts` | `BindingNamespaces` and `CoreBindings` const-classes - every namespace and core binding key in one place. |
| `packages/boot/src/base/base-artifact-booter.ts` | `BaseArtifactBooter` - the template-method base every built-in booter extends (configure -> discover -> load). |
| `packages/boot/src/booters/index.ts` | Barrel for the four built-in booters: controller, service, repository, datasource. |
| `packages/kernel/src/base/repositories/core/abstract.ts` | `AbstractRepository` - the one engine-neutral repository base every connector chain builds on. |
| `packages/core-server/src/connectors/postgres/repositories/core/index.ts` | The Postgres repository chain - five real subclasses of the neutral `connectors/relational` chain, each rebinding `ExtraOptions` and `TDataSource` to the Postgres types. |
| `packages/kernel/src/base/datasources/abstract.ts` | `AbstractDataSource` - engine-neutral datasource root; no SQL, no document-store specifics. |
| `packages/kernel/src/base/components/base.ts` | `BaseComponent` - the base every pluggable component (health check, auth, mail, Socket.IO, ...) extends. |
| `packages/kernel/src/base/metadata/persistents.ts` | `registerDataSourceInjection` - the strict logic behind `@repository`'s auto-injected DataSource at constructor param[0]. |
| `packages/filter/src/schemas/builder.ts` | `buildQuerySchemas({ decorate })` - the Zod `FilterSchema`/`InclusionSchema` definitions consumed by every repository find method, built with plain `zod` so they stay browser-usable. |
| `packages/kernel/src/base/repositories/query-schemas/index.ts` | The server-side re-export that decorates those schemas for OpenAPI. Its side-effect `import '@hono/zod-openapi'` is load-order-critical: `.openapi()` must be patched onto the shared `ZodType` prototype before `buildQuerySchemas` runs at module scope. |

## Related

- [Source map](/reference/source-map.md)
- [DI container](/architecture/di-container.md)
- [Boot lifecycle](/architecture/boot-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
