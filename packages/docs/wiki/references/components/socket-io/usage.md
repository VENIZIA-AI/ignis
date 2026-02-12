# Socket.IO -- Usage & Examples

> Server-side usage patterns, client helper setup, and advanced examples.

## Server-Side Usage

### Inject and Use in Services/Controllers

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

## Client Helper

`SocketIOClientHelper` provides a managed Socket.IO client for connecting to Socket.IO servers -- useful for service-to-service communication, testing, or building relay services. It extends `BaseHelper` for scoped logging and wraps the `socket.io-client` library with authentication flow, lifecycle callbacks, and error-safe event subscription.

### Client Setup

```typescript
import {
  SocketIOClientHelper,
} from '@venizia/ignis-helpers/socket-io';

const client = new SocketIOClientHelper({
  identifier: 'notification-relay',
  host: 'http://localhost:3000',
  options: {
    path: '/io',
    extraHeaders: {
      authorization: 'Bearer <token>',
    },
  },

  // Lifecycle callbacks (all optional)
  onConnected: () => {
    console.log('Connected to server');
    client.authenticate();
  },
  onDisconnected: (reason) => {
    console.log('Disconnected:', reason);
  },
  onError: (error) => {
    console.error('Connection error:', error);
  },
  onAuthenticated: () => {
    console.log('Authentication successful');
  },
  onUnauthenticated: (message) => {
    console.warn('Authentication failed:', message);
  },
});
```

#### Constructor Behavior

The constructor immediately calls `configure()`, which creates the `socket.io-client` `Socket` instance via `io(host, options)` and registers all internal event handlers (`connect`, `disconnect`, `connect_error`, `authenticated`, `unauthenticated`, `ping`). The socket is **not** connected until you call `client.connect()` (if using `autoConnect: false` in the options) or it connects automatically if `autoConnect` is not explicitly disabled.

#### `connect` vs `connection` Event

The client-side `socket.io-client` library fires the `connect` event (no "ion" suffix) when the connection is established. The server-side `socket.io` library fires `connection` (with the suffix). This is a Socket.IO convention, not an Ignis-specific behavior. The client helper registers on `'connect'` while the server helper registers on `SocketIOConstants.EVENT_CONNECT` which equals `'connection'`.

### Authentication Flow

After connecting, the client must emit `authenticate` to start the auth handshake. The server validates credentials from the socket handshake (headers, query params, `auth` object) and responds with either `authenticated` or `unauthenticated`.

```typescript
// Manual authentication after connection
client.authenticate();
```

The `authenticate()` method has two guard conditions:
1. The socket must be connected (`client.connected === true`)
2. The current state must be `unauthorized` -- calling `authenticate()` while `authenticating` or already `authenticated` is a no-op with a warning log

#### Authentication Failure Details

The server sends two distinct error messages depending on how the `authenticateFn` fails:

| Failure Mode | Message | Cause |
|-------------|---------|-------|
| `authenticateFn` returned `false` | `"Invalid token to authenticate! Please login again!"` | Credentials were checked but deemed invalid |
| `authenticateFn` threw an error | `"Failed to authenticate connection! Please login again!"` | An unexpected error occurred during validation |

Both failure paths set the client state back to `unauthorized`, emit the `unauthenticated` event to the client with the message, and then disconnect the socket after the message is delivered (via `setImmediate` callback).

### Event Subscription

Subscribe to custom events with automatic error safety. Handlers are wrapped in a dual try-catch that catches both synchronous throws and asynchronous rejections:

```typescript
// Subscribe to a single event
client.subscribe({
  event: 'chat:message',
  handler: (data: { from: string; text: string }) => {
    console.log(`${data.from}: ${data.text}`);
  },
});

// Subscribe with duplicate detection disabled
client.subscribe({
  event: 'chat:message',
  handler: (data) => { /* second handler */ },
  ignoreDuplicate: false, // default: true -- set to false to allow multiple handlers
});

// Subscribe to multiple events at once
client.subscribeMany({
  events: {
    'user:joined': (data) => console.log('User joined:', data),
    'user:left': (data) => console.log('User left:', data),
    'room:updated': (data) => console.log('Room updated:', data),
  },
});
```

#### Deduplication Behavior

By default (`ignoreDuplicate: true`), `subscribe()` checks `socket.hasListeners(event)` before registering. If listeners already exist for the event, the call is a no-op and logs an info message. Set `ignoreDuplicate: false` to allow multiple handlers for the same event.

### Unsubscribing

```typescript
// Remove all handlers for an event
client.unsubscribe({ event: 'chat:message' });

// Remove a specific handler
client.unsubscribe({ event: 'chat:message', handler: myHandler });

// Remove handlers for multiple events
client.unsubscribeMany({ events: ['chat:message', 'user:joined', 'room:updated'] });
```

### Emitting Events

```typescript
client.emit({
  topic: 'chat:send',
  data: { text: 'Hello world' },
  doLog: true,   // optional: log the emission
  cb: () => {    // optional: callback via setImmediate after emit
    console.log('Message sent');
  },
});
```

The `emit()` method throws if the socket is not connected or if no `topic` is provided. Unlike `send()` on the server helper, this method does **not** silently swallow errors.

### Room Management

```typescript
// Request to join rooms (server validates via validateRoomFn)
client.joinRooms({ rooms: ['chat-room-1', 'notifications'] });

// Request to leave rooms
client.leaveRooms({ rooms: ['chat-room-1'] });
```

Both methods emit Socket.IO events (`join` / `leave`) to the server. The actual join/leave happens server-side. If the socket is not connected, the call is a no-op with a warning log.

### Connection Management

```typescript
// Manually connect (useful when autoConnect: false in options)
client.connect();

// Disconnect from server
client.disconnect();

// Check current state
const state = client.getState(); // 'unauthorized' | 'authenticating' | 'authenticated'

// Get raw socket.io-client Socket instance
const rawSocket = client.getSocketClient();
```

### Shutdown

```typescript
// Clean shutdown: removes all listeners, disconnects, resets state
client.shutdown();
```

The `shutdown()` method:
1. Calls `removeAllListeners()` on the underlying socket to prevent memory leaks
2. Disconnects if still connected
3. Resets state to `unauthorized`

## Advanced Usage

### Complete Example

A full working example is available at `examples/socket-io-test/`. It demonstrates:

| Feature | Implementation |
|---------|---------------|
| Application setup | `src/application.ts` -- bindings, component registration, graceful shutdown |
| REST endpoints | `src/controllers/socket-test.controller.ts` -- 9 endpoints for Socket.IO management |
| Event handling | `src/services/socket-event.service.ts` -- chat, echo, room management |
| Automated test client | `client.ts` -- 15+ test cases covering all features |

#### REST API Endpoints

The example provides a REST API for managing Socket.IO:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/socket/info` | Server status + connected client count |
| `GET` | `/socket/clients` | List all connected client IDs |
| `GET` | `/socket/health` | Health check (is SocketIO ready?) |
| `POST` | `/socket/broadcast` | Broadcast <code v-pre>{{ topic, data }}</code> to all clients |
| `POST` | `/socket/room/{roomId}/send` | Send <code v-pre>{{ topic, data }}</code> to a room |
| `POST` | `/socket/client/{clientId}/send` | Send <code v-pre>{{ topic, data }}</code> to a specific client |
| `POST` | `/socket/client/{clientId}/join` | Join client to <code v-pre>{{ rooms: string[] }}</code> |
| `POST` | `/socket/client/{clientId}/leave` | Remove client from <code v-pre>{{ rooms: string[] }}</code> |
| `GET` | `/socket/client/{clientId}/rooms` | List rooms a client belongs to |

#### Running the Example

```bash
# Start the server
cd examples/socket-io-test
bun run server:dev

# In another terminal -- run automated tests
bun client.ts
```

The automated client tests the following features:

- Authentication (valid and invalid tokens)
- Ping/pong keepalive
- Room join/leave with validation
- Client-to-client messaging
- Room broadcasting
- Global broadcasting
- REST API for Socket.IO management
- Graceful disconnection

Review the example code to understand production-ready patterns for:

- Binding multiple handlers in a single `setupSocketIO()` method
- Lazy getter pattern for accessing `SocketIOServerHelper` in services
- Custom event registration via `CLIENT_CONNECTED_HANDLER`
- Room validation logic preventing unauthorized room access
- Graceful shutdown sequence in `application.stop()`

## See Also

- [Setup & Configuration](./) -- Quick reference, installation, bindings, constants
- [API Reference](./api) -- Architecture, method signatures, internals, types
- [Error Reference](./errors) -- Error conditions and troubleshooting
