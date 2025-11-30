# Socket.IO Helper

The Socket.IO helpers in Ignis provide a structured way to manage both client and server-side Socket.IO implementations, enabling real-time, bidirectional communication in your application.

## `SocketIOServerHelper`

The `SocketIOServerHelper` is a powerful abstraction for the Socket.IO server, handling connections, authentication, room management, and Redis-based scaling.

### Overview

-   **Redis Integration:** Uses `@socket.io/redis-adapter` for scaling across multiple instances and `@socket.io/redis-emitter` for broadcasting messages.
-   **Authentication Flow:** Includes a built-in authentication flow that requires clients to emit an `authenticate` event before they can interact with the server.
-   **Client Management:** Tracks connected clients and their authentication state.

### Usage

The `SocketIOServerHelper` is typically instantiated and managed by the `SocketIOComponent`. To use it, you need to provide the necessary configurations and handlers when you register the component. See the [Socket.IO Component documentation](../components/socket-io.md) for details on how to set it up.

Once configured, you can inject the `SocketIOServerHelper` instance into your services or controllers to emit events.

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

## `SocketIOClientHelper`

The `SocketIOClientHelper` provides a structured API for managing client-side Socket.IO connections.

### Creating a Socket.IO Client

```typescript
import { SocketIOClientHelper } from '@vez/ignis';

const socketClient = new SocketIOClientHelper({
  identifier: 'my-socket-client',
  host: 'http://localhost:3000',
  options: {
    path: '/io', // Path to the Socket.IO server
    extraHeaders: {
      Authorization: 'Bearer my-jwt-token',
    },
    auth: {
      token: 'my-jwt-token',
    }
  },
});

socketClient.connect();
```

### Subscribing to Events

```typescript
socketClient.subscribe({
  events: {
    connect: () => {
      console.log('Connected to Socket.IO server!');
      // Authenticate with the server
      socketClient.emit({ topic: 'authenticate' });
    },
    authenticated: (data) => {
      console.log('Successfully authenticated:', data);
    },
    notification: (data) => {
      console.log('Received notification:', data);
    },
    disconnect: () => {
      console.log('Disconnected from server.');
    },
  },
});
```
