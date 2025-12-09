# Socket.IO Component

Real-time, bidirectional, event-based communication using Socket.IO.

## Quick Reference

| Component | Purpose |
|-----------|---------|
| **SocketIOComponent** | Sets up Socket.IO server and bindings |
| **SocketIOServerHelper** | Encapsulates Socket.IO server instance |
| **Redis Adapter** | Enables horizontal scaling with Redis |
| **Redis Emitter** | Emit events from other processes/services |

### Required Bindings

| Binding Key | Type | Purpose |
|-------------|------|---------|
| `SERVER_OPTIONS` | `ISocketIOOptions` | Socket.IO server configuration (optional) |
| `REDIS_CONNECTION` | `DefaultRedisHelper` | Redis instance for scaling |
| `AUTHENTICATE_HANDLER` | `Function` | Authenticate socket connections |
| `CLIENT_CONNECTED_HANDLER` | `Function` | Handle successful connections (optional) |

### Use Cases

- Live notifications
- Real-time chat
- Collaborative editing
- Live data streams

## Architecture Components

-   **`SocketIOComponent`**: Sets up Socket.IO server, binds `SocketIOServerHelper` to DI
-   **`SocketIOServerHelper`**: Wraps Socket.IO server, provides interaction methods
-   **`@socket.io/redis-adapter`**: Scales Socket.IO with Redis
-   **`@socket.io/redis-emitter`**: Emits events from external processes
-   **Integration**: Works with HTTP server and authentication system

## Implementation Details

### Tech Stack

-   **Socket.IO**
-   **`@socket.io/redis-adapter`**
-   **`@socket.io/redis-emitter`**
-   **`ioredis`** (if using Redis)

### Configuration

To use the Socket.IO component, you need to provide a few things in your application's DI container:

-   **`SocketIOBindingKeys.SERVER_OPTIONS`**: (Optional) Custom options for the Socket.IO server.
-   **`SocketIOBindingKeys.REDIS_CONNECTION`**: An instance of `DefaultRedisHelper` (or a compatible class) for the Redis adapter.
-   **`SocketIOBindingKeys.AUTHENTICATE_HANDLER`**: A function to handle the authentication of new socket connections.
-   **`SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER`**: (Optional) A function to be called when a client is successfully connected and authenticated.

### Code Samples

#### 1. Setting up the Socket.IO Component

In your `src/application.ts`:

```typescript
import {
  SocketIOComponent,
  SocketIOBindingKeys,
  RedisHelper, // Your Redis helper
  BaseApplication,
  ValueOrPromise,
  IHandshake,
} from '@vez/ignis';

// ...

export class Application extends BaseApplication {
  // ...

  preConfigure(): ValueOrPromise<void> {
    // ...

    // 1. Bind Redis connection
    const redis = new RedisHelper({
      name: 'redis',
      host: 'localhost',
      port: 6379,
      password: 'password',
    });
    this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(redis);

    // 2. Bind authentication handler
    const authenticateFn = async (handshake: IHandshake) => {
      const { token } = handshake.auth;
      // Your custom authentication logic here
      // e.g., verify a JWT
      return !!token;
    };
    this.bind({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(authenticateFn);

    // 3. Register the component
    this.component(SocketIOComponent);
  }

  // ...
}
```

#### 2. Emitting Events

You can get the `SocketIOServerHelper` instance from the container and use it to emit events.

```typescript
import { SocketIOServerHelper, SocketIOBindingKeys, inject } from '@vez/ignis';

// ... in a service or controller

  @inject({ key: SocketIOBindingKeys.SOCKET_IO_INSTANCE })
  private io: SocketIOServerHelper;

  sendNotification(userId: string, message: string) {
    this.io.send({
      destination: userId, // Room or socket ID
      payload: {
        topic: 'notification',
        data: { message },
      },
    });
  }
```
