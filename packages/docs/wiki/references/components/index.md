# Components

Reusable, pluggable modules that group together related features. A component can encapsulate various resources such as providers, services, controllers, repositories, or even an entire mini-application, providing a clean way to modularize and share complex logic across Ignis applications.

## Built-in Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| [Authentication](./authentication.md) | JWT-based auth | Token generation, protected routes, user payload |
| [Health Check](./health-check.md) | Monitoring endpoint | `/health` endpoint, ping/pong functionality |
| [Request Tracker](./request-tracker.md) | Request logging | Request ID generation, timing, structured logging |
| [Socket.IO](./socket-io.md) | Real-time communication | WebSocket support, Redis adapter, event-based |
| [Static Asset](./static-asset.md) | File management | Upload/download files, MinIO & local filesystem support |
| [Swagger](./swagger.md) | API documentation | OpenAPI generation, Swagger UI, Scalar UI |

## Creating a Component

To create a new component, you need to create a class that extends `BaseComponent`.

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise } from '@venizia/ignis';

export class MyCustomComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: MyCustomComponent.name });
  }

  override binding(): ValueOrPromise<void> {
    // This is where you bind your component's resources.
    this.application.service(MyCustomService);
    this.application.controller(MyCustomController);
  }
}
```

## Component Lifecycle

| Phase | When | Purpose |
|-------|------|---------|
| **`constructor()`** | Component instantiation | Receive dependencies, define default bindings |
| **`binding()`** | Application startup | Register controllers, services, repositories with DI container |

## Registering a Component

To use a component, you need to register it with the application instance, usually in the `preConfigure` method of your `Application` class.

```typescript
// in src/application.ts
import { MyCustomComponent } from './components/my-custom.component';

// ... inside your Application class

  preConfigure(): ValueOrPromise<void> {
    // ...
    this.component(MyCustomComponent);
  }
```

When the application starts, it will automatically call the `binding()` method of the registered component, setting up all the resources it provides.

Using components is a great way to organize your application's features into modular, reusable pieces of code, keeping your main application class clean and focused on high-level configuration.
