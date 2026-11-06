---
title: "@venizia/ignis-helpers"
description: "Every export of @venizia/ignis-helpers, from the built declarations (generated)."
---

# `@venizia/ignis-helpers`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

203 exports, 203 with TSDoc. 216 more are re-exported from other entries (listed at the end).

## `AbstractLogger`

*class*

The ILogger contract as a class - for instanceof and implementations sharing no plumbing.

```ts
export declare abstract class AbstractLogger implements ILogger {
    abstract debug(message: string, ...args: AnyType[]): void;
    abstract info(message: string, ...args: AnyType[]): void;
    abstract warn(message: string, ...args: AnyType[]): void;
    abstract error(message: string, ...args: AnyType[]): void;
    abstract emerg(message: string, ...args: AnyType[]): void;
    abstract log(level: TLogLevel, message: string, ...args: AnyType[]): void;
    abstract for(methodName: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/base/abstract.ts`

## `AbstractRedisHelper`

*class*

Base for the Redis helpers: wraps one ioredis client, logs its lifecycle events and forwards them to the `onInitialized`, `onConnected`, `onReady` and `onError` callbacks. Subclasses build the client.

```ts
export declare class AbstractRedisHelper<ClientType extends TRedisClient = TRedisClient> extends BaseHelper implements IRedisHelper {
    /** Read by {@link isRedisHelper}. On the instance, so every subclass instance carries it. */
    readonly [REDIS_HELPER_BRAND] = true;
    client: ClientType;
    readonly name: string;
    constructor(opts: {
        scope: string;
        identifier: string;
        client: ClientType;
    } & IRedisHelperCallbacks);
    protected static buildRetryStrategy(opts: {
        maxRetry: number;
    }): (attemptCounter: number) => number | undefined;
    protected static buildDefaultOpts(opts: {
        maxRetry: number;
    }): {
        showFriendlyErrorStack: boolean;
        maxRetriesPerRequest: null;
        retryStrategy: (attemptCounter: number) => number | undefined;
    };
    getClient(): ClientType;
    duplicateClient(): TRedisClient;
    ping(): Promise<"PONG">;
    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
    exists(opts: {
        keys: Array<string>;
    }): Promise<number>;
    expire(opts: {
        key: string;
        seconds: number;
    }): Promise<boolean>;
    expireAt(opts: {
        key: string;
        atEpochSeconds: number;
    }): Promise<boolean>;
    ttl(opts: {
        key: string;
    }): Promise<number>;
    persist(opts: {
        key: string;
    }): Promise<boolean>;
    incr(opts: {
        key: string;
    }): Promise<number>;
    decr(opts: {
        key: string;
    }): Promise<number>;
    incrBy(opts: {
        key: string;
        value: number;
    }): Promise<number>;
    decrBy(opts: {
        key: string;
        value: number;
    }): Promise<number>;
    set<T>(opts: {
        key: string;
        value: T;
        options?: {
            log?: boolean;
            expiresIn?: number;
        };
    }): Promise<void>;
    get<T = string>(opts: {
        key: string;
        transform?: (input: string) => T;
    }): Promise<T | null>;
    del(opts: {
        keys: Array<string>;
    }): Promise<number>;
    getString(opts: {
        key: string;
    }): Promise<string | null>;
    getStrings(opts: {
        keys: Array<string>;
    }): Promise<(string | null)[]>;
    getObject<T>(opts: {
        key: string;
    }): Promise<T | null>;
    getObjects(opts: {
        keys: Array<string>;
    }): Promise<any[]>;
    mSet<T>(opts: {
        payload: Array<{
            key: string;
            value: T;
        }>;
        options?: {
            log?: boolean;
        };
    }): Promise<void>;
    mGet<T = string>(opts: {
        keys: Array<string>;
        transform?: (input: string) => T;
    }): Promise<(T | null)[]>;
    keys(opts: {
        key: string;
    }): Promise<string[]>;
    hSet<T extends Record<string, unknown>>(opts: {
        key: string;
        value: T;
        options?: {
            log?: boolean;
        };
    }): Promise<number>;
    hGetAll(opts: {
        key: string;
        transform?: <T, R>(input: T) => R;
    }): Promise<unknown>;
    hGet(opts: {
        key: string;
        field: string;
    }): Promise<string | null>;
    hDel(opts: {
        key: string;
        fields: Array<string>;
    }): Promise<number>;
    hExists(opts: {
        key: string;
        field: string;
    }): Promise<boolean>;
    hKeys(opts: {
        key: string;
    }): Promise<string[]>;
    hVals(opts: {
        key: string;
    }): Promise<string[]>;
    hIncrBy(opts: {
        key: string;
        field: string;
        value: number;
    }): Promise<number>;
    hLen(opts: {
        key: string;
    }): Promise<number>;
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
    lPush(opts: {
        key: string;
        values: Array<string | number>;
    }): Promise<number>;
    rPush(opts: {
        key: string;
        values: Array<string | number>;
    }): Promise<number>;
    lPop(opts: {
        key: string;
    }): Promise<string | null>;
    rPop(opts: {
        key: string;
    }): Promise<string | null>;
    lRange(opts: {
        key: string;
        start: number;
        stop: number;
    }): Promise<string[]>;
    lLen(opts: {
        key: string;
    }): Promise<number>;
    jSet<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<string | null>;
    jGet<T>(opts: {
        key: string;
        path?: string;
    }): Promise<T | null>;
    jDelete(opts: {
        key: string;
        path?: string;
    }): Promise<number>;
    jNumberIncreaseBy(opts: {
        key: string;
        path: string;
        value: number;
    }): Promise<string | null>;
    jStringAppend(opts: {
        key: string;
        path: string;
        value: string;
    }): Promise<number[] | null>;
    jPush<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<number[] | null>;
    jPop<T>(opts: {
        key: string;
        path: string;
    }): Promise<T | null>;
    execute<R>(command: string, parameters?: Array<string | number | Buffer>): Promise<R>;
    publish<T>(opts: {
        topics: Array<string>;
        payload: T;
        useCompress?: boolean;
    }): Promise<void>;
    subscribe(opts: {
        topic: string;
    }): void;
    unsubscribe(opts: {
        topic: string;
    }): void;
}
```

Source: `packages/helpers/src/modules/redis/base/abstract.helper.ts`

## `AbstractSecretsHelper`

*class*

Base for secrets providers: caches bundles for `cacheTtlSeconds`, tracks leases and renews them at `renewBeforeRatio` of their TTL, and notifies rotation handlers. Subclasses implement `fetchRaw`, `renewRaw` and `revokeRaw`. The constructor throws when `renewBeforeRatio` is outside (0, 1].

```ts
export declare abstract class AbstractSecretsHelper extends BaseHelper implements ISecretsHelper {
    protected readonly clock: IClock;
    protected readonly timers: ITimerAdapter;
    protected readonly cacheTtlSeconds: number;
    protected readonly renewBeforeRatio: number;
    private readonly cache;
    private readonly leases;
    private readonly leasePaths;
    private readonly timerHandles;
    private readonly rotatables;
    private readonly rotateHandlers;
    private readonly backoffAttempts;
    private closed;
    constructor(opts: ISecretsHelperOptions);
    protected abstract fetchRaw(opts: {
        path: string;
    }): Promise<IRawFetchResult>;
    protected abstract renewRaw(opts: {
        leaseId: string;
        ttlSeconds: number;
    }): Promise<{
        ttlSeconds: number;
    } | null>;
    protected abstract revokeRaw(opts: {
        leaseId: string;
    }): Promise<void>;
    configure(): Promise<void>;
    getBundle(opts: {
        path: string;
    }): Promise<Record<string, string>>;
    get(opts: IGetSecretOptions<string>): Promise<string>;
    get<TValue>(opts: IGetSecretOptions<TValue>): Promise<TValue>;
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
    private writeCache;
    private evictExpiredCache;
    private clampDelayMs;
    private armTimer;
    private scheduleRenewal;
    private scheduleBackoffRetry;
    private handleRenewal;
    private rotate;
    private dispatchRotation;
}

interface IRawFetchResult {
    value: Record<string, string>;
    lease?: {
        leaseId: string;
        ttlSeconds: number;
        renewable: boolean;
    };
}
```

Source: `packages/helpers/src/modules/secrets/base/abstract.helper.ts`

## `AbstractWorkerBusHelper`

*class*

Base for a bus over a `MessagePort`: incoming messages go to `handler`, outgoing ones through `postMessage`.

```ts
export declare abstract class AbstractWorkerBusHelper<IConsumePayload, IPublishPayload> extends BaseHelper implements IWorkerBus<IConsumePayload, IPublishPayload> {
    port: MessagePort;
    handler: IWorkerMessageBusHandler<IConsumePayload>;
    abstract onBeforePostMessage?(opts: {
        message: IPublishPayload;
    }): ValueOrPromise<void>;
    abstract onAfterPostMessage?(opts: {
        message: IPublishPayload;
    }): ValueOrPromise<void>;
    abstract postMessage(opts: {
        message: IPublishPayload;
        transferList: readonly Transferable[] | undefined;
    }): ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/worker-thread/bus/abstract.ts`

## `AbstractWorkerHelper`

*class*

Base for a helper that owns a `Worker` and reacts to its lifecycle events.

```ts
export declare abstract class AbstractWorkerHelper<MessageType> extends BaseHelper implements IWorker<MessageType> {
    worker: Worker;
    options: WorkerOptions;
    abstract onOnline(): ValueOrPromise<void>;
    abstract onExit(opts: {
        code: string | number;
    }): ValueOrPromise<void>;
    abstract onError(opts: {
        error: Error;
    }): ValueOrPromise<void>;
    abstract onMessage(opts: {
        message: MessageType;
    }): ValueOrPromise<void>;
    abstract onMessageError(opts: {
        error: Error;
    }): ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/worker-thread/worker/abstract.ts`

## `AbstractWorkerMessageBusHandlerHelper`

*class*

Base for the callbacks a worker bus invokes: `onMessage`, `onClose`, `onError` and `onExit`.

```ts
export declare abstract class AbstractWorkerMessageBusHandlerHelper<IConsumePayload> extends BaseHelper implements IWorkerMessageBusHandler<IConsumePayload> {
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

Source: `packages/helpers/src/modules/worker-thread/bus/handler/abstract.ts`

## `AbstractWorkerThreadHelper`

*class*

Base for the worker-side helper that holds message buses by key.

```ts
export declare abstract class AbstractWorkerThreadHelper extends BaseHelper implements IWorkerThread {
    buses: {
        [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType>;
    };
    abstract bindWorkerBus<IC, IP>(opts: {
        key: string;
        bus: IWorkerBus<IC, IP>;
    }): ValueOrPromise<void>;
    abstract getWorkerBus<IC, IP>(opts: {
        key: string;
    }): IWorkerBus<IC, IP>;
}
```

Source: `packages/helpers/src/modules/worker-thread/thread/abstract.ts`

## `AES`

*class*

`encrypt` and `decrypt` are async: key derivation and the cipher run over `crypto.subtle`.

```ts
export declare class AES extends BaseCryptoAlgorithm<AESAlgorithmType, string, string, TAESSecret, Promise<string>, Promise<string>, IAESExtraOptions> {
    constructor(opts: {
        algorithm: AESAlgorithmType;
    });
    static withAlgorithm(algorithm: AESAlgorithmType): AES;
    protected resolveEncryptKey(opts: {
        secret: TAESSecret;
        kdfSalt?: string;
        kdfIterations?: number;
    }): Promise<{
        id: string;
        key: Buffer;
    }>;
    protected resolveDecryptKey(opts: {
        secret: TAESSecret;
        id: string;
        kdfSalt?: string;
        kdfIterations?: number;
    }): Promise<Buffer>;
    encrypt(opts: {
        message: string;
        secret: TAESSecret;
        opts?: IAESExtraOptions;
    }): Promise<string>;
    encryptFile(opts: {
        absolutePath: string;
        secret: TAESSecret;
    }): Promise<string>;
    decrypt(opts: {
        message: string;
        secret: TAESSecret;
        opts?: IAESDecryptOptions;
    }): Promise<string>;
    decryptFile(opts: {
        absolutePath: string;
        secret: TAESSecret;
    }): Promise<string>;
}

/** `iv` is encrypt-only: the envelope carries the IV, so decrypt reads it from there and a supplied one would be silently ignored. */
interface IAESExtraOptions extends IAESDecryptOptions {
    iv?: Buffer;
}

interface IAESDecryptOptions {
    inputEncoding?: BufferEncoding;
    outputEncoding?: BufferEncoding;
    doThrow?: boolean;
    /** Per-deployment PBKDF2 salt override. Must be supplied identically on encrypt and decrypt; omit for the shipped default. */
    kdfSalt?: string;
    /** PBKDF2 iteration count override. Must be supplied identically on encrypt and decrypt; omit for the shipped default. */
    kdfIterations?: number;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`

## `AppEnvs`

*const*

Alias of `applicationEnvironment`.

```ts
export declare const AppEnvs: ApplicationEnvironment;
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `applicationEnvironment`

*const*

The process-wide environment store, built from `process.env` with the prefix in `APPLICATION_ENV_PREFIX` (`APP_ENV` when unset). One instance is shared by every copy of this module in the process.

```ts
export declare const applicationEnvironment: ApplicationEnvironment;
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `ApplicationEnvironment`

*class*

Key-value store of the environment entries whose key starts with `prefix`; other keys are dropped at construction. `get` applies a default and an optional transform. Use the shared `applicationEnvironment` instance rather than constructing one.

```ts
export declare class ApplicationEnvironment extends BaseHelper implements IApplicationEnvironment {
    private prefix;
    private arguments;
    constructor(opts: {
        prefix: string;
        envs: Record<string, string | number | undefined>;
    });
    /**
     * Reads one name. A line that is present but empty - `KEY=`, or padded to `KEY=   ` by a hand
     * edit - is a pipeline that forgot to export the value, not a value: it is normalised to
     * `undefined` so `defaultValue` applies, and `transform` is handed that `undefined` rather than
     * the empty string.
     *
     * The normalisation runs ONLY when the caller supplied a `defaultValue`, because that call site
     * has already declared what it wants when the name carries nothing. A caller without one still
     * receives `''` unchanged, so no existing read changes shape. `'0'` and `'false'` are values and
     * are never normalised.
     */
    get<ReturnType, BeforeTransformType = unknown>(key: string, opts?: {
        defaultValue?: ReturnType;
        transform?: (value: BeforeTransformType) => ReturnType;
    }): ReturnType;
    set<ValueType>(key: string, value: ValueType): void;
    merge(opts: {
        envs: Record<string, string>;
    }): void;
    isDevelopment(): boolean;
    keys(): string[];
}
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `BaseCryptoAlgorithm`

*class*

Base for the symmetric algorithms: validates the algorithm name and derives a key of a given length from a secret with PBKDF2.

```ts
export declare abstract class BaseCryptoAlgorithm<AlgorithmType extends string, EncryptInputType = unknown, DecryptInputType = unknown, SecretKeyType = unknown, EncryptReturnType = unknown, DecryptReturnType = unknown, ExtraOptions = unknown> extends AbstractCryptoAlgorithm<AlgorithmType, EncryptInputType, DecryptInputType, SecretKeyType, EncryptReturnType, DecryptReturnType, ExtraOptions> {
    constructor(opts: {
        scope: string;
        algorithm: AlgorithmType;
    });
    validateAlgorithmName(opts: {
        algorithm: AlgorithmType;
    }): void;
    /**
     * Omit `kdfSalt`/`kdfIterations` for the shipped default (byte-identical to every prior release). Supplying either requires supplying the same value again on decrypt.
     * Derived with PBKDF2 over `crypto.subtle`, once per secret: a second call, even one that starts while the first runs, shares its result.
     */
    normalizeSecretKey(opts: {
        secret: string;
        length: number;
        kdfSalt?: string;
        kdfIterations?: number;
    }): Promise<Buffer>;
    private derivePbkdf2;
    /** Rejects a `kdfSalt` short enough to look configured while giving up most of the protection a salt exists for (NIST SP 800-132: 128-bit minimum). */
    private validateKdfSalt;
    getAlgorithmKeySize(): number;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts`

## `BaseLogger`

*class*

Provider-independent plumbing: scope, prefix, DEBUG gate, for(). Every level method funnels into ONE abstract write() sink; child() lets each provider keep its own caching policy.

```ts
export declare abstract class BaseLogger extends AbstractLogger {
    protected readonly _scope: string;
    protected readonly _formattedPrefix: string;
    constructor(opts: {
        scope: string;
    });
    protected abstract write(opts: {
        level: TLogLevel;
        message: string;
        args: Array<AnyType>;
    }): void;
    protected abstract child(opts: {
        scope: string;
    }): ILogger;
    debug(message: string, ...args: AnyType[]): void;
    info(message: string, ...args: AnyType[]): void;
    warn(message: string, ...args: AnyType[]): void;
    error(message: string, ...args: AnyType[]): void;
    emerg(message: string, ...args: AnyType[]): void;
    log(level: TLogLevel, message: string, ...args: AnyType[]): void;
    for(methodName: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/base/base.ts`

## `BaseNetworkTcpClient`

*class*

TCP or TLS client that opens its socket through `createClientFn`, reports connect, data, close and error to the `on*` callbacks, and reconnects when enabled.

```ts
export declare class BaseNetworkTcpClient<SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions, SocketClientType extends PlainSocketClient | TlsSocketClient> extends BaseHelper {
    protected client?: SocketClientType | null;
    protected options: SocketClientOptions;
    protected reconnect?: boolean;
    protected retry: {
        maxReconnect: number;
        currentReconnect: number;
    };
    protected reconnectTimeout: any;
    protected encoding?: BufferEncoding;
    protected createClientFn: (options: SocketClientOptions, connectionListener?: () => void) => SocketClientType;
    protected onConnected: (opts: {
        client: SocketClientType;
    }) => void;
    protected onData: (opts: {
        identifier: string;
        message: string | Buffer;
    }) => void;
    protected onClosed?: (opts: {
        client: SocketClientType;
    }) => void;
    protected onError?: (error: any) => void;
    constructor(opts: INetworkTcpClientProps<SocketClientOptions, SocketClientType>);
    getClient(): SocketClientType | null | undefined;
    /** Redacts before logging - a TLS client's options ARE its private key (`key`/`cert`/`passphrase`). */
    protected getLoggableOptions(): unknown;
    handleConnected(): void;
    handleData(_opts: {
        identifier: string;
        message: string | Buffer;
    }): void;
    handleClosed(): void;
    handleError(error: any): void;
    connect(opts: {
        resetReconnectCounter: boolean;
    }): void;
    disconnect(): void;
    forceReconnect(): void;
    isConnected(): boolean | null | undefined;
    emit(opts: {
        payload: Buffer | string;
    }): void;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts`

## `BaseNetworkTcpServer`

*class*

TCP or TLS server that tracks connected clients by id, with an optional authentication window, and reports connection events to the `onClient*` and `onServer*` callbacks.

```ts
export declare class BaseNetworkTcpServer<SocketServerOptions extends ServerOpts = ServerOpts, SocketServerType extends SocketServer = SocketServer, SocketClientType extends SocketClient = SocketClient> extends BaseHelper {
    protected serverOptions: Partial<SocketServerOptions>;
    protected listenOptions: Partial<ListenOptions>;
    protected authenticateOptions: {
        required: boolean;
        duration?: number;
    };
    protected clients: Record<string, ITcpSocketClient<SocketClientType>>;
    protected server: SocketServerType;
    protected extraEvents: Record<string, (opts: {
        id: string;
        socket: SocketClientType;
        args: any;
    }) => ValueOrPromise<void>>;
    protected createServerFn: (options: Partial<SocketServerOptions>, connectionListener: (socket: SocketClientType) => void) => SocketServerType;
    protected onServerReady?: (opts: {
        server: SocketServerType;
    }) => void;
    protected onClientConnected?: (opts: {
        id: string;
        socket: SocketClientType;
    }) => void;
    protected onClientData?: (opts: {
        id: string;
        socket: SocketClientType;
        data: Buffer | string;
    }) => void;
    protected onClientClose?: (opts: {
        id: string;
        socket: SocketClientType;
    }) => void;
    protected onClientError?: (opts: {
        id: string;
        socket: SocketClientType;
        error: Error;
    }) => void;
    protected onServerError?: (opts: {
        server: SocketServerType;
        error: Error;
    }) => void;
    constructor(opts: ITcpSocketServerOptions<SocketServerOptions, SocketServerType, SocketClientType>);
    protected invokeHook(opts: {
        scope: string;
        execution: () => void;
    }): void;
    configure(): void;
    onNewConnection(opts: {
        socket: SocketClientType;
    }): void;
    getClients(): Record<string, ITcpSocketClient<SocketClientType>>;
    getClient(opts: {
        id: string;
    }): ITcpSocketClient<SocketClientType>;
    getServer(): SocketServerType;
    /** Clears timers and destroys all client sockets before closing the listener - `server.close()` alone never settles while a socket stays attached. Idempotent; safe if never listened. */
    shutdown(): Promise<void>;
    doAuthenticate(opts: {
        id: string;
        state: TTcpClientState;
    }): void;
    emit(opts: {
        clientId: string;
        payload: Buffer | string;
    }): void;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`

## `BaseStorageHelper`

*class*

Shared base for storage helpers: MIME lookup, name and path validation, and upload naming. Concrete helpers implement the backend calls.

```ts
export declare abstract class BaseStorageHelper extends BaseHelper implements IStorageHelper {
    constructor(opts: {
        scope: string;
        identifier: string;
    });
    getMimeType(opts: {
        filename: string;
    }): string;
    /** One path segment or file name: no separator, no traversal, no control or shell character. */
    isValidSegment(opts: {
        segment: string;
    }): boolean;
    static readonly DEFAULT_MAX_FOLDER_DEPTH = 2;
    /** Control characters and lone surrogates: never part of a file name, and not encodable into a header. */
    private static readonly UNSAFE_NAME_CHARACTERS;
    /** A bucket name is one segment; a separator in it would silently address a different bucket. */
    isValidBucketName(opts: {
        bucket: IBucketRef;
    }): boolean;
    /** A whole object key: every segment valid, and no deeper than `maxDepth` folders. */
    isValidObjectKey(opts: {
        object: IObjectRef;
        maxDepth?: number;
    }): boolean;
    /** The shared rule behind `isValidObjectKey` and the folder check inside `upload`. */
    protected isValidKeyPath(opts: {
        path: string;
        maxDepth?: number;
    }): boolean;
    getMediaType(opts: {
        mimeType: string;
    }): string;
    /** Public URL prefix; keeps its trailing slash. */
    protected abstract get defaultLinkPrefix(): string;
    /** Backend write step; owns its metadata and error handling. */
    protected abstract writeObject(opts: IObjectLocation & {
        file: IUploadFile;
    }): Promise<void>;
    protected normalizeObjectName(opts: {
        file: TUploadNaming;
    }): string;
    protected normalizeObjectLink(opts: IObjectLocation): string;
    /** An original name that is only metadata - the key is resolved elsewhere and validated on its own. */
    protected isValidOriginalName(opts: {
        name: string;
    }): boolean;
    /** `isKeyResolvedByCaller`: a `normalizeNameFn` decides the key, so the original name is metadata and meets the metadata rule, not the key rule. */
    protected validateUploadFiles(opts: {
        files: IUploadFile[];
        maxFolderDepth?: number;
        isKeyResolvedByCaller?: boolean;
    }): void;
    private validateUploadFile;
    upload(opts: {
        bucket: IBucketRef;
        files: IUploadFile[];
        normalizeNameFn?: (opts: {
            file: TUploadNaming;
        }) => string;
        normalizeLinkFn?: (opts: IObjectLocation) => string;
        /**
         * Folder nesting allowed.
         *
         * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
         */
        maxFolderDepth?: number;
    }): Promise<IUploadResult[]>;
    /** Correct anywhere; overridden by a backend whose transport is already a web stream. */
    getObjectStream(opts: IObjectLocation & {
        range?: {
            start: number;
            end?: number;
        };
    }): Promise<ReadableStream<Uint8Array>>;
    /**
     * Correct anywhere, and the wrong path to stay on: it buffers, so a backend whose transport takes
     * a stream overrides it. `BunS3Helper` does.
     */
    writeStream(opts: IObjectLocation & {
        source: ReadableStream<Uint8Array> | Blob | Response | Request;
        contentType?: string;
        maxFolderDepth?: number;
    }): Promise<void>;
    /** Bounded fan-out on the shared limiter; unbounded exhausts sockets and gets rate limited. */
    protected mapWithConcurrency<Item, Result>(opts: {
        items: Item[];
        limit?: number;
        task: (taskOptions: {
            item: Item;
            index: number;
        }) => Promise<Result>;
    }): Promise<Result[]>;
    /** A "not there" failure becomes a catalogued 404; every other failure passes through unchanged. */
    protected asStorageError(opts: IObjectLocation & {
        error: unknown;
        operation: string;
    }): unknown;
    copyObject(_opts: {
        bucket: IBucketRef;
        source: IObjectRef;
        destination: IObjectRef;
    }): Promise<void>;
    presignPost(_opts: {
        bucket: IBucketRef;
        keyPrefix: string;
        maxBytes: number;
        contentType?: string;
        expiresIn?: IDuration;
    }): Promise<IPostPolicy>;
    presignPut(_opts: IObjectLocation & {
        expiresIn?: IDuration;
        tagging?: Record<string, string>;
        contentLength?: number;
        contentType?: string;
    }): Promise<string>;
    presignGet(_opts: IObjectLocation & {
        expiresIn?: IDuration;
        responseContentType?: string;
    }): Promise<string>;
    getObjectTags(_opts: IObjectLocation): Promise<Record<string, string>>;
    replaceObjectTags(_opts: IObjectLocation & {
        tags: Record<string, string>;
    }): Promise<void>;
    abstract hasBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    abstract getBuckets(): Promise<IBucketInfo[]>;
    abstract getBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    abstract createBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    abstract removeBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    abstract getObject(opts: IObjectLocation & {
        options?: any;
    }): Promise<Readable>;
    abstract getStat(opts: IObjectLocation): Promise<IFileStat>;
    abstract removeObject(opts: IObjectLocation): Promise<void>;
    abstract removeObjects(opts: {
        bucket: IBucketRef;
        objects: IObjectRef[];
    }): Promise<void>;
    abstract listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
}
```

Source: `packages/helpers/src/modules/storage/base.ts`

## `BaseWorkerBusHelper`

*class*

A `MessagePort` bus that forwards the port's message, error, exit and close events to a handler. A throwing hook is logged, not rethrown.

```ts
export declare class BaseWorkerBusHelper<IConsumePayload, IPublishPayload> extends AbstractWorkerBusHelper<IConsumePayload, IPublishPayload> {
    constructor(opts: {
        scope: string;
        port: MessagePort;
        busHandler: IWorkerMessageBusHandler<IConsumePayload>;
    });
    /** Bus handlers run inside MessagePort listeners; a sync throw there is uncaught and kills the worker thread, so wrap it - voidExecution alone can't catch a throw evaluated before it's called. */
    protected invokeHook(opts: {
        scope: string;
        execution: () => ValueOrPromise<void>;
    }): void;
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

Source: `packages/helpers/src/modules/worker-thread/bus/base.ts`

## `BaseWorkerHelper`

*class*

Starts a `Worker` from `path` and routes its events to `eventHandlers`, or logs them when no handler is given. A throwing handler is logged, not rethrown.

```ts
export declare class BaseWorkerHelper<MessageType> extends AbstractWorkerHelper<MessageType> {
    protected eventHandlers?: Partial<Pick<IWorker<MessageType>, 'onOnline' | 'onExit' | 'onError' | 'onMessage' | 'onMessageError'>>;
    constructor(opts: {
        scope?: string;
        identifier: string;
        path: string | URL;
        options: WorkerOptions;
        eventHandlers?: Partial<Pick<IWorker<MessageType>, 'onOnline' | 'onExit' | 'onError' | 'onMessage' | 'onMessageError'>>;
    });
    /** User handlers run inside worker listeners; a sync throw there is uncaught and kills the process, so wrap it - voidExecution alone can't catch a throw evaluated before it's called. */
    protected invokeHook(opts: {
        scope: string;
        execution: () => ValueOrPromise<void>;
    }): void;
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
    binding(): void;
}
```

Source: `packages/helpers/src/modules/worker-thread/worker/base.ts`

## `BaseWorkerMessageBusHandlerHelper`

*class*

Bus handler built from callbacks. Only `onMessage` is required; a missing `onClose` does nothing, a missing `onExit` or `onError` logs.

```ts
export declare class BaseWorkerMessageBusHandlerHelper<IConsumePayload> extends AbstractWorkerMessageBusHandlerHelper<IConsumePayload> {
    constructor(opts: {
        scope: string;
        onMessage: (opts: {
            message: IConsumePayload;
        }) => ValueOrPromise<void>;
        onClose?: () => ValueOrPromise<void>;
        onError?: (opts: {
            error: Error;
        }) => ValueOrPromise<void>;
        onExit?: (opts: {
            exitCode: number | string;
        }) => ValueOrPromise<void>;
    });
}
```

Source: `packages/helpers/src/modules/worker-thread/bus/handler/base.ts`

## `BaseWorkerThreadHelper`

*class*

Holds the message buses of a worker thread by key. Throws when constructed on the main thread.

```ts
export declare class BaseWorkerThreadHelper extends AbstractWorkerThreadHelper {
    constructor(opts: {
        scope: string;
    });
    bindWorkerBus<IC, IP>(opts: {
        key: string;
        bus: IWorkerBus<IC, IP>;
    }): void;
    unbindWorkerBus(opts: {
        key: string;
    }): void;
    getWorkerBus<IC, IP>(opts: {
        key: string;
    }): IWorkerBus<IC, IP>;
}
```

Source: `packages/helpers/src/modules/worker-thread/thread/base.ts`

## `BullQueueRoles`

*class*

What a BullMQ helper is: the QUEUE that jobs are added to, or the WORKER that runs them.

```ts
export declare class BullQueueRoles {
    static readonly QUEUE = "queue";
    static readonly WORKER = "worker";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/queue/common/constants.ts`

## `Child`

*type*

```ts
type Child = string | Promise<string> | number | JSXNode | null | undefined | boolean | Child[]
```

## `COMBINING_MARKS_PATTERN`

*const*

Marks left behind by NFD normalization. Written as escapes, not literal codepoints - a pasted
combining mark is invisible in editors and gets silently dropped by copy/paste.

```ts
export declare const COMBINING_MARKS_PATTERN: RegExp;
```

Source: `packages/helpers/src/modules/slug/common/constants.ts`

## `ContentDispositionTypes`

*class*

How a client treats a download: ATTACHMENT saves it, INLINE shows it.

```ts
export declare class ContentDispositionTypes {
    static readonly ATTACHMENT = "attachment";
    static readonly INLINE = "inline";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `CredentialAlgorithms`

*class*

Password-hash schemes `CredentialHelper` accepts. `isValid` narrows a string to `TCredentialAlgorithm`.

```ts
export declare class CredentialAlgorithms {
    /** What `Bun.password` writes with its default parameters; the scheme `hash` uses unless told otherwise. */
    static readonly ARGON2ID = "argon2id";
    static readonly BCRYPT = "bcrypt";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TCredentialAlgorithm;
}
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `CredentialHelper`

*class*

Storing and checking a credential (a password) over `Bun.password`. `hash` writes an argon2id hash (Bun's
default parameters), or bcrypt when `algorithm: 'bcrypt'` asks for it (`$2b$`, 60 characters, the stored
format of the `bcrypt` package). `verify` reads every existing bcrypt and argon2 hash, whichever
algorithm `hash` wrote, so a stored password is never rehashed or migrated. Needs Bun: it throws on
another runtime.

Passwords longer than 72 bytes are where Bun and the `bcrypt` package differ, and it only matters for
bcrypt. The package keeps only the first 72 bytes; Bun keeps all of them, by hashing a longer password
before bcrypt sees it. Two things follow, and they are the whole truth about "the same format":

- A hash `hash` writes for a password longer than 72 bytes is read by Bun only. The `bcrypt` package
  cannot verify it, so rolling back to that package, or another service reading the same column, locks
  those users out. Up to 72 bytes the two read each other's hashes.
- A hash the `bcrypt` package wrote for a longer password fails a plain `Bun.password.verify` with the full
  password. `verify` therefore retries a bcrypt hash with the first 72 bytes when the password is longer.
  That retry is for the legacy hashes. A hash `hash` wrote never needs it, because Bun reads its own hash on
  the first attempt. The retry has one price: a hash of a password of exactly 72 bytes also accepts that
  password followed by anything, the way bcrypt itself always has.

```ts
export declare class CredentialHelper {
    /**
     * A hash of `password`: argon2id (Bun's default parameters), or bcrypt with `algorithm: 'bcrypt'`.
     * For bcrypt, `cost` (4 to 31) is the work factor, `2 ** cost` rounds. `cost` with argon2id
     * is refused rather than ignored: a caller who tuned a cost is told the default changed.
     */
    static hash(opts: {
        password: string;
        /**
         * The hashing scheme.
         * @default DEFAULT_CREDENTIAL_ALGORITHM
         */
        algorithm?: TCredentialAlgorithm;
        /**
         * The bcrypt work factor; refused with argon2id.
         * @default 10
         */
        cost?: number;
    }): Promise<string>;
    /**
     * Whether `password` matches `hash`. Nothing to match is `false`: an empty or non-string password, an empty
     * or non-string hash. A stored value that is not a password hash is a server fault (500), so a corrupt row is
     * never answered like a wrong password, and the runtime's own message stays out of it.
     */
    static verify(opts: {
        password: string;
        hash: string;
    }): Promise<boolean>;
    private static verifyHash;
    private static assertBun;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/credential.algorithm.ts`

## `D_STROKE_REPLACEMENTS`

*const*

`đ`/`Đ` carry no combining mark, so NFD leaves them intact - hence this explicit map. `d` is
deliberate: the `slugify` npm package romanizes them to `dj` (Serbo-Croatian), producing
`djuong-trang` for `Đường trắng`. Do not "fix" this to match that library.

```ts
export declare const D_STROKE_REPLACEMENTS: ReadonlyArray<{
    pattern: RegExp;
    replacement: string;
}>;
```

Source: `packages/helpers/src/modules/slug/common/constants.ts`

## `DEFAULT_CIPHER_BITS`

*const*

Key size in bits assumed when an algorithm name carries no size suffix (see `getAlgorithmKeySize`).

```ts
export declare const DEFAULT_CIPHER_BITS = 256;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `DEFAULT_CREDENTIAL_ALGORITHM`

*const*

Scheme `CredentialHelper.hash` uses when `algorithm` is omitted.

```ts
export declare const DEFAULT_CREDENTIAL_ALGORITHM: TCredentialAlgorithm;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `DEFAULT_HASH_OUTPUT_ENCODING`

*const*

Encoding used when `outputEncoding` is omitted.

```ts
export declare const DEFAULT_HASH_OUTPUT_ENCODING: THashOutputEncoding;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `DEFAULT_KDF_DIGEST`

*const*

PBKDF2 digest for key derivation; it is not configurable per call.

```ts
export declare const DEFAULT_KDF_DIGEST = "sha256";
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `DEFAULT_KDF_ITERATIONS`

*const*

PBKDF2 iteration count used when `kdfIterations` is omitted. Changing it makes ciphertext encrypted under the old count undecryptable.

```ts
export declare const DEFAULT_KDF_ITERATIONS = 100000;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `DEFAULT_KDF_SALT`

*const*

Public and identical across every deployment, so it stops a bare dictionary attack but not a
table precomputed against this value - pass `kdfSalt` for per-deployment isolation. Never
change this: every ciphertext already encrypted under it becomes undecryptable.

```ts
export declare const DEFAULT_KDF_SALT = "ignis-kdf-salt-v1";
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `DiskHelper`

*class*

Storage backed by the local filesystem: each bucket is a directory under `basePath`, each object a file whose key is its relative path. Names are validated and resolved paths must stay inside the bucket.

```ts
export declare class DiskHelper extends BaseStorageHelper {
    private basePath;
    constructor(options: IDiskHelperOptions);
    private getBucketPath;
    /** Validates the name AND the resolved path: containment survives a naming rule we get wrong. */
    private resolveObjectPath;
    /** `null` means not there. Anything but ENOENT is logged: it may exist and be unreadable. */
    private statOrNull;
    private exists;
    /** One `stat` answers existence and type. */
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
    protected get defaultLinkPrefix(): string;
    protected writeObject(opts: IObjectLocation & {
        file: IUploadFile;
    }): Promise<void>;
    getObject(opts: IObjectLocation & {
        options?: any;
    }): Promise<Readable>;
    /** `createReadStream` seeks natively, so a range never reads the bytes before it. */
    getObjectStream(opts: IObjectLocation & {
        range?: {
            start: number;
            end?: number;
        };
    }): Promise<ReadableStream<Uint8Array>>;
    getStat(opts: IObjectLocation): Promise<IFileStat>;
    removeObject(opts: IObjectLocation): Promise<void>;
    removeObjects(opts: {
        bucket: IBucketRef;
        objects: IObjectRef[];
    }): Promise<void>;
    listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
}
```

Source: `packages/helpers/src/modules/storage/disk/helper.ts`

## `Environment`

*class*

Adds the `NODE_ENV` reads to {@link EnvironmentNames}. Every name and set is inherited, so `Environment.PRODUCTION`, `Environment.COMMON_ENVS` and `Environment.DEVELOPMENT_ENVS` keep resolving here; only these two members need a `process`.

```ts
export declare class Environment extends EnvironmentNames {
    /** `NODE_ENV` exactly as the host has it, `undefined` when unset. Destructured on purpose: `bun build` rewrites `process.env.NODE_ENV` to a literal at build time, a destructured read stays a runtime read. */
    static get ambient(): string | undefined;
    static get current(): string;
    static is(opts: {
        name: string;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `ErrorPrettier`

*class*

Turns a thrown value into something a human can read in a console - log this, never the raw error.

```ts
export declare class ErrorPrettier {
    /** Bounds a pathological or cyclic `cause` chain. */
    static readonly DEFAULT_MAX_CAUSE_DEPTH = 5;
    /** The throw site is near the top; the tail is identical framework plumbing for every request. */
    static readonly DEFAULT_MAX_STACK_FRAMES = 10;
    /** Driver diagnostics that are actionable and absent from `message` - `pg` supplies all four. */
    private static readonly DIAGNOSTIC_KEYS;
    /** A stack frame line in every V8 stack: `    at fn (file:line:col)`. */
    private static readonly FRAME_PATTERN;
    /** A frame inside an installed package - `node_modules/` covers bun's `.bun/` store too. */
    private static readonly DEPENDENCY_FRAME_PATTERN;
    /** `getError` sits on top of every `ApplicationError` stack and names no call site. Installed, it is also the FIRST dependency frame, so the keep-the-first rule would preserve exactly the wrong one. Anchored on `inversion` so an application's own `modules/error/app-error` is not swallowed with it. */
    private static readonly ERROR_FACTORY_FRAME_PATTERN;
    /** Issues rendered from a ZodError before the rest are counted off. */
    private static readonly MAX_ZOD_ISSUES;
    /** Members of an `AggregateError` rendered before the rest are counted off. */
    private static readonly MAX_AGGREGATED_ERRORS;
    private static readonly INSPECT_OPTIONS;
    private static extractFrames;
    /** A ZodError's `message` is its issue array as pretty JSON - dozens of lines for one bad field. Render `path: reason` instead. */
    private static compressZodMessage;
    private static summarizeNode;
    private static pushDiagnostics;
    /** Under whichever node collected them - a wrapped `AggregateError` is the common shape. */
    private static pushAggregatedErrors;
    /** Reduces any thrown value to {@link IErrorSummary} - always a summary, never a bare primitive. */
    static summarize(opts: {
        error: unknown;
        includeStack?: boolean;
        maxCauseDepth?: number;
        maxStackFrames?: number;
    }): IErrorSummary;
    /** Resolved per call, not at module load, so a test passes a value instead of mutating the environment. */
    private static resolveFormat;
    /** `JSON.stringify` throws on a cycle, and `format` runs inside the error handler - a throw there turns a handled failure into an unhandled one. `redactSecrets` breaks cycles on its own, but it is switched off by `APP_ENV_LOGGER_DO_REDACT=false`, so structural safety cannot lean on it. A repeated reference reads as `[Circular]` too: the first occurrence still carries the data. */
    private static safeStringify;
    /** One line, so a log monitor keeps the error as ONE record instead of one per bullet. */
    private static renderJson;
    private static renderText;
    /** Renders {@link summarize}. `text` returns a block whose newlines survive `%s`; `json` returns one line. */
    static format(opts: {
        error: unknown;
        messageCode?: string;
        extra?: Record<string, unknown>;
        includeStack?: boolean;
        maxStackFrames?: number;
        format?: TLoggerFormat;
        inspectOptions?: util.InspectOptions;
    }): string;
}
```

Source: `packages/helpers/src/modules/logger/formatting/error-prettier.ts`

## `ErrorUtility`

*class*

Helpers for values caught in `catch` blocks.

```ts
export declare class ErrorUtility {
    /** Normalize an unknown thrown value into an Error instance - an ApplicationError when it was not one. */
    static toError(opts: {
        error: unknown;
    }): Error;
}
```

Source: `packages/helpers/src/utilities/error.utility.ts`

## `FC`

*type*

```ts
type FC<P = Props> = { (props: P): FunctionComponentResult; defaultProps?: Partial<P> | undefined; displayName?: string | undefined; }
```

## `Hash`

*class*

One-way message digests and keyed HMACs. Unlike `AES`/`RSA` this has no `decrypt` - a digest
cannot be reversed, so `digest`/`hmac` are the only operations, not `ICryptoAlgorithm`.

```ts
export declare class Hash extends BaseHelper {
    algorithm: THashAlgorithm;
    constructor(opts: {
        algorithm: THashAlgorithm;
    });
    /** Memoized - `BaseHelper`'s constructor resolves a logger on every allocation (~50ns), and downstream token code calls `withAlgorithm` per request. */
    private static readonly instances;
    static withAlgorithm(algorithm: THashAlgorithm): Hash;
    validateAlgorithmName(opts: {
        algorithm: THashAlgorithm;
    }): void;
    /**
     * Plain digest, no secret. `message` is text (UTF-8), bytes, or several parts hashed in order as ONE message: a git
     * blob is the header text "blob <size>" and a NUL byte, then the bytes, so its parts are the header and the bytes. MD5/SHA1
     * are broken/weak - see {@link HashAlgorithms} - never use for security decisions.
     */
    digest(opts: {
        message: THashInput | ReadonlyArray<THashInput>;
        opts?: IHashExtraOptions;
    }): string;
    /**
     * Keyed HMAC. `message` and `secret` are text (UTF-8) or bytes: a `Buffer` or `Uint8Array` key gives the same output
     * as the text of the same bytes, so a token printed with one keeps verifying with the other. `secret` is mandatory and
     * validated non-empty so a request for an HMAC never silently degrades into an unkeyed digest.
     */
    hmac(opts: {
        message: THashInput;
        secret: THashInput;
        opts?: IHashExtraOptions;
    }): string;
    /**
     * Compares two strings exactly as given, in constant time: the byte length first, then `crypto.timingSafeEqual`. For
     * two digests that are both already in hand, such as an idempotency fingerprint against a saved one, where
     * {@link Hash.verify} has nothing to hash. `false` for any difference, never a throw, and `false` too for a value that
     * is not a string. Two empty strings are equal. The text is compared, not the bytes it stands for: hex in upper case
     * does not equal hex in lower case.
     */
    static equals(opts: {
        value: string;
        expected: string;
    }): boolean;
    /**
     * Checks a received digest against the one `value` produces, in constant time. Use it for a webhook signature or a
     * payment callback instead of `===`, which stops at the first differing character and so tells an attacker how many
     * leading characters of a forged value were right.
     *
     * `value` is hashed the way {@link Hash.digest} does, or keyed with `secret` the way {@link Hash.hmac} does, then
     * written in `outputEncoding` (hex by default) and compared with `expected` by {@link Hash.equals}. A different length
     * answers `false` without comparing, and the answer is `false`, never a throw, for any mismatch. `expected` is exact
     * text: hex in upper case does not equal hex in lower case, and an unpadded or URL-safe form of the same base64 digest
     * is refused. Pass the matching `outputEncoding` (`base64url`), or normalise the text first.
     */
    verify(opts: {
        value: THashInput;
        expected: string;
        secret?: THashInput;
        opts?: IHashExtraOptions;
    }): boolean;
}

/** Text is hashed as UTF-8, bytes as they are. */
type THashInput = string | Uint8Array;

interface IHashExtraOptions {
    outputEncoding?: THashOutputEncoding;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`

## `HashAlgorithms`

*class*

Digest names the hash algorithm accepts. `isValid` narrows a string to `THashAlgorithm`.

```ts
export declare class HashAlgorithms {
    /** Cryptographically broken - kept only for wire-protocol compatibility (VNPay checksums); never use for security decisions. */
    static readonly MD5 = "md5";
    /** Cryptographically weak - kept for wire-protocol compatibility with legacy integrations; never use for security decisions. */
    static readonly SHA1 = "sha1";
    static readonly SHA256 = "sha256";
    static readonly SHA384 = "sha384";
    static readonly SHA512 = "sha512";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is THashAlgorithm;
}
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `HashOutputEncodings`

*class*

Text encodings a digest can be written in. `isValid` narrows a string to `THashOutputEncoding`.

```ts
export declare class HashOutputEncodings {
    static readonly HEX = "hex";
    static readonly BASE64 = "base64";
    static readonly BASE64URL = "base64url";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is THashOutputEncoding;
}
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `HF_MESSAGE_MAX_BYTES`

*const*

Max message size in UTF-8 BYTES (not characters); longer messages truncate silently.

```ts
export declare const HF_MESSAGE_MAX_BYTES = 213;
```

Source: `packages/helpers/src/modules/logger/hf/common/constants.ts`

## `HF_SCOPE_MAX_BYTES`

*const*

Max scope size in UTF-8 BYTES (not characters - a multibyte scope truncates by byte).

```ts
export declare const HF_SCOPE_MAX_BYTES = 32;
```

Source: `packages/helpers/src/modules/logger/hf/common/constants.ts`

## `HfLogFlusher`

*class*

Drains the ring in bounded batches, yielding between them - see the spec's lap accounting.

```ts
export declare class HfLogFlusher {
    private static readonly textDecoder;
    private flushIndex;
    private inFlightDrain;
    private timer;
    private readonly sink;
    private readonly batchSize;
    constructor(options?: IHfLogFlusherOptions);
    private static renderEntry;
    private static buildDefaultSink;
    flush(): Promise<void>;
    private drain;
    private deliverBatch;
    start(intervalMs?: number): void;
    stop(): void;
}
```

Source: `packages/helpers/src/modules/logger/hf/flusher.ts`

## `HfLogger`

*class*

Ring-buffer logger for hot paths; extends AbstractLogger, NOT BaseLogger - BaseLogger's string-sink plumbing is exactly the cost this implementation exists to avoid.

```ts
export declare class HfLogger extends AbstractLogger {
    private static readonly textEncoder;
    private static readonly scopeCache;
    private static cache;
    private static messageCache;
    private readonly scope;
    private readonly scopeBytes;
    private readonly scopeLength;
    private readonly ring;
    private constructor();
    private static encodeScope;
    static get(scope: string): HfLogger;
    /** Pre-encode a message at initialization time; the cache is FIFO-bounded so dynamic strings can't grow it without limit. */
    static encodeMessage(message: string): Uint8Array;
    private static evictOldestMessage;
    private writeEntry;
    private writeString;
    debug(message: string, ...args: AnyType[]): void;
    info(message: string, ...args: AnyType[]): void;
    warn(message: string, ...args: AnyType[]): void;
    error(message: string, ...args: AnyType[]): void;
    emerg(message: string, ...args: AnyType[]): void;
    log(level: TLogLevel, message: string, ...args: AnyType[]): void;
    log(level: TLogLevel, messageBytes: Uint8Array): void;
    for(methodName: string): ILogger;
}
```

Source: `packages/helpers/src/modules/logger/hf/logger.ts`

## `HookUtility`

*class*

Runs user-supplied hooks so a throw or rejection is logged and never breaks the caller.

```ts
export declare class HookUtility {
    /** Fire-and-forget a hook from inside an event listener. Takes a thunk because `PromiseUtility.voidExecution` takes a VALUE - a synchronous throw would escape the guard and, inside an emitter callback, take the process down. Rejections still route to the logger. */
    static invoke(opts: {
        logger: ILogger;
        scope: string;
        execution: () => ValueOrPromise<unknown>;
    }): void;
    /** Await a user-supplied hook, absorbing sync throws and rejections without breaking the caller's state machine. */
    static execute(opts: {
        logger: ILogger;
        scope: string;
        execution: () => ValueOrPromise<unknown>;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/common/hook.ts`

## `HrTimeUtility`

*class*

Elapsed-time measurement from the Node high-resolution clock.

```ts
export declare class HrTimeUtility {
    /**
     * Seconds from the process's high-resolution clock, to nine decimals - for measuring, not for dates.
     * A file of its own: `process.hrtime` is Node-only, and `performance.utility` ships on `/core`.
     */
    static getSeconds(): number;
}
```

Source: `packages/helpers/src/utilities/hr-time.utility.ts`

## `IAESKeyringEntry`

*interface*

One key in a keyring: `id` is written into the ciphertext so decrypt can pick the matching `secret`.

```ts
export interface IAESKeyringEntry {
    id: string;
    secret: string;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`

## `IApplicationEnvironment`

*interface*

Read and write contract of the application environment store; `get` returns `defaultValue` when the key is absent.

```ts
export interface IApplicationEnvironment {
    get<ReturnType, BeforeTransformType = unknown>(key: string, opts?: {
        defaultValue?: ReturnType;
        transform?: (value: BeforeTransformType) => ReturnType;
    }): ReturnType;
    set<ValueType>(key: string, value: ValueType): any;
}
```

Source: `packages/helpers/src/modules/env/common/types.ts`

## `IBucketInfo`

*interface*

A bucket as `getBuckets`, `getBucket` and `createBucket` report it.

```ts
export interface IBucketInfo {
    name: string;
    creationDate: Date;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IBucketRef`

*interface*

One bucket.

```ts
export interface IBucketRef {
    name: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IBunServer`

*interface*

The subset of a Bun server the WebSocket helper uses to publish to topics.

```ts
export interface IBunServer {
    readonly pendingWebSockets: number;
    publish(topic: string, data: string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView, compress?: boolean): number;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IBunWebSocketConfig`

*interface*

Bun WebSocket native configuration options

```ts
export interface IBunWebSocketConfig {
    perMessageDeflate?: boolean;
    maxPayloadLength?: number;
    idleTimeout?: number;
    backpressureLimit?: number;
    closeOnBackpressureLimit?: boolean;
    sendPings?: boolean;
    publishToSelf?: boolean;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IBunWebSocketHandler`

*interface*

Return type for getBunWebSocketHandler - handlers + config spread for server.reload()

```ts
export interface IBunWebSocketHandler extends IBunWebSocketConfig {
    open: (socket: IWebSocket) => void;
    message: (socket: IWebSocket, message: string | Buffer) => void;
    close: (socket: IWebSocket, code: number, reason: string) => void;
    drain: (socket: IWebSocket) => void;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

## `IClock`

*interface*

Injectable clock so tests advance time deterministically.

```ts
export interface IClock {
    now(): number;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/timer.ts`

## `ICryptoAlgorithm`

*interface*

Contract of an encryption algorithm: `encrypt` and `decrypt` take one options object holding `message`, `secret` and optional algorithm-specific `opts`. The type parameters set the input, secret and return types of each side.

```ts
export interface ICryptoAlgorithm<AlgorithmNameType extends string, EncryptInputType = unknown, DecryptInputType = unknown, SecretKeyType = unknown, EncryptReturnType = unknown, DecryptReturnType = unknown, ExtraOptions = unknown> {
    algorithm: AlgorithmNameType;
    encrypt(opts: {
        message: EncryptInputType;
        secret: SecretKeyType;
        opts?: ExtraOptions;
    }): EncryptReturnType;
    decrypt(opts: {
        message: DecryptInputType;
        secret: SecretKeyType;
        opts?: ExtraOptions;
    }): DecryptReturnType;
}
```

Source: `packages/helpers/src/modules/crypto/common/types.ts`

## `IDiskHelperOptions`

*interface*

Options for `DiskHelper`; `basePath` is created when missing.

```ts
export interface IDiskHelperOptions extends IStorageHelperOptions {
    /** Base directory every bucket lives under. */
    basePath: string;
}
```

Source: `packages/helpers/src/modules/storage/disk/helper.ts`

## `IErrorSummary`

*interface*

Useful-only projection of an error: a driver's `query`/`params` repeat the message and are dropped.

```ts
export interface IErrorSummary {
    name?: string;
    message?: string;
    /** The error's OWN code - a driver's `23505`, a gRPC `14`. Belongs with the name, not with the message. */
    code?: string | number;
    /** An `ApplicationError`'s `normalized.code` - the identifier an application filters on. `MessageCode.DEFAULT` never surfaces. */
    messageCode?: string;
    /** Frames ONLY - V8's `Error: <message>` header is stripped so the message is not repeated. */
    stack?: string;
    hint?: string;
    detail?: string;
    table?: string;
    constraint?: string;
    /** Values for the `%{placeholder}` tokens left unresolved in `message` - i18n resolves them downstream, so the log must carry them or the message names no field. */
    args?: Record<string, unknown>;
    /** An `ApplicationError`'s caller context - the one unmodelled payload worth keeping. */
    extra?: Record<string, unknown>;
    cause?: IErrorSummary;
    /** Every reason an `AggregateError` collected. Its own message names none of them, so without this the log says only that something failed. */
    errors?: Array<IErrorSummary>;
}
```

Source: `packages/helpers/src/modules/logger/formatting/error-prettier.ts`

## `IFileStat`

*interface*

What `getStat` reports for one object. `size` is in bytes.

```ts
export interface IFileStat {
    size: number;
    metadata: IObjectMetadata;
    lastModified?: Date;
    etag?: string;
    versionId?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IGetSecretOptions`

*interface*

Selects a secret: the `path` of a bundle and optionally one `key` in it. `defaultValue` is returned when the key is absent.

```ts
export interface IGetSecretOptions<TValue = string> {
    path: string;
    key?: string;
    defaultValue?: TValue;
}
```

Source: `packages/helpers/src/modules/secrets/common/types/helper.ts`

## `IHfLogFlusherOptions`

*interface*

Where the high-frequency logger flusher delivers batches: a custom `sink`, a `filePath`, or stdout when neither is set.

```ts
export interface IHfLogFlusherOptions {
    /** Full custom delivery. Overrides filePath. */
    sink?: THfSink;
    /** File the default sink appends to instead of writing to stdout. */
    filePath?: string;
    /**
     * Entries rendered per batch before yielding.
     * @default HF_DEFAULT_BATCH_SIZE
     */
    batchSize?: number;
}
```

Source: `packages/helpers/src/modules/logger/hf/common/types.ts`

## `IListObjectsOptions`

*interface*

Filters for `listObjects`. `maxKeys` caps the result, and `0` returns nothing.

```ts
export interface IListObjectsOptions {
    bucket: IBucketRef;
    prefix?: string;
    /**
     * Whether the listing descends into folders.
     *
     * @default false
     */
    useRecursive?: boolean;
    maxKeys?: number;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `INetworkTcpClientProps`

*interface*

Options of a TCP client. `createClientFn` opens the socket, so one client type serves plain and TLS.

```ts
export interface INetworkTcpClientProps<SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions, SocketClientType extends PlainSocketClient | TlsSocketClient> {
    identifier: string;
    scope?: string;
    options: SocketClientOptions;
    /**
     * Retries after a close, up to `maxRetry` times.
     * @default false
     */
    reconnect?: boolean;
    /**
     * How many reconnects `reconnect` attempts.
     * @default 5
     */
    maxRetry?: number;
    /** When set, `onData` receives strings in this encoding instead of buffers. */
    encoding?: BufferEncoding;
    createClientFn: (options: SocketClientOptions, connectionListener?: () => void) => SocketClientType;
    onConnected?: (opts: {
        client: SocketClientType;
    }) => ValueOrPromise<void>;
    onData?: (opts: {
        identifier: string;
        message: string | Buffer;
    }) => ValueOrPromise<void>;
    onClosed?: (opts: {
        client: SocketClientType;
    }) => void;
    onError?: (error: any) => void;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts`

## `IObjectInfo`

*interface*

One entry of `listObjects`. `name` is the full object key.

```ts
export interface IObjectInfo {
    name?: string;
    size?: number;
    lastModified?: Date;
    etag?: string;
    prefix?: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IObjectLocation`

*interface*

Which bucket, which object.

```ts
export interface IObjectLocation {
    bucket: IBucketRef;
    object: IObjectRef;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IObjectMetadata`

*interface*

`mimetype` is named because consumers persist it; `any` let it be renamed silently.

```ts
export interface IObjectMetadata {
    mimetype?: string;
    [key: string]: any;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IObjectRef`

*interface*

One object. `key` is the S3 term.

```ts
export interface IObjectRef {
    key: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IParsedMultipartBody`

*interface*

Files and the text fields posted beside them - dropping the second silently loses what the client sent.

```ts
export interface IParsedMultipartBody {
    files: IParsedFile[];
    fields: Record<string, string>;
}

interface IParsedFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer?: Buffer;
    filename?: string;
    path?: string;
}
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `IPostPolicy`

*interface*

What `presignPost` hands a browser: where to post, the fields to post with it, and when the grant dies.

```ts
export interface IPostPolicy {
    postURL: string;
    formData: Record<string, string>;
    expiresAt: string;
}
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `IQueueCallback`

*interface*

Hooks of a sequential queue.

```ts
export interface IQueueCallback<TElementPayload> {
    /**
     * Whether {@link SequentialQueueHelper} dispatches an element on its own.
     * @default true
     */
    autoDispatch?: boolean;
    onMessage?: (opts: {
        identifier: string;
        queueElement: TQueueElement<TElementPayload>;
    }) => ValueOrPromise<void>;
    onDataEnqueue?: (opts: {
        identifier: string;
        queueElement: TQueueElement<TElementPayload>;
    }) => ValueOrPromise<void>;
    onDataDequeue?: (opts: {
        identifier: string;
        queueElement: TQueueElement<TElementPayload>;
    }) => ValueOrPromise<void>;
    onStateChange?: (opts: {
        identifier: string;
        from: TQueueStatus;
        to: TQueueStatus;
    }) => ValueOrPromise<void>;
}
```

Source: `packages/helpers/src/modules/queue/internal/sequential/common/types.ts`

## `IRedisClusterHelperOptions`

*interface*

Options for `RedisClusterHelper`: connection props, lifecycle callbacks and an optional `ioredis` module.

```ts
export interface IRedisClusterHelperOptions extends IRedisClusterHelperProps, IRedisHelperCallbacks, IRedisModuleOption {
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisClusterHelperProps`

*interface*

Connection settings for a Redis Cluster: the startup `nodes`, plus raw ioredis `clusterOptions` that override the helper defaults.

```ts
export interface IRedisClusterHelperProps {
    name: string;
    nodes: Array<{
        host: string;
        port: string | number;
        password?: string;
    }>;
    /**
     * Same meaning as on single and sentinel: `false` holds the client open for a later `connect()`.
     *
     * @default true
     */
    autoConnect?: boolean;
    clusterOptions?: ClusterOptions;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisCommand`

*interface*

Escape hatch to run any Redis command by name.

```ts
export interface IRedisCommand {
    execute<R>(command: string, parameters?: Array<string | number | Buffer>): Promise<R>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisConnection`

*interface*

Client access and connection lifecycle of a Redis helper. `connect` and `disconnect` resolve `false` when the client status makes the call a no-op.

```ts
export interface IRedisConnection {
    getClient(): TRedisClient;
    duplicateClient(): TRedisClient;
    ping(): Promise<string>;
    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisHash`

*interface*

Hash commands (`HSET`, `HGET`, ...) on one key.

```ts
export interface IRedisHash {
    hSet<T extends Record<string, unknown>>(opts: {
        key: string;
        value: T;
        options?: {
            log?: boolean;
        };
    }): Promise<number>;
    hGetAll(opts: {
        key: string;
        transform?: <T, R>(input: T) => R;
    }): Promise<unknown>;
    hGet(opts: {
        key: string;
        field: string;
    }): Promise<string | null>;
    hDel(opts: {
        key: string;
        fields: Array<string>;
    }): Promise<number>;
    hExists(opts: {
        key: string;
        field: string;
    }): Promise<boolean>;
    hKeys(opts: {
        key: string;
    }): Promise<string[]>;
    hVals(opts: {
        key: string;
    }): Promise<string[]>;
    hIncrBy(opts: {
        key: string;
        field: string;
        value: number;
    }): Promise<number>;
    hLen(opts: {
        key: string;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisHelperCallbacks`

*interface*

Lifecycle hooks a Redis helper calls; each receives the helper name and the helper itself.

```ts
export interface IRedisHelperCallbacks {
    onInitialized?: (opts: {
        name: string;
        helper: IRedisHelper;
    }) => void;
    onConnected?: (opts: {
        name: string;
        helper: IRedisHelper;
    }) => void;
    onReady?: (opts: {
        name: string;
        helper: IRedisHelper;
    }) => void;
    onError?: (opts: {
        name: string;
        helper: IRedisHelper;
        error: unknown;
    }) => void;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisJson`

*interface*

RedisJSON commands (`JSON.SET`, `JSON.GET`, ...); the Redis server needs the JSON module.

```ts
export interface IRedisJson {
    jSet<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<string | null>;
    jGet<T>(opts: {
        key: string;
        /** @default '$' */
        path?: string;
    }): Promise<T | null>;
    jDelete(opts: {
        key: string;
        /** @default '$' */
        path?: string;
    }): Promise<number>;
    jNumberIncreaseBy(opts: {
        key: string;
        path: string;
        value: number;
    }): Promise<string | null>;
    jStringAppend(opts: {
        key: string;
        path: string;
        value: string;
    }): Promise<number[] | null>;
    jPush<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<number[] | null>;
    jPop<T>(opts: {
        key: string;
        path: string;
    }): Promise<T | null>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisKey`

*interface*

Key-level commands: existence, expiry, TTL and counters.

```ts
export interface IRedisKey {
    exists(opts: {
        keys: Array<string>;
    }): Promise<number>;
    expire(opts: {
        key: string;
        seconds: number;
    }): Promise<boolean>;
    expireAt(opts: {
        key: string;
        atEpochSeconds: number;
    }): Promise<boolean>;
    ttl(opts: {
        key: string;
    }): Promise<number>;
    persist(opts: {
        key: string;
    }): Promise<boolean>;
    incr(opts: {
        key: string;
    }): Promise<number>;
    decr(opts: {
        key: string;
    }): Promise<number>;
    incrBy(opts: {
        key: string;
        value: number;
    }): Promise<number>;
    decrBy(opts: {
        key: string;
        value: number;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisKeyValue`

*interface*

String value commands, including JSON-serialised object reads and batch get and set. `set` `expiresIn` is in milliseconds.

```ts
export interface IRedisKeyValue {
    set<T>(opts: {
        key: string;
        value: T;
        options?: {
            log?: boolean;
            expiresIn?: number;
        };
    }): Promise<void>;
    get<T = string>(opts: {
        key: string;
        transform?: (input: string) => T;
    }): Promise<T | null>;
    del(opts: {
        keys: Array<string>;
    }): Promise<number>;
    keys(opts: {
        key: string;
    }): Promise<Array<string>>;
    getString(opts: {
        key: string;
    }): Promise<string | null>;
    getStrings(opts: {
        keys: Array<string>;
    }): Promise<(string | null)[]>;
    getObject<T>(opts: {
        key: string;
    }): Promise<T | null>;
    getObjects(opts: {
        keys: Array<string>;
    }): Promise<(unknown | null)[]>;
    mSet<T>(opts: {
        payload: Array<{
            key: string;
            value: T;
        }>;
        options?: {
            log?: boolean;
        };
    }): Promise<void>;
    mGet<T = string>(opts: {
        keys: Array<string>;
        transform?: (input: string) => T;
    }): Promise<(T | null)[]>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisList`

*interface*

List commands (`LPUSH`, `LRANGE`, ...) on one key.

```ts
export interface IRedisList {
    lPush(opts: {
        key: string;
        values: Array<string | number>;
    }): Promise<number>;
    rPush(opts: {
        key: string;
        values: Array<string | number>;
    }): Promise<number>;
    lPop(opts: {
        key: string;
    }): Promise<string | null>;
    rPop(opts: {
        key: string;
    }): Promise<string | null>;
    lRange(opts: {
        key: string;
        start: number;
        stop: number;
    }): Promise<string[]>;
    lLen(opts: {
        key: string;
    }): Promise<number>;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisModuleOption`

*interface*

`ioredis` is an optional peer, loaded when a client is built. A `bun build --compile` binary
carries no `node_modules` to load it from: pass the module here, or register it once with
`ModuleUtility.register({ modules: { ioredis } })` at the entry.

```ts
export interface IRedisModuleOption {
    module?: typeof import('ioredis');
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisPubSub`

*interface*

Publish to many topics and subscribe on the helper client. `publish` serialises the payload as JSON and deflates it when `useCompress` is set.

```ts
export interface IRedisPubSub {
    publish<T>(opts: {
        topics: Array<string>;
        payload: T;
        useCompress?: boolean;
    }): Promise<void>;
    subscribe(opts: {
        topic: string;
    }): void;
    unsubscribe(opts: {
        topic: string;
    }): void;
}
```

Source: `packages/helpers/src/modules/redis/common/interfaces.ts`

## `IRedisSentinelHelperOptions`

*interface*

Options for `RedisSentinelHelper`: connection props, lifecycle callbacks and an optional `ioredis` module.

```ts
export interface IRedisSentinelHelperOptions extends IRedisSentinelHelperProps, IRedisHelperCallbacks, IRedisModuleOption {
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisSentinelHelperProps`

*interface*

Connection settings for Redis behind Sentinel. `redisOptions` overrides the helper defaults.

```ts
export interface IRedisSentinelHelperProps {
    name: string;
    sentinels: Array<{
        host: string;
        /** @default 26379 */
        port?: string | number;
    }>;
    masterName: string;
    /** @default RedisSentinelRoles.MASTER */
    role?: TRedisSentinelRole;
    password?: string;
    sentinelPassword?: string;
    sentinelUsername?: string;
    /** @default 0 */
    database?: number;
    /** @default true */
    autoConnect?: boolean;
    /** @default 0 */
    maxRetry?: number;
    redisOptions?: Partial<RedisOptions>;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

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

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `IRedisSingleHelperProps`

*interface*

Connection settings for a single Redis node.

```ts
export interface IRedisSingleHelperProps {
    name: string;
    host: string;
    port: string | number;
    user?: string;
    /** Omit it for a Redis with no password. */
    password?: string;
    /** @default 0 */
    database?: number;
    /** @default true */
    autoConnect?: boolean;
    /** @default 0 */
    maxRetry?: number;
}
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

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
    [extra: string | symbol]: any;
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
    get<TValue = string>(opts: IGetSecretOptions<TValue>): Promise<TValue>;
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

## `ISecretsRegistration`

*interface*

Declares a secrets provider with the bundles to hydrate and the secrets to lease.

```ts
export interface ISecretsRegistration {
    provider: TSecretProvider;
    config?: AnyObject;
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
        options?: any;
    }): Promise<Readable>;
    /** A web stream, what a `Response` body wants. `range` includes `end`, like the HTTP header. */
    getObjectStream(opts: IObjectLocation & {
        range?: {
            start: number;
            end?: number;
        };
    }): Promise<ReadableStream<Uint8Array>>;
    getStat(opts: IObjectLocation): Promise<IFileStat>;
    listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
    upload(opts: {
        bucket: IBucketRef;
        files: IUploadFile[];
        maxFolderDepth?: number;
        normalizeNameFn?: (opts: {
            file: TUploadNaming;
        }) => string;
        normalizeLinkFn?: (opts: IObjectLocation) => string;
    }): Promise<IUploadResult[]>;
    /**
     * Writes an object from a stream, so a large body never lands in this process. A backend whose
     * transport takes a stream overrides it; the default buffers, which is the thing to avoid.
     */
    writeStream(opts: IObjectLocation & {
        source: ReadableStream<Uint8Array> | Blob | Response | Request;
        contentType?: string;
        /**
         * Folder nesting the key may carry, as `upload` takes it.
         *
         * @default BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH
         */
        maxFolderDepth?: number;
    }): Promise<void>;
    /** Copies within one bucket, server side - the bytes never travel through this process. */
    copyObject(opts: {
        bucket: IBucketRef;
        source: IObjectRef;
        destination: IObjectRef;
    }): Promise<void>;
    removeObject(opts: IObjectLocation): Promise<void>;
    removeObjects(opts: {
        bucket: IBucketRef;
        objects: IObjectRef[];
    }): Promise<void>;
    /** The form a browser posts straight to the storage. Unlike a presigned PUT, a policy carries `content-length-range`, so "at most N bytes" is expressible - a signed PUT binds the length to one exact value. */
    presignPost(opts: {
        bucket: IBucketRef;
        keyPrefix: string;
        maxBytes: number;
        contentType?: string;
        expiresIn?: IDuration;
    }): Promise<IPostPolicy>;
    /** A URL a browser may PUT one object to. Every extra option below is SIGNED - the client must send it back unchanged. A pinned size is exact, never a ceiling; for a ceiling use {@link IStorageHelper.presignPost}. */
    presignPut(opts: IObjectLocation & {
        expiresIn?: IDuration;
        /** The object's tag set, written at the moment it is stored. */
        tagging?: Record<string, string>;
        /** Pins the body to EXACTLY this many bytes. A retry at a different size is refused. */
        contentLength?: number;
        /** Pins the stored content type. Unsigned, the uploader picks what is stored - and the stored type is what a browser later renders. */
        contentType?: string;
    }): Promise<string>;
    presignGet(opts: IObjectLocation & {
        expiresIn?: IDuration;
        responseContentType?: string;
        responseContentDisposition?: string;
    }): Promise<string>;
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
        [additionField: symbol | string]: any;
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
        args: any;
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
    [key: string | symbol]: any;
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
        data: any;
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

## `IWebSocketServerOptions`

*interface*

Options for `WebSocketServerHelper`. Timeouts and intervals are milliseconds. `handshakeFn` is required when `requireEncryption` is true.

```ts
export interface IWebSocketServerOptions<AuthDataType extends Record<string, unknown> = Record<string, unknown>, MetadataType extends Record<string, unknown> = Record<string, unknown>> {
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
    authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
    validateRoomFn?: TWebSocketValidateRoomFn;
    clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
    clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
    messageHandler?: TWebSocketMessageHandler;
    outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
    handshakeFn?: TWebSocketHandshakeFn<AuthDataType>;
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
        [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType>;
    };
}
```

Source: `packages/helpers/src/modules/worker-thread/common/types.ts`

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
     * 1. `APP_ENV_LOGGER_COLOR` - an explicit yes or no from the operator.
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

The rule that decides whether `debug` lines are written: off unless `DEBUG` is truthy and the environment is allowed
(`NODE_ENV` unset, or one of the common names, or one `APP_ENV_EXTRA_LOG_ENVS` adds). Every provider shares it, so a
console, a winston and a pino logger agree.

Pure: it takes the environment as an argument and reads `process` only through a guarded `globalThis` read, because a
browser has none and there the default is off. `LoggerFactory.use({ level })` overrides it.

```ts
export declare class LoggerDebugGate {
    /** The override lives on globalThis, so `use({ level })` in one copy of the module opens or closes debug in the other. */
    private static readonly FORCED_SLOT;
    private static resolved?;
    /** The environment the host has, `{}` where there is no `process`. */
    static readEnvironment(): TEnvironment;
    /**
     * The truthiness `ParseUtility.toBoolean` has, repeated here on purpose: `ParseUtility` imports the error module, and
     * this file is in the graph of `BaseHelper`, which must stay a few hundred bytes in a browser bundle.
     */
    private static isTruthy;
    /** The rule itself, for any environment: a pure function of `env`. */
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
export declare class LoggerFormats {
    static readonly JSON = "json";
    static readonly TEXT = "text";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TLoggerFormat;
}
```

Source: `packages/helpers/src/modules/logger/common/constants.ts`

## `MemoryStorageHelper`

*class*

An in-process keyed container, NOT an `IStorageHelper`: it stores values, not objects in a bucket.

```ts
export declare class MemoryStorageHelper<T extends object = AnyObject> extends BaseHelper {
    private container;
    constructor(opts?: {
        scope?: string;
    });
    static newInstance<T extends object = AnyObject>(): MemoryStorageHelper<T>;
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
    /** Peers handed over by the application, keyed by specifier. Checked before any filesystem lookup. The map lives in a globalThis slot because a process (or a compiled bundle) can carry two copies of this module, and a peer registered through one copy must be found by the other. */
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
        modules: Record<string, AnyType>;
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
    static load<T = AnyType>(opts: {
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
    static loadSync<T = AnyType>(opts: {
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
export declare class MultipartStorages {
    static readonly MEMORY = "memory";
    static readonly DISK = "disk";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
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
    static readonly SCHEME_SET: Set<string>;
    static isValid(scheme: string): boolean;
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
    getClient(): Cluster;
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

## `RedisHelperFactory`

*class*

Creates the Redis helper for a `mode`; the overloads return the concrete helper type. Throws on an unsupported mode.

```ts
export declare class RedisHelperFactory {
    static create(opts: {
        mode: typeof RedisModes.SINGLE;
    } & IRedisSingleHelperOptions): RedisSingleHelper;
    static create(opts: {
        mode: typeof RedisModes.CLUSTER;
    } & IRedisClusterHelperOptions): RedisClusterHelper;
    static create(opts: {
        mode: typeof RedisModes.SENTINEL;
    } & IRedisSentinelHelperOptions): RedisSentinelHelper;
    static create(opts: TCreateRedisHelperOptions): AbstractRedisHelper;
}
```

Source: `packages/helpers/src/modules/redis/factory.ts`

## `RedisModes`

*class*

Deployment modes a Redis helper can be built for; selects the helper in `RedisHelperFactory.create`.

```ts
export declare class RedisModes {
    static readonly SINGLE = "single";
    static readonly CLUSTER = "cluster";
    static readonly SENTINEL = "sentinel";
    static readonly SCHEME_SET: Set<string>;
    static isValid(scheme: string): scheme is TRedisMode;
}
```

Source: `packages/helpers/src/modules/redis/common/constants.ts`

## `RedisSentinelHelper`

*class*

Redis helper for a master and replicas behind Sentinel. `redisOptions` overrides the helper defaults; the first-class fields override `redisOptions`.

```ts
export declare class RedisSentinelHelper extends AbstractRedisHelper<Redis> {
    constructor(opts: IRedisSentinelHelperOptions);
    getClient(): Redis;
}
```

Source: `packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts`

## `RedisSentinelRoles`

*class*

Role of the node a Sentinel-backed client connects to.

```ts
export declare class RedisSentinelRoles {
    static readonly MASTER = "master";
    static readonly SLAVE = "slave";
    static readonly ROLE_SET: Set<string>;
    static isValid(role: string): role is TRedisSentinelRole;
}
```

Source: `packages/helpers/src/modules/redis/common/constants.ts`

## `RedisSingleHelper`

*class*

Redis helper over one ioredis `Redis` client connected to a single node.

```ts
export declare class RedisSingleHelper extends AbstractRedisHelper<Redis> {
    constructor(opts: IRedisSingleHelperOptions);
    getClient(): Redis;
}
```

Source: `packages/helpers/src/modules/redis/single/single.helper.ts`

## `RedisUtility`

*class*

Static helpers for working with ioredis clients.

```ts
export declare class RedisUtility {
    /** Resolves once the client reaches `ready`; rejects on the first client error or when `timeoutMs` elapses. */
    static waitForReady(opts: {
        client: TRedisClient;
        timeoutMs?: number;
    }): Promise<void>;
    /** Kicks off connection for clients still parked in `wait` - duplicated clients inherit `lazyConnect` from their parent and never dial on their own. */
    static ensureConnecting(opts: {
        clients: TRedisClient[];
        logger?: ILogger;
        scope: string;
    }): void;
}
```

Source: `packages/helpers/src/modules/redis/utility.ts`

## `RequestUtility`

*class*

Multipart body parsing and `Content-Disposition` header building and parsing for requests and uploads.

```ts
export declare class RequestUtility {
    static parseMultipartBody<C extends {
        req: any;
    } = {
        req: any;
    }>(opts: IParseMultipartOptions<C>): Promise<IParsedMultipartBody>;
    private static removeSpooled;
    private static readParts;
    /** Sanitizes a filename by removing path components and dangerous characters. The result is printable ASCII. */
    static sanitizeFilename(opts: {
        filename: string;
    }): string;
    static encodeRfc5987(opts: {
        filename: string;
    }): string;
    static buildContentDispositionHeader(opts: {
        filename: string;
        type: TContentDispositionType;
    }): string;
    /**
     * Reads a filename out of a `Content-Disposition` value.
     *
     * Three forms, in the order the RFC gives them precedence: `filename*=UTF-8''...` (percent-encoded,
     * and the one hand-rolled parsers miss), a quoted `filename="..."`, and a bare `filename=...`.
     * Splitting on `filename=` alone returns the percent-encoded bytes for any non-ASCII name, which in
     * a product with non-English filenames is most of them.
     *
     * The pair of {@link RequestUtility.buildContentDispositionHeader}: one writes the header, this one reads it.
     */
    static parseContentDisposition(opts: {
        header: string | null | undefined;
    }): {
        type?: string;
        filename?: string;
    };
}

interface IParseMultipartOptions<C extends {
    req: any;
} = {
    req: any;
}> {
    storage?: TMultipartStorage;
    uploadDir?: string;
    /** The most file parts one request may carry; more is refused (413) before anything is spooled. Unset: no limit. */
    maxFiles?: number;
    context: C;
}
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `RSA`

*class*

`generateDERKeyPair`, `encrypt` and `decrypt` are async: they run over `crypto.subtle`.

```ts
export declare class RSA extends BaseCryptoAlgorithm<RSAAlgorithmType, string, string, string, Promise<string>, Promise<string>, IRSAExtraOptions> {
    constructor(opts: {
        algorithm: RSAAlgorithmType;
    });
    static withAlgorithm(): RSA;
    /**
     * Rejects a modulus below `MINIMUM_RSA_MODULUS_BITS` rather than generating it - a weak key still
     * works, signs, and verifies, so this is the only point where the size is ever checked.
     */
    generateDERKeyPair(opts?: {
        modulus: number;
    }): Promise<{
        publicKey: Buffer<ArrayBuffer>;
        privateKey: Buffer<ArrayBuffer>;
    }>;
    encrypt(opts: {
        message: string;
        secret: string;
        opts?: IRSAExtraOptions;
    }): Promise<string>;
    decrypt(opts: {
        message: string;
        secret: string;
        opts?: IRSAExtraOptions;
    }): Promise<string>;
}

interface IRSAExtraOptions {
    inputEncoding?: {
        key: BufferEncoding;
        message: BufferEncoding;
    };
    outputEncoding?: BufferEncoding;
    doThrow?: boolean;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts`

## `RSAAlgorithmType`

*type*

The algorithm name `RSA` reports as its `algorithm`.

```ts
export type RSAAlgorithmType = 'rsa';
```

Source: `packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts`

## `S3Audiences`

*class*

Which host a signed artifact names. `host` is inside every SigV4 signature, so this is decided at signing time and cannot be patched afterwards.

```ts
export declare class S3Audiences {
    /** The host THIS process talks to: every bucket operation, copy and tagging call. */
    static readonly SERVER = "server";
    /** The host a BROWSER is handed: presigned URLs and POST policies. */
    static readonly BROWSER = "browser";
    static readonly SCHEME_SET: Set<string>;
    static isValid(audience: string): boolean;
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `SecretProviders`

*class*

Secret backends a secrets registration can select.

```ts
export declare class SecretProviders {
    static readonly SYSTEM_ENVS = "system-envs";
    static readonly HASHICORP_VAULT = "hashicorp-vault";
    static readonly DOTENV_VAULT = "dotenv-vault";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TSecretProvider;
}
```

Source: `packages/helpers/src/modules/secrets/common/constants.ts`

## `SecretsHelperFactory`

*class*

Builds the `ISecretsHelper` for a registration by its `provider`. Throws when the provider is unknown, or when the provider package is neither installed, registered, nor injected through the config.

```ts
export declare class SecretsHelperFactory {
    static create(opts: ISecretsRegistration & {
        identifier?: string;
    }): Promise<ISecretsHelper>;
}
```

Source: `packages/helpers/src/modules/secrets/factory.ts`

## `SequentialQueueHelper`

*class*

In-memory FIFO queue that hands one element at a time to `onMessage`.
A throwing handler is logged and its element dropped, so the queue keeps moving.

```ts
export declare class SequentialQueueHelper<TElementPayload> extends BaseHelper {
    storage: Array<TQueueElement<TElementPayload>>;
    protected processingEvents: Set<TQueueElement<TElementPayload>>;
    protected generator: Generator;
    protected totalEvent: number;
    protected autoDispatch: boolean;
    protected state: TQueueStatus;
    protected isSettleRequested: boolean;
    private onMessage?;
    private onDataEnqueue?;
    private onDataDequeue?;
    private onStateChange?;
    constructor(opts: IQueueCallback<TElementPayload> & {
        identifier: string;
    });
    /** Announce a state transition, awaiting the hook but never letting it break the caller. */
    protected notifyStateChange(opts: {
        scope: string;
        from: TQueueStatus;
    }): Promise<void>;
    /** Announce a state transition from a synchronous caller (lock/unlock/settle) - fire-and-forget. */
    protected notifyStateChangeAsync(opts: {
        scope: string;
        from: TQueueStatus;
    }): void;
    protected handleMessage(): Promise<void>;
    private _messageListener;
    nextMessage(): void;
    enqueue(payload: TElementPayload): Promise<void>;
    dequeue(): TQueueElement<TElementPayload> | undefined;
    lock(): void;
    unlock(opts: {
        shouldProcessNextElement?: boolean;
    }): void;
    settle(): void;
    isSettled(): boolean;
    close(): void;
    getElementAt(position: number): TQueueElement<TElementPayload>;
    getState(): TQueueStatus;
    getTotalEvent(): number;
    getProcessingEvents(): Set<TQueueElement<TElementPayload>>;
}
```

Source: `packages/helpers/src/modules/queue/internal/sequential/helper.ts`

## `StorageConcurrency`

*class*

Concurrent object operations. Unbounded exhausts sockets and gets rate limited.

```ts
export declare class StorageConcurrency {
    static readonly DEFAULT_LIMIT = 16;
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `StorageErrors`

*const*

Codes a caller branches on for a storage failure that is the request's fault, not the backend's.

```ts
export declare const StorageErrors: {
    readonly OBJECT_NOT_FOUND: {
        readonly message: {
            readonly text: "Object not found";
            readonly code: "core.storage.object_not_found";
        };
        readonly statusCode: 404;
        readonly category: "business";
    };
};
```

Source: `packages/helpers/src/modules/storage/common/errors.ts`

## `StoragePresignDefaults`

*class*

Presign expiry defaults - a PUT or a POST form carries a file and needs more time; a GET is a redirect.

```ts
export declare class StoragePresignDefaults {
    static readonly PUT_EXPIRES_IN: IDuration;
    static readonly GET_EXPIRES_IN: IDuration;
    /** A browser upload form: the user has to pick the file and the bytes have to travel. */
    static readonly POST_EXPIRES_IN: IDuration;
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `StoragePresignLimits`

*class*

SigV4 refuses a presigned URL valid for longer than 7 days.

```ts
export declare class StoragePresignLimits {
    static readonly MAX_EXPIRES_IN_SECONDS: number;
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `StorageUtility`

*class*

Backend-neutral checks shared by storage helpers: recognising a "not found" error and turning an `IDuration` into presign seconds.

```ts
export declare class StorageUtility {
    /** "Not there", across SDKs. Both minio and Bun report `S3Error` in `name`, so `code` and status decide. */
    static isNotFoundError(opts: {
        error: unknown;
    }): boolean;
    /** S3 presigns in whole seconds. An unknown unit is refused; `null` would read as "no expiry". */
    static toExpirySeconds(opts: {
        expiresIn: IDuration;
        operation: string;
    }): number;
}
```

Source: `packages/helpers/src/modules/storage/common/utility.ts`

## `SystemEnvsHelper`

*class*

Secrets provider that serves the current `process.env` entries. Dynamic leases are not supported: `lease()` throws.

```ts
export declare class SystemEnvsHelper extends AbstractSecretsHelper {
    constructor(opts: {
        identifier?: string;
        clock?: IClock;
        timers?: ITimerAdapter;
    });
    protected fetchRaw(): Promise<{
        value: Record<string, string>;
    }>;
    protected renewRaw(): Promise<null>;
    protected revokeRaw(): Promise<void>;
    lease(_opts: {
        path: string;
        key: string;
    }): Promise<ISecretLease>;
}
```

Source: `packages/helpers/src/modules/secrets/system-envs/system-envs.helper.ts`

## `TAESSecret`

*type*

A single secret string, or a keyring. Encrypt uses the first keyring entry; decrypt uses the entry whose `id` matches the ciphertext.

```ts
export type TAESSecret = string | IAESKeyringEntry[];
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`

## `TBullQueueRole`

*type*

Valid BullMQ queue role values.

```ts
export type TBullQueueRole = TConstValue<typeof BullQueueRoles>;
```

Source: `packages/helpers/src/modules/queue/common/constants.ts`

## `TContentDispositionType`

*type*

Valid Content-Disposition type values.

```ts
export type TContentDispositionType = TConstValue<typeof ContentDispositionTypes>;
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `TcpClientStates`

*class*

Where a TCP client is in the authentication handshake.

```ts
export declare class TcpClientStates {
    static readonly UNAUTHORIZED = "unauthorized";
    static readonly AUTHENTICATING = "authenticating";
    static readonly AUTHENTICATED = "authenticated";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`

## `TCreateRedisHelperOptions`

*type*

Options for `RedisHelperFactory.create`: the helper options of one mode, discriminated by `mode`.

```ts
export type TCreateRedisHelperOptions = ({
    mode: typeof RedisModes.SINGLE;
} & IRedisSingleHelperOptions) | ({
    mode: typeof RedisModes.CLUSTER;
} & IRedisClusterHelperOptions) | ({
    mode: typeof RedisModes.SENTINEL;
} & IRedisSentinelHelperOptions);
```

Source: `packages/helpers/src/modules/redis/factory.ts`

## `TCredentialAlgorithm`

*type*

One of the `CredentialAlgorithms` values.

```ts
export type TCredentialAlgorithm = TConstValue<typeof CredentialAlgorithms>;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `THashAlgorithm`

*type*

One of the `HashAlgorithms` values.

```ts
export type THashAlgorithm = TConstValue<typeof HashAlgorithms>;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `THashOutputEncoding`

*type*

One of the `HashOutputEncodings` values.

```ts
export type THashOutputEncoding = TConstValue<typeof HashOutputEncodings>;
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `THfLogLevel`

*type*

The levels the high-frequency logger writes: the shared log levels.

```ts
export type THfLogLevel = TLogLevel;
```

Source: `packages/helpers/src/modules/logger/hf/common/types.ts`

## `THfSink`

*type*

Declared `=> void` ON PURPOSE: TS's void-return exemption lets both sync and `async` sinks assign to it (`void | Promise<void>` would reject the sync form); the flusher still awaits a returned thenable, so a rejection is caught and logged, never unhandled.

```ts
export type THfSink = (batch: THfSinkBatch) => void;
```

Source: `packages/helpers/src/modules/logger/hf/common/types.ts`

## `THfSinkBatch`

*type*

One batch handed to a sink: the rendered `lines`, and `dropped`, the number of entries overwritten in the ring before they could be read.

```ts
export type THfSinkBatch = {
    lines: Array<string>;
    dropped: number;
};
```

Source: `packages/helpers/src/modules/logger/hf/common/types.ts`

## `TLoggerFormat`

*type*

One of the `LoggerFormats` values.

```ts
export type TLoggerFormat = TConstValue<typeof LoggerFormats>;
```

Source: `packages/helpers/src/modules/logger/common/constants.ts`

## `TMultipartStorage`

*type*

Valid multipart storage values.

```ts
export type TMultipartStorage = TConstValue<typeof MultipartStorages>;
```

Source: `packages/helpers/src/utilities/request.utility.ts`

## `TQueueElement`

*type*

One queued item: `payload`, plus `isLocked` while a handler holds it.

```ts
export type TQueueElement<T> = {
    isLocked: boolean;
    payload: T;
};
```

Source: `packages/helpers/src/modules/queue/internal/sequential/common/types.ts`

## `TQueueStatus`

*type*

A {@link QueueStatuses} value.

```ts
export type TQueueStatus = ValueOf<Omit<typeof QueueStatuses, 'isValid' | 'SCHEME_SET'>>;
```

Source: `packages/helpers/src/modules/queue/internal/sequential/common/types.ts`

## `TRedisClient`

*type*

The ioredis client a helper wraps: a single or Sentinel `Redis`, or a `Cluster`.

```ts
export type TRedisClient = Redis | Cluster;
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `TRedisMode`

*type*

Union of the `RedisModes` values.

```ts
export type TRedisMode = TConstValue<typeof RedisModes>;
```

Source: `packages/helpers/src/modules/redis/common/constants.ts`

## `TRedisSentinelRole`

*type*

Union of the `RedisSentinelRoles` values.

```ts
export type TRedisSentinelRole = TConstValue<typeof RedisSentinelRoles>;
```

Source: `packages/helpers/src/modules/redis/common/constants.ts`

## `TS3Audience`

*type*

The host a signed artifact names: `server` (the host this process talks to) or `browser` (the host a browser is handed).

```ts
export type TS3Audience = TConstValue<typeof S3Audiences>;
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `TSecretProvider`

*type*

Union of the `SecretProviders` values.

```ts
export type TSecretProvider = TConstValue<typeof SecretProviders>;
```

Source: `packages/helpers/src/modules/secrets/common/constants.ts`

## `TSecretRotationHandler`

*type*

Callback run when a leased secret is renewed with new values; may be async.

```ts
export type TSecretRotationHandler = (event: ISecretRotationEvent) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/secrets/common/types/lease.ts`

## `TTask`

*type*

An async task as `executeWithLimit` takes it.

```ts
export type TTask<T> = (...args: any[]) => Promise<T>;
```

Source: `packages/helpers/src/utilities/promise.utility.ts`

## `TTcpClientState`

*type*

Valid TCP client state values.

```ts
export type TTcpClientState = TConstValue<typeof TcpClientStates>;
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`

## `TTimerHandle`

*type*

Opaque handle returned by `ITimerAdapter.set`.

```ts
export type TTimerHandle = ReturnType<typeof setTimeout> | number | object;
```

Source: `packages/helpers/src/modules/secrets/common/types/timer.ts`

## `TUploadNaming`

*type*

The parts of an upload a naming hook needs; `IUploadFile` already declares both.

```ts
export type TUploadNaming = Pick<IUploadFile, 'originalName' | 'folderPath'>;
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

## `TVaultAuthMethod`

*type*

Union of the `VaultAuthMethods` values.

```ts
export type TVaultAuthMethod = TConstValue<typeof VaultAuthMethods>;
```

Source: `packages/helpers/src/modules/secrets/common/constants.ts`

## `TWebSocketAuthenticateFn`

*type*

Verifies the data a client sends to authenticate. Resolves `{ userId, metadata }` to accept, or `null` or `false` to reject.

```ts
export type TWebSocketAuthenticateFn<AuthDataType extends Record<string, unknown> = Record<string, unknown>, MetadataType extends Record<string, unknown> = Record<string, unknown>> = (opts: AuthDataType) => ValueOrPromise<{
    userId?: string;
    metadata?: MetadataType;
} | null | false>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `TWebSocketClientConnectedFn`

*type*

Called after a client has authenticated.

```ts
export type TWebSocketClientConnectedFn<MetadataType extends Record<string, unknown> = Record<string, unknown>> = (opts: {
    clientId: string;
    userId?: string;
    metadata?: MetadataType;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `TWebSocketClientDisconnectedFn`

*type*

Called after a client has disconnected.

```ts
export type TWebSocketClientDisconnectedFn = (opts: {
    clientId: string;
    userId?: string;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `TWebSocketClientState`

*type*

One of the `WebSocketClientStates` values.

```ts
export type TWebSocketClientState = TConstValue<typeof WebSocketClientStates>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/client.ts`

## `TWebSocketEvent`

*type*

One of the `WebSocketEvents` values.

```ts
export type TWebSocketEvent = TConstValue<typeof WebSocketEvents>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `TWebSocketHandshakeFn`

*type*

Produces the server public key and salt for an encrypted session during authentication. Resolves `null` or `false` to refuse the handshake.

```ts
export type TWebSocketHandshakeFn<AuthDataType extends Record<string, unknown> = Record<string, unknown>> = (opts: {
    clientId: string;
    userId?: string;
    data: AuthDataType;
}) => ValueOrPromise<{
    serverPublicKey: string;
    salt: string;
} | null | false>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `TWebSocketMessageHandler`

*type*

Handles a message received from an authenticated client.

```ts
export type TWebSocketMessageHandler = (opts: {
    clientId: string;
    userId?: string;
    message: IWebSocketMessage;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `TWebSocketMessageType`

*type*

One of the `WebSocketMessageTypes` values.

```ts
export type TWebSocketMessageType = TConstValue<typeof WebSocketMessageTypes>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `TWebSocketOutboundTransformer`

*type*

Rewrites an outbound event before it is sent to an encrypted client. Resolving `null` or `undefined` sends the original event and data.

```ts
export type TWebSocketOutboundTransformer<DataType = unknown, MetadataType extends Record<string, unknown> = Record<string, unknown>> = (opts: {
    client: IWebSocketClient<MetadataType>;
    event: string;
    data: DataType;
}) => ValueOrPromise<TNullable<{
    event: string;
    data: DataType;
}>>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `TWebSocketValidateRoomFn`

*type*

Returns the subset of the requested `rooms` the client may join; when none is allowed, the join is rejected.

```ts
export type TWebSocketValidateRoomFn = (opts: {
    clientId: string;
    userId?: string;
    rooms: string[];
}) => ValueOrPromise<string[]>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/hooks.ts`

## `UrlIngest`

*class*

Fetching an untrusted url without letting it reach inside the network.

```ts
export declare class UrlIngest {
    /**
     * Resolves `hostname` once and returns every address it answered, refusing the host when ANY of them is non-public.
     * Checking only the first walks straight into a host that publishes one public A record beside an internal one.
     * An IP literal answers itself. `allowPrivateAddress` skips the check and returns an empty list: nothing to pin to.
     */
    static resolvePublicAddresses(opts: {
        hostname: string;
        policy?: IUrlSafetyPolicy;
        signal?: AbortSignal;
    }): Promise<string[]>;
    /**
     * Rejects when ANY resolved address is non-public.
     *
     * A rebinding window remains when this is called on its own: the address can change between this check and a
     * later connect. {@link UrlIngest.fetchGuarded} closes it by connecting to the address it vetted.
     */
    static assertPublicHost(opts: {
        hostname: string;
        policy?: IUrlSafetyPolicy;
    }): Promise<void>;
    /** Both halves, in the order they must run: shape first, then the network. */
    static assertReachableUrl(opts: {
        url: string;
        policy?: IUrlSafetyPolicy;
    }): Promise<URL>;
    private static readTimeoutMilliseconds;
    /** Settles with `work`, or rejects with the signal's reason when the deadline passes first: a slow resolver must not outlive it. */
    private static withDeadline;
    /** Request headers that name the body; they go when a redirect turns the request into a GET. */
    private static readonly BODY_HEADERS;
    /**
     * The only caller headers a cross-origin redirect keeps. Every other one is dropped: a tenant's webhook secret
     * (`x-api-key`, a signature) must not follow a redirect to a host that tenant did not name.
     */
    private static readonly CROSS_ORIGIN_HEADERS;
    /** The statuses that name a new location; a 304 or a 300 is an answer, not a redirect. */
    private static readonly REDIRECT_STATUSES;
    /** Connect-phase errors: nothing was sent, so trying the next vetted address cannot deliver a request twice. */
    private static readonly CONNECT_ERROR_CODES;
    private static onlyHeaders;
    private static withoutHeaders;
    /**
     * One request to `target`. With `addresses` it connects to those vetted addresses and nowhere else, in order, and
     * moves to the next one only when the connection itself fails: the url's host is set as the `Host` header, and for
     * https as the TLS server name, so the certificate is still checked against the name the caller asked for.
     */
    private static send;
    /**
     * A request that an untrusted url cannot steer inside the network. GET by default; `method`, `headers` and `body`
     * (text or bytes, so a redirect can replay it) make it a signed webhook dispatch.
     *
     * The host is resolved ONCE per hop, every answer is checked, and the request connects to those addresses and to no
     * other, so a DNS answer that changes after the check (DNS rebinding) is never looked up again. The `Host` header and,
     * for https, the TLS server name stay the url's own, so the certificate is verified for that name. A `Host` in
     * `headers` is ignored. The environment's `HTTP_PROXY` / `HTTPS_PROXY` is ignored on a pinned
     * connection, because a proxy would resolve the name itself and undo the pin. `policy.proxy` sends the request through a
     * proxy on purpose; that connection is not pinned (see `IUrlSafetyPolicy.proxy`). `allowPrivateAddress` turns the guard,
     * and so the pin, off.
     *
     * Redirects are followed by hand so every hop is re-checked and re-pinned - `redirect: 'follow'` would land on an
     * internal host with no second look. 301, 302 (for a POST) and 303 turn the request into a GET without a body. A 307 or
     * 308 repeats the request; with a body it is refused when it leaves the origin, so a signed payload is never replayed to
     * a host a redirect chose. When a hop changes origin every caller header is dropped except `accept`, `accept-language` and `user-agent`.
     *
     * The body is returned unread: the caller decides whether to stream it onward or cap it with
     * {@link UrlIngest.readCappedBody}. Nothing is buffered here.
     */
    static fetchGuarded(opts: {
        url: string;
        policy?: IUrlSafetyPolicy;
        method?: string;
        headers?: Record<string, string>;
        body?: string | Uint8Array;
    }): Promise<Response>;
    /**
     * Enforces `maxBytes` on a stream nothing reads into this process - the shape a caller wants when
     * the body is piped onward rather than held. Without it a `maxBytes` policy is inert on that path.
     */
    static capStream(opts: {
        source: ReadableStream<Uint8Array>;
        policy?: IUrlSafetyPolicy;
    }): ReadableStream<Uint8Array>;
    /**
     * Reads a body that must not exceed `maxBytes`, cancelling the moment it does. `content-length` is
     * checked first because it is free, and counted anyway because it may be absent or lie.
     */
    static readCappedBody(opts: {
        response: Response;
        policy?: IUrlSafetyPolicy;
    }): Promise<Buffer>;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/ingest.ts`

## `UrlSafetyErrors`

*const*

A url the policy refuses is refused forever - the same url will never be allowed. A caller that
retries on failure has to tell that apart from a host that timed out, or it retries a rejection
and turns the guard into a repeat scanner.

```ts
export declare const UrlSafetyErrors: {
    readonly URL_REFUSED: {
        readonly message: {
            readonly text: "Url refused by the safety policy";
            readonly code: "core.url_safety.url_refused";
        };
        readonly statusCode: 400;
        readonly category: "business";
    };
};
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/errors.ts`

## `VaultAuthMethods`

*class*

Ways a Vault provider can authenticate.

```ts
export declare class VaultAuthMethods {
    static readonly TOKEN = "token";
    static readonly APP_ROLE = "app-role";
    static readonly KUBERNETES = "kubernetes";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TVaultAuthMethod;
}
```

Source: `packages/helpers/src/modules/secrets/common/constants.ts`

## `WebSocketChannels`

*class*

Redis channel names used to route WebSocket messages across server instances; the `for*` methods build a channel from an id, and the `for*Pattern` methods build the matching subscription pattern.

```ts
export declare class WebSocketChannels {
    static readonly BROADCAST = "ws:broadcast";
    static readonly ROOM_PREFIX = "ws:room:";
    static readonly CLIENT_PREFIX = "ws:client:";
    static readonly USER_PREFIX = "ws:user:";
    static forRoom(opts: {
        room: string;
    }): string;
    static forClient(opts: {
        clientId: string;
    }): string;
    static forUser(opts: {
        userId: string;
    }): string;
    static forRoomPattern(): string;
    static forClientPattern(): string;
    static forUserPattern(): string;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketClientStates`

*class*

Connection states of a WebSocket client. `isValid` narrows a string to one of them.

```ts
export declare class WebSocketClientStates {
    static readonly UNAUTHORIZED = "unauthorized";
    static readonly AUTHENTICATING = "authenticating";
    static readonly AUTHENTICATED = "authenticated";
    static readonly DISCONNECTED = "disconnected";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TConstValue<typeof WebSocketClientStates>;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketDefaults`

*class*

Default WebSocket server settings. Timeouts of `AUTH_TIMEOUT`, `HEARTBEAT_INTERVAL` and `HEARTBEAT_TIMEOUT` are milliseconds, `IDLE_TIMEOUT` is seconds, and payload and backpressure limits are bytes.

```ts
export declare class WebSocketDefaults {
    static readonly PATH = "/ws";
    static readonly ROOM = "ws-default";
    static readonly NOTIFICATION_ROOM = "ws-notification";
    static readonly BROADCAST_TOPIC = "ws:internal:broadcast";
    static readonly MAX_PAYLOAD_LENGTH: number;
    static readonly IDLE_TIMEOUT = 60;
    static readonly BACKPRESSURE_LIMIT: number;
    static readonly SEND_PINGS = true;
    static readonly PUBLISH_TO_SELF = false;
    static readonly AUTH_TIMEOUT = 5000;
    static readonly HEARTBEAT_INTERVAL = 30000;
    static readonly HEARTBEAT_TIMEOUT = 90000;
    static readonly ENCRYPTED_BATCH_LIMIT = 10;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketEmitter`

*class*

Publishes WebSocket messages to clients on any server instance through Redis, without holding connections itself. `configure()` must run first.

```ts
export declare class WebSocketEmitter extends BaseHelper {
    private redisPub;
    constructor(opts: IWebSocketEmitterOptions);
    private initRedisClient;
    configure(): Promise<void>;
    private publish;
    toClient(opts: {
        clientId: string;
        event: string;
        data: unknown;
    }): Promise<void>;
    toUser(opts: {
        userId: string;
        event: string;
        data: unknown;
    }): Promise<void>;
    toRoom(opts: {
        room: string;
        event: string;
        data: unknown;
        exclude?: string[];
    }): Promise<void>;
    broadcast(opts: {
        event: string;
        data: unknown;
    }): Promise<void>;
    shutdown(): Promise<void>;
}
```

Source: `packages/helpers/src/modules/socket/websocket/emitter/helper.ts`

## `WebSocketEvents`

*class*

Event names of the WebSocket protocol. `isValid` narrows a string to one of them.

```ts
export declare class WebSocketEvents {
    static readonly AUTHENTICATE = "authenticate";
    static readonly CONNECTED = "connected";
    static readonly DISCONNECT = "disconnect";
    static readonly JOIN = "join";
    static readonly LEAVE = "leave";
    static readonly ERROR = "error";
    static readonly HEARTBEAT = "heartbeat";
    static readonly ENCRYPTED = "encrypted";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TWebSocketEvent;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketMessageTypes`

*class*

Delivery target types of a WebSocket message. `isValid` narrows a string to one of them.

```ts
export declare class WebSocketMessageTypes {
    static readonly CLIENT = "client";
    static readonly USER = "user";
    static readonly ROOM = "room";
    static readonly BROADCAST = "broadcast";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TWebSocketMessageType;
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketServerHelper`

*class*

WebSocket server for Bun with authentication, rooms, heartbeats, optional encrypted sessions, and Redis fan-out across instances. Clients must authenticate through `authenticateFn` within `authTimeout`.

```ts
export declare class WebSocketServerHelper<AuthDataType extends Record<string, unknown> = Record<string, unknown>, MetadataType extends Record<string, unknown> = Record<string, unknown>> extends BaseHelper {
    /**
     * Narrows an untrusted room payload to the strings it actually contains.
     *
     * `payload as { rooms?: string[] }` is a claim, not a check: the value comes off the wire, so
     * `{"rooms":"lobby"}` satisfied the `rooms?.length` test (a string has one) and the next line
     * called `rooms.filter`, which a string does not have. Under `Bun.serve` that TypeError is thrown
     * inside the message callback and exits the process.
     */
    private static toRoomList;
    private path;
    private serverId;
    private clients;
    private users;
    private rooms;
    private delivery;
    private redisPub;
    private redisSub;
    private authenticateFn;
    private validateRoomFn?;
    private onClientConnected?;
    private onClientDisconnected?;
    private messageHandler?;
    private handshakeFn?;
    private defaultRooms;
    private serverOptions;
    private authTimeout;
    private heartbeatInterval;
    private heartbeatTimeout;
    private heartbeatTimer;
    private requireEncryption;
    constructor(opts: IWebSocketServerOptions<AuthDataType, MetadataType>);
    private initRedisClients;
    getClients(opts?: {
        id?: string;
    }): IWebSocketClient<MetadataType> | Map<string, IWebSocketClient<MetadataType>> | undefined;
    getClientsByUser(opts: {
        userId: string;
    }): IWebSocketClient<MetadataType>[];
    getClientsByRoom(opts: {
        room: string;
    }): IWebSocketClient<MetadataType>[];
    getPath(): string;
    /** Hooks run inside Bun socket handlers - a sync throw there kills the process; voidExecution only catches promise rejections since its argument is evaluated before the try/catch runs. */
    protected invokeHook(opts: {
        scope: string;
        execution: () => ValueOrPromise<void>;
    }): void;
    configure(): Promise<void>;
    private setupRedisSubscriptions;
    private onRedisMessage;
    private publishToRedis;
    getBunWebSocketHandler(): IBunWebSocketHandler;
    onClientConnect(opts: {
        clientId: string;
        socket: IWebSocket;
    }): void;
    onClientMessage(opts: {
        clientId: string;
        raw: string;
    }): void;
    onClientDisconnect(opts: {
        clientId: string;
    }): void;
    joinRoom(opts: {
        clientId: string;
        room: string;
    }): void;
    leaveRoom(opts: {
        clientId: string;
        room: string;
    }): void;
    /** Unsubscribes the client from Bun native topics so `server.publish()` can't reach it - encrypted clients get messages only via the outbound transformer. */
    enableClientEncryption(opts: {
        clientId: string;
    }): void;
    private handleAuthenticate;
    private handleJoin;
    private handleLeave;
    /** Local delivery and fan-out live in WebSocketDeliveryHelper - kept public here by delegation. */
    sendToClient(opts: {
        clientId: string;
        event: string;
        data: unknown;
        doLog?: boolean;
    }): void;
    sendToUser(opts: {
        userId: string;
        event: string;
        data: unknown;
    }): void;
    sendToRoom(opts: {
        room: string;
        event: string;
        data: unknown;
        exclude?: string[];
    }): void;
    broadcast(opts: {
        event: string;
        data: unknown;
        exclude?: string[];
    }): void;
    send<T = unknown>(opts: {
        destination?: string;
        payload: {
            topic: string;
            data: T;
        };
        doLog?: boolean;
        callback?: () => void;
    }): void;
    private startHeartbeatTimer;
    private heartbeatAll;
    shutdown(): Promise<void>;
}
```

Source: `packages/helpers/src/modules/socket/websocket/server/helper.ts`

## `WorkerPoolHelper`

*class*

Registry of workers by key. `register` refuses a worker once the pool holds one per CPU core, unless `ignoreMaxWarning` is set, and refuses a duplicate key; `getInstance()` returns the shared pool.

```ts
export declare class WorkerPoolHelper extends BaseHelper {
    private static instance;
    protected registry: Map<string | symbol, IWorker<any>>;
    private numberOfCPUs;
    private ignoreMaxWarning;
    constructor(opts?: {
        ignoreMaxWarning?: boolean;
    });
    static getInstance(): WorkerPoolHelper;
    size(): number;
    get<MessageType>(opts: {
        key: string;
    }): IWorker<MessageType> | undefined;
    has(opts: {
        key: string;
    }): boolean;
    register<MessageType>(opts: {
        key: string;
        worker: IWorker<MessageType>;
    }): boolean;
    unregister(opts: {
        key: string;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/worker-thread/worker-pool.ts`

## Re-exported

- `AbstractCryptoAlgorithm` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AbstractNetworkFetchableHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AbstractPoolHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AbstractTemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `AESAlgorithms` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AESAlgorithmType` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AnyObject` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `AnyType` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ApplicationError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BaseHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BaseNetworkRequest` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BasePoolHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BuildInfoRegistry` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ClassResolver` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ConsoleLogger` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `CONTENT_TYPE_BY_EXTENSION` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ContentTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ContentTypeTable` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DataTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DayjsTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_LOCALE` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_PATTERN` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_TZ` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_UID_DELIMITER` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DEFAULT_UID_LENGTH` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DEFAULT_UID_MAX_ATTEMPTS` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `Defaults` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DurationAliases` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DurationMultipliers` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DurationUnits` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ECDH` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ECDHAlgorithmType` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `EnvironmentNames` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ErrorLogLevels` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ErrorScopes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `FieldMappingDataTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `FileExtensions` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `FormBodyUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `fromError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `getError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `GRPC` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `HfQueueHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `HTTP` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IBuildInfo` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IBuildOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IConfigurable` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IDayjsFactory` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IDayjsInstance` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IDuration` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IECDHEncryptedPayload` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IECDHExtraOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IErrorKeyRegistry` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IFetchable` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IFieldMapping` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IHeightWhereOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IHfQueueNode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IIdGeneratorOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ILeavesOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ILogger` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ILoggerProvider` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ILuxonDateTime` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ILuxonDateTimeFactory` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `INextOpaqueUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `INodeFetchNetworkRequestOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `INodeFetchRequestOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `INodeWithPath` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IntlTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IOpaqueUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPool` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolControlOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolStats` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolWaiter` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPrintOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IQueryStringOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRedisHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRequestOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRetryBackoffOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRetryContext` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `isApplicationError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `isClass` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ISnowflakeParsedId` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ITemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalDurationParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalLocaleNames` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalNamespace` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalZonedDateTime` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITreeNode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IUidSegment` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IUrlSafetyPolicy` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IUuidInspection` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IWalkAsyncOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IWalkOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IZonedTemporalParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `LoggerFactory` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `LogLevels` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `LuxonTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `MessageCode` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `MessageTemplate` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `MimeTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `MIN_UID_ALPHABET_SIZE` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `NativeTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `NodeFetcher` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `NodeFetchNetworkRequest` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ObjectUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `OpaqueUidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ParseUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `PerformanceUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `PromiseUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringNestedModes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringNullishModes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringSeparators` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RecordUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `REDACTED` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `RedactUtility` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `RequestIdGenerator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ResolverUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `RetryBackoffStrategies` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RetryHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RetryJitterModes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RuntimeModules` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `SlugHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `SnowflakeConfig` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `SnowflakeUidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TAbstractClass` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TAbstractConstructor` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TAbstractMixinTarget` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TAsyncResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBuildInfoRecord` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TClass` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TConstructor` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TConstValue` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TContentType` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TDurationUnit` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TemporalDurationStyles` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalInclusivities` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalNameWidths` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalUnits` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalWrittenDateStyles` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorByDefinition` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorByField` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorDefinition` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorDefinitionMessage` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorKey` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorLogLevel` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessage` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessageInput` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessageOverride` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorNormalized` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorNormalizeTransformFn` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorScope` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TFetcherLogger` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TFieldMappingDataType` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TFieldMappingNames` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TFileExtension` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TGrpcMethod` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TGrpcResultCode` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `THttpMethod` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `THttpProtocol` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `THttpResultCode` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TInjectionGetter` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TLogLevel` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TMimeTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TMixinTarget` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TNodePredicate` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TNullable` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TNumberConstValue` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TObjectFromFieldMappings` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TOnVisit` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TOnVisitAsync` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TOptions` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TPrettify` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TQueryStringNestedMode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TQueryStringNullishMode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TreeBuilder` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TreeWalker` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TRegisterErrors` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TRelativeUnit` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TResponsedError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TRetryBackoffStrategy` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TRetryJitterMode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TRuntimeModule` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TStringConstValue` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TTemporalDurationStyle` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalFields` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalInclusivity` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalInput` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalMonthNameWidth` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalNameWidth` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalUnit` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalWrittenDateStyle` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TUidCaseForm` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TUrlScheme` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TValueOrAsyncResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TValueOrResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `UidAlphabets` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UidCaseForms` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UrlPolicy` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UrlSafetyDefaults` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UrlSchemes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UUID_PATTERN` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidNamespaces` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidV4Generator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidV5Generator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidV7Generator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ValueOf` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ValueOptional` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ValueOptionalExcept` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ValueOrPromise` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
