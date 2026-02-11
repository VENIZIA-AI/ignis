# Setup Guide

## Step 1: Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for Redis Pub/Sub
bun add ioredis
```

> [!IMPORTANT]
> **Bun only.** The WebSocket component will throw an error if the runtime is Node.js. For Node.js support, use the [Socket.IO Component](../socket-io/) instead.

## Step 2: Bind Required Services

In your application's `preConfigure()` method, bind the required services and register the component:

```typescript
import {
  BaseApplication,
  WebSocketComponent,
  WebSocketBindingKeys,
  RedisHelper,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  private redisHelper: RedisHelper;

  preConfigure(): ValueOrPromise<void> {
    this.setupWebSocket();
    // ... other setup
  }

  setupWebSocket() {
    // 1. Redis connection (required for cross-instance messaging)
    this.redisHelper = new RedisHelper({
      name: 'websocket-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: +(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: WebSocketBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // 2. Authentication handler (required)
    const authenticateFn: TWebSocketAuthenticateFn = async (data) => {
      const token = data.token as string;
      if (!token) return null;

      const user = await verifyJWT(token);
      if (!user) return null;

      return { userId: user.id, metadata: { role: user.role } };
    };

    this.bind<TWebSocketAuthenticateFn>({
      key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Room validation handler (optional -- joins rejected without this)
    const validateRoomFn: TWebSocketValidateRoomFn = ({ clientId, userId, rooms }) => {
      return rooms.filter(room => room.startsWith('public-'));
    };

    this.bind<TWebSocketValidateRoomFn>({
      key: WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
    }).toValue(validateRoomFn);

    // 4. Client connected handler (optional)
    const clientConnectedFn: TWebSocketClientConnectedFn = ({ clientId, userId }) => {
      console.log('Client connected:', clientId, userId);
    };

    this.bind<TWebSocketClientConnectedFn>({
      key: WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // 5. Client disconnected handler (optional)
    const clientDisconnectedFn: TWebSocketClientDisconnectedFn = ({ clientId, userId }) => {
      console.log('Client disconnected:', clientId, userId);
    };

    this.bind<TWebSocketClientDisconnectedFn>({
      key: WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
    }).toValue(clientDisconnectedFn);

    // 6. Message handler (optional -- for custom events)
    const messageHandler: TWebSocketMessageHandler = ({ clientId, userId, message }) => {
      console.log('Custom event:', message.event, message.data);
    };

    this.bind<TWebSocketMessageHandler>({
      key: WebSocketBindingKeys.MESSAGE_HANDLER,
    }).toValue(messageHandler);

    // 7. Outbound transformer (optional -- for per-client encryption)
    const outboundTransformer: TWebSocketOutboundTransformer = async ({ client, event, data }) => {
      if (!client.encrypted) return null;
      // Encrypt using client's derived AES key (from ECDH handshake)
      const encrypted = await encryptForClient(client.id, JSON.stringify({ event, data }));
      return { event: 'encrypted', data: encrypted };
    };

    this.bind<TWebSocketOutboundTransformer>({
      key: WebSocketBindingKeys.OUTBOUND_TRANSFORMER,
    }).toValue(outboundTransformer);

    // 8. Handshake handler (optional — required when requireEncryption is true)
    const handshakeFn: TWebSocketHandshakeFn = async ({ clientId, data }) => {
      const clientPubKey = data.publicKey as string;
      if (!clientPubKey) return null; // Reject — no public key provided
      const aesKey = await deriveSharedSecret(clientPubKey);
      storeClientKey(clientId, aesKey);
      return { serverPublicKey: serverPublicKeyB64 };
    };

    this.bind<TWebSocketHandshakeFn>({
      key: WebSocketBindingKeys.HANDSHAKE_HANDLER,
    }).toValue(handshakeFn);

    // 9. Server options — enable requireEncryption
    this.bind<Partial<IServerOptions>>({
      key: WebSocketBindingKeys.SERVER_OPTIONS,
    }).toValue({
      identifier: 'my-app-websocket',
      requireEncryption: true,
    });

    // 10. Register the component
    this.component(WebSocketComponent);
  }
}
```

## Step 3: Use in Services/Controllers

Inject `WebSocketServerHelper` to interact with WebSocket:

```typescript
import {
  BaseService,
  inject,
  WebSocketBindingKeys,
  CoreBindings,
  BaseApplication,
} from '@venizia/ignis';
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

export class NotificationService extends BaseService {
  // Lazy getter pattern -- helper is bound AFTER server starts
  private _ws: WebSocketServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: NotificationService.name });
  }

  private get ws(): WebSocketServerHelper {
    if (!this._ws) {
      this._ws = this.application.get<WebSocketServerHelper>({
        key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
        isOptional: true,
      }) ?? null;
    }

    if (!this._ws) {
      throw new Error('WebSocket not initialized');
    }

    return this._ws;
  }

  // Send to a specific client
  notifyClient(opts: { clientId: string; message: string }) {
    this.ws.send({
      destination: opts.clientId,
      payload: {
        topic: 'notification',
        data: { message: opts.message, time: new Date().toISOString() },
      },
    });
  }

  // Send to all sessions of a user
  notifyUser(opts: { userId: string; message: string }) {
    const clients = this.ws.getClientsByUser({ userId: opts.userId });
    for (const client of clients) {
      this.ws.sendToClient({
        clientId: client.id,
        event: 'notification',
        data: { message: opts.message },
      });
    }
  }

  // Send to a room
  notifyRoom(opts: { room: string; message: string }) {
    this.ws.send({
      destination: opts.room,
      payload: {
        topic: 'room:update',
        data: { message: opts.message },
      },
    });
  }

  // Broadcast to all clients
  broadcastAnnouncement(opts: { message: string }) {
    this.ws.send({
      payload: {
        topic: 'system:announcement',
        data: { message: opts.message },
      },
    });
  }
}
```

> [!IMPORTANT]
> **Lazy getter pattern**: Since `WebSocketServerHelper` is bound via a post-start hook, it is not available during DI construction. Use a lazy getter that resolves from the application container on first access.
