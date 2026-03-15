---
title: gRPC Controllers Reference
description: Technical reference for gRPC controller classes, RPC decorators, ConnectRPC adapter, and component integration
difficulty: intermediate
---

# Deep Dive: gRPC Controllers

Technical reference for gRPC controller classes -- the foundation for building gRPC services in Ignis, powered by [ConnectRPC](https://connectrpc.com/).

Ignis gRPC controllers follow the same patterns as REST controllers (decorator-based routing, `binding()` method, DI integration) while bridging to ConnectRPC's universal handler system. REST and gRPC controllers coexist in the same application, sharing the same DI container, middleware pipeline, and lifecycle.

**Files:**
- `packages/core/src/base/controllers/grpc/abstract.ts`
- `packages/core/src/base/controllers/grpc/base.ts`
- `packages/core/src/base/controllers/grpc/adapter.ts`
- `packages/core/src/base/controllers/grpc/common/types.ts`
- `packages/core/src/base/metadata/routes/rpc.ts`
- `packages/core/src/components/controller/grpc/grpc.component.ts`

## Quick Reference

| Item | Description |
|------|-------------|
| **AbstractGrpcController** | Abstract base class with RPC registration, ConnectRPC adapter mounting, idempotent `configure()` |
| **BaseGrpcController** | Recommended concrete base class with `bindRoute()` and `defineRoute()` implementations |
| **GrpcRequestAdapter** | Internal bridge from Ignis handlers to ConnectRPC universal handlers via `AsyncLocalStorage` |
| **GrpcComponent** | Auto-discovers gRPC controllers and mounts them on the application router |
| **@controller** | Class decorator with `transport: ControllerTransports.GRPC` and `service` field |
| **@unary** | Method decorator for unary RPCs |
| **@serverStream** | Method decorator for server-streaming RPCs |
| **@clientStream** | Method decorator for client-streaming RPCs |
| **@bidiStream** | Method decorator for bidirectional-streaming RPCs |
| **@rpc** | Generic method decorator (requires explicit `method` in configs) |

## Prerequisites

gRPC support requires the following peer dependencies:

```bash
bun add @connectrpc/connect @bufbuild/protobuf
```

| Package | Purpose |
|---------|---------|
| `@connectrpc/connect` | ConnectRPC router, universal handlers, protocol bridge |
| `@bufbuild/protobuf` | Protobuf code generation, `create()` for constructing response messages |

> [!NOTE]
> These are **optional** peer dependencies. They are only loaded at runtime when a gRPC controller is configured, via `createRequire` from the application's `node_modules`. If the deps are missing, `GrpcRequestAdapter.build()` throws a clear error at startup.

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

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | HTTP base path for this controller's RPC endpoints |
| `transport` | `ControllerTransports.GRPC` | Marks this controller for gRPC transport (picked up by `GrpcComponent`) |
| `service` | `ServiceType` | ConnectRPC service descriptor from generated protobuf code |

> [!NOTE]
> `ServiceType` is a generic parameter on the controller classes. `BaseGrpcController` defaults `ServiceType` to `unknown`, while `AbstractGrpcController` defaults it to `Parameters<ConnectRouter['service']>[0]` (the actual ConnectRPC service descriptor type). Use `AbstractGrpcController` when you need stricter type checking on the `service` field.

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
}
```

If you register a handler with the same `name` as an existing one, it overwrites the previous handler with a warning.

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

### `@serverStream`

Shorthand for `@rpc` with `method: 'server_streaming'`. Single request, stream of responses.

```typescript
@serverStream({ configs: { name: 'streamEvents' } })
async *streamEvents(opts: { request: StreamEventsRequest }): AsyncGenerator<Event> {
  for (let i = 0; i < opts.request.count; i++) {
    yield create(EventSchema, { sequence: i, message: `Event #${i}` });
  }
}
```

### `@clientStream`

Shorthand for `@rpc` with `method: 'client_streaming'`. Stream of requests, single response.

```typescript
@clientStream({ configs: { name: 'collectLogs' } })
async collectLogs(opts: { request: AsyncIterable<LogEntry> }): Promise<LogSummary> {
  let total = 0;
  for await (const entry of opts.request) {
    total++;
  }
  return create(LogSummarySchema, { totalEntries: total });
}
```

### `@bidiStream`

Shorthand for `@rpc` with `method: 'bidi_streaming'`. Stream of requests, stream of responses.

```typescript
@bidiStream({ configs: { name: 'chat' } })
async *chat(opts: { request: AsyncIterable<ChatMessage> }): AsyncGenerator<ChatResponse> {
  let count = 0;
  for await (const msg of opts.request) {
    count++;
    yield create(ChatResponseSchema, {
      user: msg.user,
      text: `Echo: ${msg.text}`,
      messageNumber: count,
    });
  }
}
```

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

Unified entry stored in the controller's `definitions` map. Combines metadata with the handler function.

```typescript
interface IRpcRegistration<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  handler: TRpcHandler<unknown, unknown, RouteEnv>;
}
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

For streaming methods:
- **Server streaming**: Return `AsyncGenerator<ResponseType>`
- **Client streaming**: `request` is `AsyncIterable<RequestType>`, return `Promise<ResponseType>`
- **Bidi streaming**: `request` is `AsyncIterable<RequestType>`, return `AsyncGenerator<ResponseType>`

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

## `GrpcRequestAdapter`

Internal bridge between Ignis gRPC controllers and ConnectRPC's universal handler system. You do not interact with this class directly -- it is created automatically during `configure()`.

### Architecture

The adapter solves a key challenge: ConnectRPC handlers have their own `(request, context) => response` signature, but Ignis controllers need access to the Hono `Context` for middleware, auth, and request-scoped state. The adapter uses `AsyncLocalStorage` to provide request-scoped context isolation, ensuring concurrent requests never share state.

```
Hono Request
  → GrpcRequestAdapter middleware (path matching)
    → AsyncLocalStorage.run(honoContext, ...)
      → ConnectRPC universal handler
        → Ignis TRpcHandler (reads context from AsyncLocalStorage)
          → Response
```

### Static `build()` Method

The only public API. Validates peer deps, creates the adapter, and returns the middleware + registered paths:

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

Called internally by `AbstractGrpcController.configure()`:

```typescript
const adapter = await GrpcRequestAdapter.build({ controller: this });
this.router.use('*', adapter.middleware);
```

### Internal Flow

1. **`buildConnectHandlers()`** -- Wraps each Ignis `TRpcHandler` into ConnectRPC's `(request, context) => response` signature. The wrapper reads the Hono context from `AsyncLocalStorage` and passes it to the Ignis handler.

2. **`registerService()`** -- Bridges the opaque `ServiceType` from `@controller` metadata to ConnectRPC's `router.service()` call, registering all handlers for the service.

3. **`buildMiddleware()`** -- Creates a Hono middleware that:
   - Strips the controller's base path from the request URL
   - Looks up the ConnectRPC handler by path
   - Runs the handler inside `AsyncLocalStorage.run()` with the current Hono context
   - Converts between Fetch API `Request`/`Response` and ConnectRPC's universal request/response formats
   - Returns proper gRPC error responses on failure (with `grpc-status` and `grpc-message` headers)

### Error Handling

On handler errors, the adapter returns a JSON response with:
- HTTP status `500`
- `grpc-status: 13` (INTERNAL)
- `grpc-message`: URL-encoded error message

## `GrpcComponent`

Auto-discovers and configures gRPC controllers during the application lifecycle.

### Behavior

1. Finds all bindings tagged with the `controllers` namespace
2. Filters to controllers whose metadata has `transport: 'grpc'`
3. Validates each gRPC controller: if `service` is missing, logs a warning and skips the controller; if `path` is missing, throws an error
4. Calls `configure()` on each controller instance
5. Mounts the controller's router on the application router at the controller's path

### Dynamic Discovery

The component uses a re-fetch loop with `Set` tracking. After configuring each controller, it re-queries the container for new controller bindings. This handles controllers registered dynamically during component composition (e.g., a component that registers another component that registers a gRPC controller).

### Automatic Registration

`GrpcComponent` is instantiated and configured automatically by `BaseApplication` when `appConfigs.transports` includes `ControllerTransports.GRPC`. You do not need to register it manually.

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
> If `transports` does not include `ControllerTransports.GRPC`, gRPC controllers are still registered in the DI container but the `GrpcComponent` is never mounted -- their `configure()` is never called and no routes are served.

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

REST controllers are handled by the `RestComponent` (active when transports includes `ControllerTransports.REST`, which is the default); gRPC controllers are handled by the `GrpcComponent` (active when transport is enabled). They share the same DI container and lifecycle.

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

service GreeterService {
  rpc SayHello (SayHelloRequest) returns (SayHelloResponse);
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
  SayHelloRequestSchema,
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
} from './generated/greeter_pb';
```

> [!TIP]
> Always re-export generated code through a `definition.ts` file. This acts as a stable import boundary -- controller code and external consumers import from here, never from the `generated/` directory directly. When you regenerate protos, only this file needs updating.

### 4. Controller

```typescript
// controllers/greeter/controller.ts
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
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
} from './definition';
import { GreeterService } from '../../services/greeter.service';

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
    const message = await this.greeterService.greet({ name: opts.request.name });
    return create(SayHelloResponseSchema, { message });
  }
}
```

### 5. Service

```typescript
// services/greeter.service.ts
import { BaseService } from '@venizia/ignis';

export class GreeterService extends BaseService {
  constructor() {
    super({ scope: 'GreeterService' });
  }

  async greet(opts: { name: string }): Promise<string> {
    return `Hello, ${opts.name || 'World'}!`;
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
  }

  postConfigure() {}
  setupMiddlewares() {}
}
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

Per-RPC authentication and authorization are configured via the `authenticate` and `authorize` fields in `IRpcMetadata`.

### Per-RPC Authentication

```typescript
@unary({
  configs: {
    name: 'sayHello',
    authenticate: {
      strategies: ['jwt'],
      mode: 'required',
    },
  },
})
async sayHello(opts: { request: SayHelloRequest }): Promise<SayHelloResponse> {
  // Only accessible with a valid JWT token
  return create(SayHelloResponseSchema, { message: 'Hello!' });
}
```

| Field | Type | Description |
|-------|------|-------------|
| `strategies` | `TAuthStrategy[]` | Authentication strategies to apply (e.g., `['jwt']`, `['basic']`) |
| `mode` | `TAuthMode` | `'required'` \| `'optional'` \| `'any'` \| `'all'` |

### Per-RPC Authorization

```typescript
@unary({
  configs: {
    name: 'deleteUser',
    authenticate: { strategies: ['jwt'], mode: 'required' },
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

## See Also

- [Controllers Reference](./controllers.md) -- REST controller classes and API endpoint patterns
- [Components Reference](./components.md) -- Component system and built-in components
- [Dependency Injection](./dependency-injection.md) -- IoC container, `@inject`, binding keys
- [Services](./services.md) -- Business logic layer
