---
type: Example
title: grpc-test
description: An application answering the same kind of request over gRPC (ConnectRPC) and REST, registered side by side, with one unary proto service.
resource: examples/grpc-test
tags: [examples, grpc]
---

`grpc-test` runs `ControllerTransports.REST` and `ControllerTransports.GRPC` side by side in one
`config.transports` array. `GreeterController` (`@controller({ transport: ControllerTransports.GRPC,
service })`, one `@unary` RPC, `SayHello`) is the gRPC side; `StatusController` (`GET /status`) is a
plain REST controller. Both register through `discoverArtifacts: true` - `src/application.ts` only
imports the decorated modules.

## What it demonstrates

- **Two transports, one `Application`** - `config.transports: [ControllerTransports.REST,
  ControllerTransports.GRPC]` in `src/index.ts` is what makes the gRPC branch exist at all; drop
  `GRPC` from that array and `GreeterController` boots with a warning instead of a route.
- **The Connect protocol needs no gRPC client** - a unary RPC is one `curl -X POST` away, plain JSON
  over HTTP/1.1, at `/api/grpc/greeter.v1.GreeterService/SayHello`.
- **Only unary RPCs** - `BaseGrpcController` throws at boot, when it registers the route, for any
  RPC method that is not unary. Server-streaming, client-streaming and bidirectional RPCs need
  HTTP/2 (true gRPC), which this example does not set up.
- **Generated code is committed, never imported directly** - `buf generate` (via `bun run
  proto:gen`) writes `src/controllers/greeter/generated/greeter_pb.ts` from
  `src/controllers/greeter/proto/greeter.proto`; `definition.ts` re-exports the generated names, and
  controller code imports from there.

## How to run it

```bash
bun install
bun run start        # http://localhost:3000/api/status, explorer at /api/doc/explorer
bun test              # smoke test: GET /status over fetch, SayHello over a ConnectRPC client
```

## Notable / non-obvious

- `GreeterService` is injected into `GreeterController` from `GreeterService` in
  `src/services/greeter.service.ts` - the business logic sits in a service like any REST controller,
  not inline in the gRPC handler.
- This example is one of `EXAMPLES_SMOKE` in the root `Makefile` - `make examples-smoke` runs its
  `bun test` in CI, no docker needed.

## Related
- [Controller system](/architecture/controller-system.md)
- [core package](/packages/core-server.md)
