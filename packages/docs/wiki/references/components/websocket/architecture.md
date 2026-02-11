# Architecture Overview

```
                         WebSocketComponent
                        +----------------------------------------------+
                        |                                              |
                        |  binding()                                   |
                        |    |-- RuntimeModules.detect()               |
                        |    |     +-- NODE -> throw error             |
                        |    |     +-- BUN  -> continue                |
                        |    |                                         |
                        |    |-- resolveBindings()                     |
                        |    |     |-- SERVER_OPTIONS                  |
                        |    |     |-- REDIS_CONNECTION                |
                        |    |     |-- AUTHENTICATE_HANDLER            |
                        |    |     |-- VALIDATE_ROOM_HANDLER           |
                        |    |     |-- CLIENT_CONNECTED_HANDLER        |
                        |    |     |-- CLIENT_DISCONNECTED_HANDLER     |
                        |    |     |-- MESSAGE_HANDLER                 |
                        |    |     |-- OUTBOUND_TRANSFORMER            |
                        |    |     +-- HANDSHAKE_HANDLER               |
                        |    |                                         |
                        |    +-- registerBunHook(resolved)             |
                        |                                              |
                        |  (Post-start hook executes after server)     |
                        |    |-- Creates WebSocketServerHelper         |
                        |    |-- await wsHelper.configure()            |
                        |    |-- Binds to WEBSOCKET_INSTANCE           |
                        |    |-- Creates fetch handler (WS + Hono)     |
                        |    +-- server.reload({ fetch, websocket })   |
                        +----------------------------------------------+
```

## Lifecycle Integration

The component uses the **post-start hook** system to solve a fundamental timing problem: WebSocket needs a running Bun server instance, but components are initialized *before* the server starts.

```
Application Lifecycle
=====================

  +------------------+
  |  preConfigure()  | <-- Register WebSocketComponent here
  +--------+---------+
           |
  +--------v---------+
  |  initialize()    | <-- Component.binding() runs here
  |                  |   Runtime check, resolve bindings, register post-start hook
  +--------+---------+
           |
  +--------v---------+
  | setupMiddlewares  |
  +--------+---------+
           |
  +--------v-----------------------+
  | startBunModule()               | <-- Bun server starts, instance created
  +--------+-----------------------+
           |
  +--------v--------------------------+
  | executePostStartHooks()           | <-- WebSocketServerHelper created HERE
  |   +-- websocket-initialize        |   Server instance is now available
  |       |-- new WebSocketServerHelper
  |       |-- wsHelper.configure()
  |       |-- bind WEBSOCKET_INSTANCE
  |       +-- server.reload({ fetch, websocket })
  +-----------------------------------+
```

## Fetch Handler

The component creates a custom `fetch` handler that routes requests:

1. **WebSocket upgrade requests** (`GET /ws` with `Upgrade: websocket` header) are handled by `server.upgrade()` which assigns a `clientId` and passes to Bun's WebSocket handler.
2. **All other requests** are delegated to the Hono server for normal HTTP routing.

```
Incoming Request
       |
       v
  Is WebSocket upgrade?
  (pathname === wsPath &&
   headers.upgrade === 'websocket')
       |
  +----+----+
  |         |
  Yes       No
  |         |
  v         v
server.   honoServer.
upgrade()  fetch(req)
```
