---
title: gRPC Controllers Reference
description: Technical reference for gRPC controller classes, RPC decorators, ConnectRPC adapter, and component integration
difficulty: intermediate
---

# Deep Dive: gRPC Controllers

Technical reference for gRPC controller classes -- the foundation for building gRPC services in IGNIS, powered by [ConnectRPC](https://connectrpc.com/).

IGNIS gRPC controllers follow the same patterns as REST controllers (decorator-based routing, `binding()` method, DI integration) while bridging to ConnectRPC's universal handler system. REST and gRPC controllers coexist in the same application, sharing the same DI container, middleware pipeline, and lifecycle.

**Files:**
- `packages/core/src/base/controllers/grpc/abstract.ts`
- `packages/core/src/base/controllers/grpc/base.ts`
- `packages/core/src/base/controllers/grpc/adapter.ts`
- `packages/core/src/base/controllers/grpc/common/types.ts`
- `packages/core/src/base/metadata/routes/rpc.ts`
- `packages/core/src/components/controller/grpc/grpc.component.ts`
- `packages/core/src/components/controller/grpc/common/types.ts`

## Quick Reference

| Item | Description |
|------|-------------|
| **AbstractGrpcController** | Abstract base class with RPC registration, ConnectRPC adapter mounting, idempotent `configure()` |
| **BaseGrpcController** | Recommended concrete base class with `bindRoute()` and `defineRoute()` implementations |
| **GrpcRequestAdapter** | Internal bridge from IGNIS handlers to ConnectRPC universal handlers via `AsyncLocalStorage` |
| **GrpcComponent** | Auto-discovers gRPC controllers and mounts them on the application router |
| **@controller** | Class decorator with `transport: ControllerTransports.GRPC` and `service` field |
| **@unary** | Method decorator for unary RPCs |
| **@serverStream** | Method decorator for server-streaming RPCs (**unsupported -- throws at boot**) |
| **@clientStream** | Method decorator for client-streaming RPCs (**unsupported -- throws at boot**) |
| **@bidiStream** | Method decorator for bidirectional-streaming RPCs (**unsupported -- throws at boot**) |
| **@rpc** | Generic method decorator (requires explicit `method` in configs) |

> [!WARNING]
> **Current version supports unary RPCs only.** The `@serverStream`, `@clientStream`, and `@bidiStream` decorators still exist and set metadata correctly. But `BaseGrpcController.registerRoute()` throws a clear error at boot time if a non-unary RPC is registered - the Connect protocol over HTTP/1.1 cannot support streaming. The decorators are preserved for forward compatibility.

## Prerequisites

gRPC support requires the following peer dependencies:

```bash
bun add @connectrpc/connect @bufbuild/protobuf
```

| Package | Purpose |
|---------|---------|
| `@connectrpc/connect` | ConnectRPC router, universal handlers, protocol bridge |
| `@bufbuild/protobuf` | Protobuf code generation, `create()` for constructing response messages |

For client-side usage (e.g., test clients), you also need a transport package:

```bash
bun add @connectrpc/connect-web
```

> [!NOTE]
> `@connectrpc/connect` is an **optional** peer dependency of `@venizia/ignis`. It is only loaded at runtime when a gRPC controller is configured, via `createRequire` from the application's `node_modules`. If it is missing, `GrpcRequestAdapter.build()` throws a clear error at startup via `ModuleUtility.assertInstalled()`. A compiled binary has no `node_modules` to resolve against and must pass the peer through `IGrpcComponentConfig.module` - see [Peer Dependency Loading](#peer-dependency-loading). `@bufbuild/protobuf` is required by your generated protobuf code (e.g. `create()`), not by the framework itself.

### Protobuf Code Generation

Use `buf` or `protoc-gen-es` to generate TypeScript code from `.proto` files:

```yaml
# buf.gen.yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: generated
    opt: target=ts
```

```bash
buf generate proto/greeter.proto
```

The generated output includes:
- **Service descriptors** (e.g., `GreeterService`) -- passed to `@controller({ service })`
- **Message schemas** (e.g., `SayHelloResponseSchema`) -- used with `create()` to build responses
- **TypeScript types** (e.g., `SayHelloRequest`, `SayHelloResponse`) -- for handler signatures

## `BaseGrpcController`

The recommended base class for gRPC controllers. Extends `AbstractGrpcController` with concrete `bindRoute()` and `defineRoute()` implementations.

### Constructor Options

```typescript
interface IGrpcControllerOptions {
  scope: string;
  path?: string;  // Falls back to @controller decorator path if not provided
}
```

The `scope` is used for scoped logging (`this.logger.for('methodName')`). The `path` defines the HTTP mount point for the ConnectRPC handlers; when both the constructor and `@controller` decorator specify a path, the decorator takes precedence.

### Generic Parameters

`BaseGrpcController` accepts five generic parameters:

```typescript
class BaseGrpcController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = unknown,
  ConfigurableOptions extends object = {},
>
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `RouteEnv` | `Env` | Hono environment type for typed context access |
| `RouteSchema` | `{}` | Hono schema type |
| `BasePath` | `'/'` | Base path string literal type |
| `ServiceType` | `unknown` | ConnectRPC service descriptor type |
| `ConfigurableOptions` | `{}` | Extra options passed to `configure()` |

`AbstractGrpcController` differs by defaulting `ServiceType` to `Parameters<ConnectRouter['service']>[0]` (the actual ConnectRPC service descriptor type), providing stricter type checking on the `service` field.

### The `@controller` Decorator

gRPC controllers use the same `@controller` decorator as REST controllers, with two additional fields:

```typescript
@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: GreeterServiceDef,  // Generated ConnectRPC service descriptor
})
export class GreeterController extends BaseGrpcController {
  // ...
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | HTTP base path for this controller's RPC endpoints |
| `transport` | `ControllerTransports.GRPC` | Yes | Marks this controller for gRPC transport (picked up by `GrpcComponent`) |
| `service` | `ServiceType` | Yes | ConnectRPC service descriptor from generated protobuf code |
| `tags` | `string[]` | No | Metadata tags (inherited from base controller metadata) |
| `description` | `string` | No | Controller description (inherited from base controller metadata) |

> [!NOTE]
> If `service` is missing or falsy at configure time, the `GrpcComponent` logs a warning and skips the controller entirely -- no routes are mounted.

### Route Definition Patterns

Like REST controllers, gRPC controllers support three route definition patterns:

#### 1. Decorator-Based (Recommended)

```typescript
@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: GreeterServiceDef,
})
export class GreeterController extends BaseGrpcController {
  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
    return create(SayHelloResponseSchema, { message: `Hello, ${opts.request.name}!` });
  }
}
```

Decorator-based RPCs are auto-discovered during `configure()` via `registerRpcsFromRegistry()`. The `binding()` method can be left empty if all routes use decorators.

#### 2. `defineRoute()` -- Imperative

```typescript
override binding() {
  this.defineRoute({
    configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
    handler: async (opts) => {
      return create(SayHelloResponseSchema, { message: `Hello!` });
    },
  });
}
```

#### 3. `bindRoute().to()` -- Fluent

```typescript
override binding() {
  this.bindRoute({
    configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
  }).to({
    handler: async (opts) => {
      return create(SayHelloResponseSchema, { message: `Hello!` });
    },
  });
}
```

### The `binding()` Method

An abstract method you override to register RPCs using `defineRoute()` or `bindRoute()`. Called during `configure()` before decorator-based RPCs are registered. If you only use decorators, provide an empty implementation:

```typescript
override binding() {}
```

### The `definitions` Property

A `Record<string, IRpcRegistration>` that stores all registered RPC handlers keyed by their proto method name. Populated by both decorator-based and imperative registration. The `GrpcRequestAdapter` reads this to build ConnectRPC handlers.

```typescript
interface IRpcRegistration<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  handler: TRpcHandler<unknown, unknown, RouteEnv>;
  middlewares: TRpcMiddleware<RouteEnv>[];  // Pre-built auth middleware
}
```

If you register a handler with the same `name` as an existing one, it overwrites the previous handler with a warning.

### The `configure()` Lifecycle

The `configure()` method on `AbstractGrpcController` is idempotent (guarded by `isConfigured` flag). It runs the following steps in order:

1. **`binding()`** -- Your override, registers imperative/fluent routes
2. **`registerRpcsFromRegistry()`** -- Discovers decorator-based RPCs from `MetadataRegistry` and calls `bindRoute()` for each
3. **`GrpcRequestAdapter.build()`** -- Creates the ConnectRPC adapter and mounts it as Hono middleware on `this.router`

## RPC Decorators

All RPC decorators live in `packages/core/src/base/metadata/routes/rpc.ts`. They register metadata in the `MetadataRegistry`, which is read during `configure()`.

### `@rpc` -- Generic

The base decorator. Requires the full `IRpcMetadata` config including `method`:

```typescript
@rpc({ configs: { name: 'sayHello', method: GRPC.Methods.UNARY } })
async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
  // ...
}
```

### `@unary`

Shorthand for `@rpc` with `method: 'unary'`. Single request, single response.

```typescript
@unary({ configs: { name: 'sayHello' } })
async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
  return create(SayHelloResponseSchema, { message: `Hello, ${opts.request.name}!` });
}
```

### `@serverStream` (unsupported)

Shorthand for `@rpc` with `method: 'server_streaming'`. **Throws at boot time in the current version** -- streaming is not supported over HTTP/1.1 Connect protocol. Decorator preserved for forward compatibility.

### `@clientStream` (unsupported)

Shorthand for `@rpc` with `method: 'client_streaming'`. **Throws at boot time in the current version.**

### `@bidiStream` (unsupported)

Shorthand for `@rpc` with `method: 'bidi_streaming'`. **Throws at boot time in the current version.**

### Decorator Config

All decorators accept `{ configs: ... }` where configs extends `IRpcMetadata` (with `method` omitted for the shorthand variants):

```typescript
// @unary, @serverStream, @clientStream, @bidiStream
{ configs: Omit<IRpcMetadata, 'method'> }

// @rpc (generic)
{ configs: IRpcMetadata }
```

## Type Definitions

### `IRpcMetadata`

Metadata stored per RPC method in the `MetadataRegistry`.

```typescript
interface IRpcMetadata {
  /** Proto method name -- must match the RPC name in your .proto service definition. */
  name: string;
  /** RPC method type. */
  method: TGrpcMethod;  // 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming'
  /** Per-RPC authentication config. */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  /** Per-RPC authorization spec(s). */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
```

### `IRpcRegistration`

Unified entry stored in the controller's `definitions` map. Combines metadata, handler function, and pre-built auth middleware.

```typescript
interface IRpcRegistration<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  handler: TRpcHandler<unknown, unknown, RouteEnv>;
  middlewares: TRpcMiddleware<RouteEnv>[];
}
```

### `TRpcMiddleware`

Pre-built middleware function for gRPC auth enforcement, created by `AbstractGrpcController.buildRpcMiddlewares()`.

```typescript
type TRpcMiddleware<RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv>,
  next: Next,
) => ValueOrPromise<void | Response>;
```

### `TRpcHandler`

The handler signature for gRPC RPC methods. Receives the deserialized protobuf request and the Hono context (via `AsyncLocalStorage`).

```typescript
type TRpcHandler<
  RequestType = unknown,
  ResponseType = unknown,
  RouteEnv extends Env = Env,
> = (opts: {
  request: RequestType;
  context: TRouteContext<RouteEnv>;
}) => ValueOrPromise<ResponseType>;
```

> [!NOTE]
> The adapter always calls handlers with `{ request, context }` - decorator-based handlers included. If your handler does not need the Hono context, declare only `(opts: { request: RequestType }) => Promise<ResponseType>` and ignore the `context` property.

### `IGrpcControllerOptions`

Constructor options for gRPC controllers.

```typescript
interface IGrpcControllerOptions {
  scope: string;
  path?: string;
}
```

### `IGrpcBindRouteOptions`

Fluent binding returned by `bindRoute()`.

```typescript
interface IGrpcBindRouteOptions<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  to: (opts: { handler: TRpcHandler<unknown, unknown, RouteEnv> }) => IGrpcDefineRouteOptions;
}
```

### `IGrpcDefineRouteOptions`

Return type from both `defineRoute()` and `bindRoute().to()`.

```typescript
interface IGrpcDefineRouteOptions {
  configs: IRpcMetadata;
}
```

### `IGrpcController`

The full interface that gRPC controllers implement. Extends `IConfigurable`.

```typescript
interface IGrpcController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = unknown,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  service: ServiceType;
  router: Hono<RouteEnv, RouteSchema, BasePath>;
  definitions: Record<string, IRpcRegistration<RouteEnv>>;

  getRouter(): Hono<RouteEnv, RouteSchema, BasePath>;
  bindRoute(opts: { configs: IRpcMetadata }): IGrpcBindRouteOptions<RouteEnv>;
  defineRoute(opts: {
    configs: IRpcMetadata;
    handler: TRpcHandler<unknown, unknown, RouteEnv>;
  }): IGrpcDefineRouteOptions;
}
```

### `IConnectAdapterResult`

Return type from `GrpcRequestAdapter.build()`.

```typescript
interface IConnectAdapterResult<
  RouteEnv extends Env = Env,
  BasePath extends string = '/',
  RouteInput extends Input = {},
> {
  paths: string[];
  middleware: MiddlewareHandler<RouteEnv, BasePath, RouteInput>;
}
```

## `GrpcRequestAdapter`

Internal bridge between IGNIS gRPC controllers and ConnectRPC's universal handler system. You do not interact with this class directly -- it is created automatically during `configure()`.

### Architecture

The adapter solves a key challenge: ConnectRPC handlers have their own `(request, context) => response` signature. IGNIS controllers, though, need access to the Hono `Context` for middleware, auth, and request-scoped state. The adapter uses `AsyncLocalStorage` to provide request-scoped context isolation, ensuring concurrent requests never share state.

```
Hono Request
  -> GrpcRequestAdapter middleware (path matching via basePath + controllerPath)
    -> AsyncLocalStorage.run(honoContext, ...)
      -> Pre-built auth middlewares (authenticate -> authorize)
        -> ConnectRPC universal handler
          -> IGNIS TRpcHandler (reads context from AsyncLocalStorage)
            -> Response
```

### Static `build()` Method

The only public API. Validates peer deps via `ModuleUtility.assertInstalled()`, creates the adapter, and returns the middleware + registered paths:

```typescript
static async build(opts: {
  controller: AbstractGrpcController<...>;
  interceptors?: unknown[];
}): Promise<IConnectAdapterResult<RouteEnv, BasePath>>
```

Called internally by `AbstractGrpcController.configure()`:

```typescript
const adapter = await GrpcRequestAdapter.build({ controller: this });
this.router.use('*', adapter.middleware);
```

The optional `interceptors` array is passed to ConnectRPC's `createConnectRouter()` for request/response interception at the protocol level.

### Internal Flow

1. **`buildConnectHandlers()`** -- Wraps each IGNIS `TRpcHandler` into ConnectRPC's `(request, context) => response` signature. The wrapper reads the Hono context from `AsyncLocalStorage`, runs pre-built auth middlewares (built by `AbstractGrpcController.buildRpcMiddlewares()`), then passes `{ request, context }` to the IGNIS handler.

2. **`registerService()`** -- Bridges the opaque `ServiceType` from `@controller` metadata to ConnectRPC's `router.service()` call, registering all handlers for the service.

3. **`buildMiddleware()`** -- Creates a Hono middleware that:
   - Strips the full mount prefix (`basePath + controllerPath`) from the request URL to derive the ConnectRPC handler path (e.g., `/package.Service/Method`)
   - Looks up the ConnectRPC handler by path from the handler map
   - Runs the handler inside `AsyncLocalStorage.run()` with the current Hono context
   - Converts between Fetch API `Request`/`Response` and ConnectRPC's `UniversalServerRequest`/`UniversalServerResponse` formats
   - Returns proper gRPC error responses on failure (with `grpc-status` and `grpc-message` headers)

### Peer Dependency Loading

The adapter needs two entry points:

- `@connectrpc/connect` -- for `createConnectRouter`
- `@connectrpc/connect/protocol` -- for `universalServerRequestFromFetch` and `universalServerResponseToFetch`

By default it loads both at runtime using `createRequire` from the application's `node_modules`. That keeps the specifier invisible to `Bun.build`, so a consumer who never uses gRPC is not forced to install the peer.

**A compiled application must pass `module`.** A `bun build --compile` binary ships without `node_modules`, so `createRequire` has nothing to resolve against. Hand the peer over through the component options instead - the static import is what embeds it in the binary:

```typescript
import * as connect from '@connectrpc/connect';
import * as protocol from '@connectrpc/connect/protocol';

this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  module: { connect, protocol },
});
```

`GrpcComponent` assigns the module to each controller before `configure()`, and the adapter skips both `assertInstalled` and `createRequire` when it is present.

`ModuleUtility.register` does not work here. The adapter resolves the specifier itself, so the registry never reaches it.

### Error Handling

On handler errors, the adapter returns a JSON response with:
- HTTP status: `200` if gRPC status is `OK`, `500` otherwise
- `grpc-status` header: Preserved from `ConnectError.code` if available (duck-type check on `error.code` being a number), otherwise `13` (INTERNAL)
- `grpc-message` header: URL-encoded error message
- Body: JSON `{ message, code }`

The adapter uses a duck-type check on `error.code` to preserve gRPC status codes from ConnectRPC errors, without importing `ConnectError` directly. That avoids tight coupling to the peer dependency.

## `GrpcComponent`

Auto-discovers and configures gRPC controllers during the application lifecycle.

### Configuration

```typescript
interface IGrpcComponentConfig {
  interceptors?: unknown[];
  module?: IConnectRpcModule;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `interceptors` | `unknown[]` | none | ConnectRPC interceptors, passed to `createConnectRouter` for every gRPC controller. An empty list passes nothing |
| `module` | `IConnectRpcModule` | none | The ConnectRPC peer, as `{ connect, protocol }`. Required for a compiled binary - see [Peer Dependency Loading](#peer-dependency-loading) |

Both options are component-wide. `GrpcComponent` assigns them to every gRPC controller it discovers, before calling `configure()`:

```typescript
import type { Interceptor } from '@connectrpc/connect';

const logging: Interceptor = next => async request => {
  const response = await next(request);
  return response;
};

this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  interceptors: [logging],
});
```

The component registers a default (empty) config binding under the key `'@app/grpc/options'` (`GrpcBindingKeys.GRPC_COMPONENT_OPTIONS`).

### Behavior

1. Finds all bindings tagged with the `controllers` namespace
2. Filters to controllers whose metadata has `transport: 'grpc'`
3. Validates each gRPC controller:
   - If `path` is missing, throws an error
   - If `service` is missing, logs a warning and skips the controller
4. Sets `instance.basePath` from the application's `path.base` config (needed for correct path stripping in the adapter)
5. Calls `configure()` on each controller instance
6. Mounts the controller's router on the application's root router at the controller's path via `router.route(metadata.path, instance.getRouter())`

### Dynamic Discovery

The component uses a re-fetch loop with `Set` tracking. After configuring each controller, it re-queries the container for new controller bindings (excluding already-configured ones). This handles controllers registered dynamically during component composition (e.g., a component that registers another component that registers a gRPC controller).

### Automatic Registration

`GrpcComponent` is instantiated and configured automatically by `BaseApplication` when `appConfigs.transports` includes `ControllerTransports.GRPC`. You do not need to register it manually. The relevant code in `BaseApplication`:

```typescript
case ControllerTransports.GRPC: {
  const grpcComponent = new GrpcComponent(this);
  await grpcComponent.configure();
  break;
}
```

## `GRPC` Constants

The `GRPC` class from `@venizia/ignis-helpers` provides all gRPC protocol constants:

### Methods

```typescript
GRPC.Methods.UNARY              // 'unary'
GRPC.Methods.SERVER_STREAMING   // 'server_streaming'
GRPC.Methods.CLIENT_STREAMING   // 'client_streaming'
GRPC.Methods.BIDI_STREAMING     // 'bidi_streaming'
```

### Result Codes

Standard gRPC status codes (matching `google.rpc.Code`):

```typescript
GRPC.ResultCodes.OK                 // 0
GRPC.ResultCodes.CANCELLED          // 1
GRPC.ResultCodes.UNKNOWN            // 2
GRPC.ResultCodes.INVALID_ARGUMENT   // 3
GRPC.ResultCodes.DEADLINE_EXCEEDED  // 4
GRPC.ResultCodes.NOT_FOUND          // 5
GRPC.ResultCodes.ALREADY_EXISTS     // 6
GRPC.ResultCodes.PERMISSION_DENIED  // 7
GRPC.ResultCodes.RESOURCE_EXHAUSTED // 8
GRPC.ResultCodes.FAILED_PRECONDITION // 9
GRPC.ResultCodes.ABORTED           // 10
GRPC.ResultCodes.OUT_OF_RANGE      // 11
GRPC.ResultCodes.UNIMPLEMENTED     // 12
GRPC.ResultCodes.INTERNAL          // 13
GRPC.ResultCodes.UNAVAILABLE       // 14
GRPC.ResultCodes.DATA_LOSS         // 15
GRPC.ResultCodes.UNAUTHENTICATED   // 16
```

### Headers

Standard gRPC protocol headers:

```typescript
GRPC.Headers.GRPC_STATUS       // 'grpc-status'
GRPC.Headers.GRPC_MESSAGE      // 'grpc-message'
GRPC.Headers.GRPC_TIMEOUT      // 'grpc-timeout'
GRPC.Headers.GRPC_ENCODING     // 'grpc-encoding'
// ... and more (see packages/helpers/src/common/constants/grpc.ts)
```

### Content Types

```typescript
GRPC.HeaderValues.GRPC           // 'application/grpc'
GRPC.HeaderValues.GRPC_PROTO     // 'application/grpc+proto'
GRPC.HeaderValues.GRPC_JSON      // 'application/grpc+json'
GRPC.HeaderValues.GRPC_WEB       // 'application/grpc-web'
GRPC.HeaderValues.GRPC_WEB_PROTO // 'application/grpc-web+proto'
GRPC.HeaderValues.GRPC_WEB_JSON  // 'application/grpc-web+json'
GRPC.HeaderValues.GRPC_WEB_TEXT  // 'application/grpc-web-text'
```

## Application Setup

### Enabling gRPC Transport

Add `ControllerTransports.GRPC` to the `transports` array in your application configs:

```typescript
import {
  BaseApplication,
  ControllerTransports,
  IApplicationConfigs,
  IApplicationInfo,
} from '@venizia/ignis';
import { ValueOrPromise } from '@venizia/ignis-helpers';
import { GreeterController } from './controllers/greeter';
import { GreeterService } from './services/greeter.service';

export const appConfigs: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 3000,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
};

export class Application extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'my-app', version: '1.0.0', description: 'gRPC + REST app' };
  }

  staticConfigure() {}

  preConfigure() {
    this.service(GreeterService);
    this.controller(GreeterController);
  }

  postConfigure() {}
  setupMiddlewares() {}
}
```

> [!WARNING]
> If `transports` does not include `ControllerTransports.GRPC`, gRPC controllers are still registered in the DI container. But the `GrpcComponent` is never mounted -- their `configure()` is never called and no routes are served.

### Dual Transport

REST and gRPC controllers coexist in the same application. Each controller declares its own transport via the `@controller` decorator. A single application can serve both:

```typescript
preConfigure() {
  // gRPC controller
  this.controller(GreeterController);

  // REST controller
  this.controller(StatusController);
}
```

REST controllers are handled by the `RestComponent`, active when `transports` includes `ControllerTransports.REST` (the default). gRPC controllers are handled by the `GrpcComponent`, active when that transport is enabled. They share the same DI container and lifecycle.

## Complete Example

### 1. Proto File

```protobuf
// proto/greeter.proto
syntax = "proto3";
package greeter.v1;

message SayHelloRequest {
  string name = 1;
}

message SayHelloResponse {
  string message = 1;
}

message ListUsersRequest {}

message ListUsersResponse {
  repeated string users = 1;
}

service GreeterService {
  rpc SayHello (SayHelloRequest) returns (SayHelloResponse);
  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);
}
```

### 2. Generate TypeScript Code

```bash
buf generate proto/greeter.proto
```

### 3. Definition File (Stable Import Boundary)

```typescript
// controllers/greeter/definition.ts
export {
  GreeterService,
  ListUsersResponseSchema,
  SayHelloResponseSchema,
  type ListUsersRequest,
  type ListUsersResponse,
  type SayHelloRequest,
  type SayHelloResponse,
} from './generated/greeter_pb';
```

> [!TIP]
> Always re-export generated code through a `definition.ts` file. This acts as a stable import boundary -- controller code and external consumers import from here, never from the `generated/` directory directly. When you regenerate protos, only this file needs updating.

### 4. Controller

```typescript
// controllers/greeter/controller.ts
import { GreeterService } from '@/services';
import { create } from '@bufbuild/protobuf';
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  inject,
  unary,
} from '@venizia/ignis';
import {
  GreeterService as GreeterServiceDef,
  ListUsersResponseSchema,
  SayHelloResponseSchema,
  type ListUsersRequest,
  type ListUsersResponse,
  type SayHelloRequest,
  type SayHelloResponse,
} from './definition';

@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: GreeterServiceDef,
})
export class GreeterController extends BaseGrpcController {
  constructor(
    @inject({ key: 'services.GreeterService' })
    private readonly greeterService: GreeterService,
  ) {
    super({ scope: 'GreeterController', path: '/grpc' });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
    const message = await this.greeterService.sayHello(opts);
    return create(SayHelloResponseSchema, { message });
  }

  @unary({ configs: { name: 'listUsers' } })
  async listUsers(opts: { request: ListUsersRequest }): Promise<ListUsersResponse> {
    const users = await this.greeterService.listUsers(opts);
    return create(ListUsersResponseSchema, { users });
  }
}
```

### 5. Minimal Controller (No DI)

A controller with no injected dependencies:

```typescript
// controllers/echo/controller.ts
import { create } from '@bufbuild/protobuf';
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  unary,
} from '@venizia/ignis';
import {
  EchoResponseSchema,
  EchoService as EchoServiceDef,
  type EchoRequest,
  type EchoResponse,
} from './definition';

@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: EchoServiceDef,
})
export class EchoController extends BaseGrpcController {
  constructor() {
    super({ scope: 'EchoController', path: '/grpc' });
  }

  override binding() {}

  @unary({ configs: { name: 'echo' } })
  async echo(opts: { request: EchoRequest }): Promise<EchoResponse> {
    return create(EchoResponseSchema, {
      message: `Echo: ${opts.request.message}`,
    });
  }
}
```

### 6. Application

```typescript
// application.ts
import {
  BaseApplication,
  ControllerTransports,
  IApplicationConfigs,
  IApplicationInfo,
} from '@venizia/ignis';
import { ValueOrPromise } from '@venizia/ignis-helpers';
import { GreeterController } from './controllers/greeter';
import { EchoController } from './controllers/echo';
import { GreeterService } from './services/greeter.service';

export const appConfigs: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 3000,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
};

export class Application extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'greeter-app', version: '1.0.0', description: 'gRPC greeter' };
  }

  staticConfigure() {}

  preConfigure() {
    this.service(GreeterService);
    this.controller(GreeterController);
    this.controller(EchoController);
  }

  postConfigure() {}
  setupMiddlewares() {}
}
```

### 7. Client (Testing)

```typescript
// client.ts
import { create } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { GreeterService, SayHelloRequestSchema } from './controllers/greeter/definition';

const transport = createConnectTransport({ baseUrl: 'http://localhost:3000/grpc' });
const client = createClient(GreeterService, transport);

const response = await client.sayHello(create(SayHelloRequestSchema, { name: 'IGNIS' }));
console.log(response.message);
```

## Component-Based Registration

gRPC controllers can be registered through components, following the same pattern as REST controllers. This enables modular composition and late registration.

### Basic Component

```typescript
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
} from '@venizia/ignis';
import { ValueOrPromise } from '@venizia/ignis-helpers';
import { EchoController } from '../controllers/echo';

export class EchoComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: 'EchoComponent' });
  }

  override binding(): ValueOrPromise<void> {
    this.application.controller(EchoController);
  }
}
```

### Component Composition

Components can compose other components, building a dependency graph of controllers:

```typescript
import {
  BaseApplication,
  BaseComponent,
  CoreBindings,
  inject,
} from '@venizia/ignis';
import { TimeController } from '../controllers/time';
import { EchoComponent } from './echo.component';

export class TimeComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: 'TimeComponent' });
  }

  override async binding(): Promise<void> {
    // Compose EchoComponent -- registers EchoController
    this.application.component(EchoComponent);

    // Register this component's own controller
    this.application.controller(TimeController);
  }
}
```

The `GrpcComponent` handles these dynamically-registered controllers through its re-fetch loop -- after configuring each controller, it re-queries the container for newly added bindings.

### Registration in Application

```typescript
preConfigure() {
  // TimeComponent composes EchoComponent internally
  this.component(TimeComponent);
}
```

## Authentication and Authorization

Per-RPC authentication and authorization are configured via the `authenticate` and `authorize` fields in `IRpcMetadata`. Auth middlewares are pre-built during route registration by `AbstractGrpcController.buildRpcMiddlewares()` and executed before the handler inside the `AsyncLocalStorage` context.

### Per-RPC Authentication

```typescript
@unary({
  configs: {
    name: 'sayHello',
    authenticate: {
      strategies: ['jwt'],
      mode: 'any',
    },
  },
})
async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
  // Only accessible with a valid JWT token
  return create(SayHelloResponseSchema, { message: 'Hello!' });
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strategies` | `TAuthStrategy[]` | `[]` | Authentication strategies to apply (e.g., `['jwt']`, `['basic']`) |
| `mode` | `TAuthMode` | `'any'` | `'any'` \| `'all'` (defaults to `AuthenticationModes.ANY`) |

### Per-RPC Authorization

```typescript
@unary({
  configs: {
    name: 'deleteUser',
    authenticate: { strategies: ['jwt'], mode: 'any' },
    authorize: { action: 'delete', resource: 'user' },
  },
})
async deleteUser(opts: { request: DeleteUserRequest }): Promise<DeleteUserResponse> {
  // Requires JWT + delete permission on user resource
  // ...
}
```

Multiple authorization specs can be provided as an array:

```typescript
authorize: [
  { action: 'read', resource: 'user' },
  { action: 'read', resource: 'profile' },
]
```

### Middleware Execution Order

Auth middlewares run in the following order inside the ConnectRPC handler wrapper:

1. **Authenticate** middlewares (if `configs.authenticate.strategies` has entries)
2. **Authorize** middlewares (if `configs.authorize` is present), one per spec
3. **Handler** execution

## See Also

- [Controllers Reference](./controllers.md) -- REST controller classes and API endpoint patterns
- [Components Reference](./components.md) -- Component system and built-in components
- [Dependency Injection](./dependency-injection.md) -- IoC container, `@inject`, binding keys
- [Services](./services.md) -- Business logic layer
