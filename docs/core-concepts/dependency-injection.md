# Dependency Injection

The Ignis framework is built around a powerful, custom-built dependency injection (DI) container. DI allows you to write loosely coupled code that is easier to manage, test, and extend.

## Core Concepts

- **Container:** The central registry for all your application's services and dependencies. The `Application` class itself extends the `Container`.
- **Binding:** The process of registering a class or value with the container under a specific key (a string or a symbol).
- **Injection:** The process of requesting a dependency from the container.

## How to Inject Dependencies

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

## Binding Dependencies

Before a dependency can be injected, it must be bound to the container. The `Application` class provides helper methods for binding common resource types:

- `app.service(MyService)`
- `app.repository(MyRepository)`
- `app.dataSource(MyDataSource)`
- `app.controller(MyController)`
- `app.component(MyComponent)`

These methods automatically create a binding for the class with a conventional key (e.g., `services.MyService`).

For more advanced use cases, you can create custom bindings using the `bind` method on the container:

```typescript
// In your application class
this.bind<MyCustomClass>({ key: 'MyCustomClass' }).toClass(MyCustomClass);

this.bind<string>({ key: 'API_KEY' }).toValue('my-secret-api-key');
```

## Providers

For dependencies that require more complex creation logic or are request-scoped, you can use providers. A provider is a function that returns an instance of the dependency.

A great example of this is the `@CurrentUser` decorator. It injects a function that, when called, returns the user for the *current request*.

```typescript
import { BaseService, CurrentUser, TJwtPayload } from '@vez/ignis';

export class MyRequestScopedService extends BaseService {
  constructor(
    @CurrentUser() private readonly getCurrentUser: () => TJwtPayload | undefined,
  ) {
    super({ scope: 'MyRequestScopedService' });
  }

  doSomething() {
    const user = this.getCurrentUser();
    // ...
  }
}
```

The framework handles the complexity of making the request-specific user available to the DI container through the use of `AsyncLocalStorage`.

By understanding and using dependency injection, you can build modular and maintainable applications with the Ignis framework.
