# Base Abstractions

Core classes that power every Ignis application - from the Application entry point to Repositories for data access.

## Quick Reference

| Class | Purpose | Extends |
|-------|---------|---------|
| `BaseApplication` | Application entry point, DI container | `AbstractApplication` |
| `BaseController` | HTTP route handlers | - |
| `BaseService` | Business logic layer | - |
| `BaseComponent` | Pluggable feature modules | - |
| `BaseDataSource` | Database connections | - |
| `BaseEntity` | Model definitions | - |
| `DefaultCRUDRepository` | Full CRUD operations | `PersistableRepository` |
| `ReadableRepository` | Read-only operations | `AbstractRepository` |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     BaseApplication                          │
│  (DI Container + Lifecycle + Server Management)              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐     │
│  │ BaseController│   │ BaseService  │   │BaseComponent │     │
│  │ (HTTP Layer) │   │(Business Logic)│  │ (Plugins)   │     │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘     │
│         │                  │                                 │
│         └────────┬─────────┘                                 │
│                  ▼                                           │
│         ┌──────────────────┐                                 │
│         │DefaultCRUDRepository│                              │
│         │  (Data Access)    │                                │
│         └────────┬──────────┘                                │
│                  │                                           │
│         ┌────────┴────────┐                                  │
│         ▼                 ▼                                  │
│  ┌────────────┐   ┌────────────┐                             │
│  │BaseDataSource│  │ BaseEntity │                            │
│  │(Connection) │  │  (Schema)  │                             │
│  └─────────────┘  └────────────┘                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## What's in This Section

### Core Application
- [Application](./application.md) - `BaseApplication` class, resource registration, lifecycle hooks
- [Bootstrapping](./bootstrapping.md) - Startup sequence, `initialize()` flow

### HTTP Layer
- [Controllers](./controllers.md) - Route handlers, decorators, request/response handling
- [Services](./services.md) - Business logic, injectable services

### Dependency Injection
- [Dependency Injection](./dependency-injection.md) - Container, bindings, `@inject` patterns
- [Components](./components.md) - Pluggable modules, component lifecycle

### Data Layer
- [Models & Enrichers](./models.md) - `BaseEntity`, schema definitions, enrichers
- [DataSources](./datasources.md) - Database connections, auto-discovery
- [Repositories](./repositories/) - CRUD operations, filtering, relations
- [Filter System](./filter-system.md) - Query filter types and operators

## Class Hierarchy

```
AbstractApplication
└── BaseApplication ──────► Your Application

AbstractRepository
├── ReadableRepository
│   └── PersistableRepository
│       └── DefaultCRUDRepository ──────► Your Repository
│
BaseController ──────► Your Controller
BaseService ──────► Your Service
BaseComponent ──────► Your Component
BaseDataSource ──────► Your DataSource
BaseEntity ──────► Your Model
```

> **Related:** [Core Concepts Guide](../../guides/core-concepts/application/) | [Persistent Layer Guide](../../guides/core-concepts/persistent/)
