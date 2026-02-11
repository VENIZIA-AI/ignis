# Troubleshooting

## "Client disconnects immediately with close code `4001`"

The client connects but is disconnected before it can interact, with close code `4001` ("Authentication timeout").

This happens when the client does not send a `{ event: 'authenticate', data: { type, token, ... } }` message within the configured `authTimeout` (default: 5 seconds). Common causes:

- The client is sending the auth payload in the wrong format (e.g., `{ type: 'auth' }` instead of `{ event: 'authenticate' }`).
- The client is waiting for a server-initiated message before authenticating. The server sends nothing after the WebSocket upgrade -- the client must initiate.
- Network latency or slow token retrieval causes the auth message to arrive after the 5-second window.

> [!TIP]
> Ensure the client sends `{ event: 'authenticate', data: { type: '...', token: '...' } }` immediately in the `onopen` handler. If your auth token retrieval is slow, increase `authTimeout` in the server options.


## "Redis subscription messages are not received across instances"

`helper.send()` delivers locally but other server instances do not receive the message.

Common causes:

- The Redis connection passed to `WebSocketServerHelper` is a single-instance `Redis` client, but your deployment uses Redis Cluster. The duplicated pub/sub clients must be compatible with your Redis topology.
- `configure()` was not awaited. The Redis subscriptions are set up asynchronously during `configure()`. If you start accepting WebSocket connections before `configure()` resolves, the subscriptions may not be active yet.
- A firewall or Redis ACL is blocking `SUBSCRIBE`/`PSUBSCRIBE` commands on the duplicated clients.

> [!IMPORTANT]
> Always `await helper.configure()` before accepting connections. Verify your Redis connection supports pub/sub (check ACLs, and ensure cluster mode is consistent between the `redisConnection` helper and your deployment).


## "`requireEncryption` is `true` but clients get disconnected with code `4004`"

Authentication succeeds (the `authenticateFn` returns a valid result) but the client is immediately closed with code `4004`.

This happens when `requireEncryption` is `true` but:

- `handshakeFn` is not provided in the options. The server logs `requireEncryption is true but no handshakeFn configured` and closes the client.
- `handshakeFn` returns `null` or `false`, indicating the handshake was rejected (e.g., missing `publicKey` in the auth payload).

> [!TIP]
> Ensure `handshakeFn` is configured when `requireEncryption` is `true`, and that the client includes the required key exchange data (e.g., `publicKey`) in the authenticate payload.
