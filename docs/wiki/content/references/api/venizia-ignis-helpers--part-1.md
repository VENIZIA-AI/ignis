---
title: "@venizia/ignis-helpers (1 of 4)"
description: "Every export of @venizia/ignis-helpers, from the built declarations (generated)."
---

# `@venizia/ignis-helpers (1 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 4 of [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers).

## `AbstractLogger`

*class*

The ILogger contract as a class - for instanceof and implementations sharing no plumbing.

```ts
export declare abstract class AbstractLogger implements ILogger {
    abstract debug(message: string, ...args: unknown[]): void;
    abstract info(message: string, ...args: unknown[]): void;
    abstract warn(message: string, ...args: unknown[]): void;
    abstract error(message: string, ...args: unknown[]): void;
    abstract emerg(message: string, ...args: unknown[]): void;
    abstract log(level: TLogLevel, message: string, ...args: unknown[]): void;
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
    /** `maxRetry` is `0`, `RedisDefaults.RETRY_FOREVER` or a positive integer; anything else is a typo that would silently change how the client reconnects. */
    protected static assertMaxRetry(opts: {
        scope: string;
        name: string;
        maxRetry: number;
    }): void;
    /** The wait before each reconnect, then `undefined` once `maxRetry` attempts failed: ioredis stops and the helper logs it once. */
    protected static buildRetryStrategy(opts: {
        scope: string;
        name: string;
        maxRetry: number;
    }): (attempt: number) => number | undefined;
    protected static buildDefaultOpts(opts: {
        scope: string;
        name: string;
        maxRetry: number;
    }): {
        showFriendlyErrorStack: boolean;
        maxRetriesPerRequest: null;
        retryStrategy: (attempt: number) => number | undefined;
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
    get<T>(opts: {
        key: string;
        transform: (input: string) => T;
    }): Promise<T | null>;
    get(opts: {
        key: string;
    }): Promise<string | null>;
    del(opts: {
        keys: Array<string>;
    }): Promise<number>;
    getString(opts: {
        key: string;
    }): Promise<string | null>;
    getStrings(opts: {
        keys: Array<string>;
    }): Promise<(string | null)[]>;
    getObject(opts: {
        key: string;
    }): Promise<unknown>;
    getObjects(opts: {
        keys: Array<string>;
    }): Promise<unknown[]>;
    mSet<T>(opts: {
        payload: Array<{
            key: string;
            value: T;
        }>;
        options?: {
            log?: boolean;
        };
    }): Promise<void>;
    mGet<T>(opts: {
        keys: Array<string>;
        transform: (input: string) => T;
    }): Promise<(T | null)[]>;
    mGet(opts: {
        keys: Array<string>;
    }): Promise<(string | null)[]>;
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
    jGet(opts: {
        key: string;
        path?: string;
    }): Promise<string | null>;
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
    }): Promise<Array<number | null> | number | null>;
    jPush<T>(opts: {
        key: string;
        path: string;
        value: T;
    }): Promise<Array<number | null> | number | null>;
    jPop(opts: {
        key: string;
        path: string;
    }): Promise<unknown>;
    execute(command: string, parameters?: Array<string | number | Buffer>): Promise<unknown>;
    /** The reply of a RedisJSON command, whose shape Redis fixes. */
    private reply;
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
    get(opts: {
        path: string;
        key: string;
        defaultValue?: undefined;
    }): Promise<string | undefined>;
    get<TDefault>(opts: {
        path: string;
        key: string;
        defaultValue: TDefault;
    }): Promise<string | TDefault>;
    get(opts: {
        path: string;
        key?: undefined;
    }): Promise<Record<string, string>>;
    get(opts: IGetSecretOptions): Promise<unknown>;
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
        [workerKey: string | symbol]: IWorkerBus<never, never>;
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
export declare class AES extends BaseCryptoAlgorithm<AESAlgorithmType, string, string, TAESSecret, Promise<string>, Promise<string>, IAESOptions> {
    /** The options AES refuses: `doThrow` (a failure always throws) and `iv` (every encryption draws its own). */
    private static readonly REMOVED_OPTIONS;
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
        opts?: IAESOptions;
    }): Promise<string>;
    encryptFile(opts: {
        absolutePath: string;
        secret: TAESSecret;
    }): Promise<string>;
    decrypt(opts: {
        message: string;
        secret: TAESSecret;
        opts?: IAESOptions;
    }): Promise<string>;
    decryptFile(opts: {
        absolutePath: string;
        secret: TAESSecret;
    }): Promise<string>;
}

/** Options of `AES.encrypt` and `AES.decrypt`. There is no `iv`: every encryption draws a fresh random one, and decrypt reads it from the envelope. */
interface IAESOptions {
    inputEncoding?: BufferEncoding;
    outputEncoding?: BufferEncoding;
    /** Per-deployment PBKDF2 salt override. Must be supplied identically on encrypt and decrypt; omit for the shipped default. */
    kdfSalt?: string;
    /** PBKDF2 iteration count override. Must be supplied identically on encrypt and decrypt; omit for the shipped default. */
    kdfIterations?: number;
}
```

Source: `packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`

## `AppEnvs`

*const*

The process-wide environment store, built from `process.env` with the prefix in `APPLICATION_ENV_PREFIX` (`APP_ENV` when unset). One instance is shared by every copy of this module in the process. This is the name to use.

```ts
export declare const AppEnvs: ApplicationEnvironment;
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `applicationEnvironment`

*const*

The same instance as `AppEnvs`: use `AppEnvs`.

```ts
export declare const applicationEnvironment: ApplicationEnvironment;
```

Source: `packages/helpers/src/modules/env/app-env.ts`

## `ApplicationEnvironment`

*class*

Key-value store of the environment entries whose key starts with `prefix`; other keys are dropped at construction. `get` applies a default and an optional transform. Use the shared `AppEnvs` instance rather than constructing one.

```ts
export declare class ApplicationEnvironment extends BaseHelper implements IApplicationEnvironment {
    private prefix;
    private arguments;
    constructor(opts: {
        prefix: string;
        envs: Record<string, string | undefined>;
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
    get(key: string): string | undefined;
    get(key: string, opts: {
        defaultValue: string;
    }): string;
    /** A transform that may answer nothing, with the `defaultValue` that then applies: the `defaultValue` fixes `R`. */
    get<R>(key: string, opts: IApplicationEnvironmentDefaultedTransformOptions<R>): R;
    /** What the transform makes of the raw string: `R` is inferred from the transform. */
    get<R>(key: string, opts: IApplicationEnvironmentTransformOptions<R>): R;
    /**
     * A variable the app cannot run without: it is set and not blank (the rule `get` applies to a `defaultValue`), or this throws an error naming the key. The check runs before `transform`, so `transform` receives a `string`; a `transform` that answers null or undefined throws too. A required value has no `defaultValue`.
     */
    getRequired(key: string): string;
    getRequired<R>(key: string, opts: {
        transform: (raw: string) => TNullable<R>;
    }): R;
    set(key: string, value: string | undefined): void;
    merge(opts: {
        envs: Record<string, string | undefined>;
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
    /** What a caller that still passes a removed option is told: the option, and what replaced it. */
    private static readonly REMOVED_OPTION_HINTS;
    /**
     * A caller that still passes a removed option is refused, not ignored, so nobody believes it still works.
     * `doThrow: false` is gone: a failed encrypt or decrypt used to hand the input back, which a caller could take for
     * ciphertext or plaintext. `iv` is gone from AES: a caller-chosen IV reused under GCM breaks confidentiality and integrity.
     */
    protected assertNoRemovedOptions(opts: {
        method: string;
        options?: object;
        removed?: ReadonlyArray<string>;
    }): void;
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
        args: unknown[];
    }): void;
    protected abstract child(opts: {
        scope: string;
    }): ILogger;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    emerg(message: string, ...args: unknown[]): void;
    log(level: TLogLevel, message: string, ...args: unknown[]): void;
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
    protected reconnectTimeout?: ReturnType<typeof setTimeout> | null;
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
    protected onError?: (error: unknown) => void;
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
    handleError(error: unknown): void;
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
        args: unknown;
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
    static readonly DEFAULT_MAX_FOLDER_DEPTH = 2;
    private static readonly UTF8;
    private static readonly DANGEROUS_NAME_CHARACTERS;
    /** Control characters, lone surrogates, the line and paragraph separators (U+2028, U+2029) and the bidirectional marks and overrides: never part of a file name or a key (the overrides make `gpj.exe` display as `exe.jpg`), and a control character or a surrogate cannot be encoded into a header. */
    private static readonly UNSAFE_NAME_CHARACTERS;
    /** Every way a segment can be refused, first match wins. */
    private static readonly SEGMENT_RULES;
    /** One path segment or file name: at most 255 UTF-8 bytes, no separator, no traversal, no control or shell character. */
    isValidSegment(opts: {
        segment: string;
    }): boolean;
    /** A bucket name is one segment; a separator in it would silently address a different bucket. */
    isValidBucketName(opts: {
        bucket: IBucketRef;
    }): boolean;
    /** A whole object key: every segment valid, no trailing `/`, and no deeper than `maxDepth` folders. */
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
    /** The key `upload` writes when no naming hook is given: lowercase, spaces become `_`, under the folder when there is one. Public so a naming hook can start from the very key the helper would have written. */
    static normalizeObjectName(opts: {
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
    upload(opts: IUploadOptions): Promise<IUploadResult[]>;
    getObjectStream(_opts: TObjectStreamOptions): Promise<ReadableStream<Uint8Array>>;
    /**
     * Correct anywhere, and the wrong path to stay on: it buffers, so a backend whose transport takes
     * a stream overrides it. `BunS3Helper` does.
     */
    writeStream(opts: IWriteStreamOptions): Promise<void>;
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
    /** For a backend with no ETag or versions to condition a read on: refusing is honest, ignoring would read unpinned. */
    protected refuseReadCondition(opts: {
        condition: IStorageReadCondition;
        operation: string;
    }): void;
    /** The error of an operation this helper has no transport for: throwing beats returning undefined, which reads as a valid empty result. */
    private unsupported;
    copyObject(_opts: ICopyObjectOptions): Promise<void>;
    presignPost(_opts: IPresignPostOptions): Promise<IPostPolicy>;
    presignPut(_opts: IPresignPutOptions): Promise<string>;
    presignGet(_opts: IPresignGetOptions): Promise<string>;
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
        options?: unknown;
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

## `BullMQDefaults`

*class*

What a BullMQ helper uses when its options leave a field out.

```ts
export declare class BullMQDefaults {
    static readonly NUMBER_OF_WORKER = 1;
    /** How long a worker holds a job's lock: 90 minutes, in milliseconds. */
    static readonly LOCK_DURATION_MS: number;
}
```

Source: `packages/helpers/src/modules/queue/common/constants.ts`

## `BullQueueRoles`

*class*

What a BullMQ helper is: the QUEUE that jobs are added to, or the WORKER that runs them.

```ts
export declare class BullQueueRoles {
    static readonly QUEUE = "queue";
    static readonly WORKER = "worker";
}
```

Source: `packages/helpers/src/modules/queue/common/constants.ts`

## `Child`

*type*

Kept out of the `./common` barrel because `hono/jsx` types reach DOM-dependent JSX intrinsics; `hono` is an optional peer, so a Worker or hono-less consumer of `./common` must not have this file in its type graph. Re-exported directly from the root barrel (`src/index.ts`) instead, so `Child`/`FC`/`PropsWithChildren` stay publicly reachable from `@venizia/ignis-helpers`.

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

## `CredentialAlgorithms`

*class*

Password-hash schemes `CredentialUtility` accepts. `isValid` narrows a string to `TCredentialAlgorithm`.

```ts
export declare class CredentialAlgorithms extends ConstClass {
    /** What `Bun.password` writes with its default parameters; the scheme `hash` uses unless told otherwise. */
    static readonly ARGON2ID = "argon2id";
    static readonly BCRYPT = "bcrypt";
}
```

Source: `packages/helpers/src/modules/crypto/common/constants.ts`

## `CredentialUtility`

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
export declare class CredentialUtility {
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

Scheme `CredentialUtility.hash` uses when `algorithm` is omitted.

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
