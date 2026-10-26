---
type: Overview
title: What is IGNIS
description: A TypeScript server framework that adds structure - dependency injection, repositories, components - to Hono.
resource: .
tags: [overview, framework, philosophy]
---

IGNIS is a TypeScript server framework built on Hono. The one-sentence pitch: structure for a
growing API - decorator-based dependency injection, the repository pattern, a boot system, a
component system - on Hono's HTTP engine, with Drizzle for SQL and Zod for validation.

## Why it exists

Hono is small and fast but intentionally unopinionated: it gives you a router and middleware, and
no architecture. That is fine for a single microservice and painful once an API grows past a
handful of endpoints. IGNIS adds the missing structure and keeps Hono as the engine. The repo holds
no benchmark, so no throughput figure is claimed.

## What's inside

A layered shape: Controller -> Service (optional) -> Repository -> DataSource -> a database
(PostgreSQL, SQLite) or a search engine (Typesense, Meilisearch). Controllers wrap `OpenAPIHono`
instances and use `@hono/zod-openapi` for type-safe OpenAPI. Repositories build on an
engine-neutral chain - AbstractRepository -> RelationalBaseRepository ->
ReadableRelationalRepository -> PersistableRelationalRepository -> DefaultRelationalRepository -
which the Postgres connector binds to its own `ReadableRepository`, `PersistableRepository`, and
`DefaultCRUDRepository` names, each a thin subclass of its relational-tier counterpart.
DataSources wrap Drizzle connection pools and are singletons, shared across repositories. A
generator (`ignis-artifacts generate`) finds every decorated controller, service, repository, and
datasource by an AST scan, and writes a static index the application registers at boot. On Bun,
`@venizia/ignis-boot/auto` builds the same index in memory instead: a plugin scans `src` at start
(cached) and inlines the list in a compiled binary.

Dependency injection runs through a standalone IoC container (`inversion`) rather than a
monolith - Binding fluent API, a MetadataRegistry, the `@inject` decorator, singleton/transient
scopes, constructor and property injection.

## Who it's for

Teams building growing APIs - past "a few endpoints," needing real structure (repositories,
transactions, auth, authorization, OpenAPI docs). If the API is genuinely tiny and will stay tiny,
plain Hono is simpler.

## Related

- [Design decisions](/overview/design-decisions.md)
- [Monorepo layout](/overview/monorepo-layout.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
