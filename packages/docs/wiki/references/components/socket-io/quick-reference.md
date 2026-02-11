# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core) |
| **Class** | `SocketIOComponent` |
| **Helper** | [`SocketIOServerHelper`](/references/helpers/socket-io/) |
| **Runtimes** | Node.js (`@hono/node-server`) and Bun (native) |
| **Scaling** | `@socket.io/redis-adapter` + `@socket.io/redis-emitter` |

::: details Import Paths
```typescript
import {
  SocketIOComponent,
  SocketIOBindingKeys,
  SocketIOServerHelper,
  RedisHelper,
} from '@venizia/ignis';

import type {
  IServerOptions,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
} from '@venizia/ignis';
```
:::

## Use Cases

- Live notifications and alerts
- Real-time chat and messaging
- Collaborative editing (docs, whiteboards)
- Live data streams (dashboards, monitoring)
- Multiplayer game state synchronization
