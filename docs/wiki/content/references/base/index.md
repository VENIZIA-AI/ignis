# Base Abstractions

Core classes that power every IGNIS application - from the Application entry point to Repositories for data access.

## Quick Reference

| Class | Purpose | Extends |
|-------|---------|---------|
| `BaseApplication` | Application entry point, DI container | `AbstractApplication` |
| `BaseRestController` | REST/HTTP route handlers | `AbstractRestController` |
| `BaseGrpcController` | gRPC route handlers (ConnectRPC) | `AbstractGrpcController` |
| `BaseService` | Business logic layer | - |
| `BaseProvider` | Factory pattern for runtime instantiation | `BaseHelper` |
| `BaseComponent` | Pluggable feature modules | - |
| `BaseDataSource` | Database connections | - |
| `BaseEntity` | Model definitions | - |
| `DefaultCRUDRepository` | Full CRUD operations | `PersistableRepository` |
| `ReadableRepository` | Read-only operations | `AbstractRepository` |

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
- [Models & Enrichers](./models.md) - `BaseEntity`, schema definitions, enrichers
- [DataSources](./datasources.md) - Database connections, auto-discovery
- [Repositories](./repositories/) - CRUD operations, filtering, relations
- [Filter System](./filter-system/) - Query filter types and operators

## Class Hierarchy

```
AbstractApplication
└── BaseApplication ──────► Your Application

AbstractRepository
├── ReadableRepository
│   └── PersistableRepository
│       └── DefaultCRUDRepository ──────► Your Repository
│
AbstractRestController
└── BaseRestController ──────► Your REST Controller

AbstractGrpcController
└── BaseGrpcController ──────► Your gRPC Controller
BaseService ──────► Your Service
BaseProvider ──────► Your Provider
BaseComponent ──────► Your Component
BaseDataSource ──────► Your DataSource
BaseEntity ──────► Your Model
```

> **Related:** [Core Concepts Guide](../../guides/core-concepts/application/) | [Persistent Layer Guide](../../guides/core-concepts/persistent/)
