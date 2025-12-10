# Inversion of Control (IoC) and Dependency Injection (DI)

Core DI system enabling loosely coupled, testable, and extensible code.

> **Package Architecture Note:** The core DI container functionality has been extracted to a standalone package `@vez/ignis-inversion`. The `@vez/ignis-helpers` package extends and re-exports this functionality with application-specific enhancements (logging, framework metadata). All imports from `@vez/ignis-helpers` or `@vez/ignis` continue to work as before - backward compatibility is maintained.

## Quick Reference

| Concept | Description |
|---------|-------------|
| **Container** | Central registry for services/dependencies (Application extends Container) |
| **Binding** | Register class/value with container under a key |
| **Injection** | Request dependency from container using `@inject` decorator |
| **MetadataRegistry** | Stores decorator metadata for DI and routing |

### Binding Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `app.service(MyService)` | Bind service | Key: `services.MyService` |
| `app.controller(MyController)` | Bind controller | Key: `controllers.MyController` |
| `app.repository(MyRepo)` | Bind repository | Key: `repositories.MyRepo` |
| `bind().toClass()` | Custom class binding | `bind({ key: 'MyClass' }).toClass(MyClass)` |
| `bind().toValue()` | Bind constant value | `bind({ key: 'API_KEY' }).toValue('secret')` |

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

-   `app.component(MyComponent)`
-   `app.controller(MyController)`
-   `app.service(MyService)`
-   `app.repository(MyRepository)`
-   `app.dataSource(MyDataSource)`

These methods automatically create a binding for the class with a conventional key (e.g., `services.MyService`).

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
import { BaseController, controller, inject } from '@vez/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService
  ) {
    super({ scope: UserController.name, path: '/users' });
  }

  // ... use this.userService
}
```

### Property Injection

You can also inject dependencies as class properties.

```typescript
import { BaseController, controller, inject } from '@vez/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseController {
  @inject({ key: 'services.UserService' })
  private userService: UserService;

  constructor() {
    super({ scope: UserController.name, path: '/users' });
  }

  // ... use this.userService
}
```

## `MetadataRegistry`

The `MetadataRegistry` is a crucial part of the DI and routing systems. It's a singleton class responsible for storing and retrieving all the metadata attached by decorators like `@inject`, `@controller`, `@get`, etc.

-   **Base File:** `packages/inversion/src/registry.ts` (core MetadataRegistry)
-   **Extended File:** `packages/helpers/src/helpers/inversion/registry.ts` (with framework metadata)

### Role in DI

-   When you use a decorator (e.g., `@inject`), it calls a method on the `MetadataRegistry.getInstance()` to store information about the injection (like the binding key and target property/parameter).
-   When the `Container` instantiates a class, it queries the `MetadataRegistry` to find out which dependencies need to be injected and where.

You typically won't interact with the `MetadataRegistry` directly, but it's the underlying mechanism that makes the decorator-based DI and routing systems work seamlessly.
