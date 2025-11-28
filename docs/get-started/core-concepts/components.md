# Components

Components are the primary way to extend the functionality of an Ignis application. They are reusable, pluggable modules that encapsulate a specific feature, such as authentication, logging, or API documentation.

## What is a Component?

A component is a class that extends `BaseComponent` and is responsible for:

- **Binding dependencies:** Registering services, controllers, or other resources with the application's dependency injection container.
- **Configuring features:** Setting up middlewares, initializing services, or performing any other setup required for the feature to work.

Ignis comes with several built-in components, including:

- **`AuthenticateComponent`**: Sets up JWT-based authentication and authorization.
- **`SwaggerComponent`**: Generates interactive OpenAPI documentation for your API.
- **`HealthCheckComponent`**: Adds a health check endpoint to your application.
- **`RequestTrackerComponent`**: Adds request logging and tracing.
- **`SocketIOComponent`**: Integrates Socket.IO for real-time communication.

## Creating a Component

To create a new component, you need to create a class that extends `BaseComponent`. The constructor can be used to define default bindings that the component provides.

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise, Binding } from '@vez/ignis';

// An example service that the component will provide
class MyCustomService {
  // ...
}

export class MyCustomComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: MyCustomComponent.name,
      // Enable default bindings for this component
      initDefault: { enable: true, container: application },
      // Define the default bindings
      bindings: {
        'services.MyCustomService': Binding.bind({ key: 'services.MyCustomService' }).toClass(MyCustomService),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    // This is where you can perform additional bindings or configurations.
    // The default bindings are already handled by the constructor.
    this.application.controller(MyCustomController);
  }
}
```

## Component Lifecycle

Components have a simple lifecycle:

1.  **`constructor()`**: The component is instantiated. The constructor receives any injected dependencies. In this phase, you can also define default bindings using the `initDefault` and `bindings` options. If `initDefault.enable` is `true`, the `BaseComponent` will automatically register the bindings with the provided container if they are not already bound.
2.  **`binding()`**: This method is called by the application during the startup process. This is where you should perform any additional setup, such as registering controllers or other resources that depend on the component's default bindings.

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
