# Inversion of Control (IoC) and Dependency Injection (DI)

Core DI system enabling loosely coupled, testable, and extensible code.

> **Architecture Update:** The core DI container functionality has been extracted to a standalone package `@venizia/ignis-inversion`.
>
> *   **Standalone Container:** `@venizia/ignis-inversion` (Generic DI)
> *   **Framework Integration:** `@venizia/ignis` (extends Core DI with Framework Metadata)
>
> Previously, this module resided in `@venizia/ignis-helpers`. It has now been moved to **Core** (`@venizia/ignis`) to better align with the framework architecture.

## Quick Reference

| Concept | Description |
|---------|-------------|
| **Container** | Central registry for services/dependencies (Application extends Container) |
| **Binding** | Register class/value with container under a key |
| **Injection** | Request dependency from container using `@inject` decorator |
| **MetadataRegistry** | Stores decorator metadata for DI and routing |

### Binding Methods

| Method | Purpose | Default Key |
|--------|---------|-------------|
| `app.service(MyService, opts?)` | Bind service | `services.MyService` |
| `app.controller(MyController, opts?)` | Bind controller | `controllers.MyController` |
| `app.repository(MyRepo, opts?)` | Bind repository | `repositories.MyRepo` |
| `app.component(MyComponent, opts?)` | Bind component | `components.MyComponent` |
| `app.dataSource(MyDS, opts?)` | Bind datasource | `datasources.MyDS` |
| `bind().toClass()` | Custom class binding | `bind({ key: 'MyClass' }).toClass(MyClass)` |
| `bind().toValue()` | Bind constant value | `bind({ key: 'API_KEY' }).toValue('secret')` |

All registration methods accept an optional `opts` parameter to customize the binding key:

```typescript
app.controller(UserController, {
  binding: { namespace: 'controllers', key: 'CustomUserController' }
});
```

### Binding Scopes

| Scope | Behavior |
|-------|----------|
| `BindingScopes.TRANSIENT` | New instance each request (default) |
| `BindingScopes.SINGLETON` | Single instance, reused |

### Injection Styles

| Style | When to Use |
|-------|-------------|
| **Constructor Injection** | Recommended - explicit, available at instantiation |
| **Property Injection** | Alternative - inject as class property |

## Binding Dependencies

Before a dependency can be injected, it must be bound to the container. The `Application` class provides helper methods for binding common resource types:

-   `app.component(MyComponent, opts?)`
-   `app.controller(MyController, opts?)`
-   `app.service(MyService, opts?)`
-   `app.repository(MyRepository, opts?)`
-   `app.dataSource(MyDataSource, opts?)`

These methods automatically create a binding for the class with a conventional key (e.g., `services.MyService`). Use the optional `opts` parameter to customize binding keys when needed.

### Advanced Binding

For more advanced use cases, you can create custom bindings using the `bind` method on the container.

```typescript
// In your application class or a component's binding() method

// Bind a class
this.bind<MyCustomClass>({ key: 'MyCustomClass' }).toClass(MyCustomClass);

// Bind a constant value
this.bind<string>({ key: 'API_KEY' }).toValue('my-secret-api-key');

// Bind a provider (for complex creation logic)
this.bind<DatabaseConnection>({ key: 'DatabaseConnection' }).toProvider(() => {
  return new DatabaseConnection(process.env.DATABASE_URL);
});
```

### Binding Scopes

You can control the lifecycle of a bound dependency using scopes:

-   `BindingScopes.TRANSIENT` (default): A new instance is created every time the dependency is requested.
-   `BindingScopes.SINGLETON`: A single instance is created and reused for all subsequent requests.

```typescript
this.bind<MySingletonService>({ key: 'services.MySingletonService' })
  .toClass(MySingletonService)
  .setScope(BindingScopes.SINGLETON);
```

## Injecting Dependencies

`Ignis` provides an `@inject` decorator to handle dependency injection. You can use it on constructor parameters or class properties.

### Constructor Injection

This is the recommended way to inject dependencies, as it makes them explicit and ensures they are available when the class is instantiated.

```typescript
import { BaseController, controller, inject } from '@venizia/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' })
    private _userService: UserService
  ) {
    super({ scope: UserController.name, path: '/users' });
  }

  // ... use this._userService
}
```

### Property Injection

You can also inject dependencies as class properties.

```typescript
import { BaseController, controller, inject } from '@venizia/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseController {
  @inject({ key: 'services.UserService' })
  private _userService: UserService;

  constructor() {
    super({ scope: UserController.name, path: '/users' });
  }

  // ... use this._userService
}
```

## `MetadataRegistry`

The `MetadataRegistry` is a crucial part of the DI and routing systems. It's a singleton class responsible for storing and retrieving all the metadata attached by decorators like `@inject`, `@controller`, `@get`, etc.

-   **Base File:** `packages/inversion/src/registry.ts` (core MetadataRegistry)
-   **Extended File:** `packages/core/src/helpers/inversion/registry.ts` (with framework metadata)

### Role in DI

-   When you use a decorator (e.g., `@inject`), it calls a method on the `MetadataRegistry.getInstance()` to store information about the injection (like the binding key and target property/parameter).
-   When the `Container` instantiates a class, it queries the `MetadataRegistry` to find out which dependencies need to be injected and where.

You typically won't interact with the `MetadataRegistry` directly, but it's the underlying mechanism that makes the decorator-based DI and routing systems work seamlessly.
