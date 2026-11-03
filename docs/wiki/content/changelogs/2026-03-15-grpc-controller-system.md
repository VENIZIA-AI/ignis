---
title: gRPC Controller System & Controller Architecture Refactor
description: IGNIS can now serve unary gRPC endpoints through ConnectRPC next to REST, and the controller base classes are split into REST and gRPC versions.
packages: ['@venizia/ignis']
---

# Changelog - 2026-03-15

## gRPC Controller System & Controller Architecture Refactor

**In one line.** You can now write gRPC controllers with decorators and serve them from the same app as your REST controllers, with the same authentication and authorization.

## What changed

- **`BaseGrpcController`.** Declare RPC methods with `@unary`. Only unary RPCs work: `@serverStream`, `@clientStream` and `@bidiStream` exist but throw at boot (the HTTP/1.1 Connect protocol cannot stream; reserved for future HTTP/2 support).
- **Auth on gRPC.** Authentication and authorization are enforced on gRPC endpoints, like REST.
- **Error codes kept.** ConnectRPC error codes are preserved instead of always becoming `INTERNAL(13)`.
- **Safe concurrent requests.** `GrpcRequestAdapter` uses AsyncLocalStorage so each request has its own context.
- **Both transports in one app.** Set `transport: ControllerTransports.REST` or `ControllerTransports.GRPC` in `@controller`, and register gRPC controllers with `GrpcComponent` (and REST ones with `RestComponent`).
- **Split base classes.** `AbstractRestController` and `BaseRestController` for REST, `AbstractGrpcController` and `BaseGrpcController` for gRPC.
- **gRPC constants.** Headers, methods, status codes and content types for the gRPC, gRPC-Web and Connect protocols are added to the helpers package.
- **Optional dependency.** `@connectrpc/connect` is an optional peer dependency; REST-only apps are unaffected.

## Who is affected

- **REST-only apps.** No action needed. `BaseController` still works through the barrel export.
- **Code importing controller base classes from internal file paths.** Update the paths (below).
- **Custom gRPC controllers built on the old internal API.** Migrate (below).
- **Apps adding gRPC.** Run `bun add @connectrpc/connect`.

## Breaking changes

> [!WARNING]
> The files `base/controllers/abstract.ts` and `base/controllers/base.ts` are removed, and the gRPC controller internals changed.

**Before:**

```typescript
import { AbstractController, BaseController } from '@venizia/ignis';
// or, from internal paths
import { AbstractController } from '@venizia/ignis/base/controllers/abstract';
import { BaseController } from '@venizia/ignis/base/controllers/base';

class MyGrpcController extends AbstractGrpcController {
  implementation = { /* handler map */ };
  definitions: Record<string, IRpcMetadata> = { /* separate metadata map */ };
  getImplementation() { return this.implementation; }
}

const adapter = createHonoConnectAdapter(options);
```

**After:**

```typescript
import { AbstractRestController, BaseRestController } from '@venizia/ignis';
// or, from internal paths
import { AbstractRestController } from '@venizia/ignis/base/controllers/rest/abstract';
import { BaseRestController } from '@venizia/ignis/base/controllers/rest/base';

// One unified map, one write per RPC:
// this.definitions[configs.name] = { configs, handler };   // IRpcRegistration<RouteEnv>
//   configs: { name, method, authenticate?, authorize? }
//   handler: (opts: { request, context }) => response

const adapter = await GrpcRequestAdapter.build({
  controller: myController,
  interceptors: [], // optional
});
```

| Removed | Replacement |
|---------|-------------|
| `implementation` property | Merged into `definitions` as `IRpcRegistration` |
| `getImplementation()` | Not needed; read `definitions` directly |
| `createHonoConnectAdapter()` | `GrpcRequestAdapter.build()` |
| `IConnectAdapterOptions` type | Removed (unused) |

## Migration

1. If you import controller base classes from internal paths, switch to `AbstractRestController` and `BaseRestController` at the new paths above.
2. For custom gRPC controllers: remove `implementation` and `getImplementation()`, merge handlers into `definitions` with `IRpcRegistration`, and replace `createHonoConnectAdapter()` with `GrpcRequestAdapter.build()`.
3. For gRPC, install the peer dependency: `bun add @connectrpc/connect`.

## Details

```typescript
@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterServiceDef })
export class GreeterController extends BaseGrpcController {
  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }) {
    return create(SayHelloResponseSchema, { message: `Hello, ${opts.request.name}!` });
  }
}

export class Application extends BaseApplication {
  async registerComponents() {
    this.component(GrpcComponent);
  }
}
```
