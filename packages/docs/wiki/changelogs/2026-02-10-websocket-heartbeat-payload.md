---
title: WebSocket Heartbeat & Payload Limit
description: Add application-level heartbeat for auto-disconnecting unresponsive clients, reduce max payload to 128KB, and add wiki documentation for WebSocket helper and component
---

# Changelog - 2026-02-10

## WebSocket Heartbeat & Payload Limit

The WebSocket server previously relied solely on Bun's native `sendPings: true` + `idleTimeout: 60s` for protocol-level liveness. This covers TCP-level keepalive but doesn't detect application-level unresponsiveness (frozen tabs, crashed processes behind proxies). This release adds an **application-level heartbeat** with a passive server sweep model, reduces the default max payload from 16MB to 128KB for real-time performance, and adds comprehensive wiki documentation.

## Overview

- **Application-Level Heartbeat**: Server runs a periodic sweep timer — clients that haven't sent any message within `HEARTBEAT_TIMEOUT` (90s) are disconnected with close code `4002`
- **Passive Server Model**: Server does NOT send heartbeat events to clients — clients are responsible for sending `{ event: 'heartbeat' }` messages to stay alive
- **128KB Max Payload**: Reduced from 16MB to 128KB (`WebSocketDefaults.MAX_PAYLOAD_LENGTH`) — appropriate for real-time message exchange
- **Close Code `4002`**: New close code for heartbeat timeout, distinct from `4001` (auth timeout) and `4003` (auth failed)
- **Configurable Intervals**: `heartbeatInterval` (sweep frequency) and `heartbeatTimeout` (max inactivity before disconnect) are configurable per-server
- **Wiki Documentation**: New reference docs for both WebSocket helper and component

## New Features

### 1. Application-Level Heartbeat (Passive Server Sweep)

**Files:** `packages/helpers/src/helpers/socket/websocket/server/helper.ts`, `packages/helpers/src/helpers/socket/websocket/common/constants.ts`

**Problem:** A client's TCP connection can stay alive (behind a load balancer or proxy) while the application is unresponsive. Bun's native `idleTimeout` only checks protocol-level pings — it can't detect application-layer issues.

**Solution:** A `setInterval` timer sweeps all authenticated clients every `HEARTBEAT_INTERVAL` (30s). Clients whose `lastActivity` exceeds `HEARTBEAT_TIMEOUT` (90s — 3 missed intervals) are disconnected with close code `4002`.

```typescript
// Server sweeps — no broadcast, clients must actively send heartbeat
private heartbeatAll() {
  const now = Date.now();
  for (const [clientId, client] of this.clients) {
    if (client.state !== WebSocketClientStates.AUTHENTICATED) continue;
    if (now - client.lastActivity > this.heartbeatTimeout) {
      client.socket.close(4002, 'Heartbeat timeout');
    }
  }
}
```

**Key design decisions:**
- **Server is passive** — only sweeps, never sends heartbeat events. This is simpler and puts control with the client
- **Only sweeps AUTHENTICATED clients** — unauthorized clients have their own auth timeout (5s)
- **`lastActivity` already tracked** — every message updates `lastActivity` in Bun's `message` handler, so any client communication (not just heartbeat events) keeps the connection alive
- **`heartbeat` event is a no-op** — if a client sends `{ event: 'heartbeat' }`, the server returns early (no message handler invocation). The `lastActivity` update happens upstream in the Bun handler

**Timer lifecycle:**
- Started at the end of `configure()` (after Redis ready + subscriptions)
- Cleared in `shutdown()` before disconnecting clients

### 2. Configurable Heartbeat Options

**Files:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`, `packages/core/src/components/websocket/common/types.ts`

```typescript
// Helper options
interface IWebSocketServerOptions {
  heartbeatInterval?: number;  // Default: 30_000 (30s between sweeps)
  heartbeatTimeout?: number;   // Default: 90_000 (3x interval — disconnect after 3 missed heartbeats)
}

// Core component options (passed through to helper)
interface IServerOptions {
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}
```

### 3. `HEARTBEAT` System Event

**File:** `packages/helpers/src/helpers/socket/websocket/common/constants.ts`

Added `HEARTBEAT` to `WebSocketEvents`:

```typescript
export class WebSocketEvents {
  static readonly AUTHENTICATE = 'authenticate';
  static readonly CONNECTED = 'connected';
  static readonly DISCONNECT = 'disconnect';
  static readonly JOIN = 'join';
  static readonly LEAVE = 'leave';
  static readonly ERROR = 'error';
  static readonly HEARTBEAT = 'heartbeat';  // NEW

  // SCHEME_SET updated to include HEARTBEAT (7 events total)
}
```

### 4. Heartbeat Constants

**File:** `packages/helpers/src/helpers/socket/websocket/common/constants.ts`

```typescript
export class WebSocketDefaults {
  // ...existing defaults...
  static readonly HEARTBEAT_INTERVAL = 30_000;  // 30s between sweeps
  static readonly HEARTBEAT_TIMEOUT = 90_000;   // 3x interval — 3 missed = disconnect
}
```

### 5. Max Payload Reduced to 128KB

**File:** `packages/helpers/src/helpers/socket/websocket/common/constants.ts`

**Before:** `MAX_PAYLOAD_LENGTH = 16 * 1024 * 1024` (16MB)

**After:** `MAX_PAYLOAD_LENGTH = 128 * 1024` (128KB)

**Rationale:** 16MB is excessive for real-time WebSocket messaging. 128KB is a practical upper bound for fast client-server exchange — large enough for rich JSON payloads, small enough to prevent memory abuse and ensure low-latency delivery.

## Client Test Page Updates

**File:** `examples/websocket-test/client.html`

- **Manual Authenticate button** — connection no longer auto-sends auth. This allows testing the auth timeout (5s disconnect for unauthenticated clients)
- **Manual Heartbeat button** — sends `{ event: 'heartbeat' }` on demand. No automatic heartbeat timer — the tester controls when heartbeats are sent to verify timeout behavior
- **Close code `4002`** — mapped to `'Heartbeat timeout'` in the close reason display

## Wiki Documentation

| Document | Path | Content |
|----------|------|---------|
| WebSocket Helper Reference | `wiki/references/helpers/websocket.md` | WebSocketServerHelper API, WebSocketEmitter API, constants, types, auth flow, heartbeat, Redis integration |
| WebSocket Component Reference | `wiki/references/components/websocket.md` | Binding keys, lifecycle, setup guide, component internals, troubleshooting |

Both documents added to VitePress sidebar and linked from their respective index pages.

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/socket/websocket/common/constants.ts` | Added `HEARTBEAT` event to `WebSocketEvents`; added `HEARTBEAT_INTERVAL` (30s) and `HEARTBEAT_TIMEOUT` (90s) to `WebSocketDefaults`; changed `MAX_PAYLOAD_LENGTH` from 16MB to 128KB |
| `src/helpers/socket/websocket/common/types.ts` | Added `heartbeatInterval?` and `heartbeatTimeout?` to `IWebSocketServerOptions` |
| `src/helpers/socket/websocket/server/helper.ts` | Added `heartbeatInterval`, `heartbeatTimeout`, `heartbeatTimer` private fields; `startHeartbeatTimer()` and `heartbeatAll()` methods; heartbeat event early return in `onClientMessage()`; timer start in `configure()`; timer cleanup in `shutdown()` |
| `src/__tests__/websocket/websocket.test.ts` | Updated `WebSocketEvents` tests (7 events); updated `WebSocketDefaults` tests (128KB, heartbeat constants); added heartbeat edge cases; added dedicated "Heartbeat — Application-Level Liveness Check" test group (8 tests) |

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/websocket/common/types.ts` | Added `heartbeatInterval?` and `heartbeatTimeout?` to `IServerOptions` |
| `src/components/websocket/component.ts` | Pass `heartbeatInterval` and `heartbeatTimeout` through to `WebSocketServerHelper` constructor |

### Documentation (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/references/helpers/websocket.md` | New — comprehensive WebSocket helper reference |
| `wiki/references/components/websocket.md` | New — WebSocket component reference |
| `wiki/references/helpers/index.md` | Added WebSocket row to helper index |
| `wiki/references/components/index.md` | Added WebSocket row to component index |
| `site/.vitepress/config.mts` | Added sidebar entries for both WebSocket docs |

### Examples

| File | Changes |
|------|---------|
| `examples/websocket-test/client.html` | Manual Authenticate button, manual Heartbeat button, close code `4002` mapping |

## Verification Results

| Check | Result |
|-------|--------|
| `packages/helpers` rebuild | Clean |
| `packages/helpers` lint | Clean (0 errors, 5 pre-existing warnings) |
| `packages/helpers` tests | 179 pass, 0 fail, 348 expect() calls |
| `packages/core` rebuild | Clean |
| `packages/core` lint | Clean (0 errors, 5 pre-existing warnings) |
