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
    static readonly WEBSOCKET_INSTANCE = "@app/websocket/instance";
    static readonly SERVER_OPTIONS = "@app/websocket/server-options";
    static readonly REDIS_CONNECTION = "@app/websocket/redis-connection";
    static readonly AUTHENTICATE_HANDLER = "@app/websocket/authenticate-handler";
    static readonly VALIDATE_ROOM_HANDLER = "@app/websocket/validate-room-handler";
    static readonly CLIENT_CONNECTED_HANDLER = "@app/websocket/client-connected-handler";
    static readonly CLIENT_DISCONNECTED_HANDLER = "@app/websocket/client-disconnected-handler";
    static readonly MESSAGE_HANDLER = "@app/websocket/message-handler";
    static readonly OUTBOUND_TRANSFORMER = "@app/websocket/outbound-transformer";
    static readonly HANDSHAKE_HANDLER = "@app/websocket/handshake-handler";
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
