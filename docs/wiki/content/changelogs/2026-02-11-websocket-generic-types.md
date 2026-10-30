---
title: WebSocket Generic Type Parameters
description: WebSocket authentication payloads, client metadata and callbacks can now be typed with generics, with no change needed in existing code.
packages: ['@venizia/ignis-docs', '@venizia/ignis-helpers']
---

# Changelog - 2026-02-11

## WebSocket Generic Type Parameters

**In one line.** Type your WebSocket auth payload and client metadata once, and drop the `as string` casts in your callbacks.

## What changed

- **Typed server.** `WebSocketServerHelper<AuthDataType, MetadataType>` and `IWebSocketServerOptions<AuthDataType, MetadataType>` carry the generics into every callback.
- **Typed callbacks.** `TWebSocketAuthenticateFn`, `TWebSocketHandshakeFn`, `TWebSocketClientConnectedFn` and `TWebSocketOutboundTransformer` accept the generic parameters.
- **`serverPublicKey` is its own field.** The server's ECDH public key is now `IWebSocketClient.serverPublicKey`, no longer stored inside `metadata`.
- **Constrained metadata.** `IWebSocketClient<MetadataType>` and `IWebSocketData<MetadataType>` now require `MetadataType extends Record<string, unknown>`, so something like `IWebSocketClient<string>` no longer compiles.

## Who is affected

- **Existing code.** No action needed; every generic defaults to `Record<string, unknown>`.
- **Code that read `serverPublicKey` from `client.metadata`.** Read `client.serverPublicKey` instead.

## Details

```typescript
interface AuthPayload { token: string; publicKey?: string }
interface UserMetadata { role: string; permissions: string[] }

const helper = new WebSocketServerHelper<AuthPayload, UserMetadata>({
  identifier: 'typed-ws',
  server: bunServer,
  redisConnection: redis,
  authenticateFn: async (data) => {
    // data is typed as AuthPayload
    const user = await verifyJWT(data.token);
    if (!user) return null;
    return { userId: user.id, metadata: { role: user.role, permissions: user.permissions } };
  },
  clientConnectedFn: ({ metadata }) => {
    // metadata is typed as UserMetadata | undefined
    if (metadata?.role === 'admin') console.log(metadata.permissions);
  },
});
```
