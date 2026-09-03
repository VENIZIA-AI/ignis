---
type: Overview
title: Design decisions
description: The non-obvious calls IGNIS makes and the reasoning behind each one.
resource: .
tags: [overview, architecture, conventions]
---

These decisions are easy to violate by accident. Each one exists for a reason beyond taste.

## Options objects everywhere

`fn({ key, value })`, never `fn(key, value)`. Positional parameters lock in call-site order
forever - adding one means touching every call site, and swapping two same-typed arguments
compiles silently and fails at runtime. An options object survives additions.

## Decorator-based dependency injection

`@inject({ key })`, `@controller({ path })`, `@repository({ model, dataSource })` - the LB4 model:
metadata attached at the class declaration, resolved by the container at instantiation, instead of
a separate registration file that drifts from the code. Consequence: every constructor parameter
of a container-instantiated class must carry `@inject`. The container has no channel to supply an
undecorated one, so mixing decorated and undecorated parameters is refused at boot, by class name
and parameter index - never a silent `undefined`.

## `@repository` auto-injects the DataSource

`@repository({ model, dataSource })` auto-injects the DataSource at constructor param[0] unless an
explicit `@inject` already claims that slot. Source: `registerDataSourceInjection` in
`packages/kernel/src/base/metadata/persistents.ts` validates the first parameter type extends
`AbstractDataSource` and checks compatibility with the declared `dataSource` before wiring it.
This removes the single most repetitive line in every repository class without hiding what gets
injected - the type check still fails loudly on a mismatched constructor.

An explicit `@inject` at index 0 is honoured only if its key starts with the datasource namespace;
anything else is rejected rather than quietly accepted. The lookup reads `Reflect.getOwnMetadata`
and copies on write, because the usual `getInjectMetadata` walks the prototype chain - a repository
extending another `@repository` class would otherwise see the base's param[0] injection and
silently resolve the base's DataSource.

## Schema auto-discovery from `@repository` bindings

DataSources discover their schema from the `@repository` bindings that reference them, not a
manually maintained list (a DataSource can opt out with `autoDiscovery: false`). This inverts the
usual ORM order: you write repositories, and the DataSource assembles its own schema registry from
what's actually used - one source of truth instead of a list to keep in sync.

## Namespace-based binding keys

`controllers.UserController`, `services.AuthService`, `repositories.UserRepository`,
`datasources.PostgresDataSource` - a flat string namespace borrowed from LB4's binding key
convention. The prefix alone tells you what kind of thing is bound, without opening the class.

## Mixin composition over inheritance - for assembly, not for repositories

Mixins compose the things that accrete capabilities: the metadata registry and the application
surface. `MetadataRegistry` (`packages/kernel/src/helpers/inversion/registry.ts`) is a stack of
`DatasourceMetadataMixin`, `ModelMetadataMixin`, `RepositoryMetadataMixin`,
`ControllerMetadataMixin`, `RestControllerMetadataMixin` and `GrpcControllerMetadataMixin`, so a
protocol adds its metadata handling without widening one class. On the application side,
`packages/kernel/src/base/mixins/types.ts` declares `IComponentMixin`, `IControllerMixin`,
`IRepositoryMixin`, `IServiceMixin`, `IServerConfigMixin` and `IStaticServeMixin`; `IRestApplication`
composes the registration surfaces it actually needs rather than inheriting one base class that
accretes all of them - the trap LB4's own inheritance-heavy juggler eventually fell into.

Repository cross-cutting behavior is deliberately *not* mixed in. Hidden-field exclusion and
default-filter application are folded into the base classes: `RelationalBaseRepository`
memoizes the visible-column projection from the model's hidden fields, and default filters are
merged by `mergeFilter` in the dialect filter builder. Both are on every read path, so a repository
must not be able to compose its way out of them.

## Hidden fields excluded at the SQL level

`@model({ settings: { hiddenProperties: ['password'] } })` excludes those columns from the SQL
projection itself, not from the response after the query returns - `AbstractRepository` reads
`hiddenProperties` from `modelSettings` to build the query, not to post-filter a result.
Post-processing exclusion is a data leak waiting to happen: one code path forgets to call the
filter and a password hash ships to a client. Excluding at the SQL layer means there is no such
path, because the column was never fetched.

## Convention over configuration

Default directories (`controllers/`, `services/`, ...), default file extensions
(`.controller.js`, ...), all overridable via boot options - mirrors LB4's Booter system. A new
engineer or agent can predict where a file lives without reading a config file first, and an
override always exists for the case where convention doesn't fit.

## A browser-pure kernel, proven by a gate

The engine-neutral half of the framework - dependency injection, lifecycle, REST controllers,
repository and DataSource abstractions, the authentication and authorization seams - lives in
`@venizia/ignis-kernel`, which must bundle for a browser target with zero node builtins and zero
node globals. The same kernel then serves a Bun server and a browser Worker. Kernel reaches Drizzle
only through `import type`; Hono is value-imported because Hono is itself browser-pure. It never
imports the helpers root barrel, only the two audited isomorphic surfaces
`@venizia/ignis-helpers/core` and `@venizia/ignis-helpers/common`.

Two consequences worth knowing before editing kernel. It does not depend on `@venizia/ignis-boot`:
boot's `IBootOptions` is mirrored structurally in `packages/kernel/src/base/applications/types.ts`,
because importing boot would invert the `{boot, kernel} -> core` layering - kernel sits beside boot,
not after it. And the boundary is machine-checked, not conventional: `make purity`
(`scripts/purity`) bundles each claimed entry and fails on any node reference. `@venizia/ignis`
re-exports the kernel barrel in full, so nothing moved for consumers.

## Hono as the HTTP engine, Drizzle as the ORM

Hono is why IGNIS can claim LB4's architecture at ~140k req/s instead of ~15-20k - controllers
wrap `OpenAPIHono` instances directly, no adapter layer between framework and router, which is
where NestJS's overhead comes from. Drizzle is the only ORM: type-safe SQL, `pgTable` schemas, Zod
generation straight from those schemas. Both are load-bearing, not swappable - the repository
hierarchy, filter builders, and query generation all assume Drizzle + PostgreSQL semantics.

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [Monorepo layout](/overview/monorepo-layout.md)
- [DI container](/architecture/di-container.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
