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
    static readonly SOCKET_IO_INSTANCE: string & {
        readonly valueType?: ((value: SocketIOServerHelper) => void) | undefined;
    };
    static readonly SERVER_OPTIONS: string & {
        readonly valueType?: ((value: Partial<ServerOptions>) => void) | undefined;
    };
    static readonly REDIS_CONNECTION: string & {
        readonly valueType?: ((value: AbstractRedisHelper<import("@venizia/ignis-helpers").TRedisClient> | null) => void) | undefined;
    };
    static readonly AUTHENTICATE_HANDLER: string & {
        readonly valueType?: ((value: TSocketIOAuthenticateFn | null) => void) | undefined;
    };
    static readonly VALIDATE_ROOM_HANDLER: string & {
        readonly valueType?: ((value: TSocketIOValidateRoomFn | null) => void) | undefined;
    };
    static readonly CLIENT_CONNECTED_HANDLER: string & {
        readonly valueType?: ((value: TSocketIOClientConnectedFn | null) => void) | undefined;
    };
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
