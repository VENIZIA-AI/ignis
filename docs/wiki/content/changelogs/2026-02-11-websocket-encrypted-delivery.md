---
title: WebSocket Encrypted Delivery
description: The WebSocket server can now encrypt messages per client through an outbound transformer and an ECDH handshake, and delivers them to rooms and broadcasts concurrently.
packages: ['@venizia/ignis', '@venizia/ignis-docs', '@venizia/ignis-helpers']
---

# Changelog - 2026-02-11

## WebSocket Concurrent Encrypted Delivery

**In one line.** You can now encrypt WebSocket messages for each client and require an ECDH key exchange at login, without slowing room and broadcast delivery.

## What changed

- **Outbound transformer.** New `outboundTransformer` option on `IWebSocketServerOptions` runs before every `socket.send()`. Return `{ event, data }` to replace the message, or `null` to send the original.
- **Two delivery modes.** Without a transformer, `sendToRoom()` and `broadcast()` keep using fast Bun pub/sub. With one, they send to each client individually.
- **Concurrent delivery.** Individual delivery runs up to `encryptedBatchLimit` (default `10`, `WebSocketDefaults.ENCRYPTED_BATCH_LIMIT`) sends at once.
- **`enableClientEncryption({ clientId })`.** Marks a client as encrypted and removes it from the Bun broadcast and room topics, so its messages go through the transformer.
- **`requireEncryption`.** When `true`, the server runs `handshakeFn` during authentication. A failed handshake, or a client that gives no public key, is closed with code `4004`.
- **`handshakeFn`.** New `TWebSocketHandshakeFn` callback for the key exchange. It returns `{ serverPublicKey }` to accept, or `null` / `false` to reject.
- **Component binding keys.** `WebSocketBindingKeys.OUTBOUND_TRANSFORMER` and `WebSocketBindingKeys.HANDSHAKE_HANDLER` (the handshake handler is required when `requireEncryption` is `true`). `requireEncryption` is also an option on the component's `IServerOptions`.

## Who is affected

- **Existing WebSocket servers.** No action needed; without `outboundTransformer`, `sendToRoom()` and `broadcast()` use Bun pub/sub.
- **Apps that want end-to-end encrypted messages.** Configure the options below.

## Details

```typescript
const helper = new WebSocketServerHelper({
  // ...
  outboundTransformer: async ({ client, event, data }) => {
    if (!client.encrypted) return null;
    const encrypted = await ecdh.encrypt({
      message: JSON.stringify({ event, data }),
      secret: clientKeys.get(client.id),
    });
    return { event: 'encrypted', data: encrypted };
  },
  requireEncryption: true,
  encryptedBatchLimit: 20,
  handshakeFn: async ({ clientId, userId, data }) => {
    const clientPubKey = data.publicKey as string;
    if (!clientPubKey) return null;
    storeKey(clientId, await deriveSharedSecret(clientPubKey));
    return { serverPublicKey: serverPubKeyB64 };
  },
});
```

Login flow with `requireEncryption`:

1. The client sends `{ event: 'authenticate', data: { token, publicKey } }`.
2. `authenticateFn` validates the token.
3. `handshakeFn` does the key exchange with the same payload.
4. On success, `enableClientEncryption()` is called automatically and the `connected` event includes `serverPublicKey`.
5. On failure, the client is closed with code `4004`.

| Method | No transformer | Transformer configured |
|--------|---------------|----------------------|
| `sendToClient()` | Direct `socket.send()` | Runs the transformer if `client.encrypted` |
| `sendToRoom()` | Bun `server.publish()` | Concurrent send to all room clients |
| `broadcast()` | Bun `server.publish()` | Concurrent send to all authenticated clients |
