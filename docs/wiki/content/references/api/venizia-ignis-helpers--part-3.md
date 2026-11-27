---
title: "@venizia/ignis-helpers (3 of 4)"
description: "Every export of @venizia/ignis-helpers, from the built declarations (generated)."
---

# `@venizia/ignis-helpers (3 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 4 of [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers).

## `IRedisSentinelHelperProps`

*interface*

Connection settings for Redis behind Sentinel. Top-level `username` and `password` are the data nodes' (master and replica) credentials; everything Sentinel-specific is in `sentinel`. Precedence (low -> high): the helper defaults, `redisOptions`, then the first-class fields; an auth field left unset falls back to `redisOptions`.

```ts
export interface IRedisSentinelHelperProps extends IRedisCredentials {
    name: string;
    /** The monitored group, which side to read, the Sentinel processes' own credentials and their addresses. `username` and `password` here are the Sentinel processes' (ioredis `sentinelUsername`, `sentinelPassword`), never the data nodes'. */
    sentinel: IRedisCredentials & {
        /** The group name in sentinel.conf (`sentinel monitor <masterName> ...`). Maps to ioredis `name`. */
        masterName: string;
        /** Connect to the master or to a replica. @default RedisSentinelRoles.MASTER */
        role?: TRedisSentinelRole;
        nodes: IRedisNode[];
    };
    /** @default 0 */
    database?: number;
    /** @default true */
    autoConnect?: boolean;
    /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. @default RedisDefaults.MAX_RETRY (5) */
    maxRetry?: number;
    redisOptions?: Partial<RedisOptions>;
}
```

Source: `packages/helpers/src/modules/redis/sentinel/types.ts`

## `IRedisSet`

*interface*

Set commands (`SADD`, `SMEMBERS`, ...) on one key.

```ts
export interface IRedisSet {
    sAdd(opts: {
        key: string;
        members: Array<string | number>;
    }): Promise<number>;
    sRem(opts: {
        key: string;
        members: Array<string | number>;
    }): Promise<number>;
    sMembers(opts: {
        key: string;
    }): Promise<string[]>;
    sIsMember(opts: {
        key: string;
        member: string | number;
    }): Promise<boolean>;
    sCard(opts: {
        key: string;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisSingleHelperOptions`

*interface*

Options for `RedisSingleHelper`: connection props, lifecycle callbacks and an optional `ioredis` module.

```ts
export interface IRedisSingleHelperOptions extends IRedisSingleHelperProps, IRedisHelperCallbacks, IRedisModuleOption {
}
```

Source: `packages/helpers/src/modules/redis/single/types.ts`

## `IRedisSingleHelperProps`

*interface*

Connection settings for a single Redis node.

```ts
export interface IRedisSingleHelperProps extends IRedisNode, IRedisCredentials {
    name: string;
    /** @default 0 */
    database?: number;
    /** @default true */
    autoConnect?: boolean;
    /** Reconnect attempts: `0` never reconnects, `-1` never gives up; any other value is refused. @default RedisDefaults.MAX_RETRY (5) */
    maxRetry?: number;
}
```

Source: `packages/helpers/src/modules/redis/single/types.ts`

## `IRedisSocketMessage`

*interface*

Internal Redis pub/sub message envelope

```ts
export interface IRedisSocketMessage<DataType = unknown> {
    serverId: string;
    type: TWebSocketMessageType;
    target?: string;
    event: string;
    data: DataType;
    exclude?: string[];
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/message.ts`

## `IRequestedRemark`

*interface*

A request remark: `id`, `url` and `method`, plus any extra keys.

```ts
export interface IRequestedRemark {
    id: string;
    url: string;
    method: string;
    [extra: string | symbol]: unknown;
}
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `ISecretHydrateEntry`

*interface*

A bundle at `path` to copy into environment variables; keys map by `prefix` or by explicit `keys`.

```ts
export interface ISecretHydrateEntry {
    path: string;
    prefix?: string;
    /** Explicit vaultKey -> envKey overrides. Takes precedence over `prefix`. */
    keys?: Record<string, string>;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/registration.ts`

## `ISecretLease`

*interface*

A dynamic, lease-bearing secret (e.g. Vault `database/creds/...`).

```ts
export interface ISecretLease {
    value: Record<string, string>;
    leaseId: string;
    ttlSeconds: number;
    renewable: boolean;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/lease.ts`

## `ISecretLeaseEntry`

*interface*

A leased secret at `path`, registered under the consumer binding `key`.

```ts
export interface ISecretLeaseEntry {
    /** Logical/binding key of the consuming datasource, e.g. 'datasources.postgres'. */
    key: string;
    path: string;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/registration.ts`

## `ISecretRotatable`

*interface*

A live consumer (pool holder) that rebuilds gracefully when its secret rotates.

```ts
export interface ISecretRotatable {
    onSecretRotated(opts: {
        key: string;
        secret: Record<string, string>;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/lease.ts`

## `ISecretRotationEvent`

*interface*

Passed to rotation handlers: the `key` that rotated and its new lease.

```ts
export interface ISecretRotationEvent {
    key: string;
    lease: ISecretLease;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/lease.ts`

## `ISecretsHelper`

*interface*

Contract of a secrets provider: cached reads, dynamic leases with rotation handlers, and shutdown.

```ts
export interface ISecretsHelper extends IConfigurable {
    /** The value of `key` (the whole bundle without one), or `defaultValue`. Check what you read. */
    get(opts: IGetSecretOptions<unknown>): Promise<unknown>;
    getBundle(opts: {
        path: string;
    }): Promise<Record<string, string>>;
    lease(opts: {
        path: string;
        key: string;
    }): Promise<ISecretLease>;
    onRotate(handler: TSecretRotationHandler): void;
    registerRotatable(opts: {
        key: string;
        target: ISecretRotatable;
    }): void;
    shutdown(): Promise<void>;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/helper.ts`

## `ISecretsHelperOptions`

*interface*

Constructor options of a secrets provider. `clock` and `timers` can be replaced in tests.

```ts
export interface ISecretsHelperOptions {
    scope: string;
    identifier?: string;
    /**
     * TTL in seconds of the get/getBundle cache.
     *
     * @default 300
     */
    cacheTtlSeconds?: number;
    /**
     * Renew a lease at ttl * ratio; must be within (0, 1].
     *
     * @default 0.66
     */
    renewBeforeRatio?: number;
    clock?: IClock;
    timers?: ITimerAdapter;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/helper.ts`

## `isPromiseLike`

*const*

Check if a value is a promise.

```ts
export declare const isPromiseLike: <T>(value: T | PromiseLike<T>) => value is PromiseLike<T>;
```

Source: `packages/helpers/src/utilities/promise.utility.ts`

## `isRedisHelper`

*const*

Brand check, never `instanceof`: two installed copies of this package are two distinct classes, so a helper built by one is rejected by the other. `Symbol.for` is realm-keyed and survives that.

```ts
export declare const isRedisHelper: (value: unknown) => value is AbstractRedisHelper;
```

Source: `packages/helpers/src/modules/redis/base/abstract.helper.ts`

## `IStorageHelper`

*interface*

The contract every storage backend (disk, in-memory, S3) implements. Buckets and objects are addressed by `IBucketRef` and `IObjectRef`.

```ts
export interface IStorageHelper {
    /** The backend this helper writes to. The helpers IGNIS ships declare it; a custom helper may leave it out. */
    readonly storageType?: TStorageType;
    isValidSegment(opts: {
        segment: string;
    }): boolean;
    isValidBucketName(opts: {
        bucket: IBucketRef;
    }): boolean;
    isValidObjectKey(opts: {
        object: IObjectRef;
        maxDepth?: number;
    }): boolean;
    hasBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    getBuckets(): Promise<IBucketInfo[]>;
    getBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    createBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    removeBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    getObject(opts: IObjectLocation & {
        options?: unknown;
    }): Promise<Readable>;
    /** A web stream, what a `Response` body wants. `range` includes `end`, like the HTTP header. */
    getObjectStream(opts: TObjectStreamOptions): Promise<ReadableStream<Uint8Array>>;
    getStat(opts: IObjectLocation): Promise<IFileStat>;
    listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
    upload(opts: IUploadOptions): Promise<IUploadResult[]>;
    /**
     * Writes an object from a stream, so a large body never lands in this process. A backend whose
     * transport takes a stream overrides it; the default buffers, which is the thing to avoid.
     */
    writeStream(opts: IWriteStreamOptions): Promise<void>;
    /** Copies within one bucket, server side - the bytes never travel through this process. */
    copyObject(opts: ICopyObjectOptions): Promise<void>;
    removeObject(opts: IObjectLocation): Promise<void>;
    removeObjects(opts: {
        bucket: IBucketRef;
        objects: IObjectRef[];
    }): Promise<void>;
    /**
     * The form a browser posts straight to the storage, good for exactly ONE object: the policy signs
     * `object.key` as it stands, and `formData` carries that key, so the client does not add it.
     * Unlike a presigned PUT, a policy carries `content-length-range`, so "at most N bytes" is
     * expressible - a signed PUT binds the length to one exact value.
     */
    presignPost(opts: IPresignPostOptions): Promise<IPostPolicy>;
    /** A URL a browser may PUT one object to. Every option is SIGNED; a pinned size is exact, never a ceiling - for a ceiling use {@link IStorageHelper.presignPost}. */
    presignPut(opts: IPresignPutOptions): Promise<string>;
    presignGet(opts: IPresignGetOptions): Promise<string>;
    getObjectTags(opts: IObjectLocation): Promise<Record<string, string>>;
    replaceObjectTags(opts: IObjectLocation & {
        tags: Record<string, string>;
    }): Promise<void>;
    getMediaType(opts: {
        mimeType: string;
    }): string;
    getMimeType(opts: {
        filename: string;
    }): string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IStorageHelperOptions`

*interface*

Logger `scope` and `identifier` for a storage helper.

```ts
export interface IStorageHelperOptions {
    scope?: string;
    identifier?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IStorageReadCondition`

*interface*

What a read may require of the object: its ETag, or an exact version. A read that finds other content fails with `StorageErrors.PRECONDITION_FAILED`. A backend that cannot honour it refuses the read.

```ts
export interface IStorageReadCondition {
    ifMatch?: string;
    versionId?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `ISystemEnvsSecretsRegistration`

*interface*

Registers the process environment as the provider; it takes no `config`.

```ts
export interface ISystemEnvsSecretsRegistration extends ISecretsRegistrationBase {
    provider: typeof SecretProviders.SYSTEM_ENVS;
    config?: undefined;
}

/** What every registration carries, whatever its provider. */
interface ISecretsRegistrationBase {
    hydrate?: Array<ISecretHydrateEntry>;
    lease?: Array<ISecretLeaseEntry>;
    /**
     * Renew a lease at ttl * ratio.
     *
     * @default 0.66
     */
    renewBeforeRatio?: number;
    /**
     * TTL (seconds) for the static get/getBundle cache.
     *
     * @default 300
     */
    cacheTtlSeconds?: number;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/registration.ts`

## `ITcpSocketClient`

*interface*

A client connected to `BaseNetworkTcpServer`: its `id`, `socket`, authentication `state`, `subscriptions` and `storage` (connect and authenticate times, the pending authenticate timer).

```ts
export interface ITcpSocketClient<SocketClientType> {
    id: string;
    socket: SocketClientType;
    state: TTcpClientState;
    subscriptions: Set<string>;
    storage: {
        connectedAt: Date;
        authenticatedAt: Date | null;
        authenticateTimeout?: ReturnType<typeof setTimeout> | null;
        [additionField: symbol | string]: unknown;
    };
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`

## `ITcpSocketServerOptions`

*interface*

Options of `BaseNetworkTcpServer`. With `authenticateOptions.required`, `duration` (milliseconds, greater than 0) is how long a client has to authenticate before its socket is ended; the constructor throws without it. `createServerFn` builds the server, so one class serves plain and TLS.

```ts
export interface ITcpSocketServerOptions<SocketServerOptions extends ServerOpts = ServerOpts, SocketServerType extends SocketServer = SocketServer, SocketClientType extends SocketClient = SocketClient> {
    scope?: string;
    identifier: string;
    serverOptions: Partial<SocketServerOptions>;
    listenOptions: Partial<ListenOptions>;
    authenticateOptions: {
        required: boolean;
        duration?: number;
    };
    extraEvents?: Record<string, (opts: {
        id: string;
        socket: SocketClientType;
        args: unknown;
    }) => ValueOrPromise<void>>;
    createServerFn: (options: Partial<SocketServerOptions>, connectionListener: (socket: SocketClientType) => void) => SocketServerType;
    onServerReady?: (opts: {
        server: SocketServerType;
    }) => void;
    onClientConnected?: (opts: {
        id: string;
        socket: SocketClientType;
    }) => void;
    onClientData?: (opts: {
        id: string;
        socket: SocketClientType;
        data: Buffer | string;
    }) => void;
    onClientClose?: (opts: {
        id: string;
        socket: SocketClientType;
    }) => void;
    onClientError?: (opts: {
        id: string;
        socket: SocketClientType;
        error: Error;
    }) => void;
    onServerError?: (opts: {
        server: SocketServerType;
        error: Error;
    }) => void;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`

## `ITimerAdapter`

*interface*

Injectable timer seam so tests fire renewals without real waits.

```ts
export interface ITimerAdapter {
    set(handler: () => void, ms: number): TTimerHandle;
    clear(handle: TTimerHandle): void;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/timer.ts`

## `IUploadFile`

*interface*

One file handed to `upload`. `buffer` is the whole body; `folderPath`, when set, nests the object under that folder and is depth-checked.

```ts
export interface IUploadFile {
    originalName: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
    encoding?: string;
    folderPath?: string;
    [key: string | symbol]: unknown;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IUploadOptions`

*interface*

`upload`: the files, and the rules their names and keys must meet.

```ts
export interface IUploadOptions {
    bucket: IBucketRef;
    files: IUploadFile[];
    /**
     * Folders the caller's `folderPath` may carry.
     *
     * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
     */
    maxFolderDepth?: number;
    /**
     * Folders the finished key may carry, a scope the `normalizeNameFn` adds included.
     *
     * @default `maxFolderDepth`
     */
    maxKeyDepth?: number;
    normalizeNameFn?: (opts: {
        file: TUploadNaming;
    }) => string;
    normalizeLinkFn?: (opts: IObjectLocation) => string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IUploadResult`

*interface*

`metaLink` is a union: the old pair allowed both present, or neither.

```ts
export interface IUploadResult {
    bucket: IBucketRef;
    object: IObjectRef & {
        size: number;
        contentType: string;
    };
    link: string;
    metaLink?: {
        data: unknown;
    } | {
        error: string;
    };
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IWebSocket`

*interface*

The subset of a Bun server WebSocket the helpers use; `data` holds the per-connection data attached at upgrade.

```ts
export interface IWebSocket<T = unknown> {
    readonly data: T;
    readonly remoteAddress: string;
    readonly readyState: number;
    send(data: string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView, compress?: boolean): number;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    isSubscribed(topic: string): boolean;
    close(code?: number, reason?: string): void;
    cork(callback: (ws: IWebSocket<T>) => void): void;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/client.ts`

## `IWebSocketClient`

*interface*

A connected WebSocket client as tracked by the server helper. `connectedAt` and `lastActivity` are timestamps; `backpressured` is set while the socket cannot accept more data.

```ts
export interface IWebSocketClient<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
    id: string;
    userId?: string;
    socket: IWebSocket;
    state: TWebSocketClientState;
    rooms: Set<string>;
    backpressured: boolean;
    encrypted: boolean;
    connectedAt: number;
    lastActivity: number;
    metadata?: MetadataType;
    serverPublicKey?: string;
    salt?: string;
    authTimer?: ReturnType<typeof setTimeout>;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/client.ts`

## `IWebSocketData`

*interface*

Per-connection data attached to a socket when it is upgraded, linking it back to its client record.

```ts
export interface IWebSocketData<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
    clientId: string;
    userId?: string;
    metadata?: MetadataType;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/client.ts`

## `IWebSocketEmitterOptions`

*interface*

Options for `WebSocketEmitter`.

```ts
export interface IWebSocketEmitterOptions {
    identifier?: string;
    redisConnection: IRedisHelper;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IWebSocketMessage`

*interface*

Client &lt;-> Server message envelope

```ts
export interface IWebSocketMessage<DataType = unknown> {
    event: string;
    data?: DataType;
    id?: string;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/message.ts`

## `IWebSocketRecordAuthOptions`

*interface*

Authentication without a schema: the hooks receive the object the client sent.

```ts
export interface IWebSocketRecordAuthOptions<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
    authenticate: {
        schema?: undefined;
        fn: TWebSocketAuthenticateFn<Record<string, unknown>, MetadataType>;
    };
    /** Required when `requireEncryption` is true. */
    handshake?: {
        fn: TWebSocketHandshakeFn;
    };
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `IWebSocketSchemaAuthOptions`

*interface*

Authentication checked by a schema: the server refuses what `schema` refuses, and the hooks receive what it answers.

```ts
export interface IWebSocketSchemaAuthOptions<AuthDataType extends Record<string, unknown>, MetadataType extends Record<string, unknown> = Record<string, unknown>> {
    authenticate: {
        schema: z.ZodType<AuthDataType>;
        fn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
    };
    /** Required when `requireEncryption` is true. */
    handshake?: {
        fn: TWebSocketHandshakeFn<AuthDataType>;
    };
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `IWebSocketServerBaseOptions`

*interface*

The options of `WebSocketServerHelper` that do not concern authentication. Timeouts and intervals are milliseconds.

```ts
export interface IWebSocketServerBaseOptions<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
    identifier: string;
    /** @default '/ws' */
    path?: string;
    redisConnection: IRedisHelper;
    server: IBunServer;
    /** @default [WebSocketDefaults.ROOM, WebSocketDefaults.NOTIFICATION_ROOM] */
    defaultRooms?: string[];
    serverOptions?: IBunWebSocketConfig;
    /**
     * Time a client has to authenticate before it is disconnected.
     *
     * @default 5_000
     */
    authTimeout?: number;
    /**
     * Time between heartbeats.
     *
     * @default 30_000
     */
    heartbeatInterval?: number;
    /**
     * Time without a heartbeat before the client is disconnected (3 missed heartbeats at the default interval).
     *
     * @default 90_000
     */
    heartbeatTimeout?: number;
    /**
     * Maximum concurrent encryption operations.
     *
     * @default 10
     */
    encryptedBatchLimit?: number;
    /**
     * When true, clients must complete the handshake during authentication or are rejected (4004).
     *
     * @default false
     */
    requireEncryption?: boolean;
    validateRoomFn?: TWebSocketValidateRoomFn;
    clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
    clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
    messageHandler?: TWebSocketMessageHandler;
    outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IWorker`

*interface*

A managed `Worker` and the hooks fired for its lifecycle events.

```ts
export interface IWorker<MessageType> {
    worker: Worker;
    options: WorkerOptions;
    onOnline(): ValueOrPromise<void>;
    onExit(opts: {
        code: string | number;
    }): ValueOrPromise<void>;
    onError(opts: {
        error: Error;
    }): ValueOrPromise<void>;
    onMessage(opts: {
        message: MessageType;
    }): ValueOrPromise<void>;
    onMessageError(opts: {
        error: Error;
    }): ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/worker-thread/common/types.ts`

## `IWorkerBus`

*interface*

A message channel over a `MessagePort`: `handler` receives incoming messages, `postMessage` sends outgoing ones, with optional hooks around each send.

```ts
export interface IWorkerBus<IConsumePayload, IPublishPayload> {
    port: MessagePort;
    handler: IWorkerMessageBusHandler<IConsumePayload>;
    onBeforePostMessage?(opts: {
        message: IPublishPayload;
    }): ValueOrPromise<void>;
    onAfterPostMessage?(opts: {
        message: IPublishPayload;
    }): ValueOrPromise<void>;
    postMessage(opts: {
        message: IPublishPayload;
        transferList: readonly Transferable[] | undefined;
    }): ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/worker-thread/common/types.ts`

## `IWorkerMessageBusHandler`

*interface*

The callbacks a bus invokes for the events of its port.

```ts
export interface IWorkerMessageBusHandler<IConsumePayload> {
    onMessage: (opts: {
        message: IConsumePayload;
    }) => ValueOrPromise<void>;
    onClose: () => ValueOrPromise<void>;
    onError: (opts: {
        error: Error;
    }) => ValueOrPromise<void>;
    onExit: (opts: {
        exitCode: number | string;
    }) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/worker-thread/common/types.ts`

## `IWorkerThread`

*interface*

Message buses held by a worker thread, keyed by name.

```ts
export interface IWorkerThread {
    buses: {
        [workerKey: string | symbol]: IWorkerBus<never, never>;
    };
}
```

Source: `packages/helpers/src/modules/worker-thread/common/types.ts`

## `IWriteStreamOptions`

*interface*

`writeStream`: one object written from a stream, so a large body never lands in this process.

```ts
export interface IWriteStreamOptions extends IObjectLocation {
    source: ReadableStream<Uint8Array> | Blob | Response | Request;
    contentType?: string;
    /**
     * Folder nesting the key may carry, as `upload` takes it.
     *
     * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
     */
    maxFolderDepth?: number;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `LEADING_OR_TRAILING_HYPHENS_PATTERN`

*const*

Matches hyphens at the start or end of a string, so replacing it with an empty string trims them.

```ts
export declare const LEADING_OR_TRAILING_HYPHENS_PATTERN: RegExp;
```

Source: `packages/helpers/src/modules/slug/common/constants.ts`

## `LogFormatUtility`

*class*

Renders a log message and its arguments to one string, redacting secret keys and inspecting objects to a bounded depth (`APP_ENV_LOGGER_INSPECT_DEPTH`, default 5).

```ts
export declare class LogFormatUtility {
    private static resolveDepth;
    private static buildInspectOptions;
    /** Formats like `util.format`, but `%s` inspects to configured depth instead of Node's hard-coded `depth: 0` (no inspect option overrides that), and `%j` is projected into a JSON-safe shape first. Per-placeholder only - handing `%j` the widened STRING would emit a JSON-quoted inspect dump instead of an object. */
    static formatMessage(opts: {
        message: string;
        args: Array<unknown>;
        inspectOptions?: util.InspectOptions;
    }): string;
}
```

Source: `packages/helpers/src/modules/logger/formatting/deep-splat.ts`

## `LoggerConfigUtility`

*class*

Resolves logger settings (level, color) from configured values and the environment.

```ts
export declare class LoggerConfigUtility {
    /** The logger's own level, below which a line never reaches ANY transport. Defaults to `debug` - level gating belongs to the wrapper and each transport, and a stricter default here would silently drop lines the wrapper already let through. */
    static resolveLevel(opts: {
        configured?: string;
    }): TLogLevel;
    /**
     * Whether log lines may carry ANSI color, resolved at CALL time. First match wins:
     *
     * 1. `APP_ENV_LOGGER_COLOR` - an explicit yes or no from the operator, in the words `ParseUtility.toBoolean` reads.
     * 2. `NO_COLOR`, set to anything non-empty - the no-color.org convention.
     * 3. `NODE_ENV` outside {@link Environment.DEVELOPMENT_ENVS} - production, staging, uat and any
     *    unrecognized name. Fail-closed, the same boundary the error sanitizer draws: colors are a
     *    terminal affordance, and in a deployed environment the same bytes land in a file or an
     *    aggregator as escape noise every grep then has to strip.
     *
     * `undefined` means the framework has no opinion, so a provider that detects a terminal itself
     * keeps deciding - which is why the pino path forwards nothing in that case.
     */
    static resolveColorize(opts?: {
        configured?: string;
        environment?: string;
    }): boolean | undefined;
}
```

Source: `packages/helpers/src/modules/logger/common/constants.ts`

## `LoggerDebugGate`

*class*

The rule that decides whether `debug` lines are written: off unless `DEBUG` is set to something but a false word and the environment is allowed
(`NODE_ENV` unset, or one of the common names, or one `APP_ENV_EXTRA_LOG_ENVS` adds). Every provider shares it, so a
console, a winston and a pino logger agree.

Pure: it takes the environment as an argument and reads `process` only through a guarded `globalThis` read, because a
browser has none and there the default is off. `LoggerFactory.use({ level })` overrides it.

```ts
export declare class LoggerDebugGate {
    /** The override lives on globalThis, so `use({ level })` in one copy of the module opens or closes debug in the other. */
    private static readonly FORCED_SLOT;
    private static resolved?;
    /**
     * A false word of a boolean setting, as `z.stringbool()` reads it, or a blank text; in any case, space around it
     * allowed. `ParseUtility` reads it too: it lives here because this module is in the graph of `BaseHelper`, in a
     * browser bundle with a byte ceiling. No two `\s*` meet, so a long header costs linear time.
     */
    static readonly FALSE_WORDS: RegExp;
    /** The environment the host has, `{}` where there is no `process`. */
    static readEnvironment(): TEnvironment;
    /**
     * The rule itself, for any environment: a pure function of `env`. `DEBUG` is a namespace pattern other libraries
     * share (`app:*`), not a boolean: only a blank value or a false word turns it off, and nothing is refused.
     */
    static evaluate(opts: {
        env: TEnvironment;
    }): boolean;
    /** Whether `debug` is written now: the override when `use` set one, else the rule on the host's environment, read once. */
    static isOpen(): boolean;
    /** `LoggerFactory.use({ level })` calls it: an explicit level turns debug on or off whatever the environment says. */
    static force(opts: {
        isOpen: boolean | undefined;
    }): void;
}

type TEnvironment = Record<string, string | undefined>;
```

Source: `packages/helpers/src/modules/logger/common/debug-gate.ts`

## `LoggerFormats`

*class*

Output shapes of a log line. `isValid` narrows a string to `TLoggerFormat`.

```ts
export declare class LoggerFormats extends ConstClass {
    static readonly JSON = "json";
    static readonly TEXT = "text";
}
```

Source: `packages/helpers/src/modules/logger/common/constants.ts`

## `MemoryStorageHelper`

*class*

An in-process keyed container, NOT an `IStorageHelper`: it stores values, not objects in a bucket.

```ts
export declare class MemoryStorageHelper<T extends object = Record<string, unknown>> extends BaseHelper {
    private container;
    constructor(opts?: {
        scope?: string;
    });
    static newInstance<T extends object = Record<string, unknown>>(): MemoryStorageHelper<T>;
    isBound(key: keyof T): boolean;
    get<K extends keyof T>(key: K): T[K] | undefined;
    set<K extends keyof T>(key: K, value: T[K]): void;
    /** `false` when the key was not bound, so a caller can tell a removal from a no-op. */
    unset(key: keyof T): boolean;
    keys(): Array<keyof T>;
    get size(): number;
    clear(): void;
    /** A COPY: handing out the live map let a caller mutate this helper's state behind its back. */
    getContainer(): Record<string, unknown>;
}
```

Source: `packages/helpers/src/modules/storage/in-memory/helper.ts`

## `MINIMUM_KDF_SALT_BYTES`

*const*

NIST SP 800-132 minimum recommended salt size (128 bits) for a caller-supplied `kdfSalt`.

```ts
export declare const MINIMUM_KDF_SALT_BYTES = 16;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `MINIMUM_RSA_MODULUS_BITS`

*const*

NIST SP 800-57 Part 1 floor for RSA past 2030.

```ts
export declare const MINIMUM_RSA_MODULUS_BITS = 2048;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `ModuleUtility`

*class*

Loads an optional peer without letting `Bun.build` see it: every specifier stays a parameter, so there is no literal (nor a `minify.syntax`-folded const) for the bundler to resolve.

```ts
export declare class ModuleUtility {
    /**
     * Peers handed over by the application, keyed by specifier. Checked before any filesystem lookup. The map lives in a globalThis slot because a process (or a compiled bundle) can carry two copies of this module, and a peer registered through one copy must be found by the other.
     *
     * The one deliberate `any` of this class: a module's shape is whatever the peer is, and `load<T>`/`loadSync<T>` hand it back as the `T` the caller names, as `import()` and `require()` do (both answer `any`).
     */
    private static readonly registered;
    private static sharedRegistry;
    /** Called by the application once it knows its root (`configs.projectRoot` or the cwd); every peer lookup below follows it. Delegates to `ProjectRootRegistry`, which a browser Worker host reaches too through `/core` - the two must share ONE slot. */
    static setProjectRoot(opts: {
        projectRoot: string;
    }): void;
    static getProjectRoot(): string;
    /** Resolves peers against the APP's node_modules (under the project root), not this package's own `dist/` location. */
    private static appRequire;
    private static fail;
    /**
     * Hands the framework a peer the application already holds, so no filesystem lookup is needed.
     * A `bun build --compile` binary ships without `node_modules`, which leaves runtime resolution
     * nothing to resolve against: the application imports such a peer statically - that import is
     * what gets it into the binary - and registers it here before the consuming component boots.
     *
     * Deliberately does not log. It runs at the entrypoint of exactly the deployment that has no
     * logger provider yet, where `LoggerFactory` throws - and a throw mid-loop would drop every
     * module after the first.
     */
    static register(opts: {
        modules: Record<string, unknown>;
    }): void;
    /**
     * The file `module` resolves to from the project root under the ES module conditions (`import`), so
     * the peer is the very instance an application's own `import` of it gets. `undefined` when it does not
     * resolve there or the runtime has no resolver: the caller falls back to a plain `import()`.
     */
    private static resolveEsmFile;
    /**
     * Loads the module as an ES module, resolved from the project root: a peer that ships both builds
     * (`bullmq`, `socket.io-client`) is loaded as the copy the application's own `import` gets, not a second
     * one. A module handed over with {@link register} wins; one that does not resolve from the project root is
     * imported by name as before. Use this everywhere except a constructor, which cannot await - see {@link preload}.
     */
    static load<T = unknown>(opts: {
        module: string;
    }): Promise<T>;
    /**
     * The explicit register path for what a constructor needs: loads each module with {@link load} and
     * registers it, so the synchronous {@link loadSync} returns that ES module copy afterwards. Call it once
     * at the entrypoint, before the helpers are constructed. A module already registered is kept; every module
     * is loaded before any is registered, so one that is missing registers nothing.
     */
    static preload(opts: {
        modules: Array<string>;
    }): Promise<void>;
    /**
     * Sync twin of {@link load}, for a constructor or any path that cannot await. It resolves with
     * `require`, so a peer that ships both builds comes back as its CommonJS copy - a second instance next to
     * the one an application's `import` holds, and `instanceof` across the two fails. `await preload(...)` at the
     * entrypoint registers the ES module copy first, and this returns that.
     */
    static loadSync<T = unknown>(opts: {
        module: string;
    }): T;
    /**
     * Presence check only - throws naming what to install, without executing the module.
     *
     * `allowRegistered` must be set only where {@link load} or {@link loadSync} is what finally loads
     * the module. Where the consumer resolves the specifier itself - `pino.transport()` inside a
     * worker thread, or any caller with its own `createRequire` - the registry cannot reach it, and
     * counting a registration as installed would replace this precise error with an opaque one.
     */
    static assertInstalled(opts: {
        modules: Array<string>;
        scope?: string;
        allowRegistered?: boolean;
    }): void;
}
```

Source: `packages/helpers/src/utilities/module.utility.ts`

## `MultipartStorages`

*class*

Where `RequestUtility.parseMultipartBody` keeps an uploaded file: MEMORY (a buffer) or DISK (spooled to `uploadDir`).

```ts
export declare class MultipartStorages extends ConstClass {
    static readonly MEMORY = "memory";
    static readonly DISK = "disk";
}
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `NetworkTcpClient`

*class*

`BaseNetworkTcpClient` over a plain `node:net` socket.

```ts
export declare class NetworkTcpClient extends BaseNetworkTcpClient<TcpSocketConnectOpts, Socket> {
    constructor(opts: Omit<INetworkTcpClientProps<TcpSocketConnectOpts, Socket>, 'createClientFn'>);
    static newInstance(opts: Omit<INetworkTcpClientProps<TcpSocketConnectOpts, Socket>, 'createClientFn'>): NetworkTcpClient;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/network-tcp-client.helper.ts`

## `NetworkTcpServer`

*class*

Plain TCP server (`node:net`) on top of the shared base server; adds no behavior of its own.

```ts
export declare class NetworkTcpServer extends BaseNetworkTcpServer<ServerOpts, SocketServer, SocketClient> {
    constructor(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>);
    static newInstance(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>): NetworkTcpServer;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/network-tcp-server.helper.ts`

## `NetworkTlsTcpClient`

*class*

TLS TCP client (`node:tls` `connect`) on top of the shared base client; `options` are `tls.ConnectionOptions`.

```ts
export declare class NetworkTlsTcpClient extends BaseNetworkTcpClient<ConnectionOptions, TLSSocket> {
    constructor(opts: Omit<INetworkTcpClientProps<ConnectionOptions, TLSSocket>, 'createClientFn'>);
    static newInstance(opts: Omit<INetworkTcpClientProps<ConnectionOptions, TLSSocket>, 'createClientFn'>): NetworkTlsTcpClient;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-client.helper.ts`

## `NetworkTlsTcpServer`

*class*

TLS TCP server (`node:tls`) on top of the shared base server; `serverOptions` are `tls.TlsOptions`.

```ts
export declare class NetworkTlsTcpServer extends BaseNetworkTcpServer<TlsOptions, Server, SocketClient> {
    constructor(opts: TTlsTcpServerOptions);
    static newInstance(opts: TTlsTcpServerOptions): NetworkTlsTcpServer;
}

type TTlsTcpServerOptions = Omit<ITcpSocketServerOptions<TlsOptions, Server, SocketClient>, 'createServerFn'>;
```

Source: `packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-server.helper.ts`

## `NetworkUdpClient`

*class*

UDP (`udp4`) socket that binds to `host`/`port` and optionally joins multicast groups.
Port `0` asks the OS for a port; a negative or non-integer port is logged and ignored. Without `onConnected`/`onData`/`onClosed`/`onError`, the built-in handlers log.

```ts
export declare class NetworkUdpClient extends BaseHelper {
    private host?;
    private port;
    private reuseAddr?;
    private multicastAddress?;
    private onConnected;
    private onData;
    private onClosed?;
    private onError?;
    private onBind?;
    private client?;
    constructor(opts: INetworkUdpClientProps);
    static newInstance(opts: INetworkUdpClientProps): NetworkUdpClient;
    getClient(): dgram.Socket | null | undefined;
    handleConnected(): void;
    handleData(opts: {
        identifier: string;
        message: string | Buffer;
        remoteInfo: dgram.RemoteInfo;
    }): void;
    handleClosed(): void;
    handleError(opts: {
        identifier: string;
        error: Error;
    }): void;
    connect(): void;
    private invokeHook;
    disconnect(): void;
    isConnected(): dgram.Socket | null | undefined;
}

interface INetworkUdpClientProps {
    identifier: string;
    host?: string;
    port: number;
    reuseAddr?: boolean;
    multicastAddress?: {
        groups?: Array<string>;
        interface?: string;
    };
    onConnected?: (opts: {
        identifier: string;
        host?: string;
        port: number;
    }) => void;
    onData?: (opts: {
        identifier: string;
        message: string | Buffer;
        remoteInfo: dgram.RemoteInfo;
    }) => void;
    onClosed?: (opts: {
        identifier: string;
        host?: string;
        port: number;
    }) => void;
    onError?: (opts: {
        identifier: string;
        host?: string;
        port: number;
        error: Error;
    }) => void;
    onBind?: (opts: {
        identifier: string;
        socket: dgram.Socket;
        host?: string;
        port: number;
        reuseAddr?: boolean;
        multicastAddress?: {
            groups?: Array<string>;
            interface?: string;
        };
    }) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts`

## `NON_SLUG_CHARACTERS_PATTERN`

*const*

Any run of characters outside the slug alphabet collapses to one hyphen.

```ts
export declare const NON_SLUG_CHARACTERS_PATTERN: RegExp;
```

Source: `packages/helpers/src/modules/slug/common/constants.ts`

## `PropsWithChildren`

*type*

Kept out of the `./common` barrel because `hono/jsx` types reach DOM-dependent JSX intrinsics; `hono` is an optional peer, so a Worker or hono-less consumer of `./common` must not have this file in its type graph. Re-exported directly from the root barrel (`src/index.ts`) instead, so `Child`/`FC`/`PropsWithChildren` stay publicly reachable from `@venizia/ignis-helpers`.

```ts
type PropsWithChildren<P = unknown> = P & { children?: Child | undefined; }
```

## `QueueStatuses`

*class*

Lifecycle states of a sequential queue; the numeric prefix orders them.

```ts
export declare class QueueStatuses {
    static readonly WAITING = "000_WAITING";
    static readonly PROCESSING = "100_PROCESSING";
    static readonly LOCKED = "200_LOCKED";
    static readonly SETTLED = "300_SETTLED";
}
```

Source: `packages/helpers/src/modules/queue/internal/sequential/common/types.ts`

## `REDIS_HELPER_BRAND`

*const*

Registry symbol that marks an instance as a Redis helper; `isRedisHelper` tests for it.

```ts
export declare const REDIS_HELPER_BRAND: unique symbol;
```

Source: `packages/helpers/src/modules/redis/base/abstract.helper.ts`

## `RedisClusterHelper`

*class*

Redis helper over an ioredis `Cluster`. `autoConnect: false` creates the client with `lazyConnect`; `clusterOptions` is applied last and overrides the defaults.

```ts
export declare class RedisClusterHelper extends AbstractRedisHelper<Cluster> {
    private startupNodes;
    private clusterOpts;
    private ioredis;
    constructor(opts: IRedisClusterHelperOptions);
    duplicateClient(): Cluster;
}
```

Source: `packages/helpers/src/modules/redis/cluster/cluster.helper.ts`

## `RedisConcurrency`

*class*

Ceiling on a caller-sized fan-out over one connection; a burst larger than this queues rather than piles up.

```ts
export declare class RedisConcurrency {
    static readonly PUBLISH_LIMIT = 32;
}
```

Source: `packages/helpers/src/modules/redis/common/constants.ts`

## `RedisDefaults`

*class*

Reconnect defaults of a Redis helper.

```ts
export declare class RedisDefaults {
    /** The port of a data node when none is given. */
    static readonly PORT = 6379;
    /** Reconnect attempts before the helper gives up: `0` never reconnects, `RETRY_FOREVER` never stops. */
    static readonly MAX_RETRY = 5;
    static readonly RETRY_FOREVER = -1;
    /** The wait before reconnect attempt N, computed by `RetryUtility.computeBackoffDelayMs`. */
    static readonly RECONNECT_BACKOFF: {
        strategy: "exponential";
        initialDelayMs: number;
        multiplier: number;
        maxDelayMs: number;
        jitter: "equal";
    };
}
```

Source: `packages/helpers/src/modules/redis/common/constants.ts`
