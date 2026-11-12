---
title: "@venizia/ignis-helpers/socket-io/client"
description: "Every export of @venizia/ignis-helpers/socket-io/client, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/socket-io/client`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

6 exports, 5 with TSDoc.

Without TSDoc (1): `SocketIOClientHelper`.

## `IOptions`

*interface*

Connection options for the Socket.IO client helper: the `socket.io-client` options plus a required `path` and `extraHeaders`.

```ts
export interface IOptions extends SocketOptions {
    path: string;
    extraHeaders: Record<string, string>;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/client.ts`

## `ISocketIOClientOptions`

*interface*

Options for the Socket.IO client helper. The `on*` callbacks fire on the matching connection or authentication event.

```ts
export interface ISocketIOClientOptions {
    identifier: string;
    host: string;
    options: IOptions;
    /** `socket.io-client` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. Omitted, it is loaded on `configure()`. */
    module?: typeof import('socket.io-client');
    onConnected?: () => ValueOrPromise<void>;
    onDisconnected?: (reason: string) => ValueOrPromise<void>;
    onError?: (error: Error) => ValueOrPromise<void>;
    onAuthenticated?: () => ValueOrPromise<void>;
    onUnauthenticated?: (message: string) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/client.ts`

## `SocketIOClientHelper`

*class*

```ts
export declare class SocketIOClientHelper extends BaseHelper {
    private host;
    private options;
    private client;
    private state;
    private wrappedHandlers;
    private onConnected?;
    private onDisconnected?;
    private onError?;
    private onAuthenticated?;
    private onUnauthenticated?;
    protected readonly clientModule?: typeof import('socket.io-client');
    constructor(opts: ISocketIOClientOptions);
    /** The `socket.io-client` module to connect with. Here only the one handed in; a subclass may find one. */
    protected resolveModule(): typeof import('socket.io-client');
    getState(): TSocketIOClientState;
    configure(): void;
    getSocketClient(): Socket;
    authenticate(): void;
    subscribe<T = unknown>(opts: {
        event: string;
        handler: TSocketIOEventHandler<T>;
        ignoreDuplicate?: boolean;
    }): void;
    subscribeMany(opts: {
        events: Record<string, TSocketIOEventHandler>;
        ignoreDuplicate?: boolean;
    }): void;
    unsubscribe(opts: {
        event: string;
        handler?: TSocketIOEventHandler;
    }): void;
    unsubscribeMany(opts: {
        events: string[];
    }): void;
    connect(): void;
    disconnect(): void;
    emit<T = unknown>(opts: {
        topic: string;
        data: T;
        doLog?: boolean;
        callback?: () => void;
    }): void;
    joinRooms(opts: {
        rooms: string[];
    }): void;
    leaveRooms(opts: {
        rooms: string[];
    }): void;
    shutdown(): void;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/client/browser-helper.ts`

## `SocketIOClientStates`

*class*

Authentication states of a Socket.IO client. `isValid` narrows a string to one of them.

```ts
export declare class SocketIOClientStates {
    static readonly UNAUTHORIZED = "unauthorized";
    static readonly AUTHENTICATING = "authenticating";
    static readonly AUTHENTICATED = "authenticated";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TConstValue<typeof SocketIOClientStates>;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/constants.ts`

## `SocketIOConstants`

*class*

Event names and default room names used by the Socket.IO server and client helpers.

```ts
export declare class SocketIOConstants {
    static readonly EVENT_PING = "ping";
    static readonly EVENT_CONNECT = "connection";
    static readonly EVENT_DISCONNECT = "disconnect";
    static readonly EVENT_JOIN = "join";
    static readonly EVENT_LEAVE = "leave";
    static readonly EVENT_AUTHENTICATE = "authenticate";
    static readonly EVENT_AUTHENTICATED = "authenticated";
    static readonly EVENT_UNAUTHENTICATE = "unauthenticated";
    /** Every authenticated socket, and only those, is in this room: a send with no destination goes here, never to the whole server. */
    static readonly ROOM_AUTHENTICATED = "io-authenticated";
    static readonly ROOM_DEFAULT = "io-default";
    static readonly ROOM_NOTIFICATION = "io-notification";
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/constants.ts`

## `TSocketIOEventHandler`

*type*

Handler for a Socket.IO event, receiving the event payload.

```ts
export type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/hooks.ts`
