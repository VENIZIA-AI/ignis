# Architectural Patterns

Ignis promotes separation of concerns, dependency injection, and modularity for scalable, maintainable applications.

> **Deep Dive:** See [Core Framework Reference](../../references/src-details/core.md) for implementation details.

## 1. Layered Architecture

Each layer has a single responsibility. Ignis supports **two architectural approaches**:

```mermaid
graph TD
    Client[Client/API Consumer]

    Client -->|HTTP Request| Controller[Controllers]

    Controller -->|Simple CRUD| Repo[Repositories]
    Controller -->|Complex Logic| Service[Services]

    Service --> Repo

    Repo --> DataSource[DataSources]
    DataSource --> DB[(Database)]

    style Service fill:#e1f5ff
    style Repo fill:#fff4e1
    style Controller fill:#ffe1f5
```

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Controllers** | Handle HTTP - parse requests, validate, format responses | `ConfigurationController` (uses `ControllerFactory`) |
| **Services** | Business logic - orchestrate operations | `AuthenticationService` (auth logic) |
| **Repositories** | Data access - CRUD operations | `ConfigurationRepository` (extends `DefaultCRUDRepository`) |
| **DataSources** | Database connections | `PostgresDataSource` (connects to PostgreSQL) |
| **Models** | Data structure - Drizzle schemas + Entity classes | `Configuration`, `User` models |

**Key Principle - Two Approaches:**

```
Simple CRUD (no business logic):
┌────────────┐
│ Controller │──────────────┐
└────────────┘              │
                            ▼
                    ┌──────────────┐
                    │  Repository  │
                    └──────────────┘
                            │
                            ▼
                        Database

Complex Logic (validation, orchestration):
┌────────────┐
│ Controller │────┐
└────────────┘    │
                  ▼
            ┌─────────┐
            │ Service │
            └─────────┘
                  │
                  ▼
          ┌──────────────┐
          │  Repository  │
          └──────────────┘
                  │
                  ▼
              Database
```

**When to use each:**
- **Controller → Repository** - Simple CRUD (list, get by ID, create, update, delete)
- **Controller → Service → Repository** - Business logic, validation, orchestrating multiple repositories

## 2. Dependency Injection (DI)

Classes declare dependencies in their constructor - the framework automatically provides them at runtime.

**Benefits:**
- Loosely coupled code
- Easy to test (mock dependencies)
- Easy to swap implementations

**Example:**
```typescript
@controller({ path: BASE_PATH })
export class ConfigurationController extends _Controller {
  constructor(
    // The @inject decorator tells the container to provide
    // an instance of ConfigurationRepository here.
    @inject({
      key: BindingKeys.build({
        namespace: BindingNames...REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository);
  }
}
```

## 3. Component-Based Modularity

Components bundle a group of related, reusable, and pluggable features into self-contained modules. A single component can encapsulate multiple providers, services, controllers, and repositories, essentially functioning as a mini-application that can be easily "plugged in" to any Ignis project.

**Built-in Components:**
- `AuthenticateComponent` - JWT authentication
- `SwaggerComponent` - OpenAPI documentation
- `HealthCheckComponent` - Health check endpoint
- `RequestTrackerComponent` - Request logging

**Example:**
```typescript
// src/application.ts

export class Application extends BaseApplication {
  // ...
  preConfigure(): ValueOrPromise<void> {
    // ...
    // Registering components plugs their functionality into the application.
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
    // ...
  }
}
```
This architecture keeps the main `Application` class clean and focused on high-level assembly, while the details of each feature are neatly encapsulated within their respective components.

## 4. Custom Components

You can encapsulate your own logic or third-party integrations (like Socket.IO, Redis, specific Cron jobs) into reusable Components.

**Structure of a Component:**
1.  Extend `BaseComponent`.
2.  Define default `bindings` (optional configuration/options).
3.  Implement `binding()` to register services, providers, or attach logic to the application.

**Example (`SocketIOComponent`):**

```typescript
import { BaseComponent, inject, CoreBindings, Binding } from '@venizia/ignis';

export class MySocketComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: MySocketComponent.name,
      // Automatically register bindings when component is loaded
      initDefault: { enable: true, container: application },
      bindings: {
        // Define default configuration binding
        'my.socket.options': Binding.bind({ key: 'my.socket.options' }).toValue({ port: 8080 }),
      },
    });
  }

  // The binding method is called during application startup (preConfigure)
  override binding(): void {
    const options = this.application.get({ key: 'my.socket.options' });
    
    this.logger.info('Initializing Socket.IO with options: %j', options);
    
    // Perform setup logic, register other services, etc.
    // this.application.bind(...).toValue(...);
  }
}
```