# Binding Keys

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/websocket/server-options` | `WebSocketBindingKeys.SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See [Configuration](./configuration) |
| `@app/websocket/redis-connection` | `WebSocketBindingKeys.REDIS_CONNECTION` | `DefaultRedisHelper` | **Yes** | `null` |
| `@app/websocket/authenticate-handler` | `WebSocketBindingKeys.AUTHENTICATE_HANDLER` | `TWebSocketAuthenticateFn` | **Yes** | `null` |
| `@app/websocket/validate-room-handler` | `WebSocketBindingKeys.VALIDATE_ROOM_HANDLER` | `TWebSocketValidateRoomFn` | No | `null` |
| `@app/websocket/client-connected-handler` | `WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER` | `TWebSocketClientConnectedFn` | No | `null` |
| `@app/websocket/client-disconnected-handler` | `WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER` | `TWebSocketClientDisconnectedFn` | No | `null` |
| `@app/websocket/message-handler` | `WebSocketBindingKeys.MESSAGE_HANDLER` | `TWebSocketMessageHandler` | No | `null` |
| `@app/websocket/outbound-transformer` | `WebSocketBindingKeys.OUTBOUND_TRANSFORMER` | `TWebSocketOutboundTransformer` | No | `null` |
| `@app/websocket/handshake-handler` | `WebSocketBindingKeys.HANDSHAKE_HANDLER` | `TWebSocketHandshakeFn` | No* | `null` |
| `@app/websocket/instance` | `WebSocketBindingKeys.WEBSOCKET_INSTANCE` | `WebSocketServerHelper` | -- | *Set by component* |

> [!NOTE]
> `HANDSHAKE_HANDLER` is required when `IServerOptions.requireEncryption` is `true`. It performs ECDH key exchange during authentication.

> [!NOTE]
> `WEBSOCKET_INSTANCE` is **not** set by you -- the component creates and binds it automatically after the server starts. Inject it in services/controllers to interact with WebSocket.
