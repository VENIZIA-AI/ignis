# Binding Keys

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/socket-io/server-options` | `SocketIOBindingKeys.SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See [Default Options](./configuration#default-server-options) |
| `@app/socket-io/redis-connection` | `SocketIOBindingKeys.REDIS_CONNECTION` | `RedisHelper` / `DefaultRedisHelper` | **Yes** | `null` |
| `@app/socket-io/authenticate-handler` | `SocketIOBindingKeys.AUTHENTICATE_HANDLER` | `TSocketIOAuthenticateFn` | **Yes** | `null` |
| `@app/socket-io/validate-room-handler` | `SocketIOBindingKeys.VALIDATE_ROOM_HANDLER` | `TSocketIOValidateRoomFn` | No | `null` |
| `@app/socket-io/client-connected-handler` | `SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER` | `TSocketIOClientConnectedFn` | No | `null` |
| `@app/socket-io/instance` | `SocketIOBindingKeys.SOCKET_IO_INSTANCE` | `SocketIOServerHelper` | -- | *Set by component* |

> [!NOTE]
> `SOCKET_IO_INSTANCE` is **not** set by you -- the component creates and binds it automatically after the server starts. Inject it in services/controllers to interact with Socket.IO.
