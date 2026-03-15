# gRPC Controllers

Ignis provides first-class support for gRPC via the [ConnectRPC](https://connectrpc.com/) protocol. gRPC controllers use Protobuf service definitions for strongly-typed RPC methods, and are served over the same Hono HTTP server as REST controllers.

> **Deep Dive:** See [gRPC Controllers Reference](../../references/base/grpc-controllers.md) for the complete API.

> [!IMPORTANT]
> The current version only supports **unary** RPCs (single request, single response) over HTTP/1.1 Connect protocol. Streaming methods (`@serverStream`, `@clientStream`, `@bidiStream`) have decorators defined for metadata registration, but will throw an error at runtime if used.

## Peer Dependencies

gRPC support requires the following packages to be installed:

```bash
bun add @connectrpc/connect @bufbuild/protobuf
```

## Enabling gRPC Transport

To use gRPC controllers, you must enable the gRPC transport in your application configuration:

```typescript
import { ControllerTransports } from '@venizia/ignis';

export const appConfigs: IApplicationConfigs = {
  // ... other config
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
};
```

If `transports` is not specified, only `REST` is enabled by default. If gRPC controllers are discovered but the gRPC transport is not enabled, the framework will log an error warning.

## Creating a gRPC Controller

Extend `BaseGrpcController` and use the `@controller` decorator with `transport: ControllerTransports.GRPC` and a `service` reference to your generated Protobuf service definition.

```typescript
import { create } from '@bufbuild/protobuf';
import {
  BaseGrpcController,
  ControllerTransports,
  controller,
  inject,
  unary,
  TRouteContext,
} from '@venizia/ignis';
import {
  GreeterService,
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
} from './generated/greeter_pb';

@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: GreeterService,
})
export class GreeterController extends BaseGrpcController {
  constructor(
    @inject({ key: 'services.GreeterService' })
    private readonly greeterService: GreeterService,
  ) {
    super({ scope: 'GreeterController' });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest; context: TRouteContext }): Promise<SayHelloResponse> {
    const message = await this.greeterService.greet({ name: opts.request.name });
    return create(SayHelloResponseSchema, { message });
  }
}
```

### Key Points

- The `service` field in `@controller` must reference the generated ConnectRPC service definition (e.g., `GreeterService`)
- The `path` determines the URL prefix where the gRPC service is mounted
- `binding()` must be implemented (even if empty) -- it is called during `configure()`
- Handler methods receive `{ request, context }` and return a Protobuf message object

## RPC Method Decorators

Ignis provides a decorator for each gRPC method type:

- `@unary(opts)` -- Single request, single response. **This is the only supported method type** in the current version.
- `@serverStream(opts)` -- Decorator exists for metadata, but throws at runtime.
- `@clientStream(opts)` -- Decorator exists for metadata, but throws at runtime.
- `@bidiStream(opts)` -- Decorator exists for metadata, but throws at runtime.
- `@rpc(opts)` -- Generic RPC decorator where you specify the `method` in the configs.

The `opts` object contains a `configs` property with at minimum a `name` field that matches the RPC method name in your Protobuf service definition. You can also specify `authenticate` and `authorize` options, just like REST routes.

```typescript
// Unary (supported)
@unary({ configs: { name: 'sayHello' } })
async sayHello(opts: { request: SayHelloRequest; context: TRouteContext }): Promise<SayHelloResponse> { ... }

// With authentication
@unary({
  configs: {
    name: 'getUser',
    authenticate: { strategies: ['jwt'], mode: 'required' },
  },
})
async getUser(opts: { request: GetUserRequest; context: TRouteContext }): Promise<GetUserResponse> { ... }

// With authorization
@unary({
  configs: {
    name: 'deleteUser',
    authenticate: { strategies: ['jwt'] },
    authorize: { resource: 'user', scopes: ['delete'] },
  },
})
async deleteUser(opts: { request: DeleteUserRequest; context: TRouteContext }): Promise<DeleteUserResponse> { ... }
```

## Transport Configuration

The transport type is set via the `transport` field in the `@controller` decorator:

```typescript
// REST controller (default -- transport can be omitted)
@controller({ path: '/users' })

// gRPC controller
@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: MyService })
```

The `ControllerTransports` class provides the available transport constants:

- `ControllerTransports.REST` -- Default HTTP/JSON transport
- `ControllerTransports.GRPC` -- ConnectRPC transport

## Manual Route Definition

Just like REST controllers, gRPC controllers support manual route definition via `defineRoute` and `bindRoute`:

```typescript
import { GRPC } from '@venizia/ignis-helpers';

override binding() {
  // Using defineRoute
  this.defineRoute({
    configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
    handler: async (opts) => {
      return create(SayHelloResponseSchema, { message: `Hello ${opts.request.name}` });
    },
  });

  // Using bindRoute (fluent API)
  this.bindRoute({
    configs: { name: 'getUser', method: GRPC.Methods.UNARY },
  }).to({
    handler: async (opts) => {
      return create(GetUserResponseSchema, { name: 'John' });
    },
  });
}
```

## Minimal Controller (No DI)

For simple services that don't need injected dependencies:

```typescript
import { create } from '@bufbuild/protobuf';
import { BaseGrpcController, ControllerTransports, controller, unary } from '@venizia/ignis';
import { EchoService, EchoResponseSchema, type EchoRequest, type EchoResponse } from './generated/echo_pb';

@controller({
  path: '/echo',
  transport: ControllerTransports.GRPC,
  service: EchoService,
})
export class EchoController extends BaseGrpcController {
  constructor() {
    super({ scope: 'EchoController' });
  }

  override binding() {}

  @unary({ configs: { name: 'echo' } })
  async echo(opts: { request: EchoRequest }): Promise<EchoResponse> {
    return create(EchoResponseSchema, { message: opts.request.message });
  }
}
```

## Key Differences from REST Controllers

| Aspect | REST Controller | gRPC Controller |
| :--- | :--- | :--- |
| **Base class** | `BaseRestController` | `BaseGrpcController` |
| **Router** | `OpenAPIHono` | `Hono` (plain) |
| **Route identifier** | `path` + HTTP method | `name` (Protobuf method name) |
| **Handler signature** | `(c: TRouteContext) => Response` | `(opts: { request, context }) => ResponseMessage` |
| **Response format** | `c.json()` calls | Protobuf message objects via `create()` |
| **Schema** | Zod + OpenAPI | Protobuf (`@bufbuild/protobuf`) |
| **`binding()` method** | Optional (can use decorators only) | Must be implemented (even if empty) |
| **`configure()` return** | `OpenAPIHono` router | `void` (adapter mounted internally) |
| **Peer dependencies** | None | `@connectrpc/connect`, `@bufbuild/protobuf` |

## Protobuf Setup

gRPC controllers require Protobuf service definitions. The typical workflow:

### 1. Define your `.proto` file

```protobuf
// proto/greeter.proto
syntax = "proto3";

package greeter;

service GreeterService {
  rpc SayHello (SayHelloRequest) returns (SayHelloResponse);
  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);
}

message SayHelloRequest {
  string name = 1;
}

message SayHelloResponse {
  string message = 1;
}

message ListUsersRequest {}

message ListUsersResponse {
  repeated User users = 1;
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}
```

### 2. Generate TypeScript code

Use [Buf](https://buf.build/) to generate TypeScript from your `.proto` files:

```yaml
# buf.gen.yaml
version: v2
plugins:
  - remote: buf.build/bufbuild/es
    out: src/controllers/greeter/generated
```

```bash
npx buf generate src/controllers/greeter/proto
```

### 3. Use the generated types in your controller

The generated `*_pb.ts` files export service definitions, message schemas, and TypeScript types that you use directly in your controller (as shown in the examples above).

## Client Usage

You can test gRPC controllers using the ConnectRPC client:

```typescript
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { GreeterService } from './controllers/greeter/generated/greeter_pb';

const transport = createConnectTransport({
  baseUrl: 'http://localhost:3000',
});

const client = createClient(GreeterService, transport);

const response = await client.sayHello({ name: 'World' });
console.log(response.message); // "Hello, World!"
```

## See Also

- **Related Concepts:**
  - [Application](/guides/core-concepts/application/) - Registering controllers and enabling transports
  - [REST Controllers](/guides/core-concepts/rest-controllers) - HTTP/JSON controllers
  - [Services](/guides/core-concepts/services) - Business logic layer called by controllers
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - Injecting services into controllers

- **References:**
  - [BaseGrpcController API](/references/base/grpc-controllers) - Complete gRPC controller API reference
  - [Authentication](/extensions/components/authentication/) - Securing gRPC endpoints
  - [Authorization](/extensions/components/authorization/) - Role-based access control for RPCs
