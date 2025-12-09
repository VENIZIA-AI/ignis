# Components

Components are reusable, pluggable modules that encapsulate features like authentication, logging, or API documentation.

> **Deep Dive:** See [Components Reference](../../references/base/components.md) for technical details.

## What is a Component?

A component is a class that extends `BaseComponent` and is responsible for:

- **Binding Dependencies**: Registering services, controllers, providers, or other resources with the application's dependency injection container.
- **Configuring Features**: Setting up middlewares, initializing services, or performing any other setup required for the feature to work.

`Ignis` comes with several built-in components, which you can explore in the [**Components Reference**](../../references/components/) section:

- **`AuthenticateComponent`**: Sets up JWT-based authentication.
- **`SwaggerComponent`**: Generates interactive OpenAPI documentation.
- **`HealthCheckComponent`**: Adds a health check endpoint.
- **`RequestTrackerComponent`**: Adds request logging and tracing.
- **`SocketIOComponent`**: Integrates Socket.IO for real-time communication.

## Creating a Component

To create a new component, extend the `BaseComponent` class. The constructor is the ideal place to define any **default bindings** that the component provides.

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise, Binding, BindingScopes } from '@vez/ignis';

// An example service that the component will provide
class MyFeatureService {
  // ... business logic
}

// A controller that depends on the service
@controller({ path: '/my-feature' })
class MyFeatureController {
  constructor(
    @inject({ key: 'services.MyFeatureService' })
    private myFeatureService: MyFeatureService
  ) { /* ... */ }
}

export class MyFeatureComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({
      scope: MyFeatureComponent.name,
      // Enable default bindings for this component
      initDefault: { enable: true, container: application },
      // Define the default bindings this component provides
      bindings: {
        'services.MyFeatureService': Binding.bind({ key: 'services.MyFeatureService' })
          .toClass(MyFeatureService)
          .setScope(BindingScopes.SINGLETON), // Make it a singleton
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    // This is where you configure logic that USES the bindings.
    // Here, we register a controller that depends on the service
    // we just bound in the constructor.
    this.application.controller(MyFeatureController);
  }
}
```

## Component Lifecycle

Components have a simple, two-stage lifecycle managed by the application.

| Stage | Method | Description |
| :--- | :--- | :--- |
| **1. Instantiation** | `constructor()` | The component is created by the DI container. This is where you call `super()` and define the component's `bindings`. If `initDefault` is enabled, these bindings are registered with the application container immediately. |
| **2. Configuration**| `binding()` | Called by the application during the `registerComponents` startup phase. This is where you should set up resources (like controllers) that *depend* on the bindings you defined in the constructor. |

## Registering a Component

To activate a component, you must register it with the application instance, usually in the `preConfigure` method of your `Application` class.

```typescript
// in src/application.ts
import { MyFeatureComponent } from './components/my-feature.component';

// ... inside your Application class

  preConfigure(): ValueOrPromise<void> {
    // ...
    this.component(MyFeatureComponent);
    // ...
  }
```

When the application starts, it will find the `MyFeatureComponent` binding, instantiate it, and then call its `binding()` method at the appropriate time. This modular approach keeps your main application class clean and makes it easy to toggle features on and off.
