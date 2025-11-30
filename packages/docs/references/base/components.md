# Deep Dive: Components

This document provides a technical overview of the `BaseComponent` class, the foundation for creating pluggable and reusable modules in Ignis.

## `BaseComponent` Class

The `BaseComponent` is an abstract class that all components must extend. It provides a structured way to bind resources to the application's dependency injection (DI) container and manage the component's lifecycle.

-   **File:** `packages/core/src/base/components/base.ts`

### Purpose and Features

| Feature | Description |
| :--- | :--- |
| **Encapsulation** | Bundles all the necessary bindings (services, controllers, etc.) for a specific feature into a single, manageable class. |
| **Lifecycle Management** | Provides a `binding()` method that is automatically called by the application during startup, ensuring that the component's resources are configured at the right time. |
| **Default Bindings** | Allows for the definition of default bindings that can be automatically registered with the application's container, making components self-contained. |

### Constructor Options

The `super()` constructor in your component can take the following options:

| Option | Type | Description |
| :--- | :--- | :--- |
| `scope` | `string` | **Required.** A unique name for the component, typically `MyComponent.name`. Used for logging. |
| `initDefault` | `{ enable: boolean; container: Container }` | If `enable` is `true`, the `bindings` defined below will be automatically registered with the provided `container` (usually the application instance) if they are not already bound. |
| `bindings` | `Record<string, Binding>` | An object where keys are binding keys (e.g., `'services.MyService'`) and values are `Binding` instances. These are the default services, values, or providers that your component offers. |

### Lifecycle Flow

1.  **Application Instantiates Component**: When you call `this.component(MyComponent)` in your application, the DI container creates an instance of your component.
2.  **Constructor Runs**: Your component's constructor calls `super()`, setting up its scope and defining its default `bindings`. If `initDefault` is enabled, these bindings are immediately registered with the application container.
3.  **Application Calls `binding()`**: During the `registerComponents` phase of the application startup, the `binding()` method of your component is called. This is where you can perform additional setup that might depend on the default bindings being available.

### Example Implementation

```typescript
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise, Binding } from '@vez/ignis';

// A service this component provides
class MyComponentService { /* ... */ }

// A controller that uses the service
@controller({ path: '/my-feature' })
class MyComponentController extends BaseController {
  constructor(@inject({ key: 'services.MyComponentService' }) service: MyComponentService) { /* ... */ }
  // ...
}

export class MyCustomComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: MyCustomComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        'services.MyComponentService': Binding.bind({ key: 'services.MyComponentService' })
          .toClass(MyComponentService)
          .setScope(BindingScopes.SINGLETON),
      },
    });
  }

  // This method is called after the default bindings are registered.
  override binding(): ValueOrPromise<void> {
    // We can now register the controller, which depends on the service.
    this.application.controller(MyComponentController);
  }
}
```
This architecture makes features modular. The `AuthenticateComponent`, for example, uses this pattern to provide the `JWTTokenService` as a default binding and then registers the `AuthController` which depends on it.
