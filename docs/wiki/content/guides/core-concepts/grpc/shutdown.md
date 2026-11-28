---
title: gRPC graceful shutdown
description: What happens to gRPC calls when an IGNIS application stops
---

# gRPC graceful shutdown

`application.stop()` lets running RPCs finish for up to `shutdownTimeout`, then aborts their `rpc.signal`, on both ports. It runs the post-stop hooks, stops the HTTP server and closes the datasources. The native gRPC port closes in a post-stop hook, so it ends first. Install the signal handlers after `start()`:

```typescript
await application.start();
application.installShutdownSignals({ timeoutMs: 30_000 });
```

| Setting | Default | Meaning |
|---|---|---|
| `native.shutdownTimeout` | `10_000` ms | time running RPCs get to finish, on both ports. With the native port off it is `10_000` |
| `installShutdownSignals` `timeoutMs` | `15_000` ms | after it, the process exits with code 1 |

## Shutdown of the native gRPC port

1. Stops accepting connections and asks open ones to finish (HTTP/2 GOAWAY).
2. Waits up to `shutdownTimeout`.
3. Aborts `rpc.signal` of calls still running; their clients read `unavailable`.
4. About a second later, destroys what remains.

## Shutdown of the application port

Connect and gRPC-Web calls are ordinary requests, and the server waits for the requests in flight.

1. The timeout starts after the post-stop hooks you registered in `preConfigure()`, at the same moment as the native port's.
2. An RPC that ends in time answers as usual.
3. After `shutdownTimeout`, `rpc.signal` of the RPCs still running aborts. A handler that stops on it answers `unavailable`.

A handler that ignores `rpc.signal` runs on, and `stop()` waits for it: the application port cannot cut one RPC without cutting the REST requests too. The signal `timeoutMs` then ends the process. A REST request has no such signal and is waited for.

## End long-lived streams at shutdown

A stream that waits on `rpc.signal` ends by itself after the timeout. To end it at once instead, register a post-stop hook in `preConfigure()`. Hooks run one after another in the order registered, so yours runs before the one that closes the native port.

```typescript
override preConfigure() {
  this.registerPostStopHook({
    identifier: 'notes.watchers.close',
    hook: () => this.watcher.close(),   // make every watch stream return
  });
}
```

In the stream handler, answer `unavailable` when your service closes, so clients retry:

```typescript
throw new ConnectError('The server is shutting down', Code.Unavailable);
```

Set the signal `timeoutMs` longer than `shutdownTimeout` plus the time your own hooks and datasources need to close.

## Start order of the native port

The native port starts after the HTTP server. A port already in use makes `start()` fail.
