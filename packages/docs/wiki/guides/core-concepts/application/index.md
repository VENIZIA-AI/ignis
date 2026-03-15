# The Application Class

The Application class orchestrates your application's configuration, lifecycle, and resource registration (components, controllers, services).

> **Deep Dive:** See [Application Reference](../../../references/base/application.md) for technical details.

## Creating an Application

Extend `BaseApplication` and implement the hook methods:

```typescript
// src/application.ts
import {
  BaseApplication,
  IApplicationConfigs,
  IApplicationInfo,
  ValueOrPromise,
} from "@venizia/ignis";
import packageJson from "./../package.json";

// Application configurations
export const appConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH ?? "/",
    isStrict: true,
  },
  debug: {
    shouldShowRoutes: process.env.NODE_ENV !== "production",
  },
};

// Main Application class
export class Application extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  staticConfigure(): void {
    // e.g., this.static({ folderPath: './public' })
  }

  preConfigure(): ValueOrPromise<void> {
    // Register your resources
    this.dataSource(MyDataSource);
    this.service(MyService);
    this.controller(MyController);
  }

  postConfigure(): ValueOrPromise<void> {
    // Logic to run after everything is configured
  }

  setupMiddlewares(): ValueOrPromise<void> {
    // Add any custom application-wide middlewares
  }
}
```

## Application Lifecycle

The `Ignis` application has a well-defined lifecycle, managed primarily by the `start()` and `initialize()` methods.

| Method | Description |
| :--- | :--- |
| **`constructor(opts)`** | Initializes the application, sets up the Hono server (`OpenAPIHono`), and detects the runtime (Bun/Node). The `Application` extends `Container` (IoC container). |
| **`start()`** | The main entry point. It calls `initialize()`, sets up middlewares, mounts the root router, and starts the HTTP server. |
| **`stop()`** | Stops the application server (calls `Bun.serve.stop()` or `node-server.close()`). |
| **`initialize()`** | Orchestrates the entire setup process, calling the various configuration and registration methods in the correct order. |

The `BaseApplication` class provides several **overridable hook methods** that allow you to customize the startup process. These are the primary places you'll write your application-specific setup code.

| Hook Method | Purpose |
| :--- | :--- |
| `getAppInfo()` | **Required.** Return application metadata, usually from `package.json`. Used for OpenAPI docs. |
| `staticConfigure()` | Configure static file serving. Called before `preConfigure()`. |
| `preConfigure()` | **Most Important Hook.** Set up application resources like components, controllers, services, and datasources. Can be skipped if using [Bootstrapping](./bootstrapping). |
| `postConfigure()` | Perform actions *after* all resources have been configured and instantiated. Note: do not bind new datasources, components, or controllers here -- they will not be auto-configured. |
| `setupMiddlewares()`| Add custom application-level middlewares to the Hono instance. Called after `initialize()` completes. |

## Lifecycle Diagram

This diagram shows the sequence of operations during application startup.

```
start()
  │
  ▼
initialize()
  │
  ├─► printStartUpInfo
  ├─► validateEnvs
  ├─► registerDefaultMiddlewares   (error handler, contextStorage, RequestTracker, favicon)
  ├─► staticConfigure()            ← Override hook
  ├─► preConfigure()               ← Override hook
  ├─► registerDataSources()        (configures all datasource bindings)
  ├─► registerComponents()         (configures all component bindings)
  ├─► registerControllers()        (REST + gRPC transport components)
  └─► postConfigure()              ← Override hook
  │
  ▼
setupMiddlewares()                 ← Override hook
  │
  ▼
Mount Root Router (server.route(basePath, rootRouter))
  │
  ▼
Start HTTP Server (Bun.serve or @hono/node-server)
  │
  ▼
executePostStartHooks()
```

## Configuration

Application configuration is passed to the `BaseApplication` constructor via an `IApplicationConfigs` object.

### Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `host` | `string` | `'localhost'` | The host address. Falls back to `HOST` or `APP_ENV_SERVER_HOST` env vars. |
| `port` | `number` | `3000` | The port to listen on. Falls back to `PORT` or `APP_ENV_SERVER_PORT` env vars. |
| `path.base`| `string` | `'/'` | The base path for all application routes (e.g., `/api`). |
| `path.isStrict`| `boolean`| `true` | If `true`, the router is strict about trailing slashes. |
| `debug.shouldShowRoutes`| `boolean`| `false`| If `true`, prints all registered routes to the console on startup. |
| `favicon` | `string` | `'🔥'` | An emoji to be used as the application's favicon. |
| `bootOptions` | `IBootOptions` | `undefined` | Enable auto-discovery of artifacts. See [Bootstrapping](./bootstrapping). |
| `asyncContext.enable` | `boolean` | `true` | Enable Hono's async context storage (powered by `contextStorage()`). |
| `transports` | `TControllerTransport[]` | `['rest']` | Controller transports to enable. Add `'grpc'` for gRPC support. |
| `error.rootKey` | `string` | `undefined` | Optional root key for error response wrapping. |
| `strictPath` | `boolean` | `true` | Controls trailing slash strictness on the main Hono server. |

### Example Configuration

```typescript
import { ControllerTransports } from '@venizia/ignis';

export const appConfigs: IApplicationConfigs = {
  host: "0.0.0.0",
  port: 3000,
  path: {
    base: "/api",
    isStrict: true,
  },
  debug: {
    shouldShowRoutes: true,
  },
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
};
```

## Registering Resources

Register resources in `preConfigure()` to tell the DI container about your classes:

| Method | Example | Binding Scope | When to Use |
|--------|---------|---------------|-------------|
| `this.dataSource(...)` | `this.dataSource(PostgresDataSource)` | **Singleton** | Register database connection |
| `this.component(...)` | `this.component(AuthComponent)` | **Singleton** | Register reusable modules |
| `this.repository(...)` | `this.repository(UserRepository)` | Transient | Register data access |
| `this.service(...)` | `this.service(UserService)` | Transient | Register business logic |
| `this.controller(...)` | `this.controller(UserController)` | Transient | Register API endpoints |
| `this.booter(...)` | `this.booter(CustomBooter)` | Tagged `'booter'` | Register custom booters |

All registration methods accept an optional second parameter to customize the binding key:

```typescript
// Default binding (key: 'controllers.UserController')
this.controller(UserController);

// Custom binding key
this.controller(UserController, {
  binding: { namespace: 'controllers', key: 'CustomUserController' }
});
```

**Registration order:**
1. DataSources first (database connections)
2. Repositories (depend on DataSources)
3. Services (depend on Repositories)
4. Controllers (depend on Services)
5. Components (can add more datasources/controllers during configuration)

> **Deep Dive:** See [Dependency Injection](../dependency-injection.md) for how registration and injection work together.

## Runtime Support

The application detects the runtime automatically via `RuntimeModules.detect()`:

```typescript
// Bun (default) — uses Bun.serve
Bun.serve({ port, hostname, fetch: server.fetch })

// Node.js — requires @hono/node-server
import { serve } from '@hono/node-server'
serve({ fetch: server.fetch, port, hostname })
```

## Post-Start Hooks

Register hooks that execute after the HTTP server has started:

```typescript
this.registerPostStartHook({
  identifier: 'cache-warmup',
  hook: async () => {
    // Warm up caches, start background jobs, etc.
  },
});
```

## Static File Serving

Serve static files with runtime-aware implementation:

```typescript
staticConfigure(): void {
  this.static({ restPath: '/public/*', folderPath: './public' });
}
```

Uses `hono/bun` `serveStatic` for Bun runtime, `@hono/node-server/serve-static` for Node.js.

## See Also

- **Related Concepts:**
  - [Bootstrapping](./bootstrapping) - Auto-discovery of artifacts
  - [REST Controllers](/guides/core-concepts/rest-controllers) | [gRPC Controllers](/guides/core-concepts/grpc-controllers) - Creating HTTP/gRPC endpoints
  - [Services](/guides/core-concepts/services) - Business logic layer
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - How DI works in IGNIS

- **References:**
  - [BaseApplication API](/references/base/application) - Complete API reference
  - [Environment Variables](/references/configuration/environment-variables) - Configuration management

- **Tutorials:**
  - [5-Minute Quickstart](/guides/get-started/5-minute-quickstart) - Create your first app
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Complete application example
