# Components

Components are reusable, pluggable modules that encapsulate a group of related features. A component acts as a powerful container for various resources--including providers, services, controllers, repositories, and even entire mini-applications--making it easy to share and integrate complex functionality across projects.

> **Deep Dive:** See [Components Reference](../../references/base/components.md) for detailed implementation patterns, directory structure, and best practices.

## What is a Component?

A component is a class that extends `BaseComponent` and is responsible for:

- **Binding Dependencies**: Registering services, controllers, repositories, providers, or other resources with the application's dependency injection container.
- **Configuring Features**: Setting up middlewares, initializing services, or performing any other setup required for the feature to work.

A single component can bundle everything needed for a specific domain--for example, an "AuthComponent" might include multiple services for token management, repositories for user data, and controllers for login/signup endpoints, essentially functioning as a plug-and-play mini-application.

## Built-in Components

IGNIS includes ready-to-use components for common features. The following are exported from the main barrel (`@venizia/ignis`):

| Component | Description |
| :--- | :--- |
| **Authentication** | JWT + Basic auth strategies, token services, strategy registry |
| **Authorization** | Casbin-based RBAC, permission mapping, `authorize()` middleware |
| **HealthCheckComponent** | `GET /health`, `/health/live`, `/health/ready` |
| **SwaggerComponent** | Swagger UI or Scalar UI for API documentation |
| **RequestTrackerComponent** | `x-request-id` header, request body parsing |

The following components require direct subpath imports:

| Component | Import From | Description |
| :--- | :--- | :--- |
| **MailComponent** | `@venizia/ignis/components/mail` | Nodemailer/Mailgun transporters with queue executors |
| **SocketIOComponent** | `@venizia/ignis/components/socket-io` | Socket.IO server with Redis adapter |
| **StaticAssetComponent** | `@venizia/ignis/components/static-asset` | File upload/download CRUD, MinIO/Disk storage |
| **WebSocketComponent** | `@venizia/ignis/components/websocket` | Native WebSocket support |

See the [**Built-in Components Reference**](../../extensions/components/) for detailed documentation.

## Creating a Simple Component

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise, Binding } from '@venizia/ignis';

// Define a service
class NotificationService {
  send(opts: { message: string }) { /* ... */ }
}

// Define a controller
@controller({ path: '/notifications' })
class NotificationController extends BaseRestController {
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
| **2. Init Defaults** | `initDefaultBindings()` | If `initDefault.enable` is `true`, default bindings are registered in the container (only if not already bound). |
| **3. Configuration** | `binding()` | Called during startup. Register controllers and additional resources here. |

The `configure()` method is **idempotent** -- calling it multiple times has no effect after the first call.

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

Components are bound as **singletons** automatically when registered via `this.component()`.

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
> - [Built-in Components](../../extensions/components/) - Detailed documentation for each component

## See Also

- **Related Concepts:**
  - [Application](/guides/core-concepts/application/) - Registering components
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - Component bindings
  - [Creating Components](./components-guide) - Build your own components

- **References:**
  - [BaseComponent API](/references/base/components) - Complete API reference
  - [Authentication Component](/extensions/components/authentication/) - JWT authentication
  - [Health Check Component](/extensions/components/health-check) - Health endpoints
  - [Swagger Component](/extensions/components/swagger) - API documentation
  - [Socket.IO Component](/extensions/components/socket-io/) - WebSocket support

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Component design patterns
