---
type: Example
title: grpc-test
description: The reference gRPC application - a notes service with all four call kinds on Connect, gRPC-Web and native gRPC, with JWT, a role policy and a row scope.
resource: examples/grpc-test
tags: [examples, grpc]
---

`grpc-test` runs one controller, `NotesController`, over both ports: Connect and gRPC-Web on the application port,
native gRPC on its own. The contract is `proto/notes/v1/notes.proto`; `bun run proto:gen` writes `src/generated`,
which is committed.

## What it demonstrates

- **All four call kinds** - `SignIn` (public) and `GetNote` (unary), `WatchNotes` (server stream), `ImportNotes`
  (client stream), `SyncNotes` (bidi, native port only).
- **Auth** - JWT `authenticate` and a role-policy `authorize` per RPC; the note model's row scope limits every query
  to the caller. Boot seeding runs in a system `Execution` frame.
- **Options** - the native port is read from the environment (`src/common/grpc-native-settings.ts`), TLS included; an
  interceptor logs one line per RPC.
- **Shutdown** - a post-stop hook registered in `preConfigure` ends followed streams before the native port stops.
- **Clients** - connect-es, `@grpc/grpc-js`, a browser page and a `grpcurl` script under `clients/` and `scripts/`.

## How to run it

From the repository root once: `bun install && make build`. Then in `examples/grpc-test`: copy `.env.example` to
`.env` and `bun run server:dev`. `bun run test` runs the end-to-end test. PGlite in memory: no docker, no Postgres.

## Related

- [gRPC request path](/architecture/grpc-request-path.md)
- [gRPC timeouts and shutdown](/architecture/grpc-timeouts-and-shutdown.md)
- [core package](/packages/core-server.md)
