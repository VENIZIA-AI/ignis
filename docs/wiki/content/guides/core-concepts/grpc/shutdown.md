---
title: gRPC graceful shutdown
description: What happens to gRPC calls when an IGNIS application stops
---

# gRPC graceful shutdown

`application.stop()` runs the post-stop hooks, then stops the HTTP server, then closes the datasources. The native gRPC port closes in a post-stop hook, so it ends first. Install the signal handlers after `start()`:

```typescript
await application.start();
application.installShutdownSignals({ timeoutMs: 30_000 });
```

| Setting | Default | Meaning |
|---|---|---|
| `native.shutdownTimeout` | `10_000` ms | time calls on the native port get to finish |
| `installShutdownSignals` `timeoutMs` | `15_000` ms | after it, the process exits with code 1 |

## Shutdown of the native gRPC port

1. Stops accepting connections and asks open ones to finish (HTTP/2 GOAWAY).
2. Waits up to `shutdownTimeout`.
3. Aborts `rpc.signal` of calls still running; their clients read `unavailable`.
4. About a second later, destroys what remains.

## Shutdown of the application port

Connect and gRPC-Web calls are ordinary requests. The server stops after the hooks and **waits for calls in flight**. Their `rpc.signal` is not aborted, so an endless stream holds the shutdown until the signal timeout ends the process.

## End long-lived streams at shutdown

Register a post-stop hook in `preConfigure()`. Hooks run one after another in the order registered, so yours runs before the one that closes the native port.

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

Set the signal `timeoutMs` longer than `shutdownTimeout` plus your longest call.

## Start order of the native port

The native port starts after the HTTP server. A port already in use makes `start()` fail.
