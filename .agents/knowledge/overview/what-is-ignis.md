---
type: Overview
title: What is IGNIS
description: A TypeScript server framework that pairs LoopBack 4's enterprise architecture with Hono's speed.
resource: .
tags: [overview, framework, philosophy]
---

IGNIS is a high-performance TypeScript server infrastructure framework built on Hono. The
one-sentence pitch: LoopBack 4's enterprise architecture (decorator-based dependency injection,
the repository pattern, a boot system, a component system) running on Hono's HTTP engine instead
of Express.

## Why it exists

Three frameworks shaped the decision, and each fell short in a specific way:

- **LoopBack 4** had the right architectural ideas - decorators, `@repository`, DataSource
  abstraction, Model definitions, a Component system, a Booter system, Mixin composition. It is
  still maintained (its README lists LB4 as "Current", minimum support to April 2028) and runs on
  Express, which IGNIS replaces with Hono.
- **NestJS** is popular and full-featured, but puts an adapter layer over Express or Fastify and
  asks for a lot of ceremony.
- **Hono** itself is small and fast but is intentionally unopinionated - it gives you
  a router and middleware, zero architecture. Fine for a single microservice, painful once an API
  grows past a handful of endpoints.

IGNIS keeps LB4's architecture and swaps its HTTP engine and ORM for Hono and Drizzle, aiming to
give growing APIs the structure LB4 offered. The repo holds no benchmark, so no throughput figure is claimed.

## What's inside

The same layered shape LB4 popularized: Controller -> Service (optional) -> Repository ->
DataSource -> a database (PostgreSQL, SQLite) or a search engine (Typesense, Meilisearch). Controllers wrap `OpenAPIHono` instances and use
`@hono/zod-openapi` for type-safe OpenAPI. Repositories build on an engine-neutral chain -
AbstractRepository -> RelationalBaseRepository -> ReadableRelationalRepository ->
PersistableRelationalRepository -> DefaultRelationalRepository - which the Postgres connector
binds to its own `ReadableRepository`, `PersistableRepository`, and `DefaultCRUDRepository`
names, each a thin subclass of its relational-tier counterpart. DataSources wrap Drizzle
connection pools and are singletons, shared across repositories. A generator
(`ignis-artifacts generate`) finds every decorated controller, service, repository, and datasource
by an AST scan, and writes a static index the application registers at boot. On Bun,
`@venizia/ignis-boot/auto` builds the same index in memory instead: a plugin scans `src` at start
(cached) and inlines the list in a compiled binary. LB4's Booter system did the same discovery by
scanning the file system at runtime.

Dependency injection runs through a standalone IoC container (`inversion`) rather than a
monolith - Binding fluent API, a MetadataRegistry, the `@inject` decorator, singleton/transient
scopes, constructor and property injection.

## Who it's for

Teams building growing APIs - past "a few endpoints," needing real structure (repositories,
transactions, auth, authorization, OpenAPI docs) - who are not willing to trade away performance
for that structure. If the API is genuinely tiny and will stay tiny, plain Hono is simpler. If the
API needs LB4-style architecture but must run fast, that is the gap IGNIS fills.

## Related

- [Design decisions](/overview/design-decisions.md)
- [Monorepo layout](/overview/monorepo-layout.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
