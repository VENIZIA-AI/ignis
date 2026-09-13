# Base Abstractions

Core classes that power every IGNIS application - from the Application entry point to Repositories for data access.

> [!IMPORTANT] Base vs. Connectors
> The persistence layer (`BaseDataSource`/`BaseEntity`/CRUD repositories) is split three ways: an engine-neutral root in `packages/kernel/src/base`, two paradigm tiers in `packages/connectors/src/{relational,search}/core`, and one branch per engine (postgres, sqlite, typesense, meilisearch). `BaseDataSource` and `BaseEntity` below refer to the **PostgreSQL** `BasePostgresDataSource`/`BasePostgresEntity` - see [Connectors](./connectors) for the full picture, and [Search & Typesense](/guides/core-concepts/persistent/search-typesense) for a search engine.

## Quick Reference

| Class | Purpose | Extends |
|-------|---------|---------|
| `BaseApplication` | Application entry point, DI container | `ServerApplication` -> `RestApplication` -> `AbstractApplication` |
| `BaseRestController` | REST/HTTP route handlers | `AbstractRestController` |
| `BaseGrpcController` | gRPC route handlers (ConnectRPC) | `AbstractGrpcController` |
| `BaseService` | Business logic layer | `BaseHelper` |
| `BaseProvider` | Factory pattern for runtime instantiation | `BaseHelper` |
| `BaseComponent` | Pluggable feature modules | `BaseHelper` |
| `BaseDataSource` (alias of `BasePostgresDataSource`) | PostgreSQL connections | `AbstractPostgresDataSource` -> `BaseRelationalDataSource` -> `AbstractRelationalDataSource` -> `AbstractDataSource` |
| `BaseEntity` (alias of `BaseRelationalEntity`) | Drizzle model definitions | `AbstractEntity` |
| `DefaultCRUDRepository` | Full CRUD operations (PostgreSQL binding) | `DefaultRelationalRepository` -> ... -> `AbstractRepository` |
| `ReadableRepository` | Read-only operations (PostgreSQL binding) | `ReadableRelationalRepository` -> `RelationalBaseRepository` -> `AbstractRepository` |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     BaseApplication                          │
│  (DI Container + Lifecycle + Server Management)              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌─────────────┐  ┌──────────────┐    │
│  │BaseRestController │  │ BaseService  │  │BaseComponent │    │
│  │  (REST Layer)     │  │(Biz Logic)  │  │ (Plugins)    │    │
│  ├──────────────────┤  └──────┬───────┘  └──────────────┘    │
│  │BaseGrpcController │        │                              │
│  │  (gRPC Layer)     │        │                              │
│  └────────┬──────────┘        │                              │
│           └─────────┬─────────┘                              │
│                     ▼                                        │
│          ┌──────────────────────┐                            │
│          │DefaultCRUDRepository │                            │
│          │  (Data Access)       │                            │
│          └──────────┬───────────┘                            │
│                     │                                        │
│          ┌──────────┴──────────┐                             │
│          ▼                     ▼                             │
│   ┌──────────────┐      ┌────────────┐                      │
│   │BaseDataSource │      │ BaseEntity │                      │
│   │(Connection)   │      │  (Schema)  │                      │
│   └───────────────┘      └────────────┘                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## What's in This Section

### Core Application
- [Application](./application.md) - `BaseApplication` class, resource registration, lifecycle hooks
- [Bootstrapping](./bootstrapping.md) - Startup sequence, `initialize()` flow

### Transport Layer
- [REST Controllers](./controllers.md) - REST route handlers, decorators, request/response handling
- [gRPC Controllers](./grpc-controllers.md) - gRPC/ConnectRPC handlers, RPC decorators
- [Middlewares](./middlewares.md) - Built-in middlewares for error handling, logging, and request processing
- [Services](./services.md) - Business logic, injectable services

### Dependency Injection
- [Dependency Injection](./dependency-injection.md) - Container, bindings, `@inject` patterns
- [Providers](./providers.md) - Factory pattern for configuration-driven instantiation
- [Components](./components.md) - Pluggable modules, component lifecycle

### Data Layer
- [Connectors](./connectors.md) - Base-vs-connectors architecture, dual-door exports, adding an engine
- [Models & Enrichers](./models.md) - `BaseEntity`, schema definitions, enrichers
- [DataSources](./datasources.md) - Database connections, auto-discovery
- [Repositories](./repositories/) - CRUD operations, filtering, relations
- [Filter System](./filter-system/) - Query filter types and operators

## Class Hierarchy

```
AbstractApplication (browser-pure, @venizia/ignis-kernel)
└── RestApplication (browser-pure, owns the router)
    └── ServerApplication (opens the socket)
        └── BaseApplication ──────► Your Application

AbstractRepository (engine-neutral, @venizia/ignis-kernel)
├── RelationalBaseRepository (connectors/relational/core)
│   └── ReadableRelationalRepository
│       └── PersistableRelationalRepository
│           └── DefaultRelationalRepository
│               └── SoftDeletableRelationalRepository
└── SearchBaseRepository (alias: TypesenseBaseRepository)
    └── ReadableSearchRepository -> ... -> DefaultSearchRepository

AbstractRestController
└── BaseRestController ──────► Your REST Controller

AbstractGrpcController
└── BaseGrpcController ──────► Your gRPC Controller
BaseService ──────► Your Service
BaseProvider ──────► Your Provider
BaseComponent ──────► Your Component

AbstractDataSource (engine-neutral, @venizia/ignis-kernel)
├── AbstractRelationalDataSource -> BaseRelationalDataSource
│   ├── AbstractPostgresDataSource -> BasePostgresDataSource (alias: BaseDataSource) ──────► Your DataSource
│   └── AbstractSqliteDataSource -> BaseSqliteDataSource ──────► Your SQLite DataSource
└── AbstractSearchDataSource -> BaseSearchDataSource -> TypesenseDataSource · MeilisearchDataSource

AbstractEntity (engine-neutral, @venizia/ignis-kernel)
└── BaseRelationalEntity (aliases: BaseEntity, BasePostgresEntity) ──────► Your Model
    └── BaseSqliteEntity ──────► Your SQLite Model
```

### Engine bindings of the relational repository ladder

Each SQL engine binds every rung with one thin subclass. The bindings are siblings of each other, not a ladder: `DefaultCRUDRepository` extends `DefaultRelationalRepository`, never `PersistableRepository`.

| Neutral rung | Postgres | SQLite |
|---|---|---|
| `RelationalBaseRepository` | `PostgresBaseRepository` | `SqliteBaseRepository` |
| `ReadableRelationalRepository` | `ReadableRepository` | `ReadableSqliteRepository` |
| `PersistableRelationalRepository` | `PersistableRepository` | `PersistableSqliteRepository` |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | `DefaultSqliteRepository` |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | `SoftDeletableSqliteRepository` |

> [!NOTE] Where each name resolves
> The Postgres names come from `@venizia/ignis` or `@venizia/ignis/postgres`, the SQLite names from `@venizia/ignis/sqlite`, and the neutral `*Relational*` names from `@venizia/ignis/relational`. The neutral names are deliberately absent from the engine subpaths, so `RelationalBaseRepository` and `BaseRelationalDataSource` do **not** resolve from `@venizia/ignis` or `@venizia/ignis/postgres`.

> **Related:** [Core Concepts Guide](../../guides/core-concepts/application/) | [Persistent Layer Guide](../../guides/core-concepts/persistent/)
