---
title: "@venizia/ignis/websocket"
description: "Every export of @venizia/ignis/websocket, from the built declarations (generated)."
---

# `@venizia/ignis/websocket`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `WebSocketBindingKeys`

*class*

Container keys of the WebSocket component: the server instance, its options, the Redis connection and the handlers an application binds.

```ts
export declare class WebSocketBindingKeys {
    static readonly WEBSOCKET_INSTANCE: import("@venizia/ignis-inversion").TBindingKey<WebSocketServerHelper<Record<string, unknown>, Record<string, unknown>>>;
    static readonly SERVER_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<Partial<IServerOptions>>;
    static readonly REDIS_CONNECTION: import("@venizia/ignis-inversion").TBindingKey<IRedisHelper | null>;
    static readonly AUTHENTICATE_HANDLER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketAuthenticateFn | null>;
    static readonly VALIDATE_ROOM_HANDLER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketValidateRoomFn | null>;
    static readonly CLIENT_CONNECTED_HANDLER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketClientConnectedFn | null>;
    static readonly CLIENT_DISCONNECTED_HANDLER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketClientDisconnectedFn | null>;
    static readonly MESSAGE_HANDLER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketMessageHandler | null>;
    static readonly OUTBOUND_TRANSFORMER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketOutboundTransformer | null>;
    static readonly HANDSHAKE_HANDLER: import("@venizia/ignis-inversion").TBindingKey<TWebSocketHandshakeFn | null>;
}
```

Source: `packages/core-server/src/components/websocket/common/keys.ts`

## `WebSocketComponent`

*class*

Starts a WebSocket server on Bun after the application starts. Requires a Redis helper at `WebSocketBindingKeys.REDIS_CONNECTION` and an authenticate handler at `AUTHENTICATE_HANDLER`; binding throws without them.

```ts
export declare class WebSocketComponent extends BaseComponent {
    private application;
    protected serverOptions: IServerOptions;
    constructor(application: BaseApplication);
    private resolveBindings;
    private registerBunHook;
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/websocket/component.ts`
