---
type: Example
title: grpc-test
description: A ConnectRPC (gRPC) plus REST example on one application, showing direct and component-composed controllers over both transports.
resource: examples/grpc-test
tags: [examples, grpc]
---

`grpc-test` runs `ControllerTransports.REST` and `ControllerTransports.GRPC` side by side in one `IApplicationConfigs.transports` array, backed by `@connectrpc/connect` and `@bufbuild/protobuf`. Proto files live under each controller's own `proto/` folder (`src/controllers/{greeter,health,echo,time}/proto`), generated with `buf` via per-service `proto:gen:*` scripts driven by `buf.yaml`.

## What it demonstrates

- **Direct controller registration** - `GreeterController`, `HealthController` (gRPC) and `StatusController` (REST) are registered straight in `preConfigure()`.
- **Component-composed controllers** - `OrdersComponent` composes `UsersComponent` (registering `UsersController` + `OrdersController`); `TimeComponent` composes `EchoComponent` (registering `EchoController` + `TimeController`) - both resolved through DI during the `registerComponents` phase, not `preConfigure`.
- **Transport-level limits documented in the client** - Connect protocol over HTTP/1.1 fully supports unary and server-streaming calls; client-streaming and bidi-streaming need HTTP/2 (true gRPC), which this example's client (`src/client.ts`) states explicitly rather than attempting.
- `src/client.ts` is a full pass/fail smoke test hitting every REST and gRPC endpoint (`/status`, `/users`, `/orders`, `GreeterService.SayHello`, `GreeterService.ListUsers`, `HealthService.Ping`, `EchoService.Echo`, `TimeService.GetTime`), printing `PASS`/`FAIL` per case and exiting non-zero on any failure.

## How to run it

```bash
bun install
bun run proto:gen          # regenerates all four proto services via buf
bun run server:dev          # rebuilds then NODE_ENV=development bun .
bun run client:dev           # rebuilds then runs dist/client.js against the running server
```

gRPC endpoints are exposed at `/grpc/<package>.<Service>/*` using the Connect protocol (HTTP/1.1 JSON + Protobuf) and gRPC-Web.

## Notable / non-obvious

- This is the only example demonstrating that a `@controller` can be registered either directly or transitively through a `component()` call that itself composes other components - the same DI resolution path core uses for `HealthCheckComponent`/`ApiReferenceComponent` extends naturally to app-defined component composition.
- The client file's docstring is unusually explicit about the Connect-protocol-vs-true-gRPC streaming boundary - worth citing verbatim when explaining why bidi streaming isn't demoed here.

## Related
- [Controller system](/architecture/controller-system.md)
- [core package](/packages/core-server.md)
