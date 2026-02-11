# Components

Components are reusable, pluggable modules that encapsulate a group of related features. A component acts as a powerful container for various resources—including providers, services, controllers, repositories, and even entire mini-applications—making it easy to share and integrate complex functionality across projects.

> **Deep Dive:** See [Components Reference](../../references/base/components.md) for detailed implementation patterns, directory structure, and best practices.

## What is a Component?

A component is a class that extends `BaseComponent` and is responsible for:

- **Binding Dependencies**: Registering services, controllers, repositories, providers, or other resources with the application's dependency injection container.
- **Configuring Features**: Setting up middlewares, initializing services, or performing any other setup required for the feature to work.

A single component can bundle everything needed for a specific domain—for example, an "AuthComponent" might include multiple services for token management, repositories for user data, and controllers for login/signup endpoints, essentially functioning as a plug-and-play mini-application.

## Built-in Components

Ignis includes ready-to-use components for common features like authentication, API documentation, health checks, and more. See the [**Built-in Components Reference**](../../references/components/) for the complete list with detailed documentation.

## Creating a Simple Component

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise, Binding } from '@venizia/ignis';

// Define a service
class NotificationService {
  send(opts: { message: string }) { /* ... */ }
}

// Define a controller
@controller({ path: '/notifications' })
class NotificationController extends BaseController {
  constructor(
    @inject({ key: 'services.NotificationService' })
    private _notificationService: NotificationService
  ) {
    super({ scope: NotificationController.name });
  }
}

// Create the component
export class NotificationComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private _application: BaseApplication,
  ) {
    super({
      scope: NotificationComponent.name,
      initDefault: { enable: true, container: _application },
      bindings: {
        'services.NotificationService': Binding.bind({ key: 'services.NotificationService' })
          .toClass(NotificationService),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    this._application.controller(NotificationController);
  }
}
```

## Component Lifecycle

| Stage | Method | Description |
| :--- | :--- | :--- |
| **1. Instantiation** | `constructor()` | Component is created. Define default `bindings` here. |
| **2. Configuration** | `binding()` | Called during startup. Register controllers and resources here. |

## Registering a Component

Register components in your application's `preConfigure` method:

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
    this.component(NotificationComponent);
  }
}
```

## Customizing Component Options

Most components accept configuration options. Override them before registration:

```typescript
// src/application.ts
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // Override options BEFORE registering component
    this.bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
      .toValue({ restOptions: { path: '/api/health' } });

    this.component(HealthCheckComponent);
  }
}
```

> **Next Steps:**
> - [Creating Components Guide](./components-guide.md) - Step-by-step tutorial for building your own components
> - [Components Reference](../../references/base/components.md) - Directory structure, keys, types, constants patterns
> - [Built-in Components](../../references/components/) - Detailed documentation for each component

## See Also

- **Related Concepts:**
  - [Application](/guides/core-concepts/application/) - Registering components
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - Component bindings
  - [Creating Components](./components-guide) - Build your own components

- **References:**
  - [BaseComponent API](/references/base/components) - Complete API reference
  - [Authentication Component](/references/components/authentication/) - JWT authentication
  - [Health Check Component](/references/components/health-check/) - Health endpoints
  - [Swagger Component](/references/components/swagger/) - API documentation
  - [Socket.IO Component](/references/components/socket-io/) - WebSocket support

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Component design patterns
