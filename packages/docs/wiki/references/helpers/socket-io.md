# Socket.IO Helper

Structured Socket.IO client and server management for real-time bidirectional communication.

## Quick Reference

| Helper | Type | Features |
|--------|------|----------|
| **SocketIOServerHelper** | Server | Auth flow, room management, Redis scaling |
| **SocketIOClientHelper** | Client | Structured API, event subscription |

### SocketIOServerHelper Features

| Feature | Description |
|---------|-------------|
| **Redis Integration** | `@socket.io/redis-adapter` (scaling), `@socket.io/redis-emitter` (broadcasting) |
| **Authentication** | Built-in flow - clients emit `authenticate` event |
| **Client Management** | Track connections and auth state |
| **Room Management** | Group clients for targeted messaging |

### Common Operations

| Helper | Method | Purpose |
|--------|--------|---------|
| **Server** | `send({ destination, payload })` | Send message to room/socket |
| **Server** | `broadcast({ payload })` | Broadcast to all clients |
| **Client** | `connect()` | Connect to server |
| **Client** | `emit({ topic, ...data })` | Emit event |
| **Client** | `subscribe({ events })` | Subscribe to events |

### Usage

The `SocketIOServerHelper` is typically instantiated and managed by the `SocketIOComponent`. To use it, you need to provide the necessary configurations and handlers when you register the component. See the [Socket.IO Component documentation](../components/socket-io.md) for details on how to set it up.

Once configured, you can inject the `SocketIOServerHelper` instance into your services or controllers to emit events.

```typescript
import { SocketIOServerHelper, SocketIOBindingKeys, inject } from '@venizia/ignis';

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
import { SocketIOClientHelper } from '@venizia/ignis';

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
