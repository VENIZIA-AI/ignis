---
title: WebSocket Encrypted Delivery
description: Concurrent encrypted delivery for WebSocket sendToRoom/broadcast with outbound transformer and ECDH integration
---

# Changelog - 2026-02-11

## WebSocket Concurrent Encrypted Delivery

The WebSocket helper now supports **per-client encryption** via an outbound transformer, with concurrent delivery using `executePromiseWithLimit` for room and broadcast operations. When encryption is enabled (via `outboundTransformer`), the delivery model switches from Bun native pub/sub to individual client iteration with a configurable concurrency limit.

## Overview

- **Outbound Transformer**: New `outboundTransformer` callback on `IWebSocketServerOptions` intercepts every outbound message before `socket.send()` -- enables per-client encryption using ECDH-derived AES keys
- **Conditional Delivery**: `sendToRoom()` and `broadcast()` now check for `outboundTransformer` -- without it, use fast O(1) Bun pub/sub; with it, iterate all clients individually
- **Concurrent Execution**: Encrypted client iteration uses `executePromiseWithLimit` with a sliding window (default: 10 concurrent) to prevent unbounded promise storms
- **`enableClientEncryption()`**: Marks a client as encrypted and unsubscribes from all Bun native topics -- messages are delivered individually through the transformer
- **Component Integration**: `WebSocketBindingKeys.OUTBOUND_TRANSFORMER` and `WebSocketBindingKeys.HANDSHAKE_HANDLER` binding keys added to the core WebSocket component
- **`requireEncryption`**: New server option that enforces ECDH key exchange during authentication -- clients that don't provide a public key are rejected with close code `4004`
- **`handshakeFn`**: New callback type (`TWebSocketHandshakeFn`) for key exchange during auth. Returns `{ serverPublicKey }` on success, `null`/`false` to reject

## New Features

### 1. Outbound Transformer

**Files:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`, `packages/helpers/src/helpers/socket/websocket/server/helper.ts`

A callback that intercepts outbound messages before delivery. Return a transformed `{ event, data }` or `null` to use the original payload.

```typescript
const helper = new WebSocketServerHelper({
  // ...
  outboundTransformer: async ({ client, event, data }) => {
    if (!client.encrypted) return null;

    const aesKey = clientKeys.get(client.id);
    const encrypted = await ecdh.encrypt({
      message: JSON.stringify({ event, data }),
      secret: aesKey,
    });
    return { event: 'encrypted', data: encrypted };
  },
});
```

**Type:**
```typescript
type TWebSocketOutboundTransformer<DataType = unknown> = (opts: {
  client: IWebSocketClient;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
```

### 2. Conditional Delivery Model

**File:** `packages/helpers/src/helpers/socket/websocket/server/helper.ts`

**Problem:** Previously, `sendToRoom()` and `broadcast()` used a "hybrid" approach -- Bun pub/sub for non-encrypted clients + sequential iteration for encrypted clients. This was confusing and still sequential for the encrypted path.

**Solution:** Clean conditional -- if `outboundTransformer` is configured, iterate all clients individually with concurrency control. If not, use pure Bun pub/sub.

| Method | No transformer | Transformer configured |
|--------|---------------|----------------------|
| `sendToClient()` | Direct `socket.send()` | Runs transformer if `client.encrypted` |
| `sendToRoom()` | Bun `server.publish()` (O(1)) | `executePromiseWithLimit` over all room clients |
| `broadcast()` | Bun `server.publish()` (O(1)) | `executePromiseWithLimit` over all authenticated clients |

### 3. Concurrent Encryption via `executePromiseWithLimit`

**File:** `packages/helpers/src/helpers/socket/websocket/server/helper.ts`

**Problem:** Sequential execution -- encrypted clients were iterated one-by-one, bottlenecking rooms with many encrypted clients.

**Solution:** Uses the existing `executePromiseWithLimit` utility with a sliding window. Configurable via `encryptedBatchLimit` (default: `10`).

```typescript
const helper = new WebSocketServerHelper({
  // ...
  encryptedBatchLimit: 20, // Tune based on encryption cost and CPU cores
});
```

### 4. `enableClientEncryption()` Method

**File:** `packages/helpers/src/helpers/socket/websocket/server/helper.ts`

Public method to mark a client as encrypted after key exchange:

```typescript
helper.enableClientEncryption({ clientId });
```

**What it does:**
1. Sets `client.encrypted = true`
2. Unsubscribes from `BROADCAST_TOPIC` (Bun pub/sub)
3. Unsubscribes from all room topics
4. All subsequent messages are delivered individually through the outbound transformer

### 5. Enforced Encryption (`requireEncryption`)

**Files:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`, `packages/helpers/src/helpers/socket/websocket/server/helper.ts`

When `requireEncryption` is `true`, the server runs the `handshakeFn` during authentication. If the handshake fails or the client doesn't provide a public key, the connection is rejected with close code `4004`.

```typescript
const helper = new WebSocketServerHelper({
  // ...
  requireEncryption: true,
  handshakeFn: async ({ clientId, userId, data }) => {
    const clientPubKey = data.publicKey as string;
    if (!clientPubKey) return null;
    const aesKey = await deriveSharedSecret(clientPubKey);
    storeKey(clientId, aesKey);
    return { serverPublicKey: serverPubKeyB64 };
  },
});
```

**Auth + handshake flow:**
1. Client sends `{ event: 'authenticate', data: { token, publicKey } }`
2. `authenticateFn` validates the token
3. `handshakeFn` performs key exchange using the same payload
4. On success: `enableClientEncryption()` is called automatically, `connected` event includes `serverPublicKey`
5. On failure: client closed with code `4004`

**Type:**
```typescript
type TWebSocketHandshakeFn = (opts: {
  clientId: string;
  userId?: string;
  data: Record<string, unknown>;
}) => ValueOrPromise<{ serverPublicKey: string } | null | false>;
```

### 6. Component Binding Keys

**File:** `packages/core/src/components/websocket/common/keys.ts`

New binding keys for encryption support:

```typescript
// Outbound transformer
this.bind<TWebSocketOutboundTransformer>({
  key: WebSocketBindingKeys.OUTBOUND_TRANSFORMER,
}).toValue(async ({ client, event, data }) => {
  if (!client.encrypted) return null;
  return { event: 'encrypted', data: await encrypt(client.id, { event, data }) };
});

// Handshake handler (required when requireEncryption is true)
this.bind<TWebSocketHandshakeFn>({
  key: WebSocketBindingKeys.HANDSHAKE_HANDLER,
}).toValue(async ({ clientId, data }) => {
  const pubKey = data.publicKey as string;
  if (!pubKey) return null;
  return { serverPublicKey: serverPubKeyB64 };
});
```

## New Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `WebSocketDefaults.ENCRYPTED_BATCH_LIMIT` | `10` | Default max concurrent encryption operations |

## New Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `IWebSocketServerOptions.outboundTransformer` | `TWebSocketOutboundTransformer` | `undefined` | Callback to transform outbound messages (encryption) |
| `IWebSocketServerOptions.encryptedBatchLimit` | `number` | `10` | Max concurrent operations for room/broadcast delivery |
| `IWebSocketServerOptions.requireEncryption` | `boolean` | `false` | Enforce ECDH key exchange during authentication |
| `IWebSocketServerOptions.handshakeFn` | `TWebSocketHandshakeFn` | `undefined` | Key exchange callback (required when `requireEncryption` is `true`) |

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/socket/websocket/common/types.ts` | Added `outboundTransformer`, `encryptedBatchLimit`, `requireEncryption`, `handshakeFn` to `IWebSocketServerOptions`; added `TWebSocketHandshakeFn` type |
| `src/helpers/socket/websocket/common/constants.ts` | Added `ENCRYPTED_BATCH_LIMIT = 10` to `WebSocketDefaults` |
| `src/helpers/socket/websocket/server/helper.ts` | Added `sendToClientAsync()`, import `executePromiseWithLimit`, conditional delivery in `sendToRoom()`/`broadcast()`, `enableClientEncryption()`, `encryptedBatchLimit` field, `requireEncryption` field, `handshakeFn` field, combined auth+handshake in `handleAuthenticate()` |

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/websocket/common/keys.ts` | Added `OUTBOUND_TRANSFORMER` and `HANDSHAKE_HANDLER` binding keys |
| `src/components/websocket/common/types.ts` | Added `TWebSocketOutboundTransformer`, `TWebSocketHandshakeFn` to `IResolvedBindings`; added `requireEncryption` to `IServerOptions` |
| `src/components/websocket/component.ts` | Resolves and passes `outboundTransformer`, `handshakeFn`, `requireEncryption` to `WebSocketServerHelper` |

### Documentation (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/references/helpers/websocket.md` | Added encryption section, outbound transformer docs, updated types/constants/methods |
| `wiki/references/components/websocket.md` | Added `OUTBOUND_TRANSFORMER` binding key, encryption setup example |
| `wiki/changelogs/2026-02-11-websocket-encrypted-delivery.md` | New -- this changelog |
| `site/.vitepress/config.mts` | Added sidebar entry for this changelog |

## Verification Results

| Check | Result |
|-------|--------|
| `packages/helpers` rebuild | Clean |
| `packages/helpers` lint | Clean (0 errors, 0 warnings) |
| `packages/core` tests (WebSocket) | 11 pass, 0 fail, 18 expect() calls |
