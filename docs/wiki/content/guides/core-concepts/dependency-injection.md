# Dependency Injection

Dependency Injection (DI) enables loosely coupled, testable code by automatically providing dependencies to classes.

> **Deep Dive:** See [DI Reference](../../references/base/dependency-injection.md) for technical details on Container, Binding, and `@inject`.

> **Standalone Package:** The core DI container is available as the standalone `@venizia/ignis-inversion` package for use outside the IGNIS framework. See [Inversion Package Reference](/extensions/helpers/inversion/) for details.

## Core Concepts

| Concept | Description |
| :--- | :--- |
| **Container** | The central registry for all your application's services and dependencies. The `Application` class itself extends `Container`. |
| **Binding** | The process of registering a class or value with the container under a specific key (e.g., `'services.UserService'`). |
| **Injection**| The process of requesting a dependency from the container using the `@inject` decorator. |

### How It Works: The DI Flow

```mermaid
graph TD
    A[1. Bind Resource] -- app.service(MyService) --> B(Container stores a Binding for 'services.MyService');
    B -- triggers --> C[2. Instantiate Consumer];
    C -- @inject({ key: 'services.MyService' }) --> D(Container reads injection metadata);
    D -- finds binding --> E[3. Resolve & Inject];
    E -- gets dependency --> F(Container creates/gets instance of MyService);
    F -- injects into --> G(MyController instance is created with MyService);

    subgraph Application Startup
        A
    end
    subgraph On-Demand Instantiation
        C
    end
    subgraph Container Internals
        B
        D
        E
        F
    end
    subgraph Result
        G
    end
```

### Instantiation Algorithm (Two-Phase)

When the container instantiates a class, it follows a two-phase process:

1. **Constructor injection** -- Reads `@inject` metadata from the class by parameter index (no sort - the metadata is already index-keyed), resolves each dependency from the container, and passes them as constructor arguments.
2. **Property injection** -- After construction, reads property metadata and assigns each dependency to the decorated properties.

> [!IMPORTANT]
> Every constructor parameter of a container-instantiated class must carry `@inject`. Mixing decorated and undecorated parameters is refused - `instantiate()` throws `[ClassName] Constructor parameter N has no @inject`. See the [DI Reference](../../references/base/dependency-injection.md#instantiation-algorithm-two-phase) for the full rule and the `@repository` exception.

## Binding Dependencies

Before a dependency can be injected, it must be **bound** to the container. This is typically done in the `preConfigure` method of your `Application` class.

### Standard Resource Binding

The `Application` class provides helper methods for common resource types. These automatically create a binding with a conventional key.

| Method | Default Key | Default Scope |
| :--- | :--- | :--- |
| `app.service(UserService)` | `services.UserService` | Transient |
| `app.repository(UserRepository)` | `repositories.UserRepository` | Transient |
| `app.dataSource(PostgresDataSource)` | `datasources.PostgresDataSource` | **Singleton** |
| `app.controller(UserController)` | `controllers.UserController` | Transient |
| `app.component(MyComponent)` | `components.MyComponent` | **Singleton** |

All these methods accept an optional second parameter to customize the binding key:

```typescript
// Default binding (key: 'controllers.UserController')
app.controller(UserController);

// Custom binding key
app.controller(UserController, {
  binding: { namespace: 'controllers', key: 'CustomUserController' }
});
```

### Custom Bindings

For other values or more complex setups, use the `bind` method directly.

```typescript
// In your application class's preConfigure()
this.bind<MyCustomClass>({ key: 'MyCustomClass' }).toClass(MyCustomClass);

this.bind<string>({ key: 'API_KEY' }).toValue('my-secret-api-key');
```

### Binding Scopes

You can control the lifecycle of your dependencies with scopes.

-   **`TRANSIENT`** (default): A new instance is created every time the dependency is resolved.
-   **`SINGLETON`**: A single instance is created once and cached. All subsequent resolutions return the same instance.

```typescript
import { BindingScopes } from '@venizia/ignis-inversion';

this.bind({ key: 'services.MySingletonService' })
  .toClass(MySingletonService)
  .setScope(BindingScopes.SINGLETON); // Use SINGLETON for this service
```

### Binding Tags

Bindings are automatically tagged with their namespace prefix. For example, a binding with key `'services.UserService'` is auto-tagged with `'services'`. You can also add custom tags:

```typescript
this.bind({ key: 'services.UserService' })
  .toClass(UserService)
  .setTags('critical', 'user-domain');
```

Tags are used by the container's `findByTag()` method to discover bindings by category.

## Injecting Dependencies

`IGNIS` provides the `@inject` decorator to request dependencies from the container.

### Constructor Injection (Recommended)

This makes dependencies explicit and ensures they are available right away.

```typescript
import { BaseRestController, controller, inject } from '@venizia/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService
  ) {
    super({ scope: UserController.name });
  }

  // ... you can now use this.userService
}
```

### Property Injection

You can also inject dependencies directly as class properties.

```typescript
import { inject } from '@venizia/ignis';
import { UserService } from '../services/user.service';

export class UserComponent {
  @inject({ key: 'services.UserService' })
  private userService: UserService;

  // ...
}
```

### Optional Dependencies

Mark a dependency as optional to avoid errors when it's not bound:

```typescript
constructor(
  @inject({ key: 'services.CacheService', isOptional: true })
  private cache?: CacheService
) {
  super({ scope: MyService.name });
  // cache will be undefined if not bound
}
```

## Providers

Providers are used for dependencies that require complex setup logic. A provider can be either a factory function or a class that implements the `IProvider<T>` interface with a `value()` method.

### Factory Function Provider

```typescript
// In your application class
this.bind<ThirdPartyApiClient>({ key: 'services.ApiClient' })
  .toProvider((container) => {
    const config = container.get<IConfig>({ key: 'configs.api' });
    return new ThirdPartyApiClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  });
```

### Class-Based Provider

```typescript
import { IProvider, Container } from '@venizia/ignis-inversion';

export class ApiClientProvider implements IProvider<ThirdPartyApiClient> {
  value(container: Container): ThirdPartyApiClient {
    const config = container.get<IConfig>({ key: 'configs.api' });
    const client = new ThirdPartyApiClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
    client.connect();
    return client;
  }
}
```

You would then bind this provider in your application:

```typescript
// In your application class
this.bind<ThirdPartyApiClient>({ key: 'services.ApiClient' })
  .toProvider(ApiClientProvider);
```

## Standalone Containers

You can create independent DI containers using the `Container` class directly. These containers are **completely separate** from the application's context and do not share any bindings.

### Creating an Independent Container

```typescript
import { Container, BindingScopes } from '@venizia/ignis-inversion';

// Create a standalone container
const container = new Container({ scope: 'MyCustomContainer' });

// Bind dependencies
container.bind({ key: 'config.apiKey' }).toValue('my-secret-key');
container.bind({ key: 'services.Logger' }).toClass(LoggerService);
container.bind({ key: 'services.Cache' })
  .toClass(CacheService)
  .setScope(BindingScopes.SINGLETON);

// Resolve dependencies
const logger = container.get<LoggerService>({ key: 'services.Logger' });
const apiKey = container.get<string>({ key: 'config.apiKey' });

// Resolve multiple at once
const [svcA, svcB] = container.gets<[ServiceA, ServiceB]>({
  bindings: [
    { key: 'services.A' },
    { key: 'services.B', isOptional: true },
  ],
});
```

### Use Cases

| Use Case | Description |
|----------|-------------|
| **Unit Testing** | Create isolated containers with mock dependencies for each test |
| **Isolated Modules** | Build self-contained modules with their own dependency graph |
| **Multi-Tenancy** | Separate containers per tenant with tenant-specific configurations |
| **Worker Threads** | Independent containers for background workers |
| **Plugin Systems** | Each plugin gets its own container to prevent conflicts |

### Example: Testing with Isolated Container

```typescript
import { Container } from '@venizia/ignis-inversion';
import { describe, it, expect, beforeEach } from 'bun:test';

describe('UserService', () => {
  let container: Container;

  beforeEach(() => {
    // Fresh container for each test
    container = new Container({ scope: 'TestContainer' });

    // Bind mock dependencies
    container.bind({ key: 'repositories.UserRepository' }).toValue({
      findById: async () => ({ id: '1', name: 'Test User' }),
    });

    container.bind({ key: 'services.UserService' }).toClass(UserService);
  });

  it('should find user by id', async () => {
    const userService = container.get<UserService>({ key: 'services.UserService' });
    const user = await userService.findById({ id: '1' });

    expect(user.name).toBe('Test User');
  });
});
```

### Container vs Application

| Aspect | `Application` (extends Container) | Standalone `Container` |
|--------|-----------------------------------|------------------------|
| **Purpose** | Full HTTP server with routing, middleware | Pure dependency injection |
| **Bindings** | Shared across entire application | Isolated, no sharing |
| **Lifecycle** | Managed by framework | You control it |
| **Use Case** | Main application | Testing, isolated modules, workers |

> [!TIP]
> The `Application` class extends `Container`, so all container methods (`bind`, `get`, `gets`, `resolve`, `findByTag`, `isBound`, `unbind`) are available on your application instance. Standalone containers are useful when you need isolation from the main application context.

### Container API Summary

| Method | Description |
| :--- | :--- |
| `bind<T>({ key })` | Create a new binding |
| `get<T>({ key, isOptional? })` | Resolve a single dependency |
| `gets<T>({ bindings })` | Resolve multiple dependencies at once |
| `resolve<T>(cls)` | Instantiate a class with DI (alias for `instantiate`) |
| `isBound({ key })` | Check if a key is bound |
| `unbind({ key })` | Remove a binding |
| `findByTag({ tag, exclude? })` | Find bindings by tag |
| `clear()` | Clear all cached singleton instances |
| `reset()` | Remove all bindings entirely |

## See Also

- **Related Concepts:**
  - [Application](/guides/core-concepts/application/) - Application extends Container
  - [Controllers](/guides/core-concepts/rest-controllers) - Use DI for injecting services
  - [Services](/guides/core-concepts/services) - Use DI for injecting repositories
  - [Providers](/references/base/providers) - Factory pattern for dynamic injection

- **References:**
  - [Dependency Injection API](/references/base/dependency-injection) - Complete API reference
  - [Inversion Helper](/extensions/helpers/inversion/) - DI container utilities
  - [Glossary](/guides/reference/glossary#dependency-injection-di) - DI concepts explained

- **Tutorials:**
  - [Testing](/guides/tutorials/testing) - Unit testing with mocked dependencies
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - DI in practice

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - DI patterns and anti-patterns
