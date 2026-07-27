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
`packages/core/src/base/metadata/persistents.ts` validates the first parameter type extends
`AbstractDataSource` and checks compatibility with the declared `dataSource` before wiring it.
This removes the single most repetitive line in every repository class without hiding what gets
injected - the type check still fails loudly on a mismatched constructor.

## Schema auto-discovery from `@repository` bindings

DataSources discover their schema from the `@repository` bindings that reference them, not a
manually maintained list (a DataSource can opt out with `autoDiscovery: false`). This inverts the
usual ORM order: you write repositories, and the DataSource assembles its own schema registry from
what's actually used - one source of truth instead of a list to keep in sync.

## Namespace-based binding keys

`controllers.UserController`, `services.AuthService`, `repositories.UserRepository`,
`datasources.PostgresDataSource` - a flat string namespace borrowed from LB4's binding key
convention. The prefix alone tells you what kind of thing is bound, without opening the class.

## Mixin composition over inheritance

`FieldsVisibilityMixin` strips hidden fields from responses; `DefaultFilterMixin` applies default
filters like soft-delete scoping. Composed as mixins so a repository picks up exactly the
cross-cutting behavior it needs, instead of a shared base class that accretes unrelated concerns
over time - the trap LB4's own inheritance-heavy juggler eventually fell into.

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

## Hono as the HTTP engine, Drizzle as the ORM

Hono is why IGNIS can claim LB4's architecture at ~140k req/s instead of ~15-20k - controllers
wrap `OpenAPIHono` instances directly, no adapter layer between framework and router, which is
where NestJS's overhead comes from. Drizzle is the only ORM: type-safe SQL, `pgTable` schemas, Zod
generation straight from those schemas. Both are load-bearing, not swappable - the repository
hierarchy, filter builders, and query generation all assume Drizzle + PostgreSQL semantics.

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [DI container](/architecture/di-container.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
