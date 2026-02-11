# Architecture Overview

```
                         SocketIOComponent
                        +----------------------------------------------+
                        |                                              |
                        |  binding()                                   |
                        |    |-- resolveBindings()                     |
                        |    |     |-- SERVER_OPTIONS                  |
                        |    |     |-- REDIS_CONNECTION                |
                        |    |     |-- AUTHENTICATE_HANDLER            |
                        |    |     |-- VALIDATE_ROOM_HANDLER           |
                        |    |     +-- CLIENT_CONNECTED_HANDLER        |
                        |    |                                         |
                        |    +-- RuntimeModules.detect()               |
                        |          |-- BUN  -> registerBunHook()       |
                        |          +-- NODE -> registerNodeHook()      |
                        |                                              |
                        |  (Post-start hooks execute after server)     |
                        |    |-- Creates SocketIOServerHelper          |
                        |    |-- await socketIOHelper.configure()      |
                        |    |-- Binds to SOCKET_IO_INSTANCE           |
                        |    +-- Wires into server (runtime-specific)  |
                        +----------------------------------------------+
```

## Lifecycle Integration

The component uses the **post-start hook** system to solve a fundamental timing problem: Socket.IO needs a running server instance, but components are initialized *before* the server starts.

```
Application Lifecycle
=====================

  +------------------+
  |  preConfigure()  | <-- Register SocketIOComponent here
  +--------+---------+
           |
  +--------v---------+
  |  initialize()    | <-- Component.binding() runs here
  |                  |   Resolves bindings, registers post-start hook
  +--------+---------+
           |
  +--------v---------+
  | setupMiddlewares  |
  +--------+---------+
           |
  +--------v-----------------------+
  | startBunModule()  OR          | <-- Server starts, instance created
  | startNodeModule()             |
  +--------+-----------------------+
           |
  +--------v--------------------------+
  | executePostStartHooks()           | <-- SocketIOServerHelper created HERE
  |   +-- socket-io-initialize        |   Server instance is now available
  +-----------------------------------+
```

## Runtime-Specific Behavior

| Aspect | Node.js | Bun |
|--------|---------|-----|
| **Server Type** | `node:http.Server` | `Bun.Server` |
| **IO Server Init** | `new IOServer(httpServer, opts)` | `new IOServer()` + `io.bind(engine)` |
| **Engine** | Built-in (`socket.io`) | `@socket.io/bun-engine` (optional peer dep) |
| **Request Routing** | Socket.IO attaches to HTTP server automatically | `server.reload({ fetch, websocket })` wires engine into Bun's request loop |
| **WebSocket Upgrade** | Handled by `node:http.Server` upgrade event | Handled by Bun's `websocket` handler |
| **Dynamic Import** | None needed | `await import('@socket.io/bun-engine')` at runtime |

## Complete Example

A full working example is available at `examples/socket-io-test/`. It demonstrates:

| Feature | Implementation |
|---------|---------------|
| Application setup | `src/application.ts` -- bindings, component registration, graceful shutdown |
| REST endpoints | `src/controllers/socket-test.controller.ts` -- 9 endpoints for Socket.IO management |
| Event handling | `src/services/socket-event.service.ts` -- chat, echo, room management |
| Automated test client | `client.ts` -- 15+ test cases covering all features |

### REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/socket/info` | Server status + connected client count |
| `GET` | `/socket/clients` | List all connected client IDs |
| `GET` | `/socket/health` | Health check (is SocketIO ready?) |
| `POST` | `/socket/broadcast` | Broadcast `{ topic, data }` to all clients |
| `POST` | `/socket/room/{roomId}/send` | Send `{ topic, data }` to a room |
| `POST` | `/socket/client/{clientId}/send` | Send `{ topic, data }` to a specific client |
| `POST` | `/socket/client/{clientId}/join` | Join client to `{ rooms: string[] }` |
| `POST` | `/socket/client/{clientId}/leave` | Remove client from `{ rooms: string[] }` |
| `GET` | `/socket/client/{clientId}/rooms` | List rooms a client belongs to |

### Running the Example

```bash
# Start the server
cd examples/socket-io-test
bun run server:dev

# In another terminal -- run automated tests
bun client.ts
```
