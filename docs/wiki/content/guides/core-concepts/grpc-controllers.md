---
title: gRPC controllers
description: Serve Protobuf services from IGNIS with ConnectRPC - guides and how to write a gRPC controller
---

# gRPC controllers

IGNIS serves Protobuf services with [ConnectRPC](https://connectrpc.com/). A gRPC controller is a class with one method per RPC, with dependency injection, `authenticate` and `authorize` as in REST.

```typescript
@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterDefinition })
export class GreeterController extends BaseGrpcController {
  constructor() {
    super({ scope: GreeterController.name });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }) {
    return create(SayHelloResponseSchema, { message: `Hello, ${opts.request.name}!` });
  }
}
```

New here? Start with [Build a gRPC service](/guides/core-concepts/grpc/build-a-service).

## gRPC guides

| Guide | Answers |
|---|---|
| [Build a gRPC service](/guides/core-concepts/grpc/build-a-service) | proto file to first call |
| [Ports and protocols](/guides/core-concepts/grpc/ports) | Connect, gRPC-Web or gRPC; the native port |
| [Call kinds and streaming](/guides/core-concepts/grpc/call-kinds) | unary, server, client and bidi handlers |
| [Authentication and authorization](/guides/core-concepts/grpc/authentication) | protect a method, send a token |
| [Configuration and limits](/guides/core-concepts/grpc/configuration) | every option and default |
| [TLS](/guides/core-concepts/grpc/tls) | certificates, h2c |
| [Errors and status codes](/guides/core-concepts/grpc/errors) | what the client reads |
| [Deadlines and timeouts](/guides/core-concepts/grpc/deadlines-and-timeouts) | deadline, cancel, idle timeout |
| [Shutdown](/guides/core-concepts/grpc/shutdown) | calls running at stop |
| [Bun limits](/guides/core-concepts/grpc/bun-limits) | quiet streams and other limits |
| [Testing](/guides/core-concepts/grpc/testing) | test over both ports |
| [Troubleshooting](/guides/core-concepts/grpc/troubleshooting) | symptom, cause, fix |

API details: [gRPC controllers reference](/references/base/grpc-controllers).

## Enable the gRPC transport

`@connectrpc/connect` and `@bufbuild/protobuf` are yours to install. Then add `GRPC` to `transports`; the default is REST only.

```bash
bun add @connectrpc/connect @bufbuild/protobuf
```

```typescript
config: {
  path: { base: '/api', isStrict: false },
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
}
```

A gRPC controller found while the transport is off logs an error and serves nothing.

## RPC method decorators

| Decorator | Kind |
|---|---|
| `@unary` | one request, one answer |
| `@serverStream` | one request, many answers |
| `@clientStream` | many requests, one answer |
| `@bidiStream` | many both ways, [native port only](/guides/core-concepts/grpc/call-kinds) |
| `@rpc` | any kind, with `method` in `configs` |

`configs.name` is the method as the generated code writes it (`sayHello` for `rpc SayHello`). `configs` also takes `authenticate` and `authorize`.

## Handler arguments

Every handler receives `{ request, context, rpc }`.

| Field | What it is |
|---|---|
| `request` | the decoded message, or an async iterable of them for client and bidi streams |
| `context` | the Hono context of the call |
| `rpc` | ConnectRPC `HandlerContext`: `signal`, `timeoutMs()`, `requestHeader`, `responseHeader`, `responseTrailer` |

Build answers with `create(ResponseSchema, fields)` from `@bufbuild/protobuf`.

## Define RPCs without decorators

`defineRoute` and `bindRoute` register in `binding()`.

```typescript
import { GRPC } from '@venizia/ignis-helpers';

override binding() {
  this.defineRoute({
    configs: { name: 'sayHello', method: GRPC.Methods.UNARY },
    handler: async () => create(SayHelloResponseSchema, { message: 'Hello' }),
  });

  this.bindRoute({ configs: { name: 'collect', method: GRPC.Methods.CLIENT_STREAMING } }).to({
    handler: async () => create(SayHelloResponseSchema, { message: 'Done' }),
  });
}
```

## Differences from REST controllers

| Aspect | REST | gRPC |
|---|---|---|
| Base class | `BaseRestController` | `BaseGrpcController` |
| Route identifier | path and HTTP method | RPC name |
| Handler | `(context) => Response` | `({ request, context, rpc }) => message` |
| Schema | Zod and OpenAPI | Protobuf |
| `binding()` | optional | required, may be empty |
| Request body limit | `middlewares.bodyLimit` | [`limits.messageSize`](/guides/core-concepts/grpc/configuration#grpc-message-size-limit) |

## See also

- [Application](/guides/core-concepts/application/)
- [REST controllers](/guides/core-concepts/rest-controllers)
- [Services](/guides/core-concepts/services)
- [Dependency injection](/guides/core-concepts/dependency-injection)
