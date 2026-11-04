---
title: "@venizia/ignis-helpers/socket-io"
description: "Every export of @venizia/ignis-helpers/socket-io, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/socket-io`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

11 exports, 11 with TSDoc. 5 more are re-exported from other entries (listed at the end).

## `IHandshake`

*interface*

Handshake data of a connecting Socket.IO client; passed to the authenticate hook.

```ts
export interface IHandshake {
    headers: IncomingHttpHeaders;
    time: string;
    address: string;
    xdomain: boolean;
    secure: boolean;
    issued: number;
    url: string;
    query: ParsedUrlQuery;
    auth: {
        [key: string]: any;
    };
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/client.ts`

## `ISocketIOClient`

*interface*

A connected Socket.IO client as tracked by the server helper, with its authentication state and timers.

```ts
export interface ISocketIOClient {
    id: string;
    socket: IOSocket;
    state: TSocketIOClientState;
    interval?: NodeJS.Timeout;
    authenticateTimeout?: NodeJS.Timeout;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/client.ts`

## `ISocketIOServerBaseOptions`

*interface*

Options shared by every Socket.IO server runtime. `authenticateTimeout` and `pingInterval` are milliseconds.

```ts
export interface ISocketIOServerBaseOptions {
    identifier: string;
    serverOptions: Partial<ServerOptions>;
    redisConnection: IRedisHelper;
    /** @default [SocketIOConstants.ROOM_DEFAULT, SocketIOConstants.ROOM_NOTIFICATION] */
    defaultRooms?: string[];
    /** @default 10_000 */
    authenticateTimeout?: number;
    /** @default 30_000 */
    pingInterval?: number;
    authenticateFn: TSocketIOAuthenticateFn;
    validateRoomFn?: TSocketIOValidateRoomFn;
    clientConnectedFn?: TSocketIOClientConnectedFn;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/server.ts`

## `ISocketIOServerBunOptions`

*interface*

Socket.IO server options for the Bun runtime; `engine` is a `@socket.io/bun-engine` server instance.

```ts
export interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
    runtime: typeof RuntimeModules.BUN;
    engine: any;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/server.ts`

## `SocketIOClientHelper`

*class*

The socket.io client for a server or a CLI: the browser-pure helper, plus a `socket.io-client`
found in the app's `node_modules` when no `module` is handed in. A browser bundle imports
`@venizia/ignis-helpers/socket-io/client` instead, which has no node dependency.

```ts
export declare class SocketIOClientHelper extends BrowserSocketIOClientHelper {
    protected resolveModule(): typeof import('socket.io-client');
}
```

Source: `packages/helpers/src/modules/socket/socket-io/client/helper.ts`

## `SocketIOServerHelper`

*class*

Socket.IO server over a Redis adapter. Clients must authenticate through `authenticateFn` within `authenticateTimeout` and are pinged every `pingInterval`.

```ts
export declare class SocketIOServerHelper extends BaseHelper {
    private runtime;
    private bunEngine?;
    private serverOptions;
    private io;
    private emitter;
    private clients;
    private redisPub;
    private redisSub;
    private redisEmitter;
    private authenticateFn;
    private validateRoomFn?;
    private onClientConnected?;
    private authenticateTimeout;
    private pingInterval;
    private defaultRooms;
    constructor(opts: TSocketIOServerOptions);
    private setRuntime;
    private initRedisClients;
    getIOServer(): IOServer;
    /** Handlers run inside socket.io event listeners - a sync throw there kills the process; voidExecution only catches promise rejections since its argument evaluates before the try/catch. */
    protected invokeHook(opts: {
        scope: string;
        execution: () => ValueOrPromise<void>;
    }): void;
    getEngine(): any;
    getClients(opts?: {
        id?: string;
    }): ISocketIOClient | Map<string, ISocketIOClient> | undefined;
    on<HandlerArgsType extends unknown[] = unknown[], HanderReturnType = void>(opts: {
        topic: string;
        handler: (...args: HandlerArgsType) => ValueOrPromise<HanderReturnType>;
    }): void;
    configure(): Promise<void>;
    private initIOServer;
    onClientConnect(opts: {
        socket: IOSocket;
    }): void;
    private registerAuthHandler;
    private rejectClient;
    onClientAuthenticated(opts: {
        socket: IOSocket;
    }): void;
    /**
     * Narrows an untrusted room payload to the strings it actually contains.
     *
     * The listeners below run on data any authenticated client sends. Destructuring `{ rooms = [] }`
     * out of an `any` and testing `rooms?.length` accepts a STRING - `{"rooms":"lobby"}` has a
     * length of 5 - and the next line calls `rooms.map`, which a string does not have. socket.io
     * dispatches on `process.nextTick` with no try/catch around the handler, so that TypeError
     * escapes as an uncaught exception and takes the process with it.
     */
    private static toRoomList;
    private registerRoomHandlers;
    ping(opts: {
        socket: IOSocket;
        doIgnoreAuth: boolean;
    }): void;
    disconnect(opts: {
        socket: IOSocket;
    }): void;
    send(opts: {
        destination?: string;
        payload: {
            topic: string;
            data: any;
        };
        doLog?: boolean;
        callback?: () => void;
    }): void;
    private close;
    shutdown(): Promise<void>;
}
```

Source: `packages/helpers/src/modules/socket/socket-io/server/helper.ts`

## `TSocketIOAuthenticateFn`

*type*

Decides whether a connecting client is authenticated from its handshake; resolves `true` to accept.

```ts
export type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/hooks.ts`

## `TSocketIOClientConnectedFn`

*type*

Called after a client has authenticated and been set up.

```ts
export type TSocketIOClientConnectedFn = (opts: {
    socket: IOSocket;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/hooks.ts`

## `TSocketIOClientState`

*type*

One of the `SocketIOClientStates` values.

```ts
export type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/client.ts`

## `TSocketIOServerOptions`

*type*

Options accepted by `SocketIOServerHelper`.

```ts
export type TSocketIOServerOptions = ISocketIOServerBunOptions;
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/server.ts`

## `TSocketIOValidateRoomFn`

*type*

Returns the subset of the requested `rooms` the socket may join.

```ts
export type TSocketIOValidateRoomFn = (opts: {
    socket: IOSocket;
    rooms: string[];
}) => ValueOrPromise<string[]>;
```

Source: `packages/helpers/src/modules/socket/socket-io/common/types/hooks.ts`

## Re-exported

- `IOptions` from [`@venizia/ignis-helpers/socket-io/client`](/references/api/venizia-ignis-helpers-socket-io-client)
- `ISocketIOClientOptions` from [`@venizia/ignis-helpers/socket-io/client`](/references/api/venizia-ignis-helpers-socket-io-client)
- `SocketIOClientStates` from [`@venizia/ignis-helpers/socket-io/client`](/references/api/venizia-ignis-helpers-socket-io-client)
- `SocketIOConstants` from [`@venizia/ignis-helpers/socket-io/client`](/references/api/venizia-ignis-helpers-socket-io-client)
- `TSocketIOEventHandler` from [`@venizia/ignis-helpers/socket-io/client`](/references/api/venizia-ignis-helpers-socket-io-client)
