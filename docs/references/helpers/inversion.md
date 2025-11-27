# Inversion of Control (IoC) and Dependency Injection (DI)

The Inversion of Control (IoC) and Dependency Injection (DI) system is at the heart of the Ignis framework. It allows you to write loosely coupled code that is easier to manage, test, and extend.

## Core Concepts

-   **Container:** The central registry for all your application's services and dependencies. The `Application` class itself extends the `Container`.
-   **Binding:** The process of registering a class or value with the container under a specific key (a string or a symbol).
-   **Injection:** The process of requesting a dependency from the container.

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

Ignis provides an `@inject` decorator to handle dependency injection. You can use it on constructor parameters or class properties.

### Constructor Injection

This is the recommended way to inject dependencies, as it makes them explicit and ensures they are available when the class is instantiated.

```typescript
import { BaseController, controller, inject, IControllerOptions } from '@vez/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
    opts: IControllerOptions,
  ) {
    super({ ...opts, scope: UserController.name, path: '/users' });
  }

  // ... use this.userService
}
```

### Property Injection

You can also inject dependencies as class properties.

```typescript
import { BaseController, controller, inject, IControllerOptions } from '@vez/ignis';
import { UserService } from '../services/user.service';

@controller({ path: '/users' })
export class UserController extends BaseController {
  @inject({ key: 'services.UserService' })
  private userService: UserService;

  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: UserController.name, path: '/users' });
  }

  // ... use this.userService
}
```
