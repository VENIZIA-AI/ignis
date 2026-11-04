---
title: "@venizia/ignis/socket-io"
description: "Every export of @venizia/ignis/socket-io, from the built declarations (generated)."
---

# `@venizia/ignis/socket-io`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `SocketIOBindingKeys`

*class*

Container keys of the Socket.IO component: the server instance, its options, the Redis connection and the handlers an application binds.

```ts
export declare class SocketIOBindingKeys {
    static readonly SOCKET_IO_INSTANCE = "@app/socket-io/instance";
    static readonly SERVER_OPTIONS = "@app/socket-io/server-options";
    static readonly REDIS_CONNECTION = "@app/socket-io/redis-connection";
    static readonly AUTHENTICATE_HANDLER = "@app/socket-io/authenticate-handler";
    static readonly VALIDATE_ROOM_HANDLER = "@app/socket-io/validate-room-handler";
    static readonly CLIENT_CONNECTED_HANDLER = "@app/socket-io/client-connected-handler";
}
```

Source: `packages/core-server/src/components/socket-io/common/keys.ts`

## `SocketIOComponent`

*class*

Starts a Socket.IO server on Bun after the application starts. Requires a Redis helper at `SocketIOBindingKeys.REDIS_CONNECTION` and an authenticate handler at `AUTHENTICATE_HANDLER`; binding throws without them.

```ts
export declare class SocketIOComponent extends BaseComponent {
    private application;
    protected serverOptions: Partial<IServerOptions>;
    constructor(application: BaseApplication);
    private resolveBindings;
    private registerBunHook;
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/socket-io/component.ts`
