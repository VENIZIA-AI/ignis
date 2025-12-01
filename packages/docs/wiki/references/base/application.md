# Deep Dive: Application

This document provides a technical overview of the `AbstractApplication` and `BaseApplication` classes, which form the foundation of every Ignis project.

## `AbstractApplication`

The `AbstractApplication` class is the primary abstract class that your application will extend. It's responsible for the core lifecycle and server management.

-   **File:** `packages/core/src/base/applications/abstract.ts`

### Key Responsibilities and Features

| Feature | Description |
| :--- | :--- |
| **Hono Instance** | It creates and holds the `OpenAPIHono` instance, which is the underlying web server. |
| **Runtime Detection** | It automatically detects whether the application is running on `Bun` or `Node.js` and uses the appropriate server implementation. |
| **Core Bindings** | It registers essential services with the DI container, such as the application instance itself (`CoreBindings.APPLICATION_INSTANCE`) and the server (`CoreBindings.APPLICATION_SERVER`). |
| **Lifecycle Management** | It defines the abstract methods (`preConfigure`, `postConfigure`, `setupMiddlewares`, etc.) that structure the application's startup and shutdown processes. |
| **Environment Validation** | The `validateEnvs()` method ensures that all required environment variables (prefixed with `APP_ENV_`) are present. |

## `BaseApplication`

The `BaseApplication` class extends `AbstractApplication` and provides concrete implementations for most of the application's lifecycle, including resource registration and default middleware setup.

-   **File:** `packages/core/src/base/applications/base.ts`

### Resource Registration Methods

`BaseApplication` provides a set of convenient methods for registering your application's building blocks. These methods bind the provided classes to the DI container with conventional keys.

| Method | DI Binding Key Convention |
| :--- | :--- |
| `component(MyComponent)` | `components.MyComponent` |
| `controller(MyController)` | `controllers.MyController` |
| `service(MyService)` | `services.MyService` |
| `repository(MyRepository)`| `repositories.MyRepository` |
| `dataSource(MyDataSource)`| `datasources.MyDataSource` |

### `initialize()` Method Flow

The `initialize()` method orchestrates the entire startup sequence. Understanding this flow is key to knowing where to place your custom logic.

```mermaid
graph TD
    A(start() calls initialize()) --> B(printStartUpInfo);
    B --> C(validateEnvs);
    C --> D(registerDefaultMiddlewares);
    D --> E(staticConfigure());
    E --> F(preConfigure());
    F --> G(registerDataSources);
    G --> H(registerComponents);
    H --> I(registerControllers);
    I --> J(postConfigure());
```

-   **`preConfigure()`**: This is the ideal place to register all your resources (datasources, services, controllers, etc.). At this stage, nothing is instantiated yet, so the order of registration doesn't matter.
-   **`register...()` Methods**: These methods iterate over the bindings you created in `preConfigure`, instantiate the classes, and call their `configure()` or `binding()` methods. The order is important: DataSources are initialized first, as other layers depend on them.
-   **`postConfigure()`**: This method is for logic that needs to run *after* all resources have been instantiated and configured. For example, you might use it to fetch some initial data from a repository.
