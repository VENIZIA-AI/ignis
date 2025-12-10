# Deep Dive: Components

Technical reference for `BaseComponent` - creating pluggable, reusable modules in Ignis.

**File:** `packages/core/src/base/components/base.ts`

## Quick Reference

| Feature | Benefit |
|---------|---------|
| **Encapsulation** | Bundle feature bindings (services, controllers) into single class |
| **Lifecycle Management** | Auto-called `binding()` method during startup |
| **Default Bindings** | Self-contained with automatic DI registration |

## `BaseComponent` Class

Abstract class for all components - structures resource binding and lifecycle management.

### Key Features

| Feature | Description |
| :--- | :--- |
| **Encapsulation** | Bundles necessary bindings (services, controllers) for a feature |
| **Lifecycle Management** | `binding()` method auto-called during startup |
| **Default Bindings** | Auto-registers with application container (self-contained) |

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
import { BaseApplication, BaseComponent, inject, CoreBindings, ValueOrPromise, Binding } from '@venizia/ignis';

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
