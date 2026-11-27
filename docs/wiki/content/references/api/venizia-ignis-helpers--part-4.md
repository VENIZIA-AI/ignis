---
title: "@venizia/ignis-helpers (4 of 4)"
description: "Every export of @venizia/ignis-helpers, from the built declarations (generated)."
---

# `@venizia/ignis-helpers (4 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 4 of 4 of [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers).

## `RedisHelperFactory`

*class*

Creates the Redis helper of one topology: `single`, `cluster` or `sentinel`. Each returns its concrete helper type.

```ts
export declare class RedisHelperFactory {
    static single(opts: IRedisSingleHelperOptions): RedisSingleHelper;
    static cluster(opts: IRedisClusterHelperOptions): RedisClusterHelper;
    static sentinel(opts: IRedisSentinelHelperOptions): RedisSentinelHelper;
}
```

Source: `packages/helpers/src/modules/redis/factory.ts`

## `RedisSentinelDefaults`

*class*

Defaults of the Sentinel helper.

```ts
export declare class RedisSentinelDefaults {
    /** The port of a Sentinel process when none is given. */
    static readonly PORT = 26379;
}
```

Source: `packages/helpers/src/modules/redis/sentinel/constants.ts`

## `RedisSentinelHelper`

*class*

Redis helper for a master and replicas behind Sentinel. `redisOptions` overrides the helper defaults; the first-class fields override `redisOptions`.

```ts
export declare class RedisSentinelHelper extends AbstractRedisHelper<Redis> {
    constructor(opts: IRedisSentinelHelperOptions);
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
}
```

Source: `packages/helpers/src/modules/redis/sentinel/constants.ts`

## `RedisSingleHelper`

*class*

Redis helper over one ioredis `Redis` client connected to a single node.

```ts
export declare class RedisSingleHelper extends AbstractRedisHelper<Redis> {
    constructor(opts: IRedisSingleHelperOptions);
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
    /** Built on first use: a helper opens a logger, which is work an import alone should not do. */
    private static uploadTokens?;
    /** Uniqueness for a spooled filename, not a secret; the helper's 16-byte floor is the shortest it makes. */
    private static getUploadTokens;
    static parseMultipartBody<C extends IMultipartContext = IMultipartContext>(opts: IParseMultipartOptions<C>): Promise<IParsedMultipartBody>;
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
}

/** The part of a request context a multipart body is read from: its `formData()`. A Hono context satisfies it. */
interface IMultipartContext {
    req: {
        formData: () => Promise<FormData>;
    };
}

interface IParseMultipartOptions<C extends IMultipartContext = IMultipartContext> {
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
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `S3Defaults`

*class*

S3 values the helper falls back to or recognises.

```ts
export declare class S3Defaults {
    static readonly REGION = "us-east-1";
    /** What S3 answers as the version id of an object in a bucket where versioning is off or suspended. */
    static readonly NULL_VERSION_ID = "null";
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `S3Headers`

*class*

The `x-amz-*` request and response headers the S3 helper reads and sends.

```ts
export declare class S3Headers {
    static readonly COPY_SOURCE = "x-amz-copy-source";
    static readonly COPY_SOURCE_IF_MATCH = "x-amz-copy-source-if-match";
    static readonly VERSION_ID = "x-amz-version-id";
    static readonly TAGGING = "x-amz-tagging";
    static readonly CONTENT_SHA256 = "x-amz-content-sha256";
    static readonly DATE = "x-amz-date";
    static readonly SECURITY_TOKEN = "x-amz-security-token";
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `S3Signing`

*class*

The fixed words of an AWS Signature V4 signature for S3.

```ts
export declare class S3Signing {
    static readonly ALGORITHM = "AWS4-HMAC-SHA256";
    static readonly SERVICE = "s3";
    static readonly REQUEST_TYPE = "aws4_request";
    static readonly UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `SecretProviders`

*class*

Secret backends a secrets registration can select.

```ts
export declare class SecretProviders extends ConstClass {
    static readonly SYSTEM_ENVS = "system-envs";
    static readonly HASHICORP_VAULT = "hashicorp-vault";
    static readonly DOTENV_VAULT = "dotenv-vault";
}
```

Source: `packages/helpers/src/modules/secrets/common/constants.ts`

## `SecretsHelperFactory`

*class*

Builds the `ISecretsHelper` for a registration by its `provider`. Throws when the provider is unknown, or when the provider package is neither installed, registered, nor injected through the config.

```ts
export declare class SecretsHelperFactory {
    static create(opts: TSecretsRegistration & {
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
    /** A read or copy that named the content it expects (an ETag or a version) found other content. */
    readonly PRECONDITION_FAILED: {
        readonly message: {
            readonly text: "The object no longer matches what was expected";
            readonly code: "core.storage.precondition_failed";
        };
        readonly statusCode: 412;
        readonly category: "business";
    };
    /** An upload named a folder the storage refuses: a segment it cannot hold, or an empty path. */
    readonly FOLDER_PATH_INVALID: {
        readonly message: {
            readonly text: "Invalid folder path";
            readonly code: "core.storage.folder_path_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly FOLDER_DEPTH_EXCEEDED: {
        readonly message: {
            readonly text: "Folder path exceeds the maximum depth";
            readonly code: "core.storage.folder_depth_exceeded";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
};
```

Source: `packages/helpers/src/modules/storage/common/errors.ts`

## `StorageLimits`

*class*

Size ceilings the storage helpers enforce: a name or key in UTF-8 bytes, and the keys one S3 listing call returns.

```ts
export declare class StorageLimits {
    static readonly MAX_SEGMENT_BYTES = 255;
    static readonly MAX_KEY_BYTES = 1024;
    static readonly MAX_LIST_KEYS = 1000;
}
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

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

## `StorageTypes`

*class*

The backend a storage helper writes to. A helper declares its own, so a caller never tells one apart with `instanceof`.

```ts
export declare class StorageTypes {
    static readonly DISK = "disk";
    static readonly BUN_S3 = "bun-s3";
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
    /** A version id that names a version. S3 and MinIO answer the literal `null`, or nothing, for an object in a bucket where versioning is off or suspended. */
    static realVersionId(opts: {
        value?: string | null;
    }): string | undefined;
    /** "The expected content is gone", across SDKs: S3 and MinIO answer 412. */
    static isPreconditionFailedError(opts: {
        error: unknown;
    }): boolean;
    private static hasStatus;
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

## `TcpClientStates`

*class*

Where a TCP client is in the authentication handshake.

```ts
export declare class TcpClientStates {
    static readonly UNAUTHORIZED = "unauthorized";
    static readonly AUTHENTICATING = "authenticating";
    static readonly AUTHENTICATED = "authenticated";
}
```

Source: `packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`

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

## `TObjectStreamOptions`

*type*

`getObjectStream`: one object, an optional byte window, and what the object must still be.

```ts
export type TObjectStreamOptions = IObjectLocation & {
    range?: IByteRange;
} & IStorageReadCondition;
```

Source: `packages/helpers/src/modules/storage/common/types.ts`

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
export type TQueueStatus = TConstValue<typeof QueueStatuses>;
```

Source: `packages/helpers/src/modules/queue/internal/sequential/common/types.ts`

## `TRedisClient`

*type*

The ioredis client a helper wraps: a single or Sentinel `Redis`, or a `Cluster`.

```ts
export type TRedisClient = Redis | Cluster;
```

Source: `packages/helpers/src/modules/redis/common/types.ts`

## `TRedisSentinelRole`

*type*

Union of the `RedisSentinelRoles` values.

```ts
export type TRedisSentinelRole = TConstValue<typeof RedisSentinelRoles>;
```

Source: `packages/helpers/src/modules/redis/sentinel/constants.ts`

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

## `TSecretsRegistration`

*type*

Declares a secrets provider with the bundles to hydrate and the secrets to lease: the `provider` selects the shape of `config`.

```ts
export type TSecretsRegistration = ISystemEnvsSecretsRegistration | IHashiCorpSecretsRegistration | IDotenvSecretsRegistration;
```

Source: `packages/helpers/src/modules/secrets/common/types/registration.ts`

## `TStorageType`

*type*

One of the `StorageTypes` values.

```ts
export type TStorageType = TConstValue<typeof StorageTypes>;
```

Source: `packages/helpers/src/modules/storage/common/constants.ts`

## `TTask`

*type*

An async task as `executeWithLimit` takes it.

```ts
export type TTask<T> = (...args: never[]) => Promise<T>;
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

## `TWebSocketAuthOptions`

*type*

How a client authenticates. The server refuses authentication data that is not an object, with or without a schema.

```ts
export type TWebSocketAuthOptions<AuthDataType extends Record<string, unknown> = Record<string, unknown>, MetadataType extends Record<string, unknown> = Record<string, unknown>> = IWebSocketSchemaAuthOptions<AuthDataType, MetadataType> | IWebSocketRecordAuthOptions<MetadataType>;
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

## `TWebSocketServerOptions`

*type*

Options for `WebSocketServerHelper`. `handshake` is required when `requireEncryption` is true.

```ts
export type TWebSocketServerOptions<AuthDataType extends Record<string, unknown> = Record<string, unknown>, MetadataType extends Record<string, unknown> = Record<string, unknown>> = IWebSocketServerBaseOptions<MetadataType> & TWebSocketAuthOptions<AuthDataType, MetadataType>;
```

Source: `packages/helpers/src/modules/socket/websocket/common/types/server.ts`

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

## `UrlGuard`

*class*

The server half of the url guard, the one name for it. As a fetcher's engine: `new NativeFetcher({ ..., guardEngine: UrlGuard })`, then `guard: {}` (or a policy)
on a call. Per hop the host is resolved ONCE, every answer is checked, and the request connects to those addresses and
to no other, so a DNS answer that changes after the check (DNS rebinding) is never looked up again.

```ts
export declare class UrlGuard {
    static createRoute(opts: {
        policy: IUrlSafetyPolicy;
    }): IFetchGuardRoute;
    /**
     * Resolves `hostname` once and returns every address it answered, refusing the host when ANY of them is non-public.
     * Checking only the first walks straight into a host that publishes one public A record beside an internal one.
     * An IP literal answers itself. `allowPrivateAddress` skips the check and returns an empty list: nothing to pin to.
     *
     * With `trusted` (the caller has judged the origin trusted AND every hop before it was trusted too) a private answer
     * is accepted, and the addresses are still returned to pin to. A cloud metadata address is accepted only when the trusted origin's host IS
     * that literal; a trusted host NAME that resolves to one is refused.
     */
    static resolvePublicAddresses(opts: {
        hostname: string;
        trusted?: boolean;
        policy?: IUrlSafetyPolicy;
        signal?: AbortSignal;
    }): Promise<string[]>;
    /**
     * Rejects when ANY resolved address is non-public.
     *
     * A rebinding window remains when this is called on its own: the address can change between this check and a
     * later connect. a fetcher call with a `guard` closes it by connecting to the address it vetted.
     */
    static assertPublicHost(opts: {
        hostname: string;
        trusted?: boolean;
        policy?: IUrlSafetyPolicy;
    }): Promise<void>;
    /** Both halves, in the order they must run: shape first, then the network. */
    static assertReachableUrl(opts: {
        url: string;
        policy?: IUrlSafetyPolicy;
    }): Promise<URL>;
    /** Settles with `work`, or rejects with the signal's reason when the deadline passes first: a slow resolver must not outlive it. */
    private static withDeadline;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/guard.ts`

## `UrlSafetyRefusals`

*class*

Telling a url-guard refusal from a failure worth another attempt.

```ts
export declare class UrlSafetyRefusals {
    /** Whether `error` is a refusal that repeats: the guard's `URL_REFUSED` (an address, a scheme, a hop count) or a `BODY_TOO_LARGE`. A caller that retries must drop it. */
    static is(opts: {
        error: unknown;
    }): boolean;
    /** Whether `error` is a body over the cap, as against an address the guard refused. */
    static isBodyTooLarge(opts: {
        error: unknown;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/errors.ts`

## `VaultAuthMethods`

*class*

Ways a Vault provider can authenticate.

```ts
export declare class VaultAuthMethods extends ConstClass {
    static readonly TOKEN = "token";
    static readonly APP_ROLE = "app-role";
    static readonly KUBERNETES = "kubernetes";
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
export declare class WebSocketClientStates extends ConstClass {
    static readonly UNAUTHORIZED = "unauthorized";
    static readonly AUTHENTICATING = "authenticating";
    static readonly AUTHENTICATED = "authenticated";
    static readonly DISCONNECTED = "disconnected";
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
export declare class WebSocketEvents extends ConstClass {
    static readonly AUTHENTICATE = "authenticate";
    static readonly CONNECTED = "connected";
    static readonly DISCONNECT = "disconnect";
    static readonly JOIN = "join";
    static readonly LEAVE = "leave";
    static readonly ERROR = "error";
    static readonly HEARTBEAT = "heartbeat";
    static readonly ENCRYPTED = "encrypted";
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketMessageTypes`

*class*

Delivery target types of a WebSocket message. `isValid` narrows a string to one of them.

```ts
export declare class WebSocketMessageTypes extends ConstClass {
    static readonly CLIENT = "client";
    static readonly USER = "user";
    static readonly ROOM = "room";
    static readonly BROADCAST = "broadcast";
}
```

Source: `packages/helpers/src/modules/socket/websocket/common/constants.ts`

## `WebSocketServerHelper`

*class*

WebSocket server for Bun with authentication, rooms, heartbeats, optional encrypted sessions, and Redis fan-out
across instances. Clients must authenticate through `authenticate.fn` within `authTimeout`.

`AuthDataType` is what `authenticate.schema` answers and is inferred from it; leave it out when there is no schema,
where the hooks receive `Record<string, unknown>` whatever it names.

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
    /** Checks authentication data and binds the hooks to it; `undefined` refuses the client. */
    private openAuthSession;
    private validateRoomFn?;
    private onClientConnected?;
    private onClientDisconnected?;
    private messageHandler?;
    private defaultRooms;
    private serverOptions;
    private authTimeout;
    private heartbeatInterval;
    private heartbeatTimeout;
    private heartbeatTimer;
    private requireEncryption;
    /** TypeScript narrows a union by its own properties only, and the schema is one level down. */
    private static hasNoSchema;
    /** Checks authentication data, then binds the hooks to it: with a schema to what it answers, without one to the object as it came. */
    private static authSessionOf;
    /** With `authenticate.schema`, the hooks receive what it answers, typed from it. */
    constructor(opts: IWebSocketServerBaseOptions<MetadataType> & IWebSocketSchemaAuthOptions<AuthDataType, MetadataType>);
    /** Without a schema, the hooks receive the object as it came. */
    constructor(opts: IWebSocketServerBaseOptions<MetadataType> & IWebSocketRecordAuthOptions<MetadataType>);
    /** For options built beforehand as `TWebSocketServerOptions`. */
    constructor(opts: TWebSocketServerOptions<AuthDataType, MetadataType>);
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
    /** A peer's message off Redis. Type guard, so it keeps its positional `value`; `data` is the application's own. */
    private static isRedisMessage;
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
    protected registry: Map<string | symbol, IWorker<unknown>>;
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
