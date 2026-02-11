# Setup Guide

## Step 1: Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for the Redis adapter

# For Bun runtime only -- optional peer dependency
bun add @socket.io/bun-engine
```

## Step 2: Bind Required Services

In your application's `preConfigure()` method, bind the required services and register the component:

```typescript
import {
  BaseApplication,
  SocketIOComponent,
  SocketIOBindingKeys,
  RedisHelper,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  private redisHelper: RedisHelper;

  preConfigure(): ValueOrPromise<void> {
    this.setupSocketIO();
    // ... other setup
  }

  setupSocketIO() {
    // 1. Redis connection (required for adapter + emitter)
    this.redisHelper = new RedisHelper({
      name: 'socket-io-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: +(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: SocketIOBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // 2. Authentication handler (required)
    const authenticateFn: TSocketIOAuthenticateFn = handshake => {
      const token = handshake.headers.authorization;
      // Implement your auth logic -- JWT verification, session check, etc.
      return !!token;
    };

    this.bind<TSocketIOAuthenticateFn>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Room validation handler (optional -- joins rejected without this)
    const validateRoomFn: TSocketIOValidateRoomFn = ({ socket, rooms }) => {
      // Return the rooms that the client is allowed to join
      const allowedRooms = rooms.filter(room => room.startsWith('public-'));
      return allowedRooms;
    };

    this.bind<TSocketIOValidateRoomFn>({
      key: SocketIOBindingKeys.VALIDATE_ROOM_HANDLER,
    }).toValue(validateRoomFn);

    // 4. Client connected handler (optional)
    const clientConnectedFn: TSocketIOClientConnectedFn = ({ socket }) => {
      console.log('Client connected:', socket.id);
      // Register custom event handlers on the socket
    };

    this.bind<TSocketIOClientConnectedFn>({
      key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // 5. Register the component -- that's it!
    this.component(SocketIOComponent);
  }
}
```

## Step 3: Use in Services/Controllers

Inject `SocketIOServerHelper` to interact with Socket.IO:

```typescript
import {
  BaseService,
  inject,
  SocketIOBindingKeys,
  SocketIOServerHelper,
  CoreBindings,
  BaseApplication,
} from '@venizia/ignis';

export class NotificationService extends BaseService {
  // Lazy getter pattern -- helper is bound AFTER server starts
  private _io: SocketIOServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: NotificationService.name });
  }

  private get io(): SocketIOServerHelper {
    if (!this._io) {
      this._io = this.application.get<SocketIOServerHelper>({
        key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
        isOptional: true,
      }) ?? null;
    }

    if (!this._io) {
      throw new Error('SocketIO not initialized');
    }

    return this._io;
  }

  // Send to a specific client
  notifyUser(opts: { userId: string; message: string }) {
    this.io.send({
      destination: opts.userId,
      payload: {
        topic: 'notification',
        data: { message: opts.message, time: new Date().toISOString() },
      },
    });
  }

  // Send to a room
  notifyRoom(opts: { room: string; message: string }) {
    this.io.send({
      destination: opts.room,
      payload: {
        topic: 'room:update',
        data: { message: opts.message },
      },
    });
  }

  // Broadcast to all clients
  broadcastAnnouncement(opts: { message: string }) {
    this.io.send({
      payload: {
        topic: 'system:announcement',
        data: { message: opts.message },
      },
    });
  }
}
```

> [!IMPORTANT]
> **Lazy getter pattern**: Since `SocketIOServerHelper` is bound via a post-start hook, it's not available during DI construction. Use a lazy getter that resolves from the application container on first access.
