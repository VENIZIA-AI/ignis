# gRPC Controllers

IGNIS serves Protobuf services with [ConnectRPC](https://connectrpc.com/): clients use the Connect or gRPC-Web protocol on the application port. A native gRPC request answers `415`. gRPC controllers use Protobuf service definitions for strongly-typed RPC methods, and are served over the same Hono HTTP server as REST controllers.

> **Deep Dive:** See [gRPC Controllers Reference](../../references/base/grpc-controllers.md) for the complete API.

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
  TRouteContext, BindingKeys,
} from '@venizia/ignis';
// The generated service descriptor is a value, not a type. Alias it so it does not
// collide with your own application service class of the same name.
import {
  GreeterService as GreeterServiceDefinition,
  SayHelloResponseSchema,
  type SayHelloRequest,
  type SayHelloResponse,
} from './generated/greeter_pb';
import { GreeterService } from '../../services/greeter.service';

@controller({
  path: '/grpc',
  transport: ControllerTransports.GRPC,
  service: GreeterServiceDefinition,
})
export class GreeterController extends BaseGrpcController {
  constructor(
    @inject({ key: BindingKeys.build<GreeterService>({ key: 'services.GreeterService' }) })
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

- The `service` field in `@controller` must reference the generated ConnectRPC service definition
- That descriptor is a `const`, so it cannot be used as a type. Writing `private readonly greeterService: GreeterService` against it is a compile error. The injected dependency is your own service class, which is a different symbol
- The `path` determines the URL prefix where the gRPC service is mounted
- `binding()` must be implemented (even if empty) - it is called during `configure()`
- Handler methods receive `{ request, context, rpc }` and return a Protobuf message object

The name of an RPC is the method of the service as the generated code writes it (`sayHello` for `rpc SayHello`). A name the service does not declare stops the application at startup, with the declared names in the error.

## Deadlines, cancellation, headers and trailers

`rpc` is ConnectRPC's context of the call (`HandlerContext` from `@connectrpc/connect`):

```typescript
@unary({ configs: { name: 'sayHello' } })
async sayHello(opts: { request: SayHelloRequest; context: TRouteContext; rpc: HandlerContext }) {
  const { request, rpc } = opts;

  // Aborted at the client's deadline and when the client leaves.
  const message = await this.greeterService.greet({ name: request.name, signal: rpc.signal });
  rpc.responseHeader.set('x-greeter', 'v2');
  rpc.responseTrailer.set('x-cost', '3');

  return create(SayHelloResponseSchema, { message });
}
```

A deadline is a signal, not a kill: a handler that ignores `rpc.signal` runs on and answers. `rpc.timeoutMs()` gives the time left, and `rpc.requestHeader` the request headers.

## Request size

An RPC route reads its own body: the application's body limit (`middlewares.bodyLimit`) does not apply to it, and the request spy does not read or log it. Each message is limited instead, decompressed, to 5 MiB by default. A larger one answers `resource_exhausted`.

```typescript
this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  limits: { messageSize: 10 * 1024 * 1024 },
});
```

The whole request is still held to the server's own cap, `server.maxRequestBodySize` (Bun's default is 128 MiB). A middleware of your own that reads the body of an RPC route is bounded only by that cap.

The limit steps aside by matched route, as `BodyLimits.route` does: a route of your own registered on the same path as an RPC takes no application body limit either.

## RPC Method Decorators

IGNIS provides a decorator for each gRPC method type:

- `@unary(opts)` -- one request, one answer.
- `@serverStream(opts)` -- one request, a stream of answers.
- `@clientStream(opts)` -- a stream of requests, one answer.
- `@bidiStream(opts)` -- streams both ways; the application port refuses it (it needs HTTP/2).
- `@rpc(opts)` -- Generic RPC decorator where you specify the `method` in the configs.

The `opts` object contains a `configs` property with at minimum a `name` field that matches the RPC method name in your Protobuf service definition. You can also specify `authenticate` and `authorize` options, just like REST routes.

```typescript
// Unary
@unary({ configs: { name: 'sayHello' } })
async sayHello(opts: { request: SayHelloRequest; context: TRouteContext }): Promise<SayHelloResponse> { ... }

// With authentication
@unary({
  configs: {
    name: 'getUser',
    authenticate: { strategies: ['jwt'], mode: 'any' },
  },
})
async getUser(opts: { request: GetUserRequest; context: TRouteContext }): Promise<GetUserResponse> { ... }

// With authorization
@unary({
  configs: {
    name: 'deleteUser',
    authenticate: { strategies: ['jwt'] },
    authorize: { action: 'delete', resource: 'user' },
  },
})
async deleteUser(opts: { request: DeleteUserRequest; context: TRouteContext }): Promise<DeleteUserResponse> { ... }
```

## Streaming

| Call | Application port | The handler |
|---|---|---|
| unary | Connect, gRPC-Web | returns the answer |
| server stream | Connect, gRPC-Web | an async generator: `yield` each message |
| client stream | Connect | reads `request` with `for await`, returns one answer |
| bidi | refused with HTTP 505: it needs HTTP/2 | |

A browser cannot stream a request body: from a browser only unary and server streaming work.

```typescript
@serverStream({ configs: { name: 'listHellos', authenticate: { strategies: ['jwt'] } } })
async *listHellos(opts: { request: ListRequest; context: TRouteContext; rpc: HandlerContext }) {
  for await (const row of this.greeterService.rows({ signal: opts.rpc.signal })) {
    yield create(SayHelloResponseSchema, row);
  }
}

@clientStream({ configs: { name: 'collect', authenticate: { strategies: ['jwt'] } } })
async collect(opts: { request: AsyncIterable<HelloRequest> }) {
  const names: string[] = [];

  for await (const message of opts.request) {
    names.push(message.name);
  }

  return create(SayHelloResponseSchema, { message: names.join(', ') });
}
```

The middlewares run before the handler. When the client leaves, `rpc.signal` aborts and the generator is closed, so a `finally` in it runs. A reader that stops reading pauses the generator.

### Quiet calls

`Bun.serve` closes a request that stays quiet longer than `server.idleTimeout` (10 seconds by default).

| Call | Idle timeout |
|---|---|
| passed `authenticate` or `authorize` | lifted: it may stay quiet as long as its handler needs |
| refused, or still without credentials | kept |
| a public method (no `authenticate`) | kept: raise `server.idleTimeout` if it must pause longer |

A call whose idle timeout is lifted ends with the client's deadline, the client leaving, or the handler. Send a deadline from the client, and pass `rpc.signal` to slow work.

The whole request of a client stream is held to `server.maxRequestBodySize` (128 MiB by default).

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
| **Response format** | `context.json()` calls | Protobuf message objects via `create()` |
| **Schema** | Zod + OpenAPI | Protobuf (`@bufbuild/protobuf`) |
| **`binding()` method** | Optional (can use decorators only) | Must be implemented (even if empty) |
| **`configure()` return** | `OpenAPIHono` router | `void` (adapter mounted internally) |
| **Peer dependencies** | None | `@connectrpc/connect`, `@bufbuild/protobuf` |

## Errors

An RPC fails the way a REST route does: throw `getError({ statusCode, message })`, or Hono's `HTTPException`. For a 4xx the client reads the code of the status and the message a REST request would get.

| Status | gRPC code |
|---|---|
| 400, 422 | `invalid_argument` |
| 401 | `unauthenticated` |
| 403 | `permission_denied` |
| 404 | `not_found` |
| 409 | `aborted` |
| 429 | `resource_exhausted` |
| Any other 4xx | `failed_precondition` |

Everything else, a 5xx and another library's error with a `statusCode` included, answers `internal` with its text hidden. Throw a ConnectRPC `ConnectError` to choose the code yourself.

A middleware of an RPC passes the call on by calling `next()`. One that returns a `Response`, or returns without calling `next()`, ends the call: the handler does not run. A 4xx `Response` gives the code of its status, anything else `internal`; the body and the headers of that response (`WWW-Authenticate` included) are not sent.

Every middleware runs before the handler starts: `next()` only marks the call as passed on, so code after `await next()` does not wrap the handler (a `finally`, an async context or a `catch` there never sees it).

The status and the message come from the default error handler: an error handler your application overrides is not used for an RPC.

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
bun add -d @bufbuild/buf @bufbuild/protoc-gen-es
node_modules/.bin/buf generate src/controllers/greeter/proto
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
