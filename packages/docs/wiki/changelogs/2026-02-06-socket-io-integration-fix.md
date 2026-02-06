---
title: Socket.IO Integration Fix — Lifecycle Timing & Bun Runtime Support
description: Fix SocketIOComponent lifecycle timing, add dual-mode (Node/Bun) support to SocketIOServerHelper, add post-start hooks to AbstractApplication, and reimplement socket-io-test example
---

# Changelog - 2026-02-06

## Socket.IO Integration Fix — Lifecycle Timing & Bun Runtime Support

The `SocketIOComponent` was broken in two ways: (1) it called `getServerInstance()` during `binding()`, but the HTTP server doesn't exist until after `start()` completes; (2) `SocketIOServerHelper` required `node:http.Server`, incompatible with Bun's native server. This release fixes both issues and adds comprehensive Bun runtime support via `@socket.io/bun-engine`.

## Overview

- **Post-Start Hooks**: New lifecycle hook system in `AbstractApplication` — components can register hooks that execute after the server starts
- **Dual-Mode SocketIOServerHelper**: Discriminated union (`runtime: 'node' | 'bun'`) replaces hardcoded HTTP server dependency
- **SocketIOComponent Rewrite**: Runtime detection, post-start hooks for both Node/Bun, split into clean methods
- **Generic `getServerInstance()`**: Type-safe server instance access with runtime-specific type parameter
- **`@socket.io/bun-engine` Support**: Optional peer dependency for Bun runtime Socket.IO
- **Socket.IO Test Example**: Complete reimplementation with REST + WebSocket simulation endpoints

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. `ISocketIOServerOptions` Renamed to `TSocketIOServerOptions`

The type alias was renamed to comply with the naming convention lint rule (`T*` prefix for type aliases).

**Before:**
```typescript
import { ISocketIOServerOptions } from '@venizia/ignis-helpers';
```

**After:**
```typescript
import { TSocketIOServerOptions } from '@venizia/ignis-helpers';
```

### 2. `SocketIOServerHelper` Constructor Signature Changed

The constructor now accepts a discriminated union based on `runtime` instead of a flat options object with `server`.

**Before:**
```typescript
const helper = new SocketIOServerHelper({
  identifier: 'my-socket',
  server: httpServer,          // node:http.Server — required
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
  server: httpServer,          // node:http.Server — required for Node
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
  engine,                      // @socket.io/bun-engine — required for Bun
  serverOptions,
  redisConnection,
  authenticateFn,
  clientConnectedFn,
});
```

## New Features

### 1. Post-Start Hook System

**File:** `packages/core/src/base/applications/abstract.ts`

**Problem:** Components need to access the server instance (for Socket.IO, WebSocket upgrades, etc.), but the server only exists after `start()`. The `binding()` phase runs during `initialize()` — too early.

**Solution:** Components register hooks during `binding()` that execute after `startBunModule()` / `startNodeModule()` completes.

```typescript
// In a component's binding() method:
this.application.registerPostStartHook({
  identifier: 'my-hook',
  hook: async () => {
    const server = this.application.getServerInstance();
    // Server is now available!
  },
});
```

**Lifecycle order:**
```
start()
  -> initialize()        // Components register hooks here
  -> setupMiddlewares()
  -> startBunModule() / startNodeModule()
  -> executePostStartHooks()  // Hooks run here (server available)
```

**Benefits:**
- Components no longer need to override `start()` to access the server instance
- Hooks execute in registration order with performance logging
- Clean separation of concerns — components declare what they need, framework handles timing

### 2. Dual-Mode SocketIOServerHelper (Node.js + Bun)

**File:** `packages/helpers/src/helpers/socket-io/server/helper.ts`

**Problem:** `SocketIOServerHelper` required `node:http.Server`, which doesn't exist in Bun runtime.

**Solution:** Discriminated union on `runtime` field using `RuntimeModules` constants. Constructor and `configure()` use `switch/case` to branch:

```typescript
// Constructor validates runtime-specific fields
switch (opts.runtime) {
  case RuntimeModules.NODE: {
    // validates opts.server exists
    this.server = opts.server;
    break;
  }
  case RuntimeModules.BUN: {
    // validates opts.engine exists
    this.bunEngine = opts.engine;
    break;
  }
}

// configure() creates IOServer differently per runtime
switch (this.runtime) {
  case RuntimeModules.NODE: {
    this.io = new IOServer(this.server, this.serverOptions);
    break;
  }
  case RuntimeModules.BUN: {
    this.io = new IOServer();
    this.io.bind(this.bunEngine);
    break;
  }
}
```

**Benefits:**
- Single helper class works for both runtimes
- Type-safe — discriminated union prevents passing wrong options
- `getEngine()` method exposes bun-engine instance when needed
- All shared logic (Redis adapter, emitter, connection handling) remains unified

### 3. Discriminated Union Types for Socket.IO Options

**File:** `packages/helpers/src/helpers/socket-io/common/types.ts`

```typescript
export interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: DefaultRedisHelper;
  authenticateFn: (args: IHandshake) => ValueOrPromise<boolean>;
  clientConnectedFn?: (opts: { socket: IOSocket }) => ValueOrPromise<void>;
  authenticateTimeout?: number;
  defaultRooms?: string[];
}

export interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.NODE;
  server: HTTPServer;
}

export interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.BUN;
  engine: any;
}

export type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;
```

### 4. SocketIOComponent Rewrite with Runtime Detection

**File:** `packages/core/src/components/socket-io/component.ts`

**Problem:** Original `binding()` was monolithic and tried to access the server instance too early.

**Solution:** Split into three methods + runtime detection:

- `resolveBindings()` — Resolves server options, Redis connection, auth/connect handlers from application bindings
- `registerBunHook()` — Registers post-start hook: dynamically imports `@socket.io/bun-engine`, creates engine, creates helper, wires into `Bun.Server.reload()` for request routing
- `registerNodeHook()` — Registers post-start hook: gets HTTP server instance, creates helper

```typescript
override binding(): ValueOrPromise<void> {
  const { redisConnection, authenticateFn, clientConnectedFn } = this.resolveBindings();
  const runtime = RuntimeModules.detect();

  switch (runtime) {
    case RuntimeModules.BUN: {
      this.registerBunHook({ redisConnection, authenticateFn, clientConnectedFn });
      break;
    }
    case RuntimeModules.NODE: {
      this.registerNodeHook({ redisConnection, authenticateFn, clientConnectedFn });
      break;
    }
    default: {
      throw getError({ message: `Unsupported runtime: ${runtime}` });
    }
  }
}
```

**Bun mode specifics:**
- CORS type bridging — extracts individual fields to avoid `socket.io` vs `bun-engine` type mismatch (no `as any`)
- Wires engine into running Bun server via `serverInstance.reload({ fetch, websocket })`
- Uses early return pattern for non-Socket.IO requests

### 5. Generic `getServerInstance<T>()`

**File:** `packages/core/src/base/applications/abstract.ts`

```typescript
getServerInstance<
  T extends TBunServerInstance | TNodeServerInstance = TBunServerInstance | TNodeServerInstance,
>(): T | undefined {
  return this.server.instance as T | undefined;
}
```

Usage:
```typescript
// Bun runtime — get typed Bun server
const server = this.application.getServerInstance<TBunServerInstance>();
server!.reload({ ... });

// Node runtime — get typed Node server
const server = this.application.getServerInstance<TNodeServerInstance>();
```

### 6. Socket.IO Test Example — Complete Reimplementation

**Directory:** `examples/socket-io-test/`

Reimplemented to properly use `SocketIOComponent` instead of manual workarounds.

**Application changes:**
- Uses `RedisHelper` instead of manual `new Redis()` + `DefaultRedisHelper`
- Clean `setupSocketIO()` method: binds Redis, auth handler, client connected handler, registers `SocketIOComponent`
- No more `override start()` — the component handles lifecycle via post-start hooks

**New REST endpoints (controller):**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/socket/info` | Server info (status, connected clients) |
| `GET` | `/socket/clients` | List all connected client IDs |
| `GET` | `/socket/health` | Health check |
| `POST` | `/socket/broadcast` | Broadcast message to all clients |
| `POST` | `/socket/room/{roomId}/send` | Send message to a room |
| `POST` | `/socket/client/{clientId}/send` | Send message to specific client |
| `POST` | `/socket/client/{clientId}/join` | Join client to rooms |
| `POST` | `/socket/client/{clientId}/leave` | Remove client from rooms |
| `GET` | `/socket/client/{clientId}/rooms` | List rooms a client belongs to |

**New service methods:**

| Method | Description |
|--------|-------------|
| `joinRoom({ clientId, rooms })` | Looks up client, calls `socket.join(rooms)` |
| `leaveRoom({ clientId, rooms })` | Looks up client, calls `socket.leave(room)` per room |
| `getClientRooms({ clientId })` | Returns `Array.from(client.socket.rooms)` |
| `isReady()` | Checks if `SocketIOServerHelper` is bound |

**Socket event handlers (via `registerClientHandlers`):**

| Event | Description |
|-------|-------------|
| `chat:message` | Send to room or broadcast depending on `room` field |
| `echo` | Echo back data with timestamp |
| `get-clients` | Return connected clients list |

### 7. Automated Test Client

**File:** `examples/socket-io-test/client.ts`

Run with `bun client.ts`. Creates two clients and runs all test cases automatically:

1. Connection & authentication flow (both clients)
2. Health check (REST)
3. Server info (REST)
4. Client list (REST)
5. Echo round-trip (socket event)
6. Get clients (socket event)
7. Join room (socket event)
8. Chat broadcast (socket event — sender to receiver)
9. Chat to room (socket event — sender to room members)
10. Leave room (socket event)
11. Join room (REST) + verify rooms list
12. Leave room (REST) + verify rooms list
13. Send to specific client (REST — verify receiver gets it)
14. Send to room (REST — verify listener gets it)
15. Broadcast (REST — verify both clients receive)

## Dependencies

### `@socket.io/bun-engine`

Added as **optional peer dependency** to `packages/core`:

```json
// packages/core/package.json
"peerDependencies": {
  "@socket.io/bun-engine": "^0.1.0"
},
"peerDependenciesMeta": {
  "@socket.io/bun-engine": { "optional": true }
},
"devDependencies": {
  "@socket.io/bun-engine": "^0.1.0"
}
```

Only required when using `SocketIOComponent` with Bun runtime. Dynamically imported at runtime.

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/socket-io/common/types.ts` | Added `ISocketIOServerBaseOptions`, `ISocketIOServerNodeOptions`, `ISocketIOServerBunOptions` interfaces; added `TSocketIOServerOptions` discriminated union; added `RuntimeModules` import |
| `src/helpers/socket-io/server/helper.ts` | Added `runtime: TRuntimeModule`, `server?: HTTPServer`, `bunEngine?: any` fields; switch/case constructor validation; switch/case `configure()` for Node vs Bun; added `getEngine()` method |

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/applications/abstract.ts` | Added `postStartHooks` registry, `registerPostStartHook()`, `executePostStartHooks()`; generic `getServerInstance<T>()`; call hooks at end of `start()` |
| `src/components/socket-io/component.ts` | Complete rewrite: split into `resolveBindings()`, `registerBunHook()`, `registerNodeHook()`; runtime detection via `RuntimeModules.detect()`; post-start hook pattern; CORS type bridging for bun-engine |
| `package.json` | Added `@socket.io/bun-engine` as optional peer dep and dev dep |

### Socket.IO Test Example (`examples/socket-io-test`)

| File | Changes |
|------|---------|
| `src/application.ts` | Replaced `DefaultRedisHelper` + manual `Redis` with `RedisHelper`; clean `setupSocketIO()` using binding keys + `SocketIOComponent`; removed manual `override start()` |
| `src/services/socket-event.service.ts` | Added `joinRoom()`, `leaveRoom()`, `getClientRooms()`, `isReady()` methods; lazy getter for `SocketIOServerHelper` |
| `src/controllers/socket-test.controller.ts` | Added join/leave/rooms route configs and handlers; added `ClientRoomsSchema` |
| `client.ts` | Complete rewrite as automated test runner with 15+ test cases covering all REST + socket features |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Update `SocketIOServerHelper` Constructor Calls

Add `runtime` field to all `SocketIOServerHelper` instantiations:

```typescript
// Add this import
import { RuntimeModules } from '@venizia/ignis-helpers';

// Add runtime field
new SocketIOServerHelper({
  runtime: RuntimeModules.NODE, // or RuntimeModules.BUN
  // ... rest of options unchanged
});
```

### Step 2: Rename Type Import

If you import `ISocketIOServerOptions` directly:

```typescript
// Before
import { ISocketIOServerOptions } from '@venizia/ignis-helpers';

// After
import { TSocketIOServerOptions } from '@venizia/ignis-helpers';
```

### Step 3: For Bun Runtime Users

If using `SocketIOComponent` with Bun, install the engine:

```bash
bun add @socket.io/bun-engine
```

No code changes needed — the component auto-detects runtime and dynamically imports the engine.

### Step 4: Remove Manual Socket.IO Workarounds

If you had a custom `override start()` to initialize Socket.IO after the server starts, you can remove it. `SocketIOComponent` now handles this automatically via post-start hooks.

## Verification Results

| Check | Result |
|-------|--------|
| `packages/helpers` rebuild | Clean |
| `packages/helpers` lint | Clean (0 errors, 0 warnings) |
| `packages/core` rebuild | Clean |
| `packages/core` lint | Clean (0 errors, 5 pre-existing test warnings) |
| `packages/boot` rebuild | Clean |
| `packages/core` tests | 403 pass, 7 pre-existing failures (SocketIOClientHelper xhr poll) |
| `examples/socket-io-test` tsc | Clean |
| `bun client.ts` (all 15+ tests) | All passed |
