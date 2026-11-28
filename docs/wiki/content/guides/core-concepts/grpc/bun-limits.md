---
title: Bun limits for gRPC
description: Behaviour of Bun that shapes gRPC services in IGNIS, including quiet streams cut by the idle timeout
---

# Bun limits for gRPC

The application port is `Bun.serve`. These limits come from Bun, not from your handlers.

| Limit | Work around it |
|---|---|
| A quiet or short-idle server stream is cut | [raise the timeout or authenticate](#quiet-server-streams-are-cut) |
| No response trailers | [native gRPC port](/guides/core-concepts/grpc/ports) |
| HTTP/1.1 only, so no bidi | native gRPC port |
| Idle timeout at most 255 s | authenticate longer-quiet calls |
| Request body at most `maxRequestBodySize` (128 MiB) | raise the setting, or split the upload |
| `stop()` waits for requests in flight | [stop each handler on `rpc.signal`](/guides/core-concepts/grpc/shutdown#shutdown-of-the-application-port) |

## Quiet server streams are cut

On the application port, a server stream of a **public** method can be cut by `Bun.serve`'s `idleTimeout` ([issue #1522](https://github.com/VENIZIA-AI/ignis/issues/1522)):

| `idleTimeout` (seconds) | Public server stream |
|---|---|
| 1 to 4 | cut after about 4 seconds, even while it sends |
| 5 or more, quiet gaps well under the timeout | runs |
| quiet gap within about 4 seconds of the timeout, or longer | can be cut |

The cut behaves as if Bun checks idleness only every few seconds. A stream with gaps exactly 4 seconds under the timeout was cut in some runs and survived in others.

For a public stream, do one of these:

- Set `idleTimeout` to at least 5 **and** more than 4 seconds above the longest quiet gap. With the default of 10, keep gaps under 6 seconds.
- Add [authentication](/guides/core-concepts/grpc/authentication): a call that passes it has the timeout lifted.

```typescript
// longest quiet gap 8 s: 13 or more
config: { server: { idleTimeout: 20 } }
```

The native gRPC port is not affected by the first row: a stream that keeps sending stays open.

## Native gRPC on node:http2 in Bun

The native port uses Bun's `node:http2`, which is younger than Node's. Load test before you put heavy traffic on this port.
