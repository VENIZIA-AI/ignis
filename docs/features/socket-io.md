# Feature: Socket.IO

## 1. Feature Overview

- **Feature Name:** Socket.IO
- **Purpose:** To integrate real-time, bidirectional, and event-based communication into your Ignis application using Socket.IO.
- **Background:** Many modern applications require real-time features like live notifications, chat, or collaborative editing. This component provides a robust way to add a Socket.IO server to your application, with support for Redis for horizontal scaling.
- **Related Features/Modules:** This component depends on an HTTP server instance to attach to, and it can leverage the `redis` helper for scaling. It also integrates with the authentication system.

## 2. Functional Specifications

- **Socket.IO Server:** Creates and configures a Socket.IO server.
- **Redis Adapter:** Supports using Redis as an adapter to broadcast events across multiple server instances.
- **Authentication:** Provides a mechanism to authenticate Socket.IO connections.
- **Customizable:** Allows for custom server options and event handlers.

## 3. Design and Architecture

- **`SocketIOComponent`:** This component is responsible for setting up the Socket.IO server. It binds the `SocketIOServerHelper` to the DI container.
- **`SocketIOServerHelper`:** A helper class that encapsulates the Socket.IO server instance and provides methods for interacting with it.
- **`@socket.io/redis-adapter`:** Used for scaling out the Socket.IO server with Redis.
- **`@socket.io/redis-emitter`:** Used to emit events to clients from other processes or services.

## 4. Implementation Details

### Tech Stack
- **Socket.IO**
- **`@socket.io/redis-adapter`**
- **`@socket.io/redis-emitter`**
- **`ioredis`** (if using Redis)

### Configuration

To use the Socket.IO component, you need to provide a few things in your application's DI container:

- **`SocketIOBindingKeys.SERVER_OPTIONS`**: (Optional) Custom options for the Socket.IO server.
- **`SocketIOBindingKeys.REDIS_CONNECTION`**: An instance of `DefaultRedisHelper` (or a compatible class) for the Redis adapter.
- **`SocketIOBindingKeys.AUTHENTICATE_HANDLER`**: A function to handle the authentication of new socket connections.
- **`SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER`**: (Optional) A function to be called when a client is successfully connected and authenticated.

### Code Samples

#### 1. Setting up the Socket.IO Component

In your `src/application.ts`:

```typescript
import {
  SocketIOComponent,
  SocketIOBindingKeys,
  RedisHelper, // Your Redis helper
  // ... other imports
} from '@vez/ignis';
import { IHandshake } from '@vez/ignis/helpers/socket-io'; // Adjust path if needed

// ...

export class Application extends BaseApplication {
  // ...

  preConfigure(): ValueOrPromise<void> {
    // ...

    // 1. Bind Redis connection
    const redis = new RedisHelper({ ... }); // Your Redis config
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
import { SocketIOServerHelper, SocketIOBindingKeys } from '@vez/ignis';

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

## 6. Testing

You can test your Socket.IO integration using the `socket.io-client` library in your tests.

```typescript
import { io } from 'socket.io-client';
import { describe, it, expect } from 'vitest';

describe('Socket.IO', () => {
  it('should receive a message', (done) => {
    const socket = io('http://localhost:3000', {
      auth: { token: 'your-test-token' },
    });

    socket.on('notification', (data) => {
      expect(data.message).toBe('Hello');
      socket.disconnect();
      done();
    });

    // Trigger the event from your application that sends the socket message
  });
});
```
This powerful component allows you to add real-time capabilities to your Ignis application with ease.
