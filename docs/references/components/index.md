# Components

Components are the primary way to extend the functionality of an Ignis application. They are reusable, pluggable modules that encapsulate a specific feature, such as authentication, logging, or API documentation.

Ignis comes with several built-in components:

-   [Authentication](./authentication.md): Sets up JWT-based authentication and authorization.
-   [Health Check](./health-check.md): Adds a health check endpoint to your application.
-   [Request Tracker](./request-tracker.md): Adds request logging and tracing.
-   [Socket.IO](./socket-io.md): Integrates Socket.IO for real-time communication.
-   [Swagger](./swagger.md): Generates interactive OpenAPI documentation for your API.

## Creating a Component

To create a new component, you need to create a class that extends `BaseComponent`.

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise } from '@vez/ignis';

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

Components have a simple lifecycle:

1.  **`constructor()`**: The component is instantiated. The constructor receives any injected dependencies. In this phase, you can also define default bindings.
2.  **`binding()`**: This method is called by the application during the startup process. This is where you should register your component's controllers, services, repositories, etc., with the application's DI container.

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
