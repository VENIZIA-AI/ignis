---
title: Socket.IO Integration Fix - Lifecycle Timing & Bun Runtime Support
description: SocketIOComponent now starts after the server is up and works on both Node and Bun, with room validation and several renamed types.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-02-06

## Socket.IO Integration Fix - Lifecycle Timing & Bun Runtime Support

**In one line.** `SocketIOComponent` works again, on Node and on Bun, and room joins are now rejected unless you validate them.

## What changed

- **Lifecycle fix.** The component no longer reads the server instance before it exists. Components register post-start hooks that run after the server starts: `this.application.registerPostStartHook({ identifier, hook })`. You no longer need to override `start()`.
- **Bun support.** `SocketIOServerHelper` takes `runtime: RuntimeModules.NODE` or `RuntimeModules.BUN`. `SocketIOComponent` detects the runtime itself.
- **Typed server access.** `getServerInstance<TBunServerInstance>()` and `getServerInstance<TNodeServerInstance>()`.
- **Room validation.** New `validateRoomFn` (binding key `SocketIOBindingKeys.VALIDATE_ROOM_HANDLER`). It receives `{ socket, rooms }` and returns the allowed rooms. Without it every join is rejected, so a client cannot join arbitrary rooms.
- **More robust.** `configure()` is now async and waits for Redis. All three Redis connections have `error` handlers, so Redis errors are no longer unhandled (they could crash the process). Server pings use the local socket instead of the Redis emitter.
- **Other changes.** New `pingInterval` option (default `30000` ms). `getEngine()` now throws on a non-Bun runtime. `close()` is private; use `shutdown()`. New type aliases `TSocketIOAuthenticateFn`, `TSocketIOValidateRoomFn`, `TSocketIOClientConnectedFn`.

## Who is affected

- **Code that constructs `SocketIOServerHelper`.** Add `runtime` (below). The constructor no longer calls `configure()`, so call `await helper.configure()` yourself.
- **Code importing `ISocketIOServerOptions` or `TEventHandler`.** Rename the imports.
- **Clients that use the `join` event.** You must provide `validateRoomFn`, or joins are silently rejected.
- **Bun users of `SocketIOComponent`.** Install the engine: `bun add @socket.io/bun-engine`. It is an optional peer dependency (`^0.1.0`), imported only when needed. No code changes.
- **Code with a custom `override start()` that set up Socket.IO.** Remove it; the component handles this now.

## Breaking changes

> [!WARNING]
> The helper constructor and two exported type names changed.

### 1. `ISocketIOServerOptions` is now `TSocketIOServerOptions`

```typescript
// Before
import { ISocketIOServerOptions } from '@venizia/ignis-helpers';
// After
import { TSocketIOServerOptions } from '@venizia/ignis-helpers';
```

### 2. `TEventHandler` is now `TSocketIOEventHandler`

```typescript
// Before
import { TEventHandler } from '@venizia/ignis-helpers';
// After
import { TSocketIOEventHandler } from '@venizia/ignis-helpers';
```

### 3. `SocketIOServerHelper` constructor

**Before:**
```typescript
const helper = new SocketIOServerHelper({
  identifier: 'my-socket',
  server: httpServer,          // node:http.Server - required
  serverOptions,
  redisConnection,
  authenticateFn,
  clientConnectedFn,
});
```

**After (Node.js):**
```typescript
const helper = new SocketIOServerHelper({
  runtime: RuntimeModules.NODE,
  identifier: 'my-socket',
  server: httpServer,          // node:http.Server - required for Node
  serverOptions,
  redisConnection,
  authenticateFn,
  clientConnectedFn,
});
```

**After (Bun):**
```typescript
const { Server: BunEngine } = await import('@socket.io/bun-engine');
const engine = new BunEngine({ path: '/io', cors: { origin: '*' } });

const helper = new SocketIOServerHelper({
  runtime: RuntimeModules.BUN,
  identifier: 'my-socket',
  engine,                      // @socket.io/bun-engine - required for Bun
  serverOptions,
  redisConnection,
  authenticateFn,
  clientConnectedFn,
});
```

`RuntimeModules` comes from `@venizia/ignis-helpers`.

## Details

Provide `validateRoomFn` like this (return an empty array to reject all):

```typescript
this.bind<TSocketIOValidateRoomFn>({
  key: SocketIOBindingKeys.VALIDATE_ROOM_HANDLER,
}).toValue(({ socket, rooms }) => {
  return rooms;
});
```
