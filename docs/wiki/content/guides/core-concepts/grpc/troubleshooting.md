---
title: gRPC troubleshooting
description: Symptoms of a failing gRPC service, their causes and fixes
---

# gRPC troubleshooting

Find your symptom, then follow the link.

## 404 on every gRPC method

- `transports` lacks `ControllerTransports.GRPC`: the log has an error naming the controller.
- The URL lacks the base path or the controller path. Application port: `{base}{controller path}/pkg.Service/Method`.
- The controller has no `service`: the log has a warning that it was skipped.

## HTTP 415 or a client error on a gRPC client

A native gRPC client reached the application port. Point it at the [native port](/guides/core-concepts/grpc/ports#turn-on-the-native-grpc-port).

## unimplemented from the native gRPC port

The path is `/pkg.Service/Method`, without base or controller path, and the method must be implemented by a registered controller. `grpcurl` also needs the `.proto` (no reflection).

## Bidi streaming fails with HTTP 505

The application port is HTTP/1.1. Call the native port with a gRPC client.

## A stream is cut after a few seconds

A public call hit the idle timeout. [Raise it or authenticate](/guides/core-concepts/grpc/bun-limits#quiet-server-streams-are-cut).

## Every error arrives as internal

Only IGNIS errors and `HTTPException` with a 4xx keep their code. [Throw `getError` or a `ConnectError`](/guides/core-concepts/grpc/errors#errors-that-answer-internal).

## resource_exhausted on a large message

The message is over `limits.messageSize`. [Raise it](/guides/core-concepts/grpc/configuration#grpc-message-size-limit).

## unimplemented for a compressed request

Request compression is not accepted. Turn it off in the client.

## Startup fails

| Message mentions | Cause |
|---|---|
| "declares no RPC" | the decorator `name` is not a method of the service |
| "is server_streaming, declared unary" (or the like) | the decorator does not match the `.proto` |
| "two controllers declare it" | one service is served by two controllers on the native port |
| `limits.messageSize`, `native.*` | a value outside its [range](/guides/core-concepts/grpc/configuration) |
| a missing module | install `@connectrpc/connect`, and `@connectrpc/connect-node` for the native port |
| "needs @connectrpc/connect-node" | pass `module.node` when you pass `module` |

## RPC calls are rejected as unauthenticated

Check that the strategy is [registered](/guides/core-concepts/grpc/authentication#register-the-authentication-strategy) (an unknown name is logged at startup) and that the client sends the header.

## Browser calls fail with a CORS error

Set `middlewares.cors` for your origin. See [browser clients](/guides/core-concepts/grpc/ports#connect-and-grpc-web-clients-on-the-application-port).

## Shutdown hangs or exits with code 1

A handler that ignores `rpc.signal` holds `stop()` on the application port. [Pass the signal to everything it waits on](/guides/core-concepts/grpc/shutdown#shutdown-of-the-application-port), and keep the signal `timeoutMs` above `shutdownTimeout`.
