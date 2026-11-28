---
title: gRPC Controllers Reference
description: Technical reference for gRPC controller classes, RPC decorators, ConnectRPC adapter, and component integration
difficulty: intermediate
---

# Deep Dive: gRPC Controllers

Technical reference for gRPC controller classes -- the foundation for building gRPC services in IGNIS, powered by [ConnectRPC](https://connectrpc.com/).

IGNIS gRPC controllers follow the same patterns as REST controllers (decorator-based routing, `binding()` method, DI integration) while bridging to ConnectRPC's universal handler system. REST and gRPC controllers coexist in the same application, sharing the same DI container, middleware pipeline, and lifecycle.

**Files:**
- `packages/core-server/src/base/controllers/grpc/abstract.ts`
- `packages/core-server/src/base/controllers/grpc/base.ts`
- `packages/core-server/src/base/controllers/grpc/adapter.ts`
- `packages/core-server/src/base/controllers/grpc/timeout.guard.ts`
- `packages/core-server/src/base/controllers/grpc/native/` (the native gRPC port)
- `packages/core-server/src/base/controllers/grpc/common/types.ts`
- `packages/kernel/src/base/metadata/routes/rpc.ts`
- `packages/core-server/src/components/controller/grpc/grpc.component.ts`
- `packages/core-server/src/components/controller/grpc/common/types.ts`

## Quick Reference

| Item | Description |
|------|-------------|
| **AbstractGrpcController** | Abstract base class with RPC registration, ConnectRPC adapter mounting, idempotent `configure()` |
| **BaseGrpcController** | Recommended concrete base class with `bindRoute()` and `defineRoute()` implementations |
| **GrpcRequestAdapter** | Internal bridge from IGNIS handlers to ConnectRPC: one Hono route per RPC |
| **GrpcComponent** | Auto-discovers gRPC controllers, mounts them and runs the native port |
| **GrpcListenerHelper** | The native gRPC port (`node:http2`) |
| **@controller** | Class decorator with `transport: ControllerTransports.GRPC` and `service` field |
| **@unary** | Method decorator for unary RPCs |
| **@serverStream** | Method decorator for server-streaming RPCs |
| **@clientStream** | Method decorator for client-streaming RPCs |
| **@bidiStream** | Method decorator for bidirectional-streaming RPCs (refused on the HTTP/1.1 application port) |
| **@rpc** | Generic method decorator (requires explicit `method` in configs) |

## Setup

Install, code generation and a first call are in [Build a gRPC service](/guides/core-concepts/grpc/build-a-service). Every option is in [Configuration and limits](/guides/core-concepts/grpc/configuration).

| Import | From |
|---|---|
| `BaseGrpcController`, decorators, `ControllerTransports`, `IGrpcNativeOptions` | `@venizia/ignis` |
| `GrpcComponent`, `GrpcBindingKeys`, `IGrpcComponentConfig` | `@venizia/ignis/grpc` |
| `GRPC` constants | `@venizia/ignis-helpers` |

`@connectrpc/connect` and `@connectrpc/connect-node` (native port only) are optional peers of `@venizia/ignis`. `@bufbuild/protobuf` is used by your generated code.

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
3. **`GrpcRequestAdapter.build()`** -- Creates one Hono route per RPC and mounts them on `this.router`

## RPC Decorators

All RPC decorators live in `packages/kernel/src/base/metadata/routes/rpc.ts`. They register metadata in the `MetadataRegistry`, which is read during `configure()`.

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

### `@serverStream`

Shorthand for `@rpc` with `method: 'server_streaming'`. The handler is an async generator, or returns an async iterable.

### `@clientStream`

Shorthand for `@rpc` with `method: 'client_streaming'`. `request` is an async iterable of the messages; the handler returns one answer.

### `@bidiStream`

Shorthand for `@rpc` with `method: 'bidi_streaming'`. The application port answers HTTP 505: bidi needs HTTP/2.

See [call kinds and streaming](/guides/core-concepts/grpc/call-kinds).

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
  /** Per-RPC authentication. Leave it out for a public RPC; one that names no strategy stops the boot. */
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

The handler signature for gRPC RPC methods. Receives the deserialized protobuf request, the Hono context and ConnectRPC's context of the call (`rpc`).

```typescript
type TRpcHandler<
  RequestType = unknown,
  ResponseType = unknown,
  RouteEnv extends Env = Env,
> = (opts: {
  request: RequestType;
  context: TRouteContext<RouteEnv>;
  rpc: HandlerContext; // from '@connectrpc/connect'
}) => ValueOrPromise<ResponseType>;
```

> [!NOTE]
> The adapter always calls handlers with `{ request, context, rpc }`, decorator-based handlers included. Declare only the fields you read.

| `rpc` member | What it gives |
|---|---|
| `signal` | aborted at the deadline or client leave; see [deadlines](/guides/core-concepts/grpc/deadlines-and-timeouts) |
| `timeoutMs()` | the milliseconds left, `undefined` without a deadline |
| `requestHeader` | the request headers |
| `responseHeader`, `responseTrailer` | headers and trailers of the answer |

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
interface IConnectAdapterResult<RouteEnv extends Env = Env> {
  paths: string[];
  router: Hono<RouteEnv>; // one route per RPC, at `/package.Service/Method`
}
```

## `GrpcRequestAdapter`

Internal bridge to ConnectRPC. `AbstractGrpcController.configure()` creates it; you do not call it.

```
route of the RPC (global middleware has run)
  -> ConnectRPC handler, Hono context in its context values
    -> interceptors
      -> authenticate, then authorize
        -> your handler ({ request, context, rpc })
  -> application port: context.newResponse(...), earlier headers kept
  -> native port: written on the node stream, trailers included
```

### Static `build()` method

```typescript
static async build(opts: {
  controller: AbstractGrpcController<...>;
  interceptors?: Interceptor[];         // from '@connectrpc/connect'
  module?: IConnectRpcModule;
  limits?: IGrpcLimits;
  native?: IGrpcNativeAdapterOptions;   // set when the native port is on
  shutdownSignal?: AbortSignal;         // aborts rpc.signal on the application port
  idleTimeout?: number;                 // seconds, restored when a call ends
}): Promise<IConnectAdapterResult<RouteEnv>>
```

It throws when `limits.messageSize` is not a positive integer, when an RPC name is not declared by the service or has another kind, and when a needed peer is missing.

### Peer dependency loading

By default `ModuleUtility.load` resolves the peers from the project root, so an application without gRPC does not need them: `@connectrpc/connect`, `@connectrpc/connect/protocol` and, for the native port, `@connectrpc/connect-node`. A compiled binary [passes them](/guides/core-concepts/grpc/configuration#pass-the-peers-to-a-compiled-binary).

## Native gRPC listener

`GrpcListenerHelper` is the `node:http2` server of the [native port](/guides/core-concepts/grpc/ports#turn-on-the-native-grpc-port), bound at `GrpcBindingKeys.GRPC_NATIVE_LISTENER` when the port is on.

| Method | Does |
|---|---|
| `start()` | binds the port; a port in use rejects. Run by a post-start hook |
| `stop()` | [drains and closes](/guides/core-concepts/grpc/shutdown); run by a post-stop hook. A second call waits for the first |
| `getAddress()` | `{ host, port }`, or `undefined` when not listening |

`GrpcNativeCallStore` is the `env` of a native request: `GrpcNativeCallStore.read({ env })` answers the node request and response, and `requestIP()` serves `getConnInfo` from `hono/bun`.

## `GrpcComponent`

Auto-discovers and configures gRPC controllers during the application lifecycle.

### Configuration

```typescript
interface IGrpcComponentConfig {
  interceptors?: Interceptor[];
  limits?: IGrpcLimits;
  module?: IConnectRpcModule;
  native?: TToggle<IGrpcNativeOptions>;
}
```

Defaults and ranges: [Configuration and limits](/guides/core-concepts/grpc/configuration). The component binds an empty default under `GrpcBindingKeys.GRPC_COMPONENT_OPTIONS` (`'@app/grpc/options'`) and assigns the options to every gRPC controller before `configure()`.

### Behavior

1. Finds all bindings tagged with the `controllers` namespace
2. Filters to controllers whose metadata has `transport: 'grpc'`
3. Validates each gRPC controller:
   - If `path` is missing, throws an error
   - If `service` is missing, logs a warning and skips the controller
4. Calls `configure()` on each controller instance
5. Mounts the controller's router on the application's root router at the controller's path via `router.route(metadata.path, instance.getRouter())`
6. Registers the post-stop hook that [aborts RPCs still running on the application port](/guides/core-concepts/grpc/shutdown#shutdown-of-the-application-port)
7. With the native port on, maps each `/package.Service/Method` to its mounted path (one owner per path) and registers the listener's start and stop hooks

### Dynamic Discovery

The component uses a re-fetch loop with `Set` tracking. Once the whole batch is configured, it re-queries the container for new controller bindings (excluding already-configured ones) and repeats until a pass finds nothing new. This handles controllers registered dynamically during component composition (e.g., a component that registers another component that registers a gRPC controller). The re-scan is per batch rather than per controller, because per controller makes boot one full scan of the binding map per item.

### Automatic Registration

`GrpcComponent` is instantiated and configured automatically by `BaseApplication` when `appConfigs.transports` includes `ControllerTransports.GRPC`. You do not need to register it manually.

`BaseApplication` does not switch over transports. It overrides `registerControllers()`, lets `RestApplication` handle REST first, then walks whatever is left:

```typescript
// Simplified from BaseApplication.registerControllers()
await super.registerControllers();

const transports = this.configs.transports ?? [ControllerTransports.REST];

for (const transport of transports) {
  if (transport === ControllerTransports.REST) {
    continue;
  }

  if (transport !== ControllerTransports.GRPC) {
    throw getError({ message: `[registerControllers] Unsupported transport: '${transport}'` });
  }

  const grpcComponent = new GrpcComponent(this);
  await grpcComponent.configure();
}
```

A transport that is neither `'rest'` nor `'grpc'` throws rather than being skipped.

## `GRPC` Constants

The `GRPC` class from `@venizia/ignis-helpers` provides all gRPC protocol constants:

### `GRPC.Methods`

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

## Component-based registration

A component registers gRPC controllers as it does REST ones: call `this.application.controller(...)` in its `binding()`. `GrpcComponent` finds them through its re-fetch loop. See [Components](./components.md).

## Behaviour guides

| Topic | Page |
|---|---|
| Authentication, interceptor order | [gRPC authentication](/guides/core-concepts/grpc/authentication) |
| Error codes | [gRPC errors](/guides/core-concepts/grpc/errors) |
| Deadlines, idle timeout | [gRPC deadlines and timeouts](/guides/core-concepts/grpc/deadlines-and-timeouts) |
| Streaming | [gRPC call kinds](/guides/core-concepts/grpc/call-kinds) |

## See Also

- [Controllers Reference](./controllers.md) - REST controller classes and API endpoint patterns
- [Components Reference](./components.md) - Component system and built-in components
- [Dependency Injection](./dependency-injection.md) - IoC container, `@inject`, binding keys
- [Services](./services.md) - Business logic layer
