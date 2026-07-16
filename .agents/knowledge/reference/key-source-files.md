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
| `packages/inversion/src/container/abstract.ts` | `AbstractContainer` - the bottom of the container class chain, extends `BaseHelper`. |
| `packages/inversion/src/container/base.ts` | `BaseContainer` - adds binding storage/resolution on top of `AbstractContainer`. |
| `packages/inversion/src/container/container.ts` | `Container` - the concrete IoC container; `AbstractApplication` extends it directly. |
| `packages/inversion/src/binding/binding.ts` | `Binding` - the fluent per-key API (scope, value/class, tags, caching). |
| `packages/inversion/src/metadata/injectors.ts` | Where `@inject` metadata is recorded and later read during constructor/property resolution. |
| `packages/core/src/base/applications/abstract.ts` | `AbstractApplication` - extends `Container`, owns the Hono server instance and port resolution. |
| `packages/core/src/base/applications/base.ts` | `BaseApplication` - the boot-aware application base combining all mixins and the lifecycle phases. |
| `packages/core/src/common/bindings.ts` | `BindingNamespaces` and `CoreBindings` const-classes - every namespace and core binding key in one place. |
| `packages/boot/src/base/base-artifact-booter.ts` | `BaseArtifactBooter` - the template-method base every built-in booter extends (configure -> discover -> load). |
| `packages/boot/src/booters/index.ts` | Barrel for the four built-in booters: controller, service, repository, datasource. |
| `packages/core/src/base/repositories/core/abstract.ts` | `AbstractRepository` - the one engine-neutral repository base every connector chain builds on. |
| `packages/core/src/connectors/postgres/repositories/core/index.ts` | The concrete relational repository chain, plus the `DefaultRelationalRepository as DefaultCRUDRepository` back-compat alias. |
| `packages/core/src/base/datasources/abstract.ts` | `AbstractDataSource` - engine-neutral datasource root; no SQL, no document-store specifics. |
| `packages/core/src/base/components/base.ts` | `BaseComponent` - the base every pluggable component (health check, auth, mail, Socket.IO, ...) extends. |
| `packages/core/src/base/metadata/persistents.ts` | `registerDataSourceInjection` - the strict logic behind `@repository`'s auto-injected DataSource at constructor param[0]. |
| `packages/core/src/base/repositories/query-schemas/filter.ts` | The Zod `FilterSchema`/`InclusionSchema` definitions consumed by every repository find method. |

## Related

- [Source map](/reference/source-map.md)
- [DI container](/architecture/di-container.md)
- [Boot lifecycle](/architecture/boot-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
