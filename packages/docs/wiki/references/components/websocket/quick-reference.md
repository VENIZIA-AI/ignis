# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core) |
| **Class** | `WebSocketComponent` |
| **Helper** | [`WebSocketServerHelper`](/references/helpers/websocket/) |
| **Runtimes** | Bun only (throws on Node.js) |
| **Scaling** | Redis Pub/Sub (ioredis) |

::: details Import Paths
```typescript
import {
  WebSocketComponent,
  WebSocketBindingKeys,
} from '@venizia/ignis';

import type {
  IServerOptions,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
} from '@venizia/ignis';
```
:::

## Use Cases

- Live notifications and alerts
- Real-time chat and messaging
- Collaborative editing (docs, whiteboards)
- Live data streams (dashboards, monitoring)
- Multiplayer game state synchronization
- IoT device communication
