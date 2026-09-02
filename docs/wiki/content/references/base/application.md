---
title: Application Reference
description: Technical reference for the four application layers - AbstractApplication, RestApplication, ServerApplication and BaseApplication
difficulty: beginner
---

# Deep Dive: Application

Extend `BaseApplication`. The three classes above it exist so a host that cannot open a socket - a browser Worker, a test harness - can still serve the same controllers.

**Files:**
- `packages/kernel/src/base/applications/abstract.ts`
- `packages/kernel/src/base/applications/rest.ts`
- `packages/core-server/src/base/applications/server.ts`
- `packages/core-server/src/base/applications/base.ts`
- `packages/kernel/src/base/applications/types.ts`

## Quick Reference

Each layer adds one capability. The first two ship from `@venizia/ignis-kernel` and touch no node builtin; the last two ship from `@venizia/ignis`.

| Class | Adds | Key Methods |
|-------|------|-------------|
| **AbstractApplication** | config, lifecycle hooks, the DI container | `init()`, `registerPostStartHook()`, `registerPostStopHook()` |
| **RestApplication** | the two `OpenAPIHono` routers | `getServer()`, `getRootRouter()`, `inspectRoutes()` |
| **ServerApplication** | the socket | `start()`, `stop()`, `getServerHost()`, `getServerPort()`, `getServerAddress()` |
| **BaseApplication** | resource registration, secrets, the server boot sequence | `component()`, `controller()`, `service()`, `repository()`, `dataSource()`, `registerArtifacts()`, `validateEnvs()` |

> [!NOTE]
> Every symbol still resolves from `@venizia/ignis` - `packages/core-server` re-exports the kernel wholesale. The split changed no import path.

## `AbstractApplication`

Config, lifecycle and the container. No router, no server. Extends `Container`.

```typescript
abstract class AbstractApplication extends Container
```

### Constructor

```typescript
constructor(opts: { scope: string; config: IApplicationConfigs })
```

The constructor:
1. Merges the provided config with defaults, taking host and port from `getEnvServerHost()` / `getEnvServerPort()` and falling back to `localhost:3000`
2. Resolves `asyncContext.enable` from `getDefaultAsyncContextEnabled()`
3. Sets `projectRoot` from `getProjectRoot()`

Port `0` survives that merge on purpose - it asks the operating system for an ephemeral port.

The constructor binds nothing. `registerCoreBindings()` runs from `init()`, and `init()` is not called for you - see [Lifecycle](#lifecycle) below.

### The four constructor hooks

`getEnvServerHost()`, `getEnvServerPort()`, `getDefaultAsyncContextEnabled()` and `getProjectRoot()` return `undefined`, `undefined`, `false` and `''` here. `ServerApplication` overrides all four to restore server behaviour - `process.env.HOST`, `process.env.PORT`, `true`, and `process.cwd()`. The kernel layers read no `process`, because a browser Worker has none.

> [!WARNING]
> All four run inside this constructor, before any subclass field is assigned. An override must return a literal or read module-level state only. Reading `this.something` from one yields `undefined`, silently. `getProjectRoot()` is the one applications most often override - keep it free of instance state.

## `RestApplication`

Adds the routers, and nothing that opens a socket.

```typescript
abstract class RestApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
> extends AbstractApplication
```

It builds the two `OpenAPIHono` instances - the main server and the `rootRouter` - and binds them as `APPLICATION_SERVER` and `APPLICATION_ROOT_ROUTER`.

## `ServerApplication`

Adds `start()`, `stop()` and the runtime detection that picks `Bun.serve` or `@hono/node-server`.

```typescript
abstract class ServerApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
> extends RestApplication<AppEnv, AppSchema, BasePath>
  implements IApplication<AppEnv, AppSchema, BasePath>
```
5. Auto-detects the runtime (Bun or Node.js)

### Key Features

| Feature | Description |
| :--- | :--- |
| **Hono Instance** | Creates and holds two `OpenAPIHono` instances - a main server and a root router |
| **Runtime Detection** | Auto-detects Bun or Node.js via `RuntimeModules.detect()` and uses the appropriate server implementation |
| **Core Bindings** | Registers `CoreBindings.APPLICATION_INSTANCE`, `CoreBindings.APPLICATION_SERVER`, and `CoreBindings.APPLICATION_ROOT_ROUTER` |
| **Lifecycle Management** | Defines abstract methods (`preConfigure`, `postConfigure`, `setupMiddlewares`, `staticConfigure`, `initialize`, `getAppInfo`) |
| **Environment Validation** | Validates all registered `applicationEnvironment` keys are non-empty (unless `ALLOW_EMPTY_ENV_VALUE` is set) |
| **Post-Start Hooks** | Supports registering hooks that execute after the server starts |

### Abstract Methods

These must be implemented by subclasses:

| Method | Signature | Purpose |
| :--- | :--- | :--- |
| `getAppInfo()` | `() => ValueOrPromise<IApplicationInfo>` | Return application metadata (name, version, description) |
| `preConfigure()` | `() => ValueOrPromise<void>` | Register resources before framework auto-configuration |
| `postConfigure()` | `() => ValueOrPromise<void>` | Logic after all resources are configured |
| `staticConfigure()` | `() => void` | Pre-DI static setup (synchronous) |
| `setupMiddlewares(opts?)` | `(opts?: { middlewares?: Record<string \| symbol, any> }) => ValueOrPromise<void>` | Register Hono middlewares |
| `initialize()` | `() => Promise<void>` | Full initialization sequence |

### Public Methods

| Method | Return Type | Description |
| :--- | :--- | :--- |
| `getProjectConfigs()` | `IApplicationConfigs` | Returns the merged application config |
| `getProjectRoot()` | `string` | Returns `process.cwd()` and binds it to `CoreBindings.APPLICATION_PROJECT_ROOT` |
| `getRootRouter()` | `OpenAPIHono` | Returns the root router instance |
| `getServerHost()` | `string` | Returns the configured host |
| `getServerPort()` | `number` | Returns the configured port |
| `getServerAddress()` | `string` | Returns `host:port` string |
| `getServer()` | `OpenAPIHono` | Returns the main Hono server instance |
| `getServerInstance()` | `TBunServerInstance \| TNodeServerInstance \| undefined` | Returns the underlying runtime server instance |
| `registerPostStartHook(opts)` | `void` | Register a hook to run after server start |
| `init()` | `void` | Calls `registerCoreBindings()` |
| `start()` | `Promise<void>` | Runs `initialize()`, `setupMiddlewares()`, mounts root router, starts the server, then runs post-start hooks |
| `stop()` | `void` | Stops the server (calls `.stop()` for Bun, `.close()` for Node.js) |

### `start()` Method Flow

```mermaid
graph TD
    A(start) --> B(initialize);
    B --> C(setupMiddlewares);
    C --> D(Mount rootRouter on base path);
    D --> E{Runtime?};
    E -->|Bun| F(Bun.serve);
    E -->|Node.js| G(@hono/node-server serve);
    F --> H(executePostStartHooks);
    G --> H;
```

### Server Types

```typescript
// Bun server instance
type TBunServerInstance = ReturnType<typeof Bun.serve>;

// Node.js server instance (from @hono/node-server)
type TNodeServerInstance = any;
```

The server is stored as a discriminated union based on runtime:

```typescript
protected server:
  | { hono: OpenAPIHono; runtime: 'bun'; instance?: TBunServerInstance }
  | { hono: OpenAPIHono; runtime: 'node'; instance?: TNodeServerInstance };
```

## `BaseApplication`

Extends `ServerApplication` with concrete lifecycle implementations, resource registration and secrets hydration. Implements `IRestApplication`, and still `IBootableApplication` for the deprecated `boot()`. This is the class your application extends.

```typescript
abstract class BaseApplication
  extends ServerApplication
  implements IRestApplication, IBootableApplication
```

### Resource Registration Methods

The six methods below bind classes to the DI container with conventional keys. Each of the five single-class methods reads the class's decorator defaults (`binding`, `scope`, `allowOverride`, set through `@controller`, `@service`, ...); an explicit `opts` at the call site wins over them. `registerArtifacts` is what the `registerArtifacts` boot step calls with `configs.artifacts` - see [Artifact Registration](/references/base/bootstrapping).

| Method | DI Binding Key Convention | Scope |
| :--- | :--- | :--- |
| `component(ctor, opts?)` | `components.{Name}` | Singleton |
| `controller(ctor, opts?)` | `controllers.{Name}` | Singleton |
| `service(ctor, opts?)` | `services.{Name}` | Transient |
| `repository(ctor, opts?)` | `repositories.{Name}` | Transient |
| `dataSource(ctor, opts?)` | `datasources.{Name}` | Singleton |
| `registerArtifacts(index)` | one call per listed class, in dependency order | per class |

> [!TIP]
> All registration methods accept an optional `opts.binding` parameter to override the default namespace-based key:
> ```typescript
> this.controller(UserController, {
>   binding: { namespace: 'controllers', key: 'CustomUserController' },
> });
> ```

### Method Signatures

```typescript
component<Base extends BaseComponent>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>
controller<Base>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>
service<Base extends IService>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>
repository<Base extends IRepository>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>
dataSource<Base extends IDataSource>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base>
registerArtifacts(index: TArtifactIndexInput): Promise<void>
protected registerConfiguredArtifacts(): Promise<void>
```

Where `TMixinOpts` is:

```typescript
type TMixinOpts = {
  binding?: { namespace: string; key: string };
  allowOverride?: boolean;
};
```

The options describe the registration, never the artifact: what a class needs goes on the class.

| Method | Binding scope | Why |
|---|---|---|
| `component`, `dataSource`, `controller` | `SINGLETON` | One instance per application - a controller is mounted once, a datasource holds one pool |
| `service`, `repository` | `TRANSIENT` | A new instance per resolution, so each injection point owns its own |

`binding` is optional - omit it and the method derives `{ namespace, key }` from the class name.
`allowOverride` defaults to `true`, matching `bind()`'s own silent-overwrite behavior: register the
same key twice and the second registration wins, no warning. Set it to `false` to make a same-key
re-registration throw instead of silently shadowing the first one.

```typescript
this.controller(UserController, { allowOverride: false });
```

### Static File Serving

```typescript
static(opts: { restPath?: string; folderPath: string }): this
```

Serves static files using the appropriate runtime handler (`hono/bun` for Bun, `@hono/node-server/serve-static` for Node.js). The `restPath` defaults to `'*'`.

```typescript
this.static({ restPath: '/public/*', folderPath: './public' });
```

### Artifact registration

```typescript
async registerArtifacts(index: TArtifactIndexInput): Promise<void>
protected async registerConfiguredArtifacts(): Promise<void>
```

`registerArtifacts` registers one index or a composition of indexes: datasources, then components (plus their `@provide` keys), repositories, services, controllers; a class's `when` may skip it and `order` sorts within a kind. `registerConfiguredArtifacts` is the boot step that passes `configs.artifacts` to it. Full behavior: [Artifact Registration](/references/base/bootstrapping#registerartifacts).

```typescript
/** @deprecated */
boot(): Promise<IBootReport>
```

A no-op kept for applications that still call or override it. Warns once per process and returns `{ booters: [], phases: [], totalDurationMs: 0 }`. `booter()` and `registerBooters()` are removed.

### registerDynamicBindings

Protected. Scans one binding namespace, resolves each binding and calls its `configure()`, then re-scans until a pass adds nothing new. An artifact that a `configure()` registers is therefore picked up in the same call.

```typescript
protected async registerDynamicBindings<T extends IConfigurable>(opts: {
  namespace: TBindingNamespace;
  onBeforeConfigure?: (opts: { binding: Binding<T> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<T>; instance: T }) => Promise<void>;
}): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `namespace` | `TBindingNamespace` | Binding namespace to scan (e.g., `'components'`, `'datasources'`) |
| `onBeforeConfigure` | callback | Runs before each binding's `configure()` |
| `onAfterConfigure` | callback | Runs after `configure()`, once the binding is already marked configured |

Configured keys are remembered per namespace, so a second call over the same namespace touches only what the first one missed.

### `initialize()` Method Flow

Startup sequence executed by the `initialize()` method:

```mermaid
graph TD
    A(start) --> B(printStartUpInfo);
    B --> C(validateEnvs);
    C --> D(registerDefaultMiddlewares);
    D --> E(staticConfigure);
    E --> E2(registerArtifacts);
    E2 --> F(preConfigure);
    F --> G(hydrateSecrets);
    G --> H(registerDataSources);
    H --> I(registerComponents);
    I --> J(registerContributedDataSources);
    J --> K(wireSecretRotatables);
    K --> L(registerControllers);
    L --> M(postConfigure);
    M --> N(validateScopeFilterSupport);
```

Fourteen steps. `getBootSequence()` returns them as data (`ServerBootSteps` names each one), `runBootSequence()` logs `Boot step n/14 <name>` per step, and a subclass inserts its own step with `BootSequence.insertAfter({ steps, target, step })`.

| Hook | When to Use | Notes |
|------|-------------|-------|
| **`staticConfigure()`** | Pre-DI static setup (static files, etc.) | Synchronous, called before `registerArtifacts` |
| **`registerArtifacts`** | Framework registers every class in `configs.artifacts` | Decorator `when` conditions run here, before `preConfigure` |
| **`preConfigure()`** | Register what the index cannot express - registry calls, hand-made bindings | Nothing instantiated yet - order doesn't matter |
| **`register...()`** | Framework iterates bindings and instantiates classes | DataSources initialized first (other layers depend on them) |
| **`postConfigure()`** | Logic after all resources configured | Do not register new datasources/components/controllers here - they won't auto-configure |

### registerDefaultMiddlewares

Automatically registers these default middlewares during `initialize()`:

1. **Error handler** (`AppErrorMiddleware`) - with optional `rootKey` from `configs.error.rootKey`
2. **Async context storage** (`contextStorage`) - enabled by default via `configs.asyncContext.enable`
3. **Not-found handler** (`notFoundHandler`)
4. **RequestTrackerComponent** - assigns `x-request-id` to every request, includes request body parsing
5. **Emoji favicon** - defaults to the flame emoji, configurable via `configs.favicon`

### registerControllers and Transport Support

The `registerControllers()` method supports multiple transport protocols via the `transports` config:

```typescript
// In your application config
{
  transports: ['rest'],        // Default: REST only
  transports: ['rest', 'grpc'], // Enable both REST and gRPC
  transports: ['grpc'],        // gRPC only
}
```

For each transport in the array, the corresponding component (`RestComponent` or `GrpcComponent`) is instantiated and configured. If gRPC controllers are discovered but the `'grpc'` transport is not enabled, a warning is logged.

### registerComponents

A component may register more components while it is configured, at any nesting depth, and may add a datasource of its own. Contributed datasources are configured by `registerContributedDataSources()`, one flat sweep that runs after every component has finished - not after each component in turn. A component that uses a datasource an earlier component contributed sees it unconfigured until that sweep runs.

## `IApplicationConfigs`

```typescript
interface IApplicationConfigs {
  host?: string;                          // Server host (default: process.env.HOST || 'localhost')
  port?: number;                          // Server port (default: process.env.PORT || 3000)
  path: { base: string; isStrict: boolean }; // Base path config (required)
  requestId?: { isStrict: boolean };      // Request ID validation
  favicon?: string;                       // Favicon emoji (default: '🔥')
  error?: { rootKey: string };            // Error response root key
  asyncContext?: { enable: boolean };     // Hono async context storage (default: true)
  artifacts?: TArtifactIndexInput;        // Generated indexes registered before preConfigure
  bootOptions?: IBootOptions;             // @deprecated - ignored
  debug?: { shouldShowRoutes?: boolean }; // Show registered routes on startup
  transports?: TControllerTransport[];    // Controller transports: 'rest' | 'grpc' (default: ['rest'])
  [key: string]: any;                     // Extensible (e.g. strictPath?: boolean - Hono strict path matching, default: true)
}
```

### `TArtifactIndexInput`

```typescript
interface IArtifactIndex {
  dataSources?: ReadonlyArray<TClass<IDataSource>>;
  components?: ReadonlyArray<TClass<BaseComponent>>;
  repositories?: ReadonlyArray<TClass<IRepository>>;
  services?: ReadonlyArray<TClass<IService>>;
  controllers?: ReadonlyArray<TClass<unknown>>;
}

type TArtifactIndexInput = IArtifactIndex | TArtifactIndexInput[];
```

`IBootOptions` and `IArtifactOptions` still exist, deprecated, so an old `bootOptions` entry type-checks; the value is ignored.

### `TControllerTransport`

```typescript
class ControllerTransports {
  static readonly REST = 'rest';
  static readonly GRPC = 'grpc';
}

type TControllerTransport = 'rest' | 'grpc';
```

## `IApplicationInfo`

```typescript
interface IApplicationInfo {
  name: string;
  version: string;
  description: string;
  author?: { name: string; email: string; url?: string };
  [extra: string | symbol]: any;
}
```

## `CoreBindings`

Core binding keys used for fundamental application components:

| Key | Value | Description |
| :--- | :--- | :--- |
| `APPLICATION_INSTANCE` | `'@app/instance'` | The application instance itself |
| `APPLICATION_SERVER` | `'@app/server'` | The server object (hono + runtime + instance) |
| `APPLICATION_CONFIG` | `'@app/config'` | Application configuration |
| `APPLICATION_PROJECT_ROOT` | `'@app/project_root'` | Project root directory (`process.cwd()`) |
| `APPLICATION_ROOT_ROUTER` | `'@app/router/root'` | The root OpenAPIHono router |
| `APPLICATION_ENVIRONMENTS` | `'@app/environments'` | Application environment variables |
| `APPLICATION_MIDDLEWARE_OPTIONS` | `'@app/middleware_options'` | Middleware configuration options |

## `BindingNamespaces`

Standard namespaces for organizing DI bindings:

| Namespace | Value | Used By |
| :--- | :--- | :--- |
| `COMPONENT` | `'components'` | `component()` |
| `DATASOURCE` | `'datasources'` | `dataSource()` |
| `REPOSITORY` | `'repositories'` | `repository()` |
| `MODEL` | `'models'` | Model bindings |
| `SERVICE` | `'services'` | `service()` |
| `MIDDLEWARE` | `'middlewares'` | Middleware bindings |
| `PROVIDER` | `'providers'` | Provider bindings |
| `CONTROLLER` | `'controllers'` | `controller()` |
| `BOOTERS` | `'booters'` | Nothing since `booter()` was removed; kept for compatibility |

## Mixin Interfaces

`BaseApplication` implements several mixin interfaces that define its capabilities:

| Interface | Methods | Description |
| :--- | :--- | :--- |
| `IComponentMixin` | `component()`, `registerComponents()` | Component registration and lifecycle |
| `IControllerMixin` | `controller()`, `registerControllers()` | Controller registration and route mounting |
| `IRepositoryMixin` | `dataSource()`, `repository()` | DataSource and repository registration |
| `IServiceMixin` | `service()` | Service registration |
| `IStaticServeMixin` | `static()` | Static file serving |

> [!NOTE]
> There is also an `IServerConfigMixin` interface defined in the mixins types that declares `staticConfigure()`, `preConfigure()`, `postConfigure()`, and `getApplicationVersion()`, though `BaseApplication` inherits the first three from `AbstractApplication`.

## Middleware Configuration Types

These types are used when configuring middlewares via `setupMiddlewares()`:

```typescript
interface IMiddlewareConfigs {
  requestId?: IRequestIdOptions;
  compress?: ICompressOptions;
  cors?: ICORSOptions;
  csrf?: ICSRFOptions;
  bodyLimit?: IBodyLimitOptions;
  ipRestriction?: IBaseMiddlewareOptions & IIPRestrictionRules;
  [extra: string | symbol]: any;
}

interface IBaseMiddlewareOptions {
  enable: boolean;
  path?: string;
  [extra: string | symbol]: any;
}
```

## See Also

- **Related Concepts:**
  - [Application Guide](/guides/core-concepts/application/) - Creating your first application
  - [Registering artifacts](/guides/core-concepts/application/bootstrapping) - Decorators, the generated index, `configs.artifacts`
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - How DI works in IGNIS
  - [REST Controllers](/guides/core-concepts/rest-controllers) | [gRPC Controllers](/guides/core-concepts/grpc-controllers) - Registering HTTP/gRPC endpoints

- **References:**
  - [Artifact Registration API](/references/base/bootstrapping) - Stereotypes, `@provide`, `registerArtifacts`, the generator
  - [Components API](/references/base/components) - Component system
  - [gRPC Controllers](/references/base/grpc-controllers) - gRPC transport reference
  - [Environment Variables](/references/configuration/environment-variables) - Configuration management
  - [Middlewares](/references/base/middlewares) - Request interceptors

- **Tutorials:**
  - [5-Minute Quickstart](/guides/get-started/5-minute-quickstart) - Create your first app
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api) - Complete application example

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Application structure patterns
