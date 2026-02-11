# Quick Reference

| Helper | Package | Purpose |
|--------|---------|---------|
| [`SocketIOServerHelper`](./usage#socketioserverhelper) | `@venizia/ignis-helpers` | Server-side Socket.IO wrapper with auth, rooms, Redis adapter |
| [`SocketIOClientHelper`](./usage#socketioclienthelper) | `@venizia/ignis-helpers` | Client-side Socket.IO wrapper with structured event handling |

::: details Import Paths
```typescript
// Server helper
import { SocketIOServerHelper } from '@venizia/ignis-helpers';

// Client helper
import { SocketIOClientHelper } from '@venizia/ignis-helpers';

// Types and constants
import {
  TSocketIOServerOptions,
  ISocketIOServerBaseOptions,
  ISocketIOServerNodeOptions,
  ISocketIOServerBunOptions,
  ISocketIOClientOptions,
  IHandshake,
  ISocketIOClient,
  IOptions,
  SocketIOConstants,
  SocketIOClientStates,
  TSocketIOClientState,
  TSocketIOEventHandler,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
} from '@venizia/ignis-helpers';
```
:::
