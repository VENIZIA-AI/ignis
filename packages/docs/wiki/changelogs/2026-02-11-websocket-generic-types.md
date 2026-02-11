---
title: WebSocket Generic Type Parameters
description: Type-safe generic parameters for WebSocket authentication payloads, client metadata, and callback types
---

# Changelog - 2026-02-11

## WebSocket Generic Type Parameters

The WebSocket helper types now support **generic type parameters** for type-safe authentication payloads and client metadata. All generics default to `Record<string, unknown>` for full backward compatibility -- no existing code needs to change.

## Overview

- **Generic `IWebSocketServerOptions<AuthDataType, MetadataType>`**: Server options now carry generics that flow through to all callback types
- **Generic callback types**: `TWebSocketAuthenticateFn`, `TWebSocketHandshakeFn`, `TWebSocketClientConnectedFn`, and `TWebSocketOutboundTransformer` accept generic parameters for type-safe payloads
- **Generic `IWebSocketClient<MetadataType>`**: Constrained generic (`extends Record<string, unknown>`) replaces the previous unconstrained default
- **`serverPublicKey` separated from metadata**: The server's ECDH public key is now a dedicated field on `IWebSocketClient`, not stored inside `metadata`

## No Breaking Changes

All changes are backward compatible. Every generic parameter defaults to `Record<string, unknown>`, so existing code that does not specify generics continues to work without modification.

## New Features

### 1. Generic Type Parameters on `WebSocketServerHelper`

**Files:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`, `packages/helpers/src/helpers/socket/websocket/server/helper.ts`

**Problem:** Authentication payloads and client metadata were typed as `Record<string, unknown>`, requiring manual type assertions (`data.token as string`) throughout callback implementations.

**Solution:** Two generic type parameters (`AuthDataType`, `MetadataType`) flow through the server options and all callback types, providing compile-time type safety without breaking existing untyped usage.

```typescript
interface AuthPayload { token: string; publicKey?: string }
interface UserMetadata { role: string; permissions: string[] }

const helper = new WebSocketServerHelper<AuthPayload, UserMetadata>({
  identifier: 'typed-ws',
  server: bunServer,
  redisConnection: redis,
  authenticateFn: async (data) => {
    // data is typed as AuthPayload — no casting needed
    const user = await verifyJWT(data.token);
    if (!user) return null;
    return {
      userId: user.id,
      metadata: { role: user.role, permissions: user.permissions },
    };
  },
  clientConnectedFn: ({ metadata }) => {
    // metadata is typed as UserMetadata | undefined
    if (metadata?.role === 'admin') {
      console.log('Admin connected with permissions:', metadata.permissions);
    }
  },
});
```

**Benefits:**
- No more `as string` / `as unknown` casts in auth callbacks
- Compile-time errors if metadata shape doesn't match
- IntelliSense/autocomplete for auth data and metadata fields
- Fully backward compatible -- omitting generics uses `Record<string, unknown>`

### 2. Generic Flow Through Callback Types

**File:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`

The generics propagate through the entire type chain:

| Type | Generics | Description |
|------|----------|-------------|
| `TWebSocketAuthenticateFn<AuthDataType, MetadataType>` | Both | Auth payload input + metadata output |
| `TWebSocketHandshakeFn<AuthDataType>` | `AuthDataType` | Handshake receives typed auth data |
| `TWebSocketClientConnectedFn<MetadataType>` | `MetadataType` | Connected callback has typed metadata |
| `TWebSocketOutboundTransformer<DataType, MetadataType>` | `MetadataType` | Transformer receives typed client |
| `IWebSocketClient<MetadataType>` | `MetadataType` | Client tracking has typed metadata |

### 3. `serverPublicKey` Separated from Metadata

**File:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`

**Problem:** During ECDH handshake, `serverPublicKey` was stored inside `client.metadata`. This polluted user-defined metadata and made it harder to type metadata correctly with generics.

**Solution:** `serverPublicKey` is now a dedicated `string?` field on `IWebSocketClient`, separate from `metadata`.

```typescript
interface IWebSocketClient<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
  // ... existing fields ...
  metadata?: MetadataType;
  serverPublicKey?: string;  // NEW — separate from metadata
}
```

**Benefits:**
- User metadata shape is not polluted by framework-internal fields
- `MetadataType` generic accurately represents only user-defined data
- Server public key is always accessible via `client.serverPublicKey` regardless of metadata type

### 4. Constrained Generic on `IWebSocketClient` and `IWebSocketData`

**File:** `packages/helpers/src/helpers/socket/websocket/common/types.ts`

The generic parameter on `IWebSocketClient` and `IWebSocketData` changed from an unconstrained default to a constrained generic:

**Before:**
```typescript
interface IWebSocketClient<MetadataType = Record<string, unknown>> { ... }
interface IWebSocketData<MetadataType = Record<string, unknown>> { ... }
```

**After:**
```typescript
interface IWebSocketClient<MetadataType extends Record<string, unknown> = Record<string, unknown>> { ... }
interface IWebSocketData<MetadataType extends Record<string, unknown> = Record<string, unknown>> { ... }
```

This ensures metadata is always an object type, preventing accidental usage like `IWebSocketClient<string>`.

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/socket/websocket/common/types.ts` | Added constrained generics to `IWebSocketClient`, `IWebSocketData`, `IWebSocketServerOptions`; added generics to `TWebSocketAuthenticateFn`, `TWebSocketHandshakeFn`, `TWebSocketClientConnectedFn`, `TWebSocketOutboundTransformer`; added `serverPublicKey` field to `IWebSocketClient` |
| `src/helpers/socket/websocket/server/helper.ts` | Updated class to accept and propagate `AuthDataType` and `MetadataType` generics |

### Documentation (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/references/helpers/websocket.md` | Added "Generic Type Parameters" section; updated type definitions for `IWebSocketClient`, `IWebSocketData`, `IWebSocketServerOptions`, and all callback types to show generics; added `serverPublicKey` to tracked state table; updated auth flow diagram |
| `wiki/changelogs/2026-02-11-websocket-generic-types.md` | New -- this changelog |
