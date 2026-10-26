# The Application Class

The Application class is the root of an IGNIS server. It owns the IoC container, runs the boot sequence that registers your classes, serves HTTP on Bun or Node, and stops cleanly. You extend `BaseApplication`, implement five hooks, and describe the rest in one config object.

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
import AutoArtifacts from "@venizia/ignis-boot/auto";
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
  // Registers every decorated datasource, component, repository, service and controller
  artifacts: AutoArtifacts,
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
    // Setup a decorator cannot express, e.g. bind a value or an option
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

The `IGNIS` application has a well-defined lifecycle, managed primarily by the `init()`, `start()` and `initialize()` methods.

| Method | Description |
| :--- | :--- |
| **`constructor(opts)`** | Initializes the application, sets up the Hono server (`OpenAPIHono`), and detects the runtime (Bun/Node). The `Application` extends `Container` (IoC container). |
| **`init()`** | Registers the core bindings, including `CoreBindings.APPLICATION_INSTANCE`. Call it before `start()`. |
| **`start()`** | The main entry point. It calls `initialize()`, sets up middlewares, mounts the root router, and starts the HTTP server. |
| **`stop()`** | Runs the post-stop hooks, stops the server (`Bun.serve().stop()` or node `server.close()`), then closes every datasource the boot configured, so no pool, socket or PGlite instance outlives the application. Each datasource gets `dataSourceCloseTimeoutMs` (default 10 s) to close. |
| **`initialize()`** | Orchestrates the entire setup process, calling the various configuration and registration methods in the correct order. |

> [!WARNING]
> `start()` does not call `init()` for you, and nothing else does either. `init()` is the only caller of `registerCoreBindings()`, which binds `CoreBindings.APPLICATION_INSTANCE`. Built-in components inject that key (the request tracker is registered first), so an application started without `init()` throws `Binding key: @app/instance is not bounded in context!` on the first component resolution.
>
> ```typescript
> const application = new Application({ scope: 'MyApp', config: appConfigs });
> application.init();
> await application.start();
> ```

`BaseApplication` declares five abstract hook methods, so a subclass implements all of them (an empty body is fine). These are the places you write application-specific setup code.

| Hook Method | Purpose |
| :--- | :--- |
| `getAppInfo()` | Return application metadata, usually from `package.json`. Read by the OpenAPI docs and the health check. |
| `staticConfigure()` | Configure static file serving. Called before `preConfigure()`. |
| `preConfigure()` | Register what the artifact index cannot express - registry calls, hand-made bindings. Classes come from `configs.artifacts`, see [Registering artifacts](./bootstrapping). |
| `postConfigure()` | Perform actions *after* all resources have been configured and instantiated. Note: do not bind new datasources, components, or controllers here -- they will not be auto-configured. |
| `setupMiddlewares()`| Add custom application-level middlewares to the Hono instance. Called after `initialize()` completes. |

## Lifecycle Diagram

This diagram shows the sequence of operations during application startup. `initialize()` runs a boot sequence of sixteen named steps, always in this order.

```
init()                                   ← You call this. Binds CoreBindings.APPLICATION_INSTANCE
  │
  ▼
start()
  │
  ▼
initialize()
  │
  ├─►  1. printStartUpInfo               (application name, version, environment)
  ├─►  2. validateEnvs
  ├─►  3. registerDefaultMiddlewares     (CORS, request id, body limit, error handler, 404, request tracker,
  │                                        contextStorage() when asyncContext.enable, favicon)
  ├─►  4. staticConfigure                ← Override hook
  ├─►  5. registerArtifacts              (registers the index named by configs.artifacts)
  ├─►  6. preConfigure                   ← Override hook
  ├─►  7. hydrateSecrets                 (builds the provider from registerSecrets(), merges its hydrate bundles into the environment)
  ├─►  8. registerConfigurations
  ├─►  9. registerDataSources
  ├─► 10. registerComponents
  ├─► 11. registerContributedDataSources (datasources a component added)
  ├─► 12. wireSecretRotatables           (subscribes rotatable datasources to rotation)
  ├─► 13. registerControllers            (REST + gRPC transport components)
  ├─► 14. postConfigure                  ← Override hook
  ├─► 15. verifyBindings                 (only when bootChecks.binding.doVerify is on)
  └─► 16. validateScopeFilterSupport
  │
  ▼
setupMiddlewares()                       ← Override hook
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

The step names above are the vocabulary you target with `BootSequence.insertAfter`. They live on `ServerBootSteps`, which extends the kernel's `BootSteps`.

## Configuration

Application configuration is passed to the `BaseApplication` constructor via an `IApplicationConfigs` object.

### Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `host` | `string` | `'localhost'` | The host address. Falls back to `HOST` or `APP_ENV_SERVER_HOST` env vars. |
| `port` | `number` | `3000` | The port to listen on. Falls back to `PORT` or `APP_ENV_SERVER_PORT` env vars; a value outside 0-65535 is skipped. `0` asks the OS for a free port, and `getServerPort()` returns the real one. |
| `projectRoot` | `string` | `process.cwd()` | The directory that holds `node_modules` at run time. Never `__dirname` inside a compiled binary. |
| `path.base`| `string` | `'/'` | The base path for all application routes (e.g., `/api`). |
| `path.isStrict`| `boolean`| `true` | When `true`, `/users` and `/users/` are different routes. Set `false` to answer both, and declare routes without a trailing slash: under `false`, a route declared as `/users/` is unreachable. |
| `debug.shouldShowRoutes`| `boolean`| `false`| If `true`, prints all registered routes to the console on startup. |
| `favicon` | `string` | `'🔥'` | An emoji to be used as the application's favicon. |
| `artifacts` | `TArtifactIndexInput` | `undefined` | The generated artifact index (or several) to register before `preConfigure()`. See [Registering artifacts](./bootstrapping). |
| `asyncContext.enable` | `boolean` | `true` | Enable Hono's async context storage (powered by `contextStorage()`). |
| `transports` | `TControllerTransport[]` | `['rest']` | Controller transports to enable. Add `'grpc'` for gRPC support. |
| `error.rootKey` | `string` | `undefined` | Optional root key for error response wrapping. |
| `error.environment` | `string` | `process.env.NODE_ENV` | The ambient environment name. Set it where there is no `process.env`, such as a browser Worker. |
| `middlewares.cors` | `object` | `undefined` | CORS options. Installed first, so early framework responses such as the body-limit 413 carry the headers. |
| `middlewares.bodyLimit` | `object` | `undefined` | Request body limit. Installed right after the request id, ahead of every other middleware. |
| `server.idleTimeout`, `server.maxRequestBodySize` | `number` | Bun's defaults | Bun-only socket options passed to `Bun.serve`. Node logs a warning and ignores them. |
| `discoverArtifacts` | `boolean` | `false` | Registers every decorated class the application imports, with no index. With `artifacts` too, the union registers. |
| `bootChecks` | `object` | `undefined` | Boot-time checks: `binding.{ doVerify, allowManual, allowOverride }` and `allowDerivedKeyCollision`. Without `binding`, nothing is verified. See [Registering artifacts](./bootstrapping). |
| `dataSourceCloseTimeoutMs` | `number` | `10_000` | How long `stop()` waits for one datasource to close. `0` waits without limit. |

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

Decorate each class and set `artifacts: AutoArtifacts` in the application config. IGNIS registers every decorated class before `preConfigure()` runs. See [Registering artifacts](./bootstrapping).

| Decorator | Marks | Binding Scope |
|-----------|-------|---------------|
| `@configuration()` | A typed configuration class, registered first | **Singleton** |
| `@datasource({ ... })` | A database connection | **Singleton** |
| `@component()` | A reusable module | **Singleton** |
| `@repository({ model, dataSource })` | Data access | Transient |
| `@service()` | Business logic | Transient |
| `@controller({ path })` | API endpoints | **Singleton** |

### Registering by hand

`preConfigure()` is for what a decorator cannot express. The `this.dataSource(...)`, `this.component(...)`, `this.repository(...)`, `this.service(...)` and `this.controller(...)` methods still work as an escape hatch. Inside `preConfigure()` or `postConfigure()` they fail when `configs.artifacts` is set and `bootChecks.binding.allowManual` is `false`.

All of them accept an optional second parameter to customize the binding key:

```typescript
// Default binding (key: 'controllers.UserController')
this.controller(UserController);

// Custom binding key
this.controller(UserController, {
  binding: { namespace: 'controllers', key: 'CustomUserController' }
});
```

**Registration order** for decorated classes:
1. Configurations
2. DataSources (database connections)
3. Components
4. Repositories (depend on DataSources)
5. Services (depend on Repositories)
6. Controllers (depend on Services)

> **Deep Dive:** See [Dependency Injection](../dependency-injection.md) for how registration and injection work together.

## Runtime Support

The application detects the runtime automatically via `RuntimeModules.detect()`:

```typescript
// Bun - uses Bun.serve (chosen when `Bun` is defined)
Bun.serve({ port, hostname, fetch: server.fetch })

// Node.js - requires @hono/node-server
import { serve } from '@hono/node-server'
serve({ fetch: server.fetch, port, hostname })
```

`AutoArtifacts` (`@venizia/ignis-boot/auto`) needs Bun, and throws on Node. On Node, generate the index with `ignis-artifacts generate` and pass it as `configs.artifacts`. See [Registering artifacts](./bootstrapping).

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

## Graceful Shutdown

Nothing stops the application on `SIGTERM` or `SIGINT` by itself. Call `installShutdownSignals()` after `start()` to stop it, then exit, when the process is asked to end (a container stop, Ctrl-C):

```typescript
const application = new Application({ scope: 'MyApp', config: appConfigs });
application.init();
await application.start();

const uninstall = application.installShutdownSignals({ timeoutMs: 20_000 });
// later, if you need to take the handlers off again: uninstall();
```

| Option | Default | Meaning |
|---|---|---|
| `signals` | `['SIGTERM', 'SIGINT']` | The signals that start a shutdown |
| `timeoutMs` | `15_000` | A shutdown that takes longer is force-exited with code `1` |
| `exit` | `process.exit` | What ends the process; replace it in a test or a host that exits differently |

It calls `stop()` once: a second signal while it runs is ignored. The process exits `0` when `stop()` finishes, and `1` when it throws or hits the timeout. Calling `installShutdownSignals()` again returns the same uninstall function and adds no listener. It is not installed unless you call it, and it exists on `ServerApplication` only, so a browser Worker host never gets process signal handlers.

A post-stop hook runs before the server stops. Register one with `registerPostStopHook({ identifier, hook })`, the same shape as `registerPostStartHook`.

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
  - [Registering artifacts](./bootstrapping) - Decorators, the generated index, `configs.artifacts`
  - [REST Controllers](/guides/core-concepts/rest-controllers) | [gRPC Controllers](/guides/core-concepts/grpc-controllers) - Creating HTTP/gRPC endpoints
  - [Services](/guides/core-concepts/services) - Business logic layer
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - How DI works in IGNIS

- **References:**
  - [BaseApplication API](/references/base/application) - Complete API reference
  - [Environment Variables](/references/configuration/environment-variables) - Configuration management

- **Tutorials:**
  - [5-Minute Quickstart](/guides/get-started/5-minute-quickstart) - Create your first app
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Complete application example
