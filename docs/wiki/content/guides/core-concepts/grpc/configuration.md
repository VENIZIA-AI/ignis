---
title: gRPC configuration and limits
description: Every gRPC option of IGNIS, its default and its allowed values
---

# gRPC configuration and limits

gRPC settings live in two places: the component options (below) and the application config.

```typescript
import { GrpcBindingKeys } from '@venizia/ignis/grpc';

// in preConfigure()
this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  interceptors: [],
  limits: { messageSize: 5 * 1024 * 1024 },
  native: {
    use: true,
    port: 50051,
    host: '127.0.0.1',
    tls: { use: false },
    shutdownTimeout: 10_000,
    limits: { concurrentStreams: 100 },
  },
});
```

All options are optional. Absent options keep the defaults below.

## Component options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `interceptors` | `Interceptor[]` | none | Wrap every RPC. See [order](/guides/core-concepts/grpc/authentication#server-interceptors-run-before-authentication) |
| `limits.messageSize` | `number` (bytes) | `5 * 1024 * 1024` (5 MiB) | Largest message a client may send, decoded. Positive integer |
| `module` | `IConnectRpcModule` | none: loaded from the project | The ConnectRPC peers, for a [compiled binary](#pass-the-peers-to-a-compiled-binary) |
| `native` | `{ use: false }` or `{ use: true, ... }` | off | The [native gRPC port](/guides/core-concepts/grpc/ports) |

## Native port options

| Option | Type | Default | Allowed values |
|---|---|---|---|
| `native.use` | `boolean` | `false` | `true` opens the port |
| `native.port` | `number` | required | integer 0 to 65535; 0 takes a free port |
| `native.host` | `string` | `'127.0.0.1'` | an empty string means the default |
| `native.tls` | `{ use: false }` or `{ use: true, key, cert }` | `{ use: false }` | `key` and `cert`: PEM `string` or `Buffer`, both required |
| `native.shutdownTimeout` | `number` (ms) | `10_000` | positive, at most 2147483647 |
| `native.limits.concurrentStreams` | `number` | `100` | integer 1 to 4294967295, per connection |

A value outside these ranges stops the boot. `native.use` and `native.tls.use` are booleans: anything else stops the boot too.

## Application settings that affect gRPC

| Config | Default | Effect on gRPC |
|---|---|---|
| `transports` | `['rest']` | add `ControllerTransports.GRPC` to mount gRPC controllers |
| `path.base` | required | prefix of RPC paths on the application port |
| `server.idleTimeout` | `10` s (Bun) | [idle timeout](/guides/core-concepts/grpc/deadlines-and-timeouts#idle-timeout), both ports; max 255; `0` off |
| `server.maxRequestBodySize` | 128 MiB (Bun) | whole request on the application port, a client stream included |
| `middlewares.bodyLimit` | 5 MiB | does **not** apply to RPC routes |

```typescript
config: {
  path: { base: '/api', isStrict: false },
  transports: [ControllerTransports.REST, ControllerTransports.GRPC],
  server: { idleTimeout: 30, maxRequestBodySize: 32 * 1024 * 1024 },
}
```

## Controller options

| `@controller` field | Required | Meaning |
|---|---|---|
| `path` | yes (here or in `super`) | mount path on the application port; the decorator wins |
| `transport` | yes | `ControllerTransports.GRPC` |
| `service` | yes | the generated service descriptor; without it the controller is skipped with a warning |

## gRPC message size limit

`limits.messageSize` applies to each decoded message, on both ports. A larger one answers `resource_exhausted`.

```typescript
this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  limits: { messageSize: 10 * 1024 * 1024 },
});
```

An RPC route reads its own body: the application body limit does not apply, and the request logger neither reads nor logs it. A middleware of yours that reads an RPC body is bounded only by `server.maxRequestBodySize`. A route of your own on the same path as an RPC takes no application body limit either.

## Limits IGNIS does not set

| Not available | What it means |
|---|---|
| Total size of a stream on the native port | only each message is limited |
| Number of connections | not capped |
| Server deadline | none: only the client's [deadline](/guides/core-concepts/grpc/deadlines-and-timeouts) bounds a call |
| Compression | a compressed request message is refused (`unimplemented`) |
| Reflection and health service | not served |
| TLS on the application port | terminate it at a proxy |
| Client certificates (mTLS) | not supported |

## Pass the peers to a compiled binary

A `bun build --compile` binary has no `node_modules`. Import the peers statically and pass them, or register them with `ModuleUtility.register`.

```typescript
import * as connect from '@connectrpc/connect';
import * as protocol from '@connectrpc/connect/protocol';
import * as node from '@connectrpc/connect-node';   // only for the native port

this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  module: { connect, protocol, node },
});
```
