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
    static readonly WEBSOCKET_INSTANCE: string & {
        readonly valueType?: ((value: WebSocketServerHelper<Record<string, unknown>, Record<string, unknown>>) => void) | undefined;
    };
    static readonly SERVER_OPTIONS: string & {
        readonly valueType?: ((value: Partial<IServerOptions>) => void) | undefined;
    };
    static readonly REDIS_CONNECTION: string & {
        readonly valueType?: ((value: AbstractRedisHelper<import("@venizia/ignis-helpers").TRedisClient> | null) => void) | undefined;
    };
    static readonly AUTHENTICATE_HANDLER: string & {
        readonly valueType?: ((value: TWebSocketAuthenticateFn | null) => void) | undefined;
    };
    static readonly VALIDATE_ROOM_HANDLER: string & {
        readonly valueType?: ((value: TWebSocketValidateRoomFn | null) => void) | undefined;
    };
    static readonly CLIENT_CONNECTED_HANDLER: string & {
        readonly valueType?: ((value: TWebSocketClientConnectedFn | null) => void) | undefined;
    };
    static readonly CLIENT_DISCONNECTED_HANDLER: string & {
        readonly valueType?: ((value: TWebSocketClientDisconnectedFn | null) => void) | undefined;
    };
    static readonly MESSAGE_HANDLER: string & {
        readonly valueType?: ((value: TWebSocketMessageHandler | null) => void) | undefined;
    };
    static readonly OUTBOUND_TRANSFORMER: string & {
        readonly valueType?: ((value: TWebSocketOutboundTransformer | null) => void) | undefined;
    };
    static readonly HANDSHAKE_HANDLER: string & {
        readonly valueType?: ((value: TWebSocketHandshakeFn | null) => void) | undefined;
    };
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
