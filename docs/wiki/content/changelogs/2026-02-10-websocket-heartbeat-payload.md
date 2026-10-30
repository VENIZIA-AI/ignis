---
title: WebSocket Heartbeat & Payload Limit
description: The WebSocket server now disconnects clients that stop responding at the application level, and the default maximum message size drops from 16MB to 128KB.
packages: ['@venizia/ignis', '@venizia/ignis-docs', '@venizia/ignis-helpers']
---

# Changelog - 2026-02-10

## WebSocket Heartbeat & Payload Limit

**In one line.** The WebSocket server now drops clients that go silent (frozen tabs, crashed processes behind proxies) and caps messages at 128KB by default.

## What changed

- **Heartbeat sweep.** The server checks authenticated clients every `heartbeatInterval` (default 30s). A client with no message for `heartbeatTimeout` (default 90s) is disconnected with close code `4002`.
- **Clients keep themselves alive.** The server never sends heartbeat events. A client stays alive by sending `{ event: 'heartbeat' }`, and any other message also counts as activity.
- **Close code `4002`.** New code for a heartbeat timeout, distinct from `4001` (auth timeout) and `4003` (auth failed).
- **Configurable per server.** `heartbeatInterval` and `heartbeatTimeout` are options on `IWebSocketServerOptions` and on the core component's `IServerOptions`.
- **New constants.** `WebSocketEvents.HEARTBEAT`, `WebSocketDefaults.HEARTBEAT_INTERVAL` (30_000) and `WebSocketDefaults.HEARTBEAT_TIMEOUT` (90_000).
- **Smaller default payload.** `WebSocketDefaults.MAX_PAYLOAD_LENGTH` goes from 16MB to 128KB.

## Who is affected

- **WebSocket servers.** Clients that stay silent for 90s are now disconnected, so your clients must send `{ event: 'heartbeat' }` (or any message) regularly.
- **Apps that send large messages.** The default limit is now 128KB instead of 16MB.
- **Unauthenticated clients.** Not swept by the heartbeat; they keep their own auth timeout (5s).

## Details

```typescript
interface IWebSocketServerOptions {
  heartbeatInterval?: number; // Default: 30_000
  heartbeatTimeout?: number;  // Default: 90_000 (3 missed intervals)
}
```
